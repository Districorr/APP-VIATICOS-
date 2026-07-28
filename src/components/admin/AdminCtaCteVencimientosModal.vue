<script setup>
import { computed, ref, watch } from 'vue';
import { supabase } from '../../supabaseClient';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from '../../utils/formatters';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'show-notification']);

const selectedMonth = ref(''); // Formato 'YYYY-MM' (Mes de vencimiento)
const loading = ref(false);
const items = ref([]);

// Inicializar con el mes siguiente
const initMonth = () => {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
  selectedMonth.value = `${year}-${month}`;
};

initMonth();

// Calcular el período de origen (mes anterior al seleccionado)
const originPeriod = computed(() => {
  if (!selectedMonth.value) return null;
  const [year, month] = selectedMonth.value.split('-').map(Number);
  // El mes origen es el mes de vencimiento - 1
  const originDate = new Date(year, month - 2, 1);
  const startYear = originDate.getFullYear();
  const startMonth = String(originDate.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(startYear, originDate.getMonth() + 1, 0).getDate();
  
  return {
    start: `${startYear}-${startMonth}-01`,
    end: `${startYear}-${startMonth}-${String(lastDay).padStart(2, '0')}`,
    label: originDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    vencimientoLabel: new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
  };
});

const isSurgeryDescription = (desc) => {
  if (!desc) return false;
  const normalized = String(desc)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return normalized.includes('cirugia') || normalized.includes('cirugía');
};

const loadCtaCteExpenses = async () => {
  if (!originPeriod.value) return;
  loading.value = true;
  try {
    const { data, error } = await supabase
      .from('gastos')
      .select(`
        id,
        fecha_gasto,
        monto_total,
        descripcion_general,
        numero_factura,
        proveedor:proveedores(id, nombre),
        transporte:transportes(id, nombre),
        perfil:perfiles!user_id(nombre_completo)
      `)
      .eq('origen_gasto', 'cuenta_corriente_empresa')
      .gte('fecha_gasto', originPeriod.value.start)
      .lte('fecha_gasto', originPeriod.value.end)
      .order('fecha_gasto', { ascending: true });

    if (error) throw error;

    // Mapear y autodetectar cirugías
    items.value = (data || []).map(item => {
      const isSinProv = !item.proveedor || item.proveedor.id === 4 || item.proveedor.nombre?.toLowerCase() === 'sin proveedor';
      const desc = item.descripcion_general || '';
      if (isSinProv && isSurgeryDescription(desc)) {
        return {
          ...item,
          proveedor: { id: 14, nombre: 'LOGISTICA CIRUGIA' }
        };
      }
      return item;
    });
  } catch (e) {
    console.error('Error cargando vencimientos de cuenta corriente:', e);
    emit('show-notification', 'Error', 'No se pudieron cargar los vencimientos.', 'error');
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const totalAmount = computed(() => {
  return items.value.reduce((total, item) => total + Number(item.monto_total || 0), 0);
});

const closeModal = () => {
  emit('update:modelValue', false);
};

const downloadPDF = () => {
  if (items.value.length === 0) return;
  
  try {
    const doc = new jsPDF();
    const margin = 12;
    let y = 14;

    // Cabecera plana tipo ERP
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('INFO-GASTOS DISTRICORR - LIBRO MAYOR DE CUENTA CORRIENTE', margin, y);
    
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    const infoText = `Mes Vencimiento: ${originPeriod.value.vencimientoLabel.toUpperCase()} | Origen: ${originPeriod.value.label} | Total: ${formatCurrency(totalAmount.value)} | Operaciones: ${items.value.length} despachos | Generado: ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs`;
    doc.text(infoText, margin, y);
    
    y += 3;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, y, doc.internal.pageSize.width - margin, y);
    
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('RESUMEN DE VENCIMIENTOS POR PROVEEDOR', margin, y);

    // Agrupación por proveedor para mostrar un resumen ejecutivo
    const provGroups = items.value.reduce((acc, item) => {
      const name = item.proveedor?.nombre || 'SIN PROVEEDOR';
      acc[name] = (acc[name] || 0) + Number(item.monto_total || 0);
      return acc;
    }, {});

    const provTableRows = Object.entries(provGroups).map(([name, total]) => [
      name,
      formatCurrency(total)
    ]);

    y += 3;
    doc.autoTable({
      startY: y,
      head: [['Proveedor', 'Total Vencimiento']],
      body: provTableRows,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1, textColor: [0, 0, 0], lineColor: [200, 200, 200] },
      headStyles: { fillColor: [60, 60, 60], fontSize: 8, fontStyle: 'bold', cellPadding: 1.2, textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', fontStyle: 'bold', cellWidth: 35 }
      },
      margin: { left: margin, right: margin }
    });

    // Detalle de operaciones
    y = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('DETALLE DE OPERACIONES EN CUENTA CORRIENTE', margin, y);

    const detailRows = items.value.map(item => [
      formatDate(item.fecha_gasto),
      item.proveedor?.nombre || 'SIN PROVEEDOR',
      item.transporte?.nombre || 'N/A',
      item.descripcion_general || 'Pago de encomienda',
      item.numero_factura || '—',
      formatCurrency(item.monto_total)
    ]);

    y += 3;
    doc.autoTable({
      startY: y,
      head: [['Fecha', 'Proveedor', 'Operador Log.', 'Detalle / Concepto', 'N° Factura', 'Importe']],
      body: detailRows,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1, textColor: [0, 0, 0], lineColor: [220, 220, 220] },
      headStyles: { fillColor: [60, 60, 60], fontSize: 7.5, fontStyle: 'bold', cellPadding: 1.2, textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 16 }, // Fecha
        1: { cellWidth: 30 }, // Proveedor
        2: { cellWidth: 26 }, // Operador Log.
        3: { cellWidth: 'auto' }, // Detalle / Concepto
        4: { cellWidth: 25 }, // N° Factura
        5: { cellWidth: 23, halign: 'right', fontStyle: 'bold' } // Importe
      },
      margin: { left: margin, right: margin }
    });

    doc.save(`vencimientos_cta_cte_${selectedMonth.value}.pdf`);
    emit('show-notification', 'PDF descargado', 'El Libro Mayor de vencimientos fue descargado.', 'success');
  } catch (e) {
    console.error('Error generando PDF de vencimientos:', e);
    emit('show-notification', 'Error', 'No se pudo generar el reporte en PDF.', 'error');
  }
};

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    initMonth();
    loadCtaCteExpenses();
  }
});

