<script setup>
import { ref, onMounted, computed, watch, inject } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
import { useReportGenerator } from '../composables/useReportGenerator.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import DetallesJson from '../components/DetallesJson.vue';

const router = useRouter();
const route = useRoute();
const userProfile = inject('userProfile', ref(null));

const { generateGastosExcel, generateRendicionCompletaPDF } = useReportGenerator();

const gastos = ref([]);
const viajeSeleccionadoInfo = ref(null);
const loading = ref(true);
const errorMessage = ref('');
const listaViajesParaFiltro = ref([]);
const tiposDeGastoDisponibles = ref([]);
const currentUserName = ref('');
const currentUserEmail = ref('');

// --- Refs para los filtros ---
const filtroFechaDesde = ref('');
const filtroFechaHasta = ref('');
const filtroTipoGastoId = ref('');
const filtroViajeId = ref('');
const filtroDescripcion = ref('');

// --- Refs para el control de la UI ---
const isExportMenuOpen = ref(false);
const expandedRows = ref(new Set());
const debounceTimeout = ref(null); // Para la lógica de debounce

const toggleRowExpansion = (gastoId) => {
  if (expandedRows.value.has(gastoId)) {
    expandedRows.value.delete(gastoId);
  } else {
    expandedRows.value.add(gastoId);
  }
};

// --- COMPUTED PROPERTIES ---
const activeFiltersText = computed(() => {
  const filters = [];
  if (filtroTipoGastoId.value) {
    const tipo = tiposDeGastoDisponibles.value.find(t => t.id === filtroTipoGastoId.value);
    if (tipo) filters.push(`Tipo: ${tipo.nombre_tipo_gasto}`);
  }
  if (filtroFechaDesde.value) {
    filters.push(`Desde: ${formatDate(filtroFechaDesde.value)}`);
  }
  if (filtroFechaHasta.value) {
    filters.push(`Hasta: ${formatDate(filtroFechaHasta.value)}`);
  }
  if (filtroDescripcion.value) {
    filters.push(`Descripción: "${filtroDescripcion.value}"`);
  }
  return filters.join(' | ');
});

const totalGastadoBrutoFiltradoUI = computed(() => {
    if (!gastos.value || gastos.value.length === 0) return 0;
    return gastos.value.reduce((acc, gasto) => acc + (gasto.monto_total || 0), 0);
});

const totalAdelantosEspecificosFiltradosUI = computed(() => {
    if (!gastos.value || gastos.value.length === 0) return 0;
    return gastos.value.reduce((acc, gasto) => acc + (gasto.adelanto_especifico_aplicado || 0), 0);
});

const totalAdelantosDisponiblesViajeUI = computed(() => {
  if (!viajeSeleccionadoInfo.value) return totalAdelantosEspecificosFiltradosUI.value;
  const adelantoInicialViaje = viajeSeleccionadoInfo.value.monto_adelanto || 0;
  return adelantoInicialViaje + totalAdelantosEspecificosFiltradosUI.value;
});

const saldoActualViajeUI = computed(() => {
  if (!viajeSeleccionadoInfo.value) return null;
  return totalAdelantosDisponiblesViajeUI.value - totalGastadoBrutoFiltradoUI.value;
});

const isViajeActualCerrado = computed(() => {
    return !!viajeSeleccionadoInfo.value?.cerrado_en;
});

// --- FUNCIONES DE DATOS ---
const fetchDropdownData = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    currentUserEmail.value = user.email || 'Email no disponible';
    currentUserName.value = userProfile.value?.nombre_completo || user.email;
    
    const { data: tiposData, error: tiposError } = await supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true).order('nombre_tipo_gasto');
    if (tiposError) throw tiposError;
    tiposDeGastoDisponibles.value = tiposData || [];

    const { data: viajesData, error: viajesError } = await supabase.from('viajes').select('id, nombre_viaje, codigo_rendicion').eq('user_id', user.id).order('fecha_inicio', { ascending: false });
    if (viajesError) throw viajesError;
    listaViajesParaFiltro.value = viajesData || [];
  } catch (error) { 
    errorMessage.value = "Error cargando opciones de filtro."; 
  }
};

