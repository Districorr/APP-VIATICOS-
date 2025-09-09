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
  <div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div><label class="form-label">Fecha Desde</label><input type="date" v-model="filters.fechaDesde" class="form-input"></div>
      <div><label class="form-label">Fecha Hasta</label><input type="date" v-model="filters.fechaHasta" class="form-input"></div>
      <div>
        <label class="form-label">Responsable</label>
        <v-select 
          v-model="filters.selectedResponsable"
          :options="perfilesOptions" 
          :loading="loadingOptions" 
          placeholder="Todos" 
          class="v-select-filter bg-white"
          :class="{ 'filter-active': filters.selectedResponsable }"
          label="label"
          track-by="code"
        ></v-select>
      </div>
    </div>
    <div v-if="loading && !dashboardData" class="text-center py-20"><svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
    <div v-else-if="error" class="error-banner">{{ error }}</div>
    <div v-else class="space-y-8">
      <section><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Costo Promedio / Rendición" :value="kpis?.costo_promedio" formatAs="currency" :loading="loading" />
        <StatCard title="Duración Promedio" :value="kpis?.duracion_promedio" :suffix="kpis?.duracion_promedio === 1 ? ' día' : ' días'" :loading="loading" />
        <StatCard title="Rendiciones Procesadas" :value="kpis?.total_rendiciones" :loading="loading" />
        <StatCard title="Total Gastado" :value="kpis?.costo_total" formatAs="currency" :loading="loading" />
      </div></section>
      
      <section v-if="filters.selectedResponsable" class="section-container bg-indigo-50 border-indigo-200">
        <h2 class="section-title text-indigo-800">Insights de Comportamiento para: {{ filters.selectedResponsable.label }}</h2>
        <div v-if="loadingInsights" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div v-for="i in 4" :key="i" class="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
        <div v-else-if="insightsData" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="insight-card">
            <p class="insight-text">Sus días de mayor gasto suelen ser los <span class="insight-highlight">{{ insightsData.dias_mayor_gasto?.join(' y ') || 'N/A' }}</span>.</p>
          </div>
          <div class="insight-card">
            <p class="insight-text">Generalmente, rinde sus adelantos los días <span class="insight-highlight">{{ insightsData.dia_cierre_comun || 'N/A' }}</span>.</p>
          </div>
          
          <!-- INICIO: Tarjeta de Insight Modificada -->
          <div class="insight-card">
            <p class="insight-text">Sus gastos se concentran más en <span class="insight-highlight">{{ insightsData.tipo_gasto_principal || 'N/A' }}</span>.</p>
            <div v-if="insightsData.gasto_mas_alto" class="text-xs text-gray-500 mt-2 space-y-1">
              <p>
                <span class="font-semibold">Gasto más alto:</span> {{ formatCurrency(insightsData.gasto_mas_alto.monto_total) }}
              </p>
              <p>
                <span class="font-semibold">Tipo:</span> {{ insightsData.gasto_mas_alto.nombre_tipo_gasto }}
              </p>
              <p>
                <span class="font-semibold">Descripción:</span> "{{ insightsData.gasto_mas_alto.descripcion_general }}"
              </p>
              <p>
                <span class="font-semibold">Rendición:</span> #{{ insightsData.gasto_mas_alto.codigo_rendicion }}
              </p>
            </div>
          </div>
          <!-- FIN: Tarjeta de Insight Modificada -->

          <div class="insight-card">
            <p class="insight-text">Registra la mayoría de sus gastos en el sistema los días <span class="insight-highlight">{{ insightsData.dia_registro_comun || 'N/A' }}</span>.</p>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section class="section-container">
          <h2 class="section-title">Costo Promedio por Responsable</h2>
          <div class="h-96">
            <Bar v-if="efficiencyBarChartData" :data="efficiencyBarChartData" :options="{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: true, position: 'bottom' } } }" />
            <div v-else class="no-data-placeholder h-full"><p>No hay datos para mostrar.</p></div>
          </div>
        </section>
        <section class="section-container">
          <h2 class="section-title">Matriz de Eficiencia (Costo vs. Duración)</h2>
          <div class="h-96">
            <Bubble v-if="efficiencyBubbleChartData" :data="efficiencyBubbleChartData" :options="efficiencyBubbleChartOptions" />
            <div v-else class="no-data-placeholder h-full"><p>No hay datos para mostrar.</p></div>
          </div>
        </section>
      </div>

      <section class="section-container">
          <div class="flex justify-between items-center mb-4">
              <h2 class="section-title !mb-0">Eficiencia por Responsable</h2>
              <button @click="handleExport" class="btn-primary btn-sm inline-flex items-center gap-2">
                  <ArrowDownTrayIcon class="h-4 w-4"/>Exportar
              </button>
          </div>
          <div class="overflow-x-auto">
              <table class="min-w-full">
                  <thead>
                      <tr>
                          <th class="table-header">Responsable</th>
                          <th class="table-header text-right"># Rend.</th>
                          <th class="table-header text-right">Costo Total</th>
                          <th class="table-header text-right">Duración Prom. (Días)</th>
                          <th class="table-header text-right bg-blue-50/50">Costo Diario Promedio</th>
                      </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                      <tr v-for="item in eficienciaData" :key="item.responsable_id" class="hover:bg-gray-50">
                          <td class="table-cell font-medium">{{ item.responsable_nombre }}</td>
                          <td class="table-cell text-right">{{ item.cantidad_rendiciones }}</td>
                          <td class="table-cell text-right">{{ formatCurrency(item.costo_total) }}</td>
                          <td class="table-cell text-right">{{ item.duracion_promedio }}</td>
                          <td class="table-cell text-right font-bold text-blue-700 bg-blue-50/50">
                              {{ formatCurrency(item.costo_diario_promedio) }}
                          </td>
                      </tr>
                      <tr v-if="eficienciaData.length === 0">
                          <td colspan="5" class="text-center py-10 text-gray-500">No hay datos de eficiencia para el período seleccionado.</td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </section>
    </div>
  </div>
</template>
<style>
/* Estilo para resaltar el filtro cuando está activo */
.filter-active {
  --vs-border-color: #3b82f6;
  --vs-ring-color: #3b82f6;
}
.filter-active .vs__dropdown-toggle {
  border-color: var(--vs-border-color);
  box-shadow: 0 0 0 2px var(--vs-ring-color);
}

/* Estilos para las nuevas tarjetas de insights */
.insight-card {
  @apply bg-white/60 p-4 rounded-lg shadow-sm;
}
.insight-text {
  @apply text-sm text-gray-700;
}
.insight-highlight {
  @apply font-bold text-indigo-700;
}
</style>