watch(selectedMonth, () => {
  loadCtaCteExpenses();
});
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="modelValue" class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4" @click.self="closeModal">
      <div class="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        
        <!-- Header -->
        <div class="flex items-start justify-between border-b border-slate-200 p-5 bg-slate-50">
          <div>
            <h3 class="text-lg font-bold text-slate-900">Libro Mayor de Cuenta Corriente — Vencimientos</h3>
            <p class="mt-1 text-xs font-medium text-slate-500">
              Visualiza y descarga el detalle de gastos acumulados a vencer el próximo mes.
            </p>
          </div>
          <button type="button" class="rounded-md p-2 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800" @click="closeModal">x</button>
        </div>

        <!-- Contenido principal -->
        <div class="flex-grow overflow-y-auto p-6 space-y-6">
          
          <!-- Filtro de mes -->
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center bg-white p-4 border border-slate-200 rounded-xl">
            <div class="flex-grow">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Mes de Vencimiento</label>
              <input v-model="selectedMonth" type="month" class="form-input" />
            </div>
            <div class="sm:pt-5" v-if="originPeriod">
              <p class="text-sm font-semibold text-slate-600">
                Origen de los gastos: <span class="text-indigo-600 capitalize">{{ originPeriod.label }}</span>
              </p>
            </div>
          </div>

          <!-- Spinner o vacío -->
          <div v-if="loading" class="flex flex-col items-center justify-center py-12">
            <svg class="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="mt-3 text-sm text-slate-500">Cargando vencimientos de cuenta corriente...</span>
          </div>

          <div v-else-if="items.length === 0" class="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
            <p class="text-sm font-semibold text-slate-500">Sin operaciones de Cuenta Corriente registradas en el período seleccionado.</p>
          </div>

          <!-- Panel de datos -->
          <div v-else class="space-y-4">
            
            <!-- Resumen de tarjetas -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div class="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <span class="block text-xs font-bold uppercase tracking-wider text-slate-500">Monto total a vencer</span>
                <strong class="mt-1 block text-2xl font-bold text-slate-900">{{ formatCurrency(totalAmount) }}</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <span class="block text-xs font-bold uppercase tracking-wider text-slate-500">Cantidad operaciones</span>
                <strong class="mt-1 block text-2xl font-bold text-slate-900">{{ items.length }} despachos</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <span class="block text-xs font-bold uppercase tracking-wider text-slate-500">Promedio por despacho</span>
                <strong class="mt-1 block text-2xl font-bold text-slate-900">{{ formatCurrency(totalAmount / items.length) }}</strong>
              </div>
            </div>

            <!-- Tabla de visualización rápida -->
            <div class="rounded-xl border border-slate-200 overflow-hidden">
              <div class="overflow-x-auto max-h-[30vh]">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50 sticky top-0">
                    <tr>
                      <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Fecha</th>
                      <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor</th>
                      <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Operador Log.</th>
                      <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Detalle</th>
                      <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Monto</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100 text-xs">
                    <tr v-for="item in items" :key="item.id" class="hover:bg-slate-50">
                      <td class="px-4 py-2.5 whitespace-nowrap text-slate-600">{{ formatDate(item.fecha_gasto) }}</td>
                      <td class="px-4 py-2.5 font-semibold text-slate-800">{{ item.proveedor?.nombre || 'SIN PROVEEDOR' }}</td>
                      <td class="px-4 py-2.5 text-slate-600">{{ item.transporte?.nombre || 'N/A' }}</td>
                      <td class="px-4 py-2.5 text-slate-500 truncate max-w-xs">{{ item.descripcion_general || 'Pago de encomienda' }}</td>
                      <td class="px-4 py-2.5 text-right font-bold text-slate-900">{{ formatCurrency(item.monto_total) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="border-t border-slate-200 p-4 bg-slate-50 flex justify-end gap-3">
          <button type="button" class="btn-secondary" @click="closeModal">Cerrar</button>
          <button 
            type="button" 
            class="btn-primary flex items-center justify-center gap-2" 
            :disabled="items.length === 0 || loading"
            @click="downloadPDF"
          >
            Descargar PDF Reporte
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.form-input { @apply block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50; }
.btn-secondary { @apply rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50; }
.z-60 { z-index: 60; }
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
