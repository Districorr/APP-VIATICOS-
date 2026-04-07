<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useRouter } from 'vue-router';

import VueMultiselect from 'vue-multiselect';
import 'vue-multiselect/dist/vue-multiselect.css';
import { useExcelExporter } from '../../composables/useExcelExporter.js';

import { LMap, LTileLayer, LMarker, LTooltip } from "@vue-leaflet/vue-leaflet";
import L from 'leaflet';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const router = useRouter();
const { exportToExcel: generateExcel } = useExcelExporter();

// --- Estado General ---
const loading = ref(true);
const errorMessage = ref('');
const transportes = ref([]);
const allProvincias = ref([]);
const allLocalidades = ref([]);

// --- Estado de Pestañas ---
const activeTab = ref('analisis');

// --- Lógica de Gestión ---
const mostrarFormulario = ref(false);
const esModoEdicion = ref(false);
const form = ref({ id: null, nombre: '' });

// --- Lógica de Análisis ---
const analisisLoading = ref(false);
const analisisError = ref('');
const analisisData = ref(null);

const selectedTransportes = ref([]);
const selectedProvinciaId = ref(null);
const selectedLocalidades = ref([]);

const isComparisonMode = ref(false);
const today = new Date();
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const fechaInicioA = ref(firstDayOfMonth.toISOString().split('T')[0]);
const fechaFinA = ref(today.toISOString().split('T')[0]);
const fechaInicioB = ref(null);
const fechaFinB = ref(null);

const isExporting = ref(false);


// --- Funciones de Carga de Datos ---
async function fetchMasterData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [transportesRes, provinciasRes, localidadesRes] = await Promise.all([
      supabase.from('transportes').select('*').order('nombre', { ascending: true }),
      supabase.from('provincias').select('*').order('nombre', { ascending: true }),
      supabase.from('localidades').select('id, nombre, provincia_id').order('nombre', { ascending: true })
    ]);
    if (transportesRes.error) throw transportesRes.error;
    transportes.value = transportesRes.data;
    if (provinciasRes.error) throw provinciasRes.error;
    allProvincias.value = provinciasRes.data;
    if (localidadesRes.error) throw localidadesRes.error;
    allLocalidades.value = localidadesRes.data;
  } catch (e) {
    errorMessage.value = `Error al cargar datos maestros: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchMasterData);

// --- Funciones CRUD ---
function abrirFormularioParaCrear() {
  esModoEdicion.value = false;
  form.value = { id: null, nombre: '' };
  mostrarFormulario.value = true;
}
function abrirFormularioParaEditar(transporte) {
  esModoEdicion.value = true;
  form.value = { ...transporte };
  mostrarFormulario.value = true;
}
function cerrarFormulario() {
  mostrarFormulario.value = false;
}
async function handleGuardado() {
  if (!form.value.nombre?.trim()) {
    alert("El nombre es obligatorio.");
    return;
  }
  loading.value = true;
  try {
    const payload = { nombre: form.value.nombre.trim() };
    const { error } = esModoEdicion.value ? await supabase.from('transportes').update(payload).eq('id', form.value.id) : await supabase.from('transportes').insert(payload);
    if (error) throw error;
    cerrarFormulario();
    await fetchMasterData();
  } catch (e) {
    alert(`Error: ${e.message}`);
  } finally {
    loading.value = false;
  }
}
async function eliminarTransporte(transporteId) {
  if (!confirm("¿Seguro?")) return;
  try {
    const { error } = await supabase.from('transportes').delete().eq('id', transporteId);
    if (error) throw error;
    await fetchMasterData();
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

// --- Lógica de Análisis ---
async function fetchAnalisisData() {
  if (!fechaInicioA.value || !fechaFinA.value) return;
  if (isComparisonMode.value && (!fechaInicioB.value || !fechaFinB.value)) return;

  analisisLoading.value = true;
  analisisError.value = '';
  try {
    const transporteIds = selectedTransportes.value.map(t => t.id);
    const localidadIds = selectedLocalidades.value.map(l => l.id);

    const { data, error } = await supabase.rpc('get_transporte_analisis_geografico', {
      p_transporte_ids: transporteIds,
      p_provincia_id: selectedProvinciaId.value,
      p_localidad_ids: localidadIds,
      p_fecha_inicio_a: fechaInicioA.value,
      p_fecha_fin_a: fechaFinA.value,
      p_fecha_inicio_b: isComparisonMode.value ? fechaInicioB.value : null,
      p_fecha_fin_b: isComparisonMode.value ? fechaFinB.value : null
    });

    if (error) throw error;
    analisisData.value = data;

  } catch (e) {
    analisisError.value = `Error al cargar el análisis: ${e.message}.`;
    analisisData.value = null;
  } finally {
    analisisLoading.value = false;
  }
}

watch(
  [selectedTransportes, selectedProvinciaId, selectedLocalidades, fechaInicioA, fechaFinA, isComparisonMode, fechaInicioB, fechaFinB],
  fetchAnalisisData,
  { deep: true, immediate: true }
);

watch(isComparisonMode, (newValue) => {
  if (!newValue) {
    fechaInicioB.value = null;
    fechaFinB.value = null;
  }
});

watch(selectedProvinciaId, () => {
  selectedLocalidades.value = [];
});

const filteredLocalidadesParaSelector = computed(() => {
  if (!selectedProvinciaId.value) return allLocalidades.value;
  return allLocalidades.value.filter(loc => loc.provincia_id === selectedProvinciaId.value);
});

// --- Propiedades Computadas para UI ---
const kpisPeriodoA = computed(() => analisisData.value?.kpis?.periodo_a || {});
const kpisPeriodoB = computed(() => analisisData.value?.kpis?.periodo_b || {});
const localidadesComparativa = computed(() => analisisData.value?.localidades || []);

const maxGastoLocalidad = computed(() => {
  if (localidadesComparativa.value.length === 0) return 0;
  return Math.max(...localidadesComparativa.value.map(l => l.gasto_total_a || 0));
});

const mapKey = ref(0);
watch(analisisData, () => { mapKey.value++; });

function getMarkerIcon(gasto) {
  const max = maxGastoLocalidad.value;
  let size = 12;
  let color = '#2563eb';
  if (max > 0 && gasto > 0) {
    const intensity = gasto / max;
    size = 12 + (intensity * 28);
    if (intensity > 0.75) color = '#dc2626';
    else if (intensity > 0.4) color = '#facc15';
  }
  return L.divIcon({
    html: `<span style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; display: block; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></span>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: { y: { beginAtZero: true, ticks: { callback: (value) => formatCurrency(value, true) } } }
}));

const chartGastosData = computed(() => {
  const sorted = [...localidadesComparativa.value].sort((a, b) => (b.gasto_total_a || 0) - (a.gasto_total_a || 0));
  return {
    labels: sorted.map(loc => loc.localidad_nombre),
    datasets: [
      { label: 'Gasto Período A', backgroundColor: '#2563eb', data: sorted.map(l => l.gasto_total_a) },
      ...(isComparisonMode.value ? [{ label: 'Gasto Período B', backgroundColor: '#93c5fd', data: sorted.map(l => l.gasto_total_b) }] : [])
    ]
  };
});

const chartFrecuenciaData = computed(() => {
  const sorted = [...localidadesComparativa.value].sort((a, b) => (b.frecuencia_a || 0) - (a.frecuencia_a || 0));
  return {
    labels: sorted.map(loc => loc.localidad_nombre),
    datasets: [
      { label: 'Frec. Período A', backgroundColor: '#facc15', data: sorted.map(l => l.frecuencia_a) },
      ...(isComparisonMode.value ? [{ label: 'Frec. Período B', backgroundColor: '#fef08a', data: sorted.map(l => l.frecuencia_b) }] : [])
    ]
  };
});

const formatCurrency = (value, compact = false) => {
  if (compact && value > 999) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', compactDisplay: 'short' }).format(value || 0);
  }
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
};

const formatPercentage = (value) => {
  if (value === null || value === undefined) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

// --- LÓGICA DE EXPORTACIÓN (REESTRUCTURADA) ---

// Esta es la función que el botón llama.
async function handleExportClick() {
  // 1. Validar que no se esté exportando ya y que haya datos.
  if (isExporting.value) return;
  if (!analisisData.value || !analisisData.value.kpis || localidadesComparativa.value.length === 0) {
    alert('No hay datos para exportar. Por favor, asegúrese de que el análisis se haya cargado y los filtros devuelvan resultados.');
    return;
  }

  isExporting.value = true;

  try {
    // 2. Recolectar todos los datos necesarios de las computadas en este preciso momento.
    const dataToExport = {
      kpisA: kpisPeriodoA.value,
      kpisB: kpisPeriodoB.value,
      localidades: localidadesComparativa.value,
      filtros: {
        fechaExportacion: new Date().toLocaleString('es-AR'),
        modoComparacion: isComparisonMode.value,
        periodoA: `${fechaInicioA.value} al ${fechaFinA.value}`,
        periodoB: isComparisonMode.value ? `${fechaInicioB.value} al ${fechaFinB.value}` : 'N/A',
        transportes: selectedTransportes.value.length > 0 ? selectedTransportes.value.map(t => t.nombre).join(', ') : 'Todos',
        provincia: selectedProvinciaId.value ? allProvincias.value.find(p => p.id === selectedProvinciaId.value)?.nombre : 'Todas',
        localidades: selectedLocalidades.value.length > 0 ? selectedLocalidades.value.map(l => l.nombre).join(', ') : 'Todas'
      }
    };
    
    // 3. Llamar a la función pura que genera el Excel, pasándole los datos recolectados.
    await exportDataToExcel(dataToExport);

  } catch (error) {
    console.error("Error al exportar a Excel:", error);
    alert("Ocurrió un error al intentar generar el archivo Excel.");
  } finally {
    // 4. Resetear el estado de exportación.
    isExporting.value = false;
  }
}

// Esta es una función "pura" que solo se encarga de construir el archivo.
function exportDataToExcel(data) {
  const sheets = [];

  // Hoja 1: Filtros Aplicados
  const filtrosData = [
    { Filtro: 'Fecha de Exportación', Valor: data.filtros.fechaExportacion },
    { Filtro: 'Modo Comparación', Valor: data.filtros.modoComparacion ? 'Activado' : 'Desactivado' },
    { Filtro: 'Período A', Valor: data.filtros.periodoA },
    { Filtro: 'Período B', Valor: data.filtros.periodoB },
    { Filtro: 'Transportes', Valor: data.filtros.transportes },
    { Filtro: 'Provincia', Valor: data.filtros.provincia },
    { Filtro: 'Localidades', Valor: data.filtros.localidades },
  ];
  sheets.push({ name: 'Filtros Aplicados', data: filtrosData });

  // Hoja 2: Resumen Comparativo
  const resumenData = [
    { Criterio: 'Gasto Total', 'Período A': data.kpisA.gasto_total, ...(data.filtros.modoComparacion && { 'Período B': data.kpisB.gasto_total }) },
    { Criterio: 'Nº de Gastos', 'Período A': data.kpisA.total_gastos, ...(data.filtros.modoComparacion && { 'Período B': data.kpisB.total_gastos }) },
    { Criterio: 'Costo Promedio / Gasto', 'Período A': data.kpisA.costo_promedio_gasto, ...(data.filtros.modoComparacion && { 'Período B': data.kpisB.costo_promedio_gasto }) },
    { Criterio: 'Localidades Únicas', 'Período A': data.kpisA.localidades_unicas, ...(data.filtros.modoComparacion && { 'Período B': data.kpisB.localidades_unicas }) },
  ];
  sheets.push({ name: 'Resumen Comparativo', data: resumenData });

  // Hoja 3: Desglose por Localidad
  const desgloseData = data.localidades.map(loc => ({
    'Localidad': loc.localidad_nombre,
    'Provincia': loc.provincia_nombre,
    'Gasto Total (A)': loc.gasto_total_a,
    'Frecuencia (A)': loc.frecuencia_a,
    ...(data.filtros.modoComparacion && {
      'Gasto Total (B)': loc.gasto_total_b,
      'Frecuencia (B)': loc.frecuencia_b,
      'Variación Gasto ($)': loc.variacion_gasto,
      'Variación Gasto (%)': loc.variacion_gasto_porc,
    })
  }));
  sheets.push({ name: 'Desglose por Localidad', data: desgloseData });

  generateExcel(sheets, `Analisis_Transportes_${new Date().toISOString().split('T')[0]}`);
}


// Configuración de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'leaflet/dist/images/marker-icon-2x.png',
  iconUrl: 'leaflet/dist/images/marker-icon.png',
  shadowUrl: 'leaflet/dist/images/marker-shadow.png',
});
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Encabezado y Navegación Principal -->
    <div class="mb-4">
      <router-link :to="{ name: 'AdminDashboard' }" class="text-districorr-accent hover:underline">
        ← Volver al Panel de Admin
      </router-link>
    </div>
    <h1 class="text-3xl font-bold text-districorr-primary mb-6">Análisis y Gestión de Transportes</h1>

    <!-- Pestañas de Navegación -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="-mb-px flex space-x-6" aria-label="Tabs">
        <button @click="activeTab = 'analisis'"
                :class="[activeTab === 'analisis' ? 'border-districorr-accent text-districorr-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
                class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 focus:outline-none">
          Análisis Avanzado
        </button>
        <button @click="activeTab = 'gestion'"
                :class="[activeTab === 'gestion' ? 'border-districorr-accent text-districorr-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
                class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 focus:outline-none">
          Gestionar Transportes
        </button>
      </nav>
    </div>

    <!-- Contenido de la Pestaña: ANÁLISIS AVANZADO -->
    <div v-if="activeTab === 'analisis'">
      <div v-if="loading" class="text-center py-10">Cargando datos maestros...</div>
      <div v-else>
        <!-- Panel de Filtros Avanzados -->
        <div class="p-4 bg-gray-50 rounded-lg border mb-8 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <label for="comparison-toggle" class="flex items-center cursor-pointer">
                <span class="mr-3 text-sm font-medium text-gray-900">Modo Comparación</span>
                <div class="relative">
                  <input type="checkbox" v-model="isComparisonMode" id="comparison-toggle" class="sr-only" />
                  <div class="block bg-gray-200 w-14 h-8 rounded-full"></div>
                  <div class="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
                </div>
              </label>
            </div>
            <button @click="handleExportClick" :disabled="isExporting" class="btn btn-secondary flex items-center gap-2">
              <svg v-if="!isExporting" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a1 1 0 00-1 1v5.586L7.707 8.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 9.586V4a1 1 0 00-1-1z" /><path d="M3 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" /></svg>
              {{ isExporting ? 'Exportando...' : 'Exportar a Excel' }}  
            </button>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t">
            <!-- Filtros Período A -->
            <div class="p-3 border rounded-md bg-white">
              <h3 class="font-bold text-districorr-primary mb-2">Período Principal (A)</h3>
              <div class="space-y-3">
                <div>
                  <label class="form-label-sm">Fecha Inicio (A)</label>
                  <input type="date" v-model="fechaInicioA" class="form-input">
                </div>
                <div>
                  <label class="form-label-sm">Fecha Fin (A)</label>
                  <input type="date" v-model="fechaFinA" class="form-input">
                </div>
              </div>
            </div>
            <!-- Filtros Período B (Comparación) -->
            <div class="p-3 border rounded-md bg-white transition-opacity duration-300" :class="{'opacity-50 pointer-events-none': !isComparisonMode}">
              <h3 class="font-bold mb-2" :class="isComparisonMode ? 'text-districorr-primary' : 'text-gray-400'">Período Comparación (B)</h3>
              <div class="space-y-3">
                <div>
                  <label class="form-label-sm">Fecha Inicio (B)</label>
                  <input type="date" v-model="fechaInicioB" :disabled="!isComparisonMode" class="form-input">
                </div>
                <div>
                  <label class="form-label-sm">Fecha Fin (B)</label>
                  <input type="date" v-model="fechaFinB" :disabled="!isComparisonMode" class="form-input">
                </div>
              </div>
            </div>
            <!-- Filtros Generales -->
            <div class="p-3 border rounded-md bg-white">
              <h3 class="font-bold text-districorr-primary mb-2">Filtros Generales</h3>
              <div class="space-y-3">
                <div>
                  <label class="form-label-sm">Transportes</label>
                  <VueMultiselect v-model="selectedTransportes" :options="transportes" :multiple="true" track-by="id" label="nombre" placeholder="Todos los transportes"></VueMultiselect>
                </div>
                <div>
                  <label class="form-label-sm">Provincia</label>
                  <select v-model="selectedProvinciaId" class="form-input">
                    <option :value="null">-- Todas --</option>
                    <option v-for="p in allProvincias" :key="p.id" :value="p.id">{{ p.nombre }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label-sm">Localidades</label>
                  <VueMultiselect v-model="selectedLocalidades" :options="filteredLocalidadesParaSelector" :multiple="true" track-by="id" label="nombre" placeholder="Todas las localidades"></VueMultiselect>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Contenido del Análisis -->
        <div v-if="analisisLoading" class="text-center py-10">Cargando análisis...</div>
        <div v-else-if="analisisError" class="bg-red-100 p-4 rounded-md text-red-700">{{ analisisError }}</div>
        <div v-else-if="analisisData" class="space-y-8">
          <!-- KPIs Comparativos -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div class="kpi-card">
              <h4 class="kpi-title">Gasto Total</h4>
              <p class="kpi-value">{{ formatCurrency(kpisPeriodoA.gasto_total) }}</p>
              <div v-if="isComparisonMode" class="kpi-comparison">
                vs {{ formatCurrency(kpisPeriodoB.gasto_total) }}
                <span :class="kpisPeriodoA.gasto_total >= kpisPeriodoB.gasto_total ? 'text-green-600' : 'text-red-600'">
                  ({{ formatPercentage((kpisPeriodoA.gasto_total - kpisPeriodoB.gasto_total) / (kpisPeriodoB.gasto_total || 1) * 100) }})
                </span>
              </div>
            </div>
            <div class="kpi-card">
              <h4 class="kpi-title">Nº de Gastos</h4>
              <p class="kpi-value">{{ kpisPeriodoA.total_gastos || 0 }}</p>
               <div v-if="isComparisonMode" class="kpi-comparison">
                vs {{ kpisPeriodoB.total_gastos || 0 }}
                <span :class="kpisPeriodoA.total_gastos >= kpisPeriodoB.total_gastos ? 'text-green-600' : 'text-red-600'">
                  ({{ formatPercentage((kpisPeriodoA.total_gastos - kpisPeriodoB.total_gastos) / (kpisPeriodoB.total_gastos || 1) * 100) }})
                </span>
              </div>
            </div>
             <div class="kpi-card">
              <h4 class="kpi-title">Localidades Únicas</h4>
              <p class="kpi-value">{{ kpisPeriodoA.localidades_unicas || 0 }}</p>
               <div v-if="isComparisonMode" class="kpi-comparison">
                vs {{ kpisPeriodoB.localidades_unicas || 0 }}
              </div>
            </div>
             <div class="kpi-card">
              <h4 class="kpi-title">Costo Promedio / Gasto</h4>
              <p class="kpi-value">{{ formatCurrency(kpisPeriodoA.costo_promedio_gasto) }}</p>
               <div v-if="isComparisonMode" class="kpi-comparison">
                vs {{ formatCurrency(kpisPeriodoB.costo_promedio_gasto) }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <!-- Tabla Comparativa de Localidades -->
            <div class="lg:col-span-2 bg-white shadow-xl rounded-lg overflow-hidden h-fit">
              <h3 class="text-xl font-bold text-districorr-primary p-4 border-b">Desglose por Localidad</h3>
              <div class="overflow-y-auto max-h-[500px]">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-100 sticky top-0">
                    <tr>
                      <th class="table-header">Localidad</th>
                      <th class="table-header text-right">Total (A)</th>
                      <th v-if="isComparisonMode" class="table-header text-right">Total (B)</th>
                      <th v-if="isComparisonMode" class="table-header text-right">Var. %</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-if="localidadesComparativa.length === 0">
                      <td :colspan="isComparisonMode ? 4 : 2" class="px-6 py-12 text-center text-gray-500">No hay datos para los filtros aplicados.</td>
                    </tr>
                    <tr v-for="loc in localidadesComparativa" :key="loc.localidad_nombre" class="hover:bg-gray-50">
                      <td class="px-6 py-4 text-sm font-medium text-gray-900">
                        {{ loc.localidad_nombre }}
                        <span class="block text-xs text-gray-500">{{ loc.provincia_nombre }}</span>
                      </td>
                      <td class="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{{ formatCurrency(loc.gasto_total_a) }}</td>
                      <td v-if="isComparisonMode" class="px-6 py-4 text-sm text-gray-600 text-right">{{ formatCurrency(loc.gasto_total_b) }}</td>
                      <td v-if="isComparisonMode" class="px-6 py-4 text-sm font-semibold text-right" :class="loc.variacion_gasto_porc > 0 ? 'text-green-600' : 'text-red-600'">
                        {{ formatPercentage(loc.variacion_gasto_porc) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Mapa de Puntos por Localidad (Muestra Período A) -->
            <div class="lg:col-span-3 bg-white shadow-xl rounded-lg p-4">
               <h3 class="text-xl font-bold text-districorr-primary mb-4">Mapa de Gastos (Período A)</h3>
               <div class="h-[500px] w-full rounded-md overflow-hidden z-0">
                  <l-map ref="map" :zoom="4" :center="[-40, -64]" :key="mapKey">
                    <l-tile-layer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" layer-type="base" name="OpenStreetMap"></l-tile-layer>
                    <l-marker v-for="loc in localidadesComparativa" :key="loc.localidad_nombre" :lat-lng="[loc.lat, loc.lng]" :icon="getMarkerIcon(loc.gasto_total_a)">
                      <l-tooltip :options="{ sticky: true }">
                        <strong class="text-base">{{ loc.localidad_nombre }}</strong>
                        <div class="text-sm text-gray-600">{{ loc.provincia_nombre }}</div>
                        <hr class="my-1">
                        <div><strong>Gasto (A):</strong> {{ formatCurrency(loc.gasto_total_a) }}</div>
                        <div v-if="isComparisonMode"><strong>Gasto (B):</strong> {{ formatCurrency(loc.gasto_total_b) }}</div>
                      </l-tooltip>
                    </l-marker>
                  </l-map>
               </div>
            </div>
          </div>

          <!-- Gráficos de Barras Comparativos -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <div class="bg-white shadow-xl rounded-lg p-4">
              <h3 class="text-xl font-bold text-districorr-primary mb-4">Gasto por Localidad</h3>
              <div class="h-80">
                <Bar :data="chartGastosData" :options="chartOptions" v-if="chartGastosData.labels.length > 0" />
                <p v-else class="text-center text-gray-500 py-10">No hay datos para graficar.</p>
              </div>
            </div>
            <div class="bg-white shadow-xl rounded-lg p-4">
              <h3 class="text-xl font-bold text-districorr-primary mb-4">Frecuencia de Viajes por Localidad</h3>
              <div class="h-80">
                <Bar :data="chartFrecuenciaData" :options="chartOptions" v-if="chartFrecuenciaData.labels.length > 0" />
                <p v-else class="text-center text-gray-500 py-10">No hay datos para graficar.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Contenido de la Pestaña: GESTIONAR TRANSPORTES (sin cambios) -->
    <div v-if="activeTab === 'gestion'">
      <!-- ... (código de la pestaña de gestión sin cambios) ... -->
    </div>
  </div>
</template>

<style>
/* Estilos para Vue-Multiselect */
.multiselect__tags {
  @apply border-gray-300 rounded-md shadow-sm;
}
.multiselect__tag {
  @apply bg-districorr-accent;
}
.multiselect__tag-icon:hover {
  @apply bg-black/20; /* Esto crea un fondo negro con 20% de opacidad */
}
.multiselect__option--highlight {
  @apply bg-districorr-accent;
}
.multiselect__option--highlight::after {
  @apply bg-districorr-accent;
}

/* Estilos para el Toggle de Comparación */
#comparison-toggle:checked ~ .dot {
  transform: translateX(100%);
  @apply bg-districorr-accent;
}
#comparison-toggle:checked ~ .block {
  @apply bg-blue-200;
}

/* Estilos para los labels de los filtros */
.form-label-sm {
  @apply block text-xs font-medium text-gray-600 mb-1;
}

/* Estilos para las tarjetas de KPI */
.kpi-card { @apply bg-white p-4 rounded-lg shadow-lg border border-gray-200 flex flex-col; }
.kpi-title { @apply text-sm font-medium text-gray-500 truncate; }
.kpi-value { @apply mt-1 text-2xl font-semibold text-districorr-primary; }
.kpi-comparison { @apply text-xs text-gray-500 mt-auto pt-1; }

/* Estilos generales (reutilizados) */
.form-input { @apply block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm disabled:bg-gray-100; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.btn { @apply px-4 py-2 border rounded-md shadow-sm text-sm font-medium disabled:opacity-50; }
.btn-primary { @apply border-transparent text-white bg-districorr-accent hover:bg-opacity-90; }
.btn-secondary { @apply border-gray-300 text-gray-700 bg-white hover:bg-gray-50; }
</style>