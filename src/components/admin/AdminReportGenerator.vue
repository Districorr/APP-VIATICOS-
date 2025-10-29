<script setup>
import { ref, reactive, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useAdminReports } from '../../composables/useAdminReports.js';
import { useReportGenerator } from '../../composables/useReportGenerator.js';
import { useExcelExporter } from '../../composables/useExcelExporter.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

// Componentes hijos
import ReportEmailModal from './ReportEmailModal.vue';
import ReportScheduleDrawer from './ReportScheduleDrawer.vue';
import StatCard from './StatCard.vue'; // Asumiendo que tienes un componente StatCard reutilizable

// --- PROPS & EMITS ---
const props = defineProps({
  initialDateRange: { type: Object, default: null },
  initialGranularity: { type: String, default: 'daily' },
  initialFilters: { type: Object, default: () => ({}) },
  asModal: { type: Boolean, default: false }
});

const emit = defineEmits(['exported:pdf', 'exported:xlsx', 'sent:email', 'scheduled:save', 'error', 'show-notification']);

// --- COMPOSABLES ---
const { 
  loading, 
  error, 
  filters, 
  rawData,
  kpis, 
  tables, 
  executeReportGeneration, 
  sendEmail, 
  saveSchedule 
} = useAdminReports({
  initialDateRange: props.initialDateRange,
  initialGranularity: props.initialGranularity,
  initialFilters: props.initialFilters
});

const { generateAdminOperativoPDF } = useReportGenerator();
const { exportJsonToExcel } = useExcelExporter();

// --- LOCAL UI STATE ---
const isEmailModalOpen = ref(false);
const isScheduleDrawerOpen = ref(false);
const isSendingEmail = ref(false);
const filterOptions = reactive({
  responsables: [],
  clientes: [],
  provincias: [],
  transportes: [],
  tiposGasto: []
});

// --- FILTER MANAGEMENT ---
const loadFilterOptions = async () => {
  try {
    const [responsables, clientes, provincias, transportes, tiposGasto] = await Promise.all([
      supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
      supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
      supabase.from('provincias').select('id, nombre').order('nombre'),
      supabase.from('transportes').select('id, nombre').order('nombre'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').order('nombre_tipo_gasto')
    ]);
    filterOptions.responsables = responsables.data;
    filterOptions.clientes = clientes.data;
    filterOptions.provincias = provincias.data;
    filterOptions.transportes = transportes.data;
    filterOptions.tiposGasto = tiposGasto.data;
  } catch (e) {
    console.error("Error loading filter options:", e);
    error.value = "No se pudieron cargar las opciones de filtro.";
  }
};

const resetFilters = () => {
  const today = new Date();
  const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
  
  filters.dateRange = {
    from: thirtyDaysAgo,
    to: today,
  };
  filters.granularity = 'daily';
  filters.responsable_id = null;
  filters.cliente_id = null;
  filters.provincia_id = null;
  filters.transporte_id = null;
  filters.tipo_gasto_id = null;
};

onMounted(() => {
  loadFilterOptions();
});

// --- EXPORT & SEND ACTIONS ---
const handleExportPDF = async () => {
  if (!rawData.value || rawData.value.length === 0) {
    emit('show-notification', 'Sin Datos', 'No hay datos para generar el reporte.', 'warning');
    return;
  }
  // Llamamos sin el tercer parámetro para que use el default 'save' y descargue el archivo
  await generateAdminOperativoPDF(kpis.value, tables.value, filters);
  emit('exported:pdf');
};

const handleExportTableXLSX = (tableKey, fileName) => {
  const dataToExport = tables.value[tableKey];
  if (!dataToExport || dataToExport.length === 0) {
    emit('show-notification', 'Sin Datos', 'No hay datos en esta tabla para exportar.', 'warning');
    return;
  }
  exportJsonToExcel(dataToExport, fileName);
  emit('exported:xlsx', { table: tableKey });
};

// En src/components/admin/AdminReportGenerator.vue

const handleSendEmail = async (emailData) => {
  isSendingEmail.value = true;
  try {
    // Ya no generamos el PDF aquí. El backend se encarga de todo.
    await sendEmail(emailData);
    
    isEmailModalOpen.value = false;
    emit('sent:email', { recipients: emailData.to });
    emit('show-notification', 'Éxito', 'El correo ha sido puesto en cola para su envío.', 'success');
  } catch (e) {
    console.error("Failed to send email:", e);
    emit('error', e);
    emit('show-notification', 'Error de Envío', e.message, 'error');
  } finally {
    isSendingEmail.value = false;
  }
};

const handleSaveSchedule = async (scheduleConfig) => {
  try {
    const configToSave = {
      ...scheduleConfig,
      filters_json: JSON.stringify(filters)
    };
    await saveSchedule(configToSave);
    isScheduleDrawerOpen.value = false;
    emit('scheduled:save', configToSave);
    emit('show-notification', 'Guardado', 'La programación del reporte se ha guardado correctamente.', 'success');
  } catch (e) {
    console.error("Failed to save schedule:", e);
    emit('error', e);
    emit('show-notification', 'Error', 'No se pudo guardar la programación.', 'error');
  }
};
</script>
<template>
  <div class="space-y-8">
    <!-- Encabezado y Acciones Globales -->
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">Reportes Administrativos</h1>
        <p class="text-gray-500 mt-1">Análisis operativo de gastos por período.</p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="handleExportPDF" class="btn-secondary">Exportar PDF</button>
        <button @click="isEmailModalOpen = true" class="btn-secondary">Enviar por Correo</button>
        <button @click="isScheduleDrawerOpen = true" class="btn-primary">Programación</button>
      </div>
    </header>

    <!-- Filtros -->
    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <div class="form-group xl:col-span-2">
          <label class="form-label">Rango de Fechas</label>
          <div class="flex items-center gap-2">
            <input 
              type="date" 
              :value="formatDate(filters.dateRange.from, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')" 
              @input="filters.dateRange.from = new Date($event.target.value + 'T00:00:00')" 
              class="form-input"
            >
            <span class="text-gray-400">-</span>
            <input 
              type="date" 
              :value="formatDate(filters.dateRange.to, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')" 
              @input="filters.dateRange.to = new Date($event.target.value + 'T23:59:59')" 
              class="form-input"
            >
          </div>
        </div>
        <div class="form-group">
          <label for="granularity" class="form-label">Granularidad</label>
          <select id="granularity" v-model="filters.granularity" class="form-input">
            <option value="daily">Diario</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>
        <div class="form-group">
          <label for="responsable" class="form-label">Responsable</label>
          <select id="responsable" v-model="filters.responsable_id" class="form-input">
            <option :value="null">Todos</option>
            <option v-for="opt in filterOptions.responsables" :key="opt.id" :value="opt.id">{{ opt.nombre_completo }}</option>
          </select>
        </div>
        <div class="form-group">
          <label for="cliente" class="form-label">Cliente</label>
          <select id="cliente" v-model="filters.cliente_id" class="form-input">
            <option :value="null">Todos</option>
            <option v-for="opt in filterOptions.clientes" :key="opt.id" :value="opt.id">{{ opt.nombre_cliente }}</option>
          </select>
        </div>
        <div class="flex items-end">
          <button @click="resetFilters" class="btn-secondary w-full">Restablecer</button>
        </div>
      </div>
    </div>

    <!-- ESTADO DE CARGA -->
    <div v-if="loading" class="space-y-8">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div v-for="i in 4" :key="i" class="animate-pulse h-28 bg-gray-200 rounded-xl"></div>
      </div>
      <div class="animate-pulse h-64 bg-gray-200 rounded-xl"></div>
    </div>

    <!-- ESTADO DE ERROR -->
    <div v-else-if="error" class="text-center py-10 bg-white rounded-xl border border-red-200">
      <p class="font-semibold text-red-600">¡Ocurrió un error!</p>
      <p class="text-gray-500 mt-2">{{ error }}</p>
      <button @click="executeReportGeneration" class="mt-4 btn-primary">Reintentar</button>
    </div>

    <!-- ESTADO SIN DATOS -->
    <div v-else-if="!rawData || rawData.length === 0" class="text-center py-20 bg-white rounded-xl border border-gray-200">
      <h3 class="text-lg font-medium text-gray-900">Sin datos para el período seleccionado</h3>
      <p class="mt-1 text-sm text-gray-500">Intenta ajustar los filtros o selecciona un rango de fechas diferente.</p>
    </div>

    <!-- CONTENIDO PRINCIPAL -->
    <div v-else class="space-y-8">
      <!-- KPIs -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Gasto Total" :value="kpis.gastoTotal" formatAs="currency" :loading="loading" :percentage="kpis.variacionVsPeriodoAnterior" />
        <StatCard title="Gasto Promedio Diario" :value="kpis.gastoPromedioDiario" formatAs="currency" :loading="loading" />
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h3 class="text-sm font-medium text-gray-500 truncate">Top Tipo de Gasto</h3>
          <p class="text-xl font-semibold text-gray-800 mt-1 truncate">{{ kpis.topTipoGasto.nombre }}</p>
          <p class="text-sm text-gray-500">{{ formatCurrency(kpis.topTipoGasto.monto) }} ({{ kpis.topTipoGasto.porcentaje.toFixed(1) }}%)</p>
        </div>
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h3 class="text-sm font-medium text-gray-500 truncate">Top Cliente</h3>
          <p class="text-xl font-semibold text-gray-800 mt-1 truncate">{{ kpis.topCliente.nombre }}</p>
          <p class="text-sm text-gray-500">{{ formatCurrency(kpis.topCliente.monto) }} ({{ kpis.topCliente.porcentaje.toFixed(1) }}%)</p>
        </div>
      </section>

      <!-- Tablas de Datos -->
      <section class="section-container">
        <div class="flex items-center justify-between mb-4">
          <h2 class="section-title mb-0">Totales por Período ({{ filters.granularity }})</h2>
          <button @click="handleExportTableXLSX('totalesPorPeriodo', 'totales_por_periodo')" class="text-sm font-semibold text-indigo-600 hover:text-indigo-500">Exportar XLSX</button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="table-header">Período</th>
                <th class="table-header">Cant. Gastos</th>
                <th class="table-header text-right">Monto Total</th>
                <th class="table-header text-right">Ticket Promedio</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="row in tables.totalesPorPeriodo" :key="row.periodo" class="hover:bg-gray-50">
                <td class="table-cell font-medium text-gray-800">{{ row.periodo }}</td>
                <td class="table-cell">{{ row.cantidad_gastos }}</td>
                <td class="table-cell text-right font-semibold">{{ formatCurrency(row.monto_total) }}</td>
                <td class="table-cell text-right">{{ formatCurrency(row.ticket_promedio) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      
      <section class="section-container">
        <div class="flex items-center justify-between mb-4">
          <h2 class="section-title mb-0">Desglose por Tipo de Gasto</h2>
          <button @click="handleExportTableXLSX('porTipoGasto', 'desglose_por_tipo_gasto')" class="text-sm font-semibold text-indigo-600 hover:text-indigo-500">Exportar XLSX</button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="table-header">Tipo de Gasto</th>
                <th class="table-header">Cant.</th>
                <th class="table-header text-right">Monto</th>
                <th class="table-header text-right">% del Total</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="row in tables.porTipoGasto" :key="row.Tipo" class="hover:bg-gray-50">
                <td class="table-cell font-medium text-gray-800">{{ row.Tipo }}</td>
                <td class="table-cell">{{ row.cantidad }}</td>
                <td class="table-cell text-right font-semibold">{{ formatCurrency(row.monto) }}</td>
                <td class="table-cell text-right">{{ row.porcentaje.toFixed(2) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>

    <!-- Modals and Drawers -->
    <ReportEmailModal 
      :is-open="isEmailModalOpen" 
      :is-sending="isSendingEmail"
      @close="isEmailModalOpen = false" 
      @send="handleSendEmail" 
    />
    <ReportScheduleDrawer 
      :is-open="isScheduleDrawerOpen" 
      @close="isScheduleDrawerOpen = false" 
      @save="handleSaveSchedule" 
    />
  </div>
</template>

<style scoped>
.btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors; }
.btn-secondary { @apply bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors; }
.form-label { @apply block text-xs font-medium text-gray-600 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition; }
.section-container { @apply bg-white p-6 rounded-xl shadow-sm border border-gray-200; }
.section-title { @apply text-lg font-semibold text-gray-800 mb-4; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm text-gray-600; }
</style>