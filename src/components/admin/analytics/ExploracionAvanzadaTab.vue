<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../../../supabaseClient';
import { formatCurrency, formatDate } from '../../../utils/formatters.js';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { ArrowDownTrayIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline';
import { useExcelExporter } from '../../../composables/useExcelExporter';
import { useRouter } from 'vue-router';

const props = defineProps({
  tipoGastoOptions: { type: Array, required: true },
  loadingOptions: { type: Boolean, required: true },
});

const emit = defineEmits(['show-notification']);

const { exportToExcel } = useExcelExporter();
const router = useRouter();

const loading = ref(false);
const error = ref('');
const filters = ref({
  clienteId: null,
  transporteId: null,
  tipoGastoId: null,
  provinciaId: null,
  paciente: '',
  fechaDesde: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
  fechaHasta: new Date().toISOString().split('T')[0],
});
const gastosFiltrados = ref([]);
const options = ref({
  clientes: [],
  transportes: [],
  provincias: [],
});
const loadingExtraOptions = ref(true);

// --- INICIO DE LA CORRECCIÓN: AÑADIR ESTADO DE PAGINACIÓN ---
const resultsPerPage = ref(20);
const currentPage = ref(1);
const totalResults = ref(0);

const pageCount = computed(() => Math.ceil(totalResults.value / resultsPerPage.value));
const rangeFrom = computed(() => (currentPage.value - 1) * resultsPerPage.value);
const rangeTo = computed(() => rangeFrom.value + resultsPerPage.value - 1);
// --- FIN DE LA CORRECCIÓN ---

async function applyFilters() {
    loading.value = true;
    error.value = '';
    try {
        // La RPC no soporta paginación, así que la haremos en el cliente por ahora.
        // Para una solución a gran escala, la RPC debería aceptar `limit` y `offset`.
        const { data, error: rpcError } = await supabase.rpc('filtrar_gastos_admin', {
            p_cliente_id: filters.value.clienteId,
            p_transporte_id: filters.value.transporteId,
            p_tipo_gasto_id: filters.value.tipoGastoId,
            p_provincia_id: filters.value.provinciaId,
            p_paciente: filters.value.paciente || null,
            p_fecha_desde: filters.value.fechaDesde || null,
            p_fecha_hasta: filters.value.fechaHasta || null
        });

        if (rpcError) throw rpcError;
        
        // Guardamos todos los resultados y luego paginamos
        totalResults.value = data?.length || 0;
        const start = rangeFrom.value;
        const end = start + resultsPerPage.value;
        gastosFiltrados.value = (data || []).slice(start, end);

    } catch (e) {
        error.value = `Error al buscar datos: ${e.message}`;
        gastosFiltrados.value = [];
        totalResults.value = 0;
    } finally {
        loading.value = false;
    }
}

async function fetchExtraOptions() {
    loadingExtraOptions.value = true;
    try {
      const [clientesRes, transportesRes, provinciasRes] = await Promise.all([
          supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
          supabase.from('transportes').select('id, nombre').order('nombre'),
          supabase.from('provincias').select('id, nombre').order('nombre')
      ]);
      if (clientesRes.error) throw clientesRes.error;
      options.value.clientes = clientesRes.data.map(c => ({ label: c.nombre_cliente, code: c.id }));
      if (transportesRes.error) throw transportesRes.error;
      options.value.transportes = transportesRes.data.map(t => ({ label: t.nombre, code: t.id }));
      if (provinciasRes.error) throw provinciasRes.error;
      options.value.provincias = provinciasRes.data.map(p => ({ label: p.nombre, code: p.id }));
    } catch(e) {
      console.error("Error cargando opciones de exploración:", e);
      error.value = "No se pudieron cargar las opciones de filtro.";
    } finally {
      loadingExtraOptions.value = false;
    }
}

// --- INICIO DE LA CORRECCIÓN: AÑADIR FUNCIONES DE PAGINACIÓN ---
function goToPage(page) {
  if (page > 0 && page <= pageCount.value) {
    currentPage.value = page;
    applyFilters(); // Recargamos los datos para la nueva página
  }
}

function changeResultsPerPage() {
  currentPage.value = 1;
  applyFilters();
}
// --- FIN DE LA CORRECCIÓN ---

function goToRendicion(viajeId) {
  if (!viajeId) return;
  // router.push({ name: 'AdminGastosDeRendicion', params: { id: viajeId } });
}

const handleExport = async () => {
  emit('show-notification', 'Exportando', 'Preparando tu reporte completo...', 'info');
  try {
    // Para exportar, traemos TODOS los resultados, sin paginación
    const { data: allData, error: exportError } = await supabase.rpc('filtrar_gastos_admin', {
        p_cliente_id: filters.value.clienteId,
        p_transporte_id: filters.value.transporteId,
        p_tipo_gasto_id: filters.value.tipoGastoId,
        p_provincia_id: filters.value.provinciaId,
        p_paciente: filters.value.paciente || null,
        p_fecha_desde: filters.value.fechaDesde || null,
        p_fecha_hasta: filters.value.fechaHasta || null
    });
    if (exportError) throw exportError;

    if (!allData || allData.length === 0) {
      emit('show-notification', 'Aviso', 'No hay resultados para exportar.', 'warning');
      return;
    }

    const dataToExport = allData.map(item => ({
      'Fecha': formatDate(item.fecha_gasto),
      'Responsable': item.responsable_gasto_nombre,
      'Tipo Gasto': item.nombre_tipo_gasto,
      'Descripción': item.gasto_descripcion,
      'Rendición': item.nombre_viaje,
      'Monto': item.gasto_monto_total,
      'Cod. Rendición': item.viaje_codigo_rendicion,
      'Proveedor': item.nombre_proveedor,
      'Cliente': item.nombre_cliente,
    }));

    const sheets = [{ name: 'ExploracionAvanzada', data: dataToExport }];
    exportToExcel(sheets, 'exploracion_avanzada');
    setTimeout(() => { emit('show-notification', 'Éxito', 'Reporte generado.', 'success'); }, 500);
  } catch (e) {
    emit('show-notification', 'Error', `No se pudo generar el reporte: ${e.message}`, 'error');
    console.error("Error al exportar:", e);
  }
};

onMounted(() => {
  fetchExtraOptions();
  applyFilters();
});
</script>
<template>
  <div id="exploration-content">
    <section class="section-container mb-8">
      <h2 class="section-title">Filtros de Exploración</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div><label class="form-label">Cliente</label><v-select v-model="filters.clienteId" :options="options.clientes" :loading="loadingExtraOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter"></v-select></div>
        <div><label class="form-label">Transporte</label><v-select v-model="filters.transporteId" :options="options.transportes" :loading="loadingExtraOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter"></v-select></div>
        <div><label class="form-label">Tipo de Gasto</label><v-select v-model="filters.tipoGastoId" :options="tipoGastoOptions" :loading="loadingOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter"></v-select></div>
        <div><label class="form-label">Provincia</label><v-select v-model="filters.provinciaId" :options="options.provincias" :loading="loadingExtraOptions" :reduce="option => option.code" placeholder="Todas" class="v-select-filter"></v-select></div>
        
        <div class="lg:col-span-2"><label class="form-label">Paciente / Referencia</label><input type="text" v-model="filters.paciente" placeholder="Buscar por paciente..." class="form-input"></div>
        <div><label class="form-label">Fecha Desde</label><input type="date" v-model="filters.fechaDesde" class="form-input"></div>
        <div><label class="form-label">Fecha Hasta</label><input type="date" v-model="filters.fechaHasta" class="form-input"></div>
        <div class="flex items-end">
          <button @click="applyFilters" class="btn-primary w-full">Aplicar Filtros</button>
        </div>
      </div>
    </section>

    <section class="section-container">
      <div class="flex justify-between items-center mb-4">
        <h2 class="section-title !mb-0">Resultados ({{ gastosFiltrados.length }})</h2>
        <button @click="handleExport" :disabled="gastosFiltrados.length === 0" class="btn-primary btn-sm inline-flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"><ArrowDownTrayIcon class="h-4 w-4"/>Exportar Resultados</button>
      </div>
      <div v-if="loading" class="text-center py-20"><svg class="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
      <div v-else-if="error" class="error-banner">{{ error }}</div>
      <div v-else-if="gastosFiltrados.length > 0">
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead><tr><th class="table-header">Fecha</th><th class="table-header">Responsable</th><th class="table-header">Tipo Gasto</th><th class="table-header">Descripción</th><th class="table-header">Rendición</th><th class="table-header text-right">Monto</th></tr></thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="gasto in gastosFiltrados" :key="gasto.gasto_id">
                <td class="table-cell">{{ formatDate(gasto.fecha_gasto) }}</td>
                <td class="table-cell">
                  <div class="font-medium text-gray-900">{{ gasto.responsable_gasto_nombre }}</div>
                </td>
                <td class="table-cell">{{ gasto.nombre_tipo_gasto }}</td>
                <td class="table-cell max-w-xs truncate" :title="gasto.gasto_descripcion">{{ gasto.gasto_descripcion }}</td>
                <td class="table-cell text-xs">
                  <a v-if="gasto.viaje_id" @click.prevent="goToRendicion(gasto.viaje_id)" href="#" class="text-blue-600 hover:underline">
                    {{ gasto.nombre_viaje }} (#{{ gasto.viaje_codigo_rendicion }})
                  </a>
                  <span v-else class="text-gray-400">N/A</span>
                </td>
                <td class="table-cell text-right font-semibold">{{ formatCurrency(gasto.gasto_monto_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="no-data-placeholder py-16"><div class="text-center"><MagnifyingGlassIcon class="h-12 w-12 mx-auto text-gray-400" /><h4 class="mt-2 text-lg font-medium text-gray-800">Sin Resultados</h4><p class="mt-1 text-sm text-gray-500">Ajusta los filtros para comenzar una nueva búsqueda.</p></div></div>
    </section>
  </div>
</template>

<style scoped>
.btn-secondary {
  @apply bg-white text-gray-700 font-semibold py-1.5 px-3 rounded-lg border border-gray-300 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed;
}
.btn-secondary.btn-sm {
  @apply text-sm;
}
</style>