const fetchGastos = async () => {
  loading.value = true; 
  errorMessage.value = ''; 
  expandedRows.value.clear();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    let query = supabase.from('gastos')
      .select(`
        id, fecha_gasto, monto_total, moneda, descripcion_general, numero_factura, 
        factura_url, monto_iva, adelanto_especifico_aplicado, 
        viaje_id, datos_adicionales, 
        viajes!inner(id, nombre_viaje, monto_adelanto, fecha_inicio, fecha_fin, cerrado_en, codigo_rendicion), 
        tipos_gasto_config (id, nombre_tipo_gasto),
        clientes (nombre_cliente),
        transportes (nombre)
      `)
      .eq('user_id', user.id);

    if (filtroFechaDesde.value) query = query.gte('fecha_gasto', filtroFechaDesde.value);
    if (filtroFechaHasta.value) { 
      const fechaHasta = new Date(filtroFechaHasta.value);
      fechaHasta.setUTCDate(fechaHasta.getUTCDate() + 1);
      query = query.lt('fecha_gasto', fechaHasta.toISOString().split('T')[0]);
    }
    if (filtroTipoGastoId.value) query = query.eq('tipo_gasto_id', filtroTipoGastoId.value);
    
    // (N°6) LÓGICA DE BÚSQUEDA POR DESCRIPCIÓN
    if (filtroDescripcion.value) {
      query = query.ilike('descripcion_general', `%${filtroDescripcion.value}%`);
    }
    
    if (filtroViajeId.value) {
      query = query.eq('viaje_id', filtroViajeId.value);
      const { data: viajeData } = await supabase.from('viajes').select('*').eq('id', filtroViajeId.value).single();
      viajeSeleccionadoInfo.value = viajeData || null;
    } else { 
      viajeSeleccionadoInfo.value = null; 
    }

    const { data, error } = await query.order('fecha_gasto', { ascending: false });
    if (error) throw error;
    gastos.value = data || [];
  } catch (error) { 
    errorMessage.value = 'No se pudieron cargar los gastos: ' + error.message;
    gastos.value = [];
  } finally { 
    loading.value = false; 
  }
};

onMounted(fetchDropdownData);

watch(() => route.query.viajeId, (newViajeId) => {
    if (filtroViajeId.value !== (newViajeId || '')) {
        filtroViajeId.value = newViajeId || ''; 
    }
    fetchGastos(); 
}, { immediate: true });

// (N°6) WATCH CON DEBOUNCE PARA LA BÚSQUEDA
watch(filtroDescripcion, () => {
  clearTimeout(debounceTimeout.value);
  debounceTimeout.value = setTimeout(() => {
    fetchGastos();
  }, 500); // Espera 500ms después de la última pulsación de tecla
});

const aplicarFiltros = () => {
  if (String(filtroViajeId.value || '') !== String(route.query.viajeId || '')) {
      router.push({ 
        name: 'GastosListUser',
        query: { ...route.query, viajeId: filtroViajeId.value || undefined } 
      });
  } else {
      fetchGastos();
  }
};

const limpiarFiltros = () => {
  filtroFechaDesde.value = ''; 
  filtroFechaHasta.value = ''; 
  filtroTipoGastoId.value = '';
  filtroDescripcion.value = '';
  const teniaViajeIdEnRuta = !!route.query.viajeId;
  filtroViajeId.value = ''; 

  if (teniaViajeIdEnRuta) {
    router.push({ name: 'GastosListUser', query: {} });
  } else {
    fetchGastos(); 
  }
};

const goToNuevoGasto = () => {
  if (isViajeActualCerrado.value) {
    alert("No se pueden agregar nuevos gastos a un Viaje/Período que ya ha sido cerrado.");
    return;
  }
  const query = filtroViajeId.value ? { viajeId: filtroViajeId.value } : {};
  router.push({ name: 'GastoFormCreate', query });
};

const editarGasto = (gasto) => { 
  if (gasto.viajes?.cerrado_en) {
    alert("No se puede editar un gasto de un período que ya ha sido cerrado.");
    return;
  }
  router.push({ name: 'GastoFormEdit', params: { id: gasto.id } });
};

const eliminarGasto = async (gasto) => { 
  if (gasto.viajes?.cerrado_en) {
    alert("No se pueden eliminar gastos de un período que ya ha sido cerrado.");
    return;
  }
  if (!confirm(`¿Estás seguro de que querés eliminar el gasto "${gasto.descripcion_general || 'Gasto sin descripción'}"?`)) return;
  
  loading.value = true; 
  errorMessage.value = '';
  try {
    if (gasto.factura_url) {
        try {
            const urlObject = new URL(gasto.factura_url);
            const pathSegments = urlObject.pathname.split('/');
            const bucketNameInUrl = 'facturas'; 
            const bucketIndex = pathSegments.findIndex(segment => segment === bucketNameInUrl);
            if (bucketIndex !== -1 && bucketIndex < pathSegments.length -1) {
                const filePathInBucket = pathSegments.slice(bucketIndex + 1).join('/');
                if (filePathInBucket) { await supabase.storage.from(bucketNameInUrl).remove([filePathInBucket]); }
            }
        } catch (e) { console.warn("EliminarGasto: Error al eliminar factura de Storage:", e.message); }
    }
    const { error } = await supabase.from('gastos').delete().eq('id', gasto.id);
    if (error) throw error;
    fetchGastos(); 
    alert('Gasto eliminado correctamente.');
  } catch (error) {
    errorMessage.value = 'Error al eliminar el gasto: ' + error.message;
  } finally {
    loading.value = false;
  }
};

