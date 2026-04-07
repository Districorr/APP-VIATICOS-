<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useReportGenerator } from '../../composables/useReportGenerator';
import PagoDirectoForm from '../../components/admin/PagoDirectoForm.vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

const { exportJsonToExcel } = useReportGenerator();

const loading = ref(true);
const errorMessage = ref('');
const pagos = ref([]);
const showFormModal = ref(false);

// --- ESTADO DE FILTROS Y PAGINACIÓN ---
const filters = ref({
  fechaDesde: '',
  fechaHasta: '',
  responsableId: null,
  metodoPago: '', // NUEVO
  entidad: '',
});
const currentPage = ref(1);
const resultsPerPage = ref(15);
const totalResults = ref(0);

const opcionesFiltro = ref({
  responsables: [],
  metodosPago: ['Transferencia Banco Galicia', 'Transferencia Banco Santander', 'Efectivo', 'E-Cheque', 'Otro'], // NUEVO
});

const pageCount = computed(() => Math.ceil(totalResults.value / resultsPerPage.value));
const rangeFrom = computed(() => (currentPage.value - 1) * resultsPerPage.value + 1);
const rangeTo = computed(() => Math.min(currentPage.value * resultsPerPage.value, totalResults.value));

async function fetchData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    let query = supabase
      .from('vista_gastos_detallados')
      .select('*', { count: 'exact' })
      .eq('origen_gasto', 'pago_directo')
      .order('fecha_gasto', { ascending: false });

    if (filters.value.fechaDesde) query = query.gte('fecha_gasto', filters.value.fechaDesde);
    if (filters.value.fechaHasta) query = query.lte('fecha_gasto', filters.value.fechaHasta);
    if (filters.value.responsableId) query = query.eq('responsable_principal_id', filters.value.responsableId);
    if (filters.value.metodoPago) query = query.eq('datos_adicionales->>metodo_pago', filters.value.metodoPago); // NUEVO
    if (filters.value.entidad) {
      query = query.or(`proveedores->>nombre.ilike.%${filters.value.entidad}%,transportes->>nombre.ilike.%${filters.value.entidad}%`);
    }

    const offset = (currentPage.value - 1) * resultsPerPage.value;
    query = query.range(offset, offset + resultsPerPage.value - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    
    pagos.value = data;
    totalResults.value = count;

  } catch (e) {
    errorMessage.value = `Error al cargar pagos: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

async function cargarOpcionesFiltro() {
  try {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo')
      .eq('rol', 'admin');
    if (error) throw error;
    opcionesFiltro.value.responsables = data.map(u => ({ label: u.nombre_completo, code: u.id }));
  } catch (e) {
    console.error("Error cargando opciones de filtro:", e);
  }
}

// --- NUEVO: LÓGICA DE EXPORTACIÓN ---
async function handleExport() {
  try {
    // 1. Obtener TODOS los datos filtrados, sin paginación
    let query = supabase
      .from('vista_gastos_detallados')
      .select('*')
      .eq('origen_gasto', 'pago_directo')
      .order('fecha_gasto', { ascending: false });

    if (filters.value.fechaDesde) query = query.gte('fecha_gasto', filters.value.fechaDesde);
    if (filters.value.fechaHasta) query = query.lte('fecha_gasto', filters.value.fechaHasta);
    if (filters.value.responsableId) query = query.eq('responsable_principal_id', filters.value.responsableId);
    if (filters.value.metodoPago) query = query.eq('datos_adicionales->>metodo_pago', filters.value.metodoPago);
    if (filters.value.entidad) {
      query = query.or(`proveedores->>nombre.ilike.%${filters.value.entidad}%,transportes->>nombre.ilike.%${filters.value.entidad}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 2. Formatear los datos para el Excel
    const dataToExport = data.map(pago => ({
      'Fecha': formatDate(pago.fecha_gasto),
      'Responsable': pago.responsable_principal_nombre,
      'Descripción': pago.descripcion_general,
      'Tipo de Gasto': pago.tipos_gasto_config?.nombre_tipo_gasto,
      'Proveedor/Transporte': pago.proveedores?.nombre || pago.transportes?.nombre || '',
      'Cliente': pago.clientes?.nombre_cliente || '',
      'Método de Pago': pago.datos_adicionales?.metodo_pago,
      'Ref. Pago': pago.datos_adicionales?.referencia_pago || '',
      'Banco E-Cheque': pago.datos_adicionales?.echeque?.banco_nombre || '',
      'N° E-Cheque': pago.datos_adicionales?.echeque?.numero || '',
      'Emisión E-Cheque': pago.datos_adicionales?.echeque?.emision ? formatDate(pago.datos_adicionales.echeque.emision) : '',
      'Vto. E-Cheque': pago.datos_adicionales?.echeque?.vencimiento ? formatDate(pago.datos_adicionales.echeque.vencimiento) : '',
      'Acred. E-Cheque': pago.datos_adicionales?.echeque?.acreditacion ? formatDate(pago.datos_adicionales.echeque.acreditacion) : '',
      'Monto': pago.monto_total,
    }));

    // 3. Llamar al composable de exportación
    exportJsonToExcel(dataToExport, "Reporte_Pagos_Directos");

  } catch (e) {
    errorMessage.value = `Error al exportar: ${e.message}`;
  }
}


function handlePaymentSaved() {
  showFormModal.value = false;
  fetchData();
}

function goToPage(page) {
  if (page > 0 && page <= pageCount.value) {
    currentPage.value = page;
    fetchData();
  }
}

function resetFilters() {
  filters.value = { fechaDesde: '', fechaHasta: '', responsableId: null, tipoGastoId: null, entidad: null, metodoPago: '' };
}

watch(filters, () => {
  currentPage.value = 1;
  fetchData();
}, { deep: true });

onMounted(() => {
  fetchData();
  cargarOpcionesFiltro();
});
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Gestión de Pagos Directos</h1>
      <p class="mt-1 text-gray-600">Registra y consulta gastos de gerencia como transferencias, pagos de servicios, etc.</p>
    </header>

    <!-- Filtros -->
    <section class="mb-6">
      <div class="bg-white p-4 rounded-lg shadow border">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label class="form-label">Desde</label>
            <input type="date" v-model="filters.fechaDesde" class="form-input">
          </div>
          <div>
            <label class="form-label">Hasta</label>
            <input type="date" v-model="filters.fechaHasta" class="form-input">
          </div>
          <div>
            <label class="form-label">Responsable</label>
            <v-select v-model="filters.responsableId" :options="opcionesFiltro.responsables" :reduce="option => option.code" placeholder="Todos" class="v-select-filter"></v-select>
          </div>
          <div>
            <label class="form-label">Método de Pago</label>
            <select v-model="filters.metodoPago" class="form-input">
              <option value="">Todos</option>
              <option v-for="metodo in opcionesFiltro.metodosPago" :key="metodo" :value="metodo">{{ metodo }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Proveedor / Transporte</label>
            <input type="text" v-model="filters.entidad" class="form-input" placeholder="Buscar...">
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button @click="resetFilters" class="btn-secondary">Limpiar Filtros</button>
        </div>
      </div>
    </section>

    <!-- Tabla de Resultados -->
    <section>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold text-gray-800">Historial de Pagos</h2>
        <button @click="handleExport" :disabled="pagos.length === 0" class="btn-secondary flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
          Exportar a Excel
        </button>
      </div>

      <div v-if="loading" class="text-center py-10">Cargando...</div>
      <div v-else-if="errorMessage" class="error-banner">{{ errorMessage }}</div>
      
      <!-- GUÍA VISUAL PARA EL USUARIO -->
      <div v-else-if="pagos.length === 0" class="empty-state relative">
        <p class="text-lg font-semibold">No se han registrado pagos directos todavía.</p>
        <div class="absolute bottom-full right-0 mb-4 mr-20 text-right">
          <p class="text-lg font-semibold text-indigo-600">Ingresa los gastos acá</p>
          <svg class="w-16 h-16 text-indigo-600 ml-auto transform -scale-x-100" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5m-5-5l-2-5"></path></svg>
        </div>
      </div>

      <div v-else>
        <!-- Vista de Tabla para Escritorio -->
        <div class="hidden md:block bg-white shadow-lg rounded-lg overflow-hidden border">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="table-header">Fecha</th>
                <th class="table-header">Responsable</th>
                <th class="table-header">Descripción</th>
                <th class="table-header">Proveedor/Transporte</th>
                <th class="table-header">Método de Pago</th>
                <th class="table-header text-right">Monto</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="pago in pagos" :key="pago.id">
                <td class="table-cell">{{ formatDate(pago.fecha_gasto) }}</td>
                <td class="table-cell font-medium">{{ pago.responsable_principal_nombre }}</td>
                <td class="table-cell">{{ pago.descripcion_general }}</td>
                <td class="table-cell">{{ pago.proveedores?.nombre || pago.transportes?.nombre || 'N/A' }}</td>
                <td class="table-cell">{{ pago.datos_adicionales?.metodo_pago || 'N/A' }}</td>
                <td class="table-cell text-right font-semibold">{{ formatCurrency(pago.monto_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Vista de Tarjetas para Móvil -->
        <div class="md:hidden space-y-4">
          <div v-for="pago in pagos" :key="pago.id" class="bg-white p-4 rounded-lg shadow border">
            <div class="flex justify-between items-start">
              <div>
                <p class="font-semibold text-gray-800">{{ pago.descripcion_general }}</p>
                <p class="text-sm text-gray-500">{{ pago.tipos_gasto_config.nombre_tipo_gasto }}</p>
              </div>
              <p class="font-bold text-lg text-indigo-600">{{ formatCurrency(pago.monto_total) }}</p>
            </div>
            <div class="mt-3 pt-3 border-t text-xs text-gray-500 space-y-1">
              <p><strong>Fecha:</strong> {{ formatDate(pago.fecha_gasto) }}</p>
              <p><strong>Responsable:</strong> {{ pago.responsable_principal_nombre }}</p>
              <p><strong>Proveedor/Transporte:</strong> {{ pago.proveedores?.nombre || pago.transportes?.nombre || 'N/A' }}</p>
              <p><strong>Método:</strong> {{ pago.datos_adicionales?.metodo_pago || 'N/A' }}</p>
            </div>
          </div>
        </div>
        <!-- Paginación -->
        <div class="pagination-controls mt-4 flex justify-between items-center">
          <span class="text-sm text-gray-600">
            Mostrando {{ rangeFrom }} - {{ rangeTo }} de {{ totalResults }} resultados
          </span>
          <div class="flex gap-2">
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1" class="btn-secondary">Anterior</button>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === pageCount" class="btn-secondary">Siguiente</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Botón Flotante (FAB) -->
    <div class="fixed bottom-6 right-6 z-30">
      <button @click="showFormModal = true" class="fab-button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7"><path fill-rule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clip-rule="evenodd" /></svg>
      </button>
    </div>

    <!-- Modal para el Formulario -->
    <transition name="modal-fade">
      <div v-if="showFormModal" class="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center p-4 z-40" @click.self="showFormModal = false">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl transform transition-all max-h-[90vh] flex flex-col">
          <div class="p-6 border-b">
            <h3 class="text-xl font-semibold text-gray-900">Registrar Nuevo Pago Directo</h3>
          </div>
          <div class="p-6 overflow-y-auto">
            <PagoDirectoForm @pago-guardado="handlePaymentSaved" @cancelar="showFormModal = false" />
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.btn-primary { @apply bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors; }
.btn-secondary { @apply bg-white text-gray-700 font-semibold py-2 px-4 rounded-lg border border-gray-300 shadow-sm hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.empty-state { @apply bg-white p-10 rounded-xl shadow-sm text-center border text-gray-500; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm text-gray-700; }
.fab-button { @apply h-14 w-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform duration-150 hover:scale-110; }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.3s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.v-select-filter { --vs-border-radius: 0.375rem; }
</style>