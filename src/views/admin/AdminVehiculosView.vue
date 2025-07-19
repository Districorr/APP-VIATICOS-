// src/views/admin/AdminVehiculosView.vue
<script setup>
import { ref, onMounted, reactive, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { useExcelExporter } from '../../composables/useExcelExporter';

// Imports para Gráficos y Componentes
import { Bar as BarChart, Line as LineChart, Doughnut as DoughnutChart } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler } from 'chart.js';
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler);

import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

import StatCard from '../../components/admin/StatCard.vue';
import { ListBulletIcon, ChartBarIcon, DocumentTextIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline';

const router = useRouter();
const { exportToExcel } = useExcelExporter();

// --- ESTADO GENERAL DE LA VISTA ---
const activeTab = ref('lista'); // 'lista', 'analisis', 'gastos_flota'

// --- ESTADO PESTAÑA "LISTA DE VEHÍCULOS" ---
const vehiculos = ref([]);
const loadingList = ref(true);
const listError = ref('');
const showForm = ref(false);
const isEditMode = ref(false);
const form = ref({ id: null, patente: '', marca: '', modelo: '', ano: null, activo: true, responsable_id: null });
const perfilesOptions = ref([]);

// --- ESTADO PESTAÑA "ANÁLISIS DE FLOTA" ---
const loadingAnalysis = ref(true);
const analysisError = ref('');
const analysisData = ref(null);
const analysisFilters = ref({
  fechaDesde: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().split('T')[0],
  fechaHasta: new Date().toISOString().split('T')[0],
});

// --- ESTADO PESTAÑA "GASTOS DE FLOTA" ---
const loadingGastosFlota = ref(true);
const gastosFlotaError = ref('');
const gastosFlota = ref([]);
const gastosFlotaFilters = ref({
  fechaDesde: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
  fechaHasta: new Date().toISOString().split('T')[0],
  vehiculoId: null,
  tipoGastoId: null,
});
const tiposGastoOptions = ref([]);

// --- LÓGICA PESTAÑA "LISTA DE VEHÍCULOS" ---
async function fetchVehiculosYPerfiles() {
  loadingList.value = true;
  listError.value = '';
  try {
    const [vehiculosRes, perfilesRes] = await Promise.all([
      supabase.from('vehiculos').select('*').order('marca').order('modelo'),
      supabase.from('perfiles').select('id, nombre_completo')
    ]);

    if (vehiculosRes.error) throw vehiculosRes.error;
    if (perfilesRes.error) throw perfilesRes.error;

    const perfilesMap = new Map(perfilesRes.data.map(p => [p.id, p.nombre_completo]));
    
    vehiculos.value = vehiculosRes.data.map(v => ({
      ...v,
      nombre_responsable: v.responsable_id ? perfilesMap.get(v.responsable_id) : null
    }));
    
    perfilesOptions.value = perfilesRes.data.map(p => ({ label: p.nombre_completo, code: p.id }));

  } catch (e) {
    listError.value = `Error al cargar datos: ${e.message}`;
  } finally {
    loadingList.value = false;
  }
}

function openNewForm() {
  isEditMode.value = false;
  form.value = { id: null, patente: '', marca: '', modelo: '', ano: new Date().getFullYear(), activo: true, responsable_id: null };
  showForm.value = true;
}

function openEditForm(vehiculo) {
  isEditMode.value = true;
  form.value = { 
    id: vehiculo.id,
    patente: vehiculo.patente,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    ano: vehiculo.ano,
    activo: vehiculo.activo,
    responsable_id: vehiculo.responsable_id 
  };
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
}

async function handleSubmit() {
  if (!form.value.patente) {
    alert('La patente es obligatoria.');
    return;
  }
  
  const payload = { ...form.value };
  delete payload.id;
  delete payload.nombre_responsable;

  try {
    let error;
    if (isEditMode.value) {
      ({ error } = await supabase.from('vehiculos').update(payload).eq('id', form.value.id));
    } else {
      ({ error } = await supabase.from('vehiculos').insert(payload));
    }
    if (error) throw error;
    
    closeForm();
    await fetchVehiculosYPerfiles();
  } catch (e) {
    alert(`Error al guardar el vehículo: ${e.message}`);
  }
}

async function handleDelete(id) {
  if (!confirm('¿Estás seguro de que quieres eliminar este vehículo?')) return;
  try {
    const { error } = await supabase.from('vehiculos').delete().eq('id', id);
    if (error) throw error;
    await fetchVehiculosYPerfiles();
  } catch (e) {
    alert(`Error al eliminar el vehículo: ${e.message}`);
  }
}

function goToDetails(vehiculoId) {
  router.push({ name: 'AdminVehiculoDetalle', params: { id: vehiculoId } });
}

// --- LÓGICA PESTAÑA "ANÁLISIS DE FLOTA" ---
async function fetchAnalysisData() {
  loadingAnalysis.value = true;
  analysisError.value = '';
  try {
    const { data, error } = await supabase.rpc('get_analisis_flota_global', {
      p_start_date: analysisFilters.value.fechaDesde,
      p_end_date: analysisFilters.value.fechaHasta,
    });
    if (error) throw error;
    analysisData.value = data;
  } catch (e) {
    analysisError.value = `Error al cargar el análisis: ${e.message}`;
  } finally {
    loadingAnalysis.value = false;
  }
}

const kpisAnalysis = computed(() => analysisData.value?.kpis || {});
const chartColors = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#64748b'];

const costoPorVehiculoData = computed(() => {
  if (!analysisData.value?.charts?.costo_por_vehiculo) return null;
  const data = analysisData.value.charts.costo_por_vehiculo;
  return {
    labels: data.map(d => d.nombre_vehiculo),
    datasets: [{ label: 'Costo Total', data: data.map(d => d.total), backgroundColor: chartColors, }]
  };
});

const costoPorTipoData = computed(() => {
  if (!analysisData.value?.charts?.costo_por_tipo) return null;
  const data = analysisData.value.charts.costo_por_tipo;
  return {
    labels: data.map(d => d.tipo_costo),
    datasets: [{ data: data.map(d => d.total), backgroundColor: chartColors, }]
  };
});

const evolucionCostosData = computed(() => {
  if (!analysisData.value?.charts?.evolucion_costos) return null;
  const data = analysisData.value.charts.evolucion_costos;
  return {
    labels: data.map(d => formatDate(d.mes, { month: 'short', year: '2-digit' })),
    datasets: [{
      label: 'Costo Mensual de la Flota',
      data: data.map(d => d.total),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4,
    }]
  };
});

// --- LÓGICA PESTAÑA "GASTOS DE FLOTA" ---
async function fetchTiposGasto() {
    if (tiposGastoOptions.value.length) return;
    try {
        const { data, error } = await supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true);
        if (error) throw error;
        tiposGastoOptions.value = data.map(t => ({ label: t.nombre_tipo_gasto, code: t.id }));
    } catch(e) { console.error("Error cargando tipos de gasto:", e); }
}

async function fetchGastosFlota() {
    loadingGastosFlota.value = true;
    gastosFlotaError.value = '';
    try {
        const { data, error } = await supabase.rpc('get_gastos_generales_audit', {
            p_start_date: gastosFlotaFilters.value.fechaDesde,
            p_end_date: gastosFlotaFilters.value.fechaHasta,
            p_vehiculo_id: gastosFlotaFilters.value.vehiculoId,
            p_tipo_gasto_id: gastosFlotaFilters.value.tipoGastoId,
            p_user_id: null,
        });
        if (error) throw error;
        gastosFlota.value = data || [];
    } catch (e) {
        gastosFlotaError.value = `Error al cargar los gastos de la flota: ${e.message}`;
    } finally {
        loadingGastosFlota.value = false;
    }
}

function exportGastosFlota() {
    if (!gastosFlota.value.length) {
        alert("No hay datos para exportar.");
        return;
    }
    const dataToExport = gastosFlota.value.map(g => ({
        "ID Gasto": g.id,
        "Fecha": formatDate(g.fecha_gasto),
        "Responsable": g.responsable_nombre,
        "Tipo de Gasto": g.tipo_gasto,
        "Proveedor": g.proveedor_nombre,
        "Vehiculo": g.origen_vehiculo,
        "Nro Factura": g.numero_factura,
        "Descripcion": g.descripcion,
        "Monto Total": g.monto_total,
    }));
    exportToExcel(dataToExport, `gastos_flota_${new Date().toISOString().split('T')[0]}`);
}

// --- CICLO DE VIDA Y WATCHERS ---
onMounted(() => {
  fetchVehiculosYPerfiles();
});

watch(activeTab, (newTab) => {
  if (newTab === 'analisis' && !analysisData.value) {
    fetchAnalysisData();
  }
  if (newTab === 'gastos_flota' && gastosFlota.value.length === 0) {
      fetchTiposGasto();
      // No necesitamos cargar los vehículos aquí de nuevo, ya los tenemos de la primera pestaña
      fetchGastosFlota();
  }
});

watch(analysisFilters, fetchAnalysisData, { deep: true });
watch(gastosFlotaFilters, fetchGastosFlota, { deep: true });
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-800">Gestión de Flota</h1>
    </div>

    <!-- NAVEGACIÓN POR PESTAÑAS -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="-mb-px flex space-x-6" aria-label="Tabs">
        <button @click="activeTab = 'lista'" :class="[activeTab === 'lista' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
          <ListBulletIcon class="-ml-0.5 mr-2 h-5 w-5" />
          <span>Lista de Vehículos</span>
        </button>
        <button @click="activeTab = 'analisis'" :class="[activeTab === 'analisis' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
          <ChartBarIcon class="-ml-0.5 mr-2 h-5 w-5" />
          <span>Análisis de Flota</span>
        </button>
        <button @click="activeTab = 'gastos_flota'" :class="[activeTab === 'gastos_flota' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
          <DocumentTextIcon class="-ml-0.5 mr-2 h-5 w-5" />
          <span>Gastos de Flota</span>
        </button>
      </nav>
    </div>

    <!-- PESTAÑA 1: LISTA DE VEHÍCULOS -->
    <div v-if="activeTab === 'lista'">
      <div class="flex justify-end mb-4">
        <button @click="openNewForm" class="btn-primary">+ Añadir Vehículo</button>
      </div>
      
      <div v-if="showForm" class="mb-8 p-6 bg-gray-50 rounded-lg shadow-md border">
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <h3 class="text-lg font-medium">{{ isEditMode ? 'Editar Vehículo' : 'Nuevo Vehículo' }}</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <input v-model="form.patente" placeholder="Patente (ej. AA123BB)" required class="form-input">
            <input v-model="form.marca" placeholder="Marca (ej. Toyota)" class="form-input">
            <input v-model="form.modelo" placeholder="Modelo (ej. Hilux)" class="form-input">
            <input v-model.number="form.ano" type="number" placeholder="Año (ej. 2022)" class="form-input">
            <v-select 
              v-model="form.responsable_id"
              :options="perfilesOptions"
              :reduce="option => option.code"
              label="label"
              placeholder="Responsable..."
              class="v-select-filter bg-white">
            </v-select>
          </div>
          <div class="flex items-center">
            <input type="checkbox" v-model="form.activo" id="vehiculo_activo" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
            <label for="vehiculo_activo" class="ml-2 text-sm text-gray-700">Vehículo Activo</label>
          </div>
          <div class="flex justify-end gap-3">
            <button type="button" @click="closeForm" class="btn-secondary">Cancelar</button>
            <button type="submit" class="btn-primary">{{ isEditMode ? 'Actualizar' : 'Guardar' }}</button>
          </div>
        </form>
      </div>

      <div v-if="loadingList" class="text-center py-10">Cargando...</div>
      <div v-else-if="listError" class="bg-red-100 p-4 rounded-md text-red-700">{{ listError }}</div>
      
      <div v-else class="bg-white shadow-lg rounded-lg overflow-hidden border">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="table-header">Patente</th>
              <th class="table-header">Marca / Modelo</th>
              <th class="table-header">Responsable</th>
              <th class="table-header">Año</th>
              <th class="table-header text-center">Estado</th>
              <th class="table-header text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="v in vehiculos" :key="v.id" @click="goToDetails(v.id)" class="cursor-pointer hover:bg-gray-50 transition-colors">
              <td class="table-cell font-mono font-semibold">{{ v.patente }}</td>
              <td class="table-cell">{{ v.marca }} {{ v.modelo }}</td>
              <td class="table-cell">{{ v.nombre_responsable || 'N/A' }}</td>
              <td class="table-cell">{{ v.ano }}</td>
              <td class="table-cell text-center">
                <span :class="v.activo ? 'status-badge-success' : 'status-badge-danger'">{{ v.activo ? 'Activo' : 'Inactivo' }}</span>
              </td>
              <td class="table-cell text-right space-x-2">
                <button @click.stop="openEditForm(v)" class="btn-icon-edit">Editar</button>
                <button @click.stop="handleDelete(v.id)" class="btn-icon-delete">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PESTAÑA 2: ANÁLISIS DE FLOTA -->
    <div v-if="activeTab === 'analisis'">
       <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div>
            <label class="form-label">Fecha Desde</label>
            <input type="date" v-model="analysisFilters.fechaDesde" class="form-input">
          </div>
          <div>
            <label class="form-label">Fecha Hasta</label>
            <input type="date" v-model="analysisFilters.fechaHasta" class="form-input">
          </div>
       </div>
       <div v-if="loadingAnalysis" class="text-center py-20">Cargando análisis de la flota...</div>
       <div v-else-if="analysisError" class="error-banner">{{ analysisError }}</div>
       <div v-else-if="analysisData" class="space-y-8">
          <section>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Costo Total de Flota" :value="kpisAnalysis.costo_total_flota" format="currency" />
              <StatCard title="Costo Promedio / Registro" :value="kpisAnalysis.costo_promedio_registro" format="currency" />
              <StatCard title="Vehículos Activos" :value="kpisAnalysis.cantidad_vehiculos_activos" />
              <StatCard title="Registros de Costos" :value="kpisAnalysis.cantidad_registros" />
            </div>
          </section>
          <section><div class="section-container"><h3 class="section-title">Evolución de Costos de la Flota</h3><div class="h-96"><LineChart v-if="evolucionCostosData" :data="evolucionCostosData" :options="{ responsive: true, maintainAspectRatio: false }" /></div></div></section>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section class="section-container"><h3 class="section-title">Ranking de Costos por Vehículo</h3><div class="h-96"><BarChart v-if="costoPorVehiculoData" :data="costoPorVehiculoData" :options="{ responsive: true, maintainAspectRatio: false, indexAxis: 'y' }" /></div></section>
            <section class="section-container"><h3 class="section-title">Desglose por Tipo de Costo</h3><div class="h-96 flex items-center justify-center"><DoughnutChart v-if="costoPorTipoData" :data="costoPorTipoData" :options="{ responsive: true, maintainAspectRatio: false }" /></div></section>
          </div>
       </div>
    </div>

    <!-- PESTAÑA 3: GASTOS DE FLOTA -->
    <div v-if="activeTab === 'gastos_flota'">
        <div class="bg-white p-4 rounded-lg border shadow-md mb-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label class="form-label">Fecha Desde</label><input type="date" v-model="gastosFlotaFilters.fechaDesde" class="form-input"></div>
                <div><label class="form-label">Fecha Hasta</label><input type="date" v-model="gastosFlotaFilters.fechaHasta" class="form-input"></div>
                <div><label class="form-label">Vehículo</label><v-select v-model="gastosFlotaFilters.vehiculoId" :options="vehiculos.map(v => ({label: `${v.marca} ${v.modelo} (${v.patente})`, code: v.id}))" :reduce="option => option.code" placeholder="Todos" class="v-select-filter"></v-select></div>
                <div><label class="form-label">Tipo de Gasto</label><v-select v-model="gastosFlotaFilters.tipoGastoId" :options="tiposGastoOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter"></v-select></div>
            </div>
        </div>

        <div class="flex justify-end mb-4">
            <button @click="exportGastosFlota" :disabled="!gastosFlota.length" class="btn-secondary flex items-center gap-2 disabled:opacity-50">
                <ArrowDownTrayIcon class="h-5 w-5"/> Exportar
            </button>
        </div>

        <div v-if="loadingGastosFlota" class="text-center py-20">Cargando gastos...</div>
        <div v-else-if="gastosFlotaError" class="error-banner">{{ gastosFlotaError }}</div>
        <div v-else class="bg-white shadow-lg rounded-lg overflow-hidden border">
             <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="table-header">Fecha</th>
                        <th class="table-header">Vehículo</th>
                        <th class="table-header">Tipo Gasto</th>
                        <th class="table-header">Responsable</th>
                        <th class="table-header text-right">Monto</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    <tr v-if="!gastosFlota.length">
                        <td colspan="5" class="text-center py-10 text-gray-500">No se encontraron gastos con los filtros seleccionados.</td>
                    </tr>
                    <tr v-for="gasto in gastosFlota" :key="gasto.id">
                        <td class="table-cell">{{ formatDate(gasto.fecha_gasto) }}</td>
                        <td class="table-cell font-mono">{{ gasto.origen_vehiculo }}</td>
                        <td class="table-cell">{{ gasto.tipo_gasto }}</td>
                        <td class="table-cell">{{ gasto.responsable_nombre }}</td>
                        <td class="table-cell text-right font-semibold">{{ formatCurrency(gasto.monto_total) }}</td>
                    </tr>
                </tbody>
             </table>
        </div>
    </div>

  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-indigo-700; }
.btn-secondary { @apply bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-6 py-4 whitespace-nowrap text-sm text-gray-800; }
.status-badge-success { @apply px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800; }
.status-badge-danger { @apply px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800; }
.btn-icon-edit { @apply text-indigo-600 hover:text-indigo-900; }
.btn-icon-delete { @apply text-red-600 hover:text-red-900; }
.section-container { @apply bg-white p-6 rounded-xl shadow-lg border; }
.section-title { @apply text-xl font-semibold text-gray-700 mb-4; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.v-select-filter { --vs-controls-color: #6b7280; --vs-border-color: #d1d5db; --vs-dropdown-bg: #ffffff; --vs-dropdown-option-bg: #ffffff; --vs-dropdown-option-color: #374151; --vs-dropdown-option-padding: 0.5rem 1rem; --vs-dropdown-option--active-bg: #3b82f6; --vs-dropdown-option--active-color: #ffffff; --vs-selected-bg: #3b82f6; --vs-selected-color: #ffffff; --vs-search-input-color: #4b5563; --vs-line-height: 1.5; --vs-font-size: 0.875rem; }
</style>