const exportarAExcelWrapper = () => {
  if (gastos.value.length === 0) { alert('No hay gastos para exportar a Excel.'); return; }
  const userInfo = { nombre_completo: currentUserName.value, email: currentUserEmail.value };
  generateGastosExcel(JSON.parse(JSON.stringify(gastos.value)), viajeSeleccionadoInfo.value, userInfo);
  isExportMenuOpen.value = false;
};

const generarRendicionPDFWrapper = () => {
  if (!viajeSeleccionadoInfo.value) {
    alert('Por favor, selecciona un viaje/período desde los filtros para generar la rendición.');
    return;
  }
  if (gastos.value.length === 0) {
    alert('No hay gastos en este período para generar la rendición.');
    return;
  }

  const userInfo = { nombre_completo: currentUserName.value, email: currentUserEmail.value };
  const totales = {
    gastosBruto: totalGastadoBrutoFiltradoUI.value,
    adelantosExtras: totalAdelantosEspecificosFiltradosUI.value,
    adelantosDisponibles: totalAdelantosDisponiblesViajeUI.value,
    saldoFinal: saldoActualViajeUI.value
  };

  generateRendicionCompletaPDF(
    JSON.parse(JSON.stringify(gastos.value)), 
    viajeSeleccionadoInfo.value, 
    userInfo,
    totales
  );
  isExportMenuOpen.value = false;
};
</script>
<template>
  <div class="bg-gray-100/50 min-h-screen">
    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      <!-- Encabezado Principal -->
      <div class="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">Mis Gastos</h1>
          <div v-if="viajeSeleccionadoInfo" class="mt-2 flex items-center gap-2 text-lg text-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 text-blue-500"><path d="M3.5 3.75a.25.25 0 0 1 .25-.25h5.5a.25.25 0 0 1 .25.25v1.5h4.75a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75-.75h-12a.75.75 0 0 1-.75-.75v-10a.75.75 0 0 1 .75-.75h1.5V3.75Z" /></svg>
            <span class="font-semibold">{{ viajeSeleccionadoInfo.nombre_viaje }}</span>
          </div>
           <p v-else class="mt-2 text-gray-600">Mostrando todos los gastos de todas las rendiciones.</p>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <div class="relative"><button @click="isExportMenuOpen = !isExportMenuOpen" class="btn-secondary w-full sm:w-auto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.47-3.47a.75.75 0 111.06 1.06l-4.75 4.75a.75.75 0 01-1.06 0l-4.75-4.75a.75.75 0 111.06-1.06l3.47 3.47V3.75A.75.75 0 0110 3z" clip-rule="evenodd" /></svg>Exportar</button><transition name="fade"><div v-if="isExportMenuOpen" @click.away="isExportMenuOpen = false" class="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10"><div class="py-1"><button @click="generarRendicionPDFWrapper" :disabled="!viajeSeleccionadoInfo" class="export-btn-pdf">Rendición a PDF</button><button @click="exportarAExcelWrapper" class="export-btn-excel">Exportar a Excel</button></div></div></transition></div>
          <button @click="goToNuevoGasto" :disabled="isViajeActualCerrado" class="btn-primary w-full sm:w-auto transform transition-transform duration-150 hover:scale-105"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>Nuevo Gasto</button>
        </div>
      </div>

      <!-- Tarjeta de Totales -->
      <div v-if="viajeSeleccionadoInfo" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="totals-card"><p class="totals-card-label">Adelanto del Viaje</p><p class="totals-card-value text-adelanto">{{ formatCurrency(totalAdelantosDisponiblesViajeUI) }}</p></div>
        <div class="totals-card"><p class="totals-card-label">Total Gastado</p><p class="totals-card-value text-gastado">{{ formatCurrency(totalGastadoBrutoFiltradoUI) }}</p></div>
        <div class="totals-card"><p class="totals-card-label">Saldo Actual</p><p class="text-2xl font-bold" :class="saldoActualViajeUI >= 0 ? 'text-green-600' : 'text-saldo-negativo'">{{ formatCurrency(saldoActualViajeUI) }}</p><p v-if="saldoActualViajeUI < 0" class="saldo-legend">Se debe reponer</p></div>
      </div>

      <p v-if="isViajeActualCerrado" class="info-banner-warning mb-6">Esta rendición está cerrada. No se pueden agregar, editar o eliminar gastos.</p>

      <!-- Contenedor Principal de Contenido -->
      <div class="bg-white rounded-xl shadow-lg border border-gray-200">
        
        <!-- Sección de Filtros -->
        <div class="p-4 border-b border-gray-200">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
            <div class="lg:col-span-3"><label for="filtro-viaje" class="form-label-filter">Rendición</label><select id="filtro-viaje" v-model="filtroViajeId" @change="aplicarFiltros" class="form-input"><option value="">Todas</option><option v-for="viaje in listaViajesParaFiltro" :key="viaje.id" :value="viaje.id">{{ viaje.nombre_viaje }}</option></select></div>
            <div class="lg:col-span-2"><label for="filtro-tipo" class="form-label-filter">Tipo de Gasto</label><div class="relative"><span class="filter-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Z" /></svg></span><select id="filtro-tipo" v-model="filtroTipoGastoId" @change="aplicarFiltros" class="form-input pl-8"><option value="">Todos</option><option v-for="tipo in tiposDeGastoDisponibles" :key="tipo.id" :value="tipo.id">{{ tipo.nombre_tipo_gasto }}</option></select></div></div>
            <div class="lg:col-span-3 grid grid-cols-2 gap-2"><div><label for="filtro-desde" class="form-label-filter">Fecha Desde</label><input id="filtro-desde" type="date" v-model="filtroFechaDesde" @change="aplicarFiltros" class="form-input"></div><div><label for="filtro-hasta" class="form-label-filter">Fecha Hasta</label><input id="filtro-hasta" type="date" v-model="filtroFechaHasta" @change="aplicarFiltros" class="form-input"></div></div>
            
            <!-- Campo de Búsqueda SIN ÍCONO -->
            <div class="lg:col-span-3">
              <label for="filtro-descripcion" class="form-label-filter">Buscar en Descripción</label>
              <input id="filtro-descripcion" type="text" v-model="filtroDescripcion" placeholder="Ej: Nafta, Hotel..." class="form-input">
            </div>
            
            <div class="lg:col-span-1"><button @click="limpiarFiltros" class="btn-clear-filter" title="Limpiar filtros"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z" /></svg><span>Limpiar</span></button></div>
          </div>
          <div v-if="activeFiltersText" class="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800"><span class="font-semibold">Filtros aplicados:</span> {{ activeFiltersText }}</div>
        </div>

        <!-- Indicadores de Carga/Error/Vacío -->
        <div v-if="loading" class="text-center py-20 text-gray-500">Cargando gastos...</div>
        <div v-else-if="errorMessage" class="m-4 error-banner">{{ errorMessage }}</div>
        <div v-else-if="gastos.length === 0" class="text-center py-20 text-gray-500"><p class="font-semibold">No se encontraron gastos.</p><p class="text-sm">Intenta ajustar los filtros o registra un nuevo gasto.</p></div>
        
        <!-- Contenido: Tabla (Desktop) y Cards (Mobile) -->
        <div v-else>
          <!-- Vista de Tabla para Desktop -->
          <div class="hidden md:block overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="table-header w-px"></th>
                  <th class="table-header">Fecha</th>
                  <th class="table-header">Tipo</th>
                  <th class="table-header">Descripción</th>
                  <th class="table-header text-right">Monto</th>
                  <th class="table-header text-center">Factura</th>
                  <th class="table-header text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <template v-for="gasto in gastos" :key="gasto.id">
                  <tr class="hover:bg-gray-50 transition-colors duration-150">
                    <td class="table-cell-bordered text-center"><button @click="toggleRowExpansion(gasto.id)" class="p-1 rounded-full hover:bg-gray-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-gray-500 transition-transform" :class="{'rotate-90': expandedRows.has(gasto.id)}"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" /></svg></button></td>
                    <td class="table-cell-bordered font-semibold">{{ formatDate(gasto.fecha_gasto) }}</td>
                    <td class="table-cell-bordered">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto }}</td>
                    <td class="table-cell-bordered font-medium text-gray-900 max-w-xs truncate" :title="gasto.descripcion_general">{{ gasto.descripcion_general }}</td>
                    <td class="table-cell-bordered text-right font-semibold text-gray-800">{{ formatCurrency(gasto.monto_total) }}</td>
                    <td class="table-cell-bordered text-center"><a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-factura-pill" title="Ver factura"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h7.5A2.25 2.25 0 0 0 14 11.75V7.5a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /><path d="M10 .75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.56L6.03 6.28a.75.75 0 0 1-1.06-1.06L8.69 1.5H7.25a.75.75 0 0 1 0-1.5h3.5Z" /></svg></a><span v-else class="text-gray-400">-</span></td>
                    <td class="table-cell-bordered text-right space-x-2"><button @click="editarGasto(gasto)" :disabled="gasto.viajes?.cerrado_en" class="btn-icon-action btn-icon-edit" title="Editar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg></button><button @click="eliminarGasto(gasto)" :disabled="gasto.viajes?.cerrado_en" class="btn-icon-action btn-icon-delete" title="Eliminar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button></td>
                  </tr>
                  <tr v-if="expandedRows.has(gasto.id)" class="bg-blue-50/30">
                    <td class="table-cell-bordered"></td>
                    <td class="table-cell-bordered" colspan="6"><div class="p-2"><DetallesJson :datos="gasto.datos_adicionales" /></div></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <!-- Vista de Cards para Mobile -->
          <div class="md:hidden divide-y divide-gray-200">
            <div v-for="gasto in gastos" :key="gasto.id" class="p-4">
              <div class="flex justify-between items-start">
                <div class="pr-4"><p class="font-semibold text-gray-800">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto }}</p><p class="text-xs text-gray-500">{{ formatDate(gasto.fecha_gasto) }}</p></div>
                <p class="font-bold text-lg text-gray-900 flex-shrink-0">{{ formatCurrency(gasto.monto_total) }}</p>
              </div>
              <p class="text-sm text-gray-700 mt-2">{{ gasto.descripcion_general }}</p>
              <div class="mt-3"><DetallesJson :datos="gasto.datos_adicionales" /></div>
              <div class="mt-4 flex justify-between items-center">
                <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-factura-pill" title="Ver factura"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h7.5A2.25 2.25 0 0 0 14 11.75V7.5a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /><path d="M10 .75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.56L6.03 6.28a.75.75 0 0 1-1.06-1.06L8.69 1.5H7.25a.75.75 0 0 1 0-1.5h3.5Z" /></svg></a>
                <span v-else></span>
                <div class="space-x-2"><button @click="editarGasto(gasto)" :disabled="gasto.viajes?.cerrado_en" class="btn-icon-action btn-icon-edit" title="Editar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg></button><button @click="eliminarGasto(gasto)" :disabled="gasto.viajes?.cerrado_en" class="btn-icon-action btn-icon-delete" title="Eliminar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.btn-primary { @apply inline-flex items-center justify-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed; }
.btn-secondary { @apply inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors; }
.info-banner-warning { @apply text-xs text-center sm:text-left text-yellow-800 bg-yellow-50 p-2 rounded-md border border-yellow-200 shadow-sm; }
.error-banner { @apply bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.text-adelanto { color: #3B82F6; }
.text-gastado { color: #1E40AF; }
.text-saldo-negativo { color: #EF4444; }
.saldo-legend { @apply text-xs text-red-600 mt-1; }
.table-cell-bordered { @apply px-4 py-3 whitespace-nowrap text-sm text-gray-600 border-r border-gray-200 last:border-r-0; }
.totals-card { @apply bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-center transition-all duration-200 hover:shadow-md hover:border-blue-300; }
.totals-card-label { @apply text-sm font-medium text-gray-500 mb-1; }
.totals-card-value { @apply text-2xl font-bold; }
.export-btn-pdf { @apply flex items-center w-full px-4 py-2 text-sm text-left text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors; }
.export-btn-excel { @apply flex items-center w-full px-4 py-2 text-sm text-left text-green-700 hover:bg-green-50 transition-colors; }
.form-label-filter { @apply block text-xs font-medium text-gray-600 mb-1; }
.filter-icon { @apply pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-gray-400; }
.btn-clear-filter { @apply inline-flex items-center justify-center gap-1 w-full h-full px-3 py-2 border border-gray-300 text-xs font-medium rounded-md shadow-sm text-gray-600 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors; }
.btn-clear-filter svg { @apply text-red-500; }
.btn-icon-action { @apply inline-flex items-center p-1.5 rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed; }
.btn-icon-edit { @apply text-blue-600 hover:bg-blue-100 hover:scale-110 disabled:hover:bg-transparent disabled:hover:scale-100; }
.btn-icon-delete { @apply text-red-600 hover:bg-red-100 hover:scale-110 disabled:hover:bg-transparent disabled:hover:scale-100; }
.btn-factura-pill { @apply inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-all duration-150; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.1s ease-in-out; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>