// src/views/DashboardView.vue
<script setup>
import { ref, onMounted, computed, inject, watch } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter } from 'vue-router';
import { Bar as BarChart } from 'vue-chartjs';
import { 
  Chart as ChartJS, 
  Title, 
  Tooltip, 
  Legend, 
  BarElement, 
  CategoryScale, 
  LinearScale,
  Filler 
} from 'chart.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';

console.log("DashboardView.vue (v. final robusta): Script setup INICIADO");

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, Filler);

const router = useRouter();

// Inyectamos el perfil del usuario desde el estado global de App.vue
const userProfile = inject('userProfile');

// --- ESTADO REACTIVO ---
const dashboardStats = ref({ viajesCount: 0, gastosCount: 0 });
const ultimosGastosMostrados = ref([]);
const barChartData = ref(null);
const vehiculosAsignados = ref([]); // Estado para los vehículos del usuario

const isLoading = ref(true);
const dashboardErrorMessage = ref('');

// Opciones del gráfico (completas para referencia)
const barChartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'x',
  scales: {
    y: {
      beginAtZero: true,
      ticks: { 
        color: '#4b5563', 
        font: { family: 'Inter, system-ui, sans-serif' },
        callback: value => formatCurrency(value, 'ARS', 0)
      },
      grid: { color: '#e5e7eb', drawBorder: false }
    },
    x: {
      ticks: { color: '#4b5563', font: { family: 'Inter, system-ui, sans-serif' }},
      grid: { display: false }
    }
  },
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      text: 'Últimos 5 Gastos Registrados (ARS)',
      padding: { top: 10, bottom: 25 },
      color: '#1f2937',
      font: { size: 16, weight: '600', family: 'Inter, system-ui, sans-serif' }
    },
    tooltip: {
      enabled: true,
      backgroundColor: 'rgba(0,0,0,0.8)',
      titleFont: { family: 'Inter, system-ui, sans-serif', weight: 'bold', size: 13 },
      bodyFont: { family: 'Inter, system-ui, sans-serif', size: 12 },
      padding: 10,
      boxPadding: 3,
      cornerRadius: 6,
      callbacks: {
        label: context => {
          let label = context.dataset.label || 'Monto';
          if (context.parsed.y !== null) {
            label += `: ${formatCurrency(context.parsed.y, 'ARS')}`;
          }
          return label;
        }
      }
    }
  },
  elements: {
    bar: {
      backgroundColor: 'rgba(59, 130, 246, 0.6)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1,
      hoverBackgroundColor: 'rgba(37, 99, 235, 0.8)',
      hoverBorderColor: 'rgba(37, 99, 235, 1)',
      borderRadius: 5,
    }
  }
});

// --- PROPIEDADES COMPUTADAS ---
const greetingName = computed(() => {
  if (userProfile.value?.nombre_completo) return userProfile.value.nombre_completo.split(' ')[0];
  if (userProfile.value?.email) return userProfile.value.email.split('@')[0];
  return 'Usuario';
});

// --- MÉTODOS DE CARGA DE DATOS ---
async function fetchDashboardKPIs() {
  const userId = userProfile.value.id;
  try {
    const [viajesRes, gastosRes] = await Promise.all([
      supabase.from('viajes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    if (viajesRes.error) throw viajesRes.error;
    dashboardStats.value.viajesCount = viajesRes.count || 0;
    if (gastosRes.error) throw gastosRes.error;
    dashboardStats.value.gastosCount = gastosRes.count || 0;
  } catch(e) { throw new Error(`Contando KPIs: ${e.message}`); }
}

async function fetchGastosRecientesYParaChart() {
  const userId = userProfile.value.id;
  try {
    const { data: gastosData, error } = await supabase
      .from('gastos')
      .select('id, fecha_gasto, descripcion_general, monto_total, moneda, tipos_gasto_config (nombre_tipo_gasto), viajes (nombre_viaje)')
      .eq('user_id', userId)
      .order('fecha_gasto', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    ultimosGastosMostrados.value = (gastosData || []).slice(0, 3);
    if (gastosData && gastosData.length > 0) {
      const gastosParaGrafico = [...gastosData].reverse();
      barChartData.value = {
        labels: gastosParaGrafico.map(g => `${formatDate(g.fecha_gasto, {day:'numeric', month:'short'})} (${(g.tipos_gasto_config?.nombre_tipo_gasto || 'Gral.').substring(0,10)}...)`),
        datasets: [{ label: 'Monto Gasto', data: gastosParaGrafico.map(g => g.monto_total || 0) }],
      };
    }
  } catch(e) { throw new Error(`Obteniendo gastos recientes: ${e.message}`); }
}

async function fetchVehiculosAsignados() {
  try {
    const { data, error } = await supabase.rpc('get_vehiculos_asignados_al_usuario');
    if (error) throw error;
    vehiculosAsignados.value = data || [];
  } catch (e) {
    console.warn("No se pudieron cargar los vehículos asignados:", e.message);
    vehiculosAsignados.value = []; // Aseguramos que sea un array vacío en caso de error
  }
}

// --- FUNCIÓN PRINCIPAL DE CARGA ---
async function loadDashboardData() {
  isLoading.value = true;
  dashboardErrorMessage.value = '';
  try {
    await Promise.all([
      fetchDashboardKPIs(),
      fetchGastosRecientesYParaChart(),
      fetchVehiculosAsignados()
    ]);
  } catch (error) {
    console.error("DashboardView: Error durante la carga de datos:", error.message);
    dashboardErrorMessage.value = `No se pudieron cargar los datos del dashboard. ${error.message}`;
  } finally {
    isLoading.value = false;
  }
}

// --- CICLO DE VIDA Y NAVEGACIÓN ---
onMounted(() => {
  // Declarar la variable 'unwatch' aquí, fuera del watcher.
  let unwatch;

  // Asignar el resultado de watch() a la variable ya declarada.
  unwatch = watch(userProfile, (newProfile) => {
    if (newProfile && newProfile.id) {
      loadDashboardData();
      // Ahora 'unwatch' existe y se puede llamar de forma segura.
      if (unwatch) {
        unwatch();
      }
    }
  }, { immediate: true }); // 'immediate: true' intenta ejecutarlo una vez al inicio.
});

const navigateTo = (routeName, params = {}, query = {}) => {
  router.push({ name: routeName, params, query });
};

// Navegación específica para el detalle de un vehículo
function goToVehiculoDetalle(vehiculoId) {
    router.push({ name: 'AdminVehiculoDetalle', params: { id: vehiculoId } });
}

console.log("DashboardView.vue (v. final robusta): Script setup FINALIZADO");
</script>
<template>
  <div class="min-h-screen bg-gray-100/50 p-4 sm:p-6 lg:p-8 print:hidden">
    <div class="max-w-7xl mx-auto space-y-8">
      
      <div v-if="isLoading" class="text-center py-20">
        <div class="flex justify-center items-center">
          <svg class="animate-spin h-10 w-10 text-districorr-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <p class="ml-4 text-xl text-gray-600">Cargando tu dashboard...</p>
        </div>
      </div>

      <div v-else-if="dashboardErrorMessage" class="error-banner" role="alert">
        <p class="font-bold">Ocurrió un error:</p>
        <p class="whitespace-pre-line text-sm">{{ dashboardErrorMessage }}</p>
      </div>

      <div v-else class="space-y-10">
        
        <!-- Saludo -->
        <div class="mb-6">
          <h1 class="text-3xl sm:text-4xl font-bold text-districorr-primary tracking-tight">¡Hola, {{ greetingName }}!</h1>
          <p class="mt-2 text-lg text-districorr-text-medium">Bienvenido a tu panel de control de InfoGastos.</p>
        </div>

        <!-- KPIs Principales -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="kpi-card border-blue-500 hover:border-blue-600" @click="navigateTo('ViajesListUser')" role="button">
            <p class="kpi-label">Viajes / Períodos Activos</p>
            <p class="kpi-value">{{ dashboardStats.viajesCount }}</p>
            <p class="kpi-description">Total de tus registros de períodos abiertos.</p>
          </div>
          <div class="kpi-card border-green-500 hover:border-green-600" @click="navigateTo('GastosListUser')" role="button">
            <p class="kpi-label">Gastos Registrados</p>
            <p class="kpi-value">{{ dashboardStats.gastosCount }}</p>
            <p class="kpi-description">Total de tus comprobantes cargados.</p>
          </div>
        </div>

        <!-- Acciones Rápidas -->
        <section class="section-container">
            <h2 class="section-title">Acciones Rápidas</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button @click="navigateTo('ViajeCreate')" class="btn-action-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                    Nueva Rendición
                </button>
                <button @click="navigateTo('GastoFormCreate')" class="btn-action-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                    Nuevo Gasto Individual
                </button>
            </div>
        </section>

        <!-- Acceso a Vehículos Asignados -->
        <section v-if="vehiculosAsignados.length > 0" class="section-container">
            <h2 class="section-title">Mis Vehículos</h2>
            <p class="text-sm text-gray-500 -mt-2 mb-4">Accede para registrar cargas de combustible y ver análisis.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- CAMBIO CLAVE: La clase 'group' se aplica aquí directamente -->
                <button v-for="vehiculo in vehiculosAsignados" :key="vehiculo.id" @click="goToVehiculoDetalle(vehiculo.id)" class="btn-vehiculo group">
                    <div class="flex-grow text-left">
                        <span class="font-semibold text-gray-800">{{ vehiculo.marca }} {{ vehiculo.modelo }}</span>
                        <span class="block text-xs text-gray-500 font-mono">{{ vehiculo.patente }}</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-gray-400 group-hover:text-districorr-accent transition-colors"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
            </div>
        </section>

        <!-- Actividad Reciente y Gráfico -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <div class="lg:col-span-2 section-container min-h-[300px]">
            <h2 class="section-title">Actividad Reciente</h2>
            <div v-if="ultimosGastosMostrados.length > 0" class="space-y-3">
              <div v-for="gasto in ultimosGastosMostrados" :key="gasto.id" class="p-3 rounded-md hover:bg-gray-100 border border-gray-200 transition-colors">
                <div class="flex justify-between items-center gap-2">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-800 truncate" :title="gasto.descripcion_general || gasto.tipos_gasto_config?.nombre_tipo_gasto">
                      {{ gasto.descripcion_general || gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto sin descripción' }}
                    </p>
                    <p class="text-xs text-gray-500">
                      {{ formatDate(gasto.fecha_gasto, {day: 'numeric', month: 'short', year: '2-digit'}) }} 
                      <span v-if="gasto.viajes?.nombre_viaje" class="italic">- {{ gasto.viajes.nombre_viaje.substring(0,15) }}{{ gasto.viajes.nombre_viaje.length > 15 ? '...' : '' }}</span>
                    </p>
                  </div>
                  <p class="text-sm font-semibold text-gray-700 whitespace-nowrap">
                    {{ formatCurrency(gasto.monto_total, gasto.moneda) }}
                  </p>
                </div>
              </div>
              <button @click="navigateTo('GastosListUser')" class="link-more">
                Ver todos mis gastos →
              </button>
            </div>
            <div v-else class="no-data-placeholder-sm">No has registrado gastos recientemente.</div>
          </div>
          <div class="lg:col-span-3 section-container min-h-[350px] sm:min-h-[420px] flex flex-col items-center justify-center">
            <div v-if="barChartData && barChartData.datasets && barChartData.datasets[0].data.length > 0" class="w-full h-full relative">
              <BarChart :data="barChartData" :options="barChartOptions" id="dashboard-user-barchart" />
            </div>
            <div v-else class="no-data-placeholder-sm">No hay datos suficientes para mostrar el gráfico de gastos.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-container { @apply bg-white p-4 sm:p-6 rounded-xl shadow-lg border border-gray-200/80; }
.section-title { @apply text-lg font-semibold text-districorr-primary mb-4; }
.error-banner { @apply bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md; }
.kpi-card { @apply bg-white p-5 sm:p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border-l-4 cursor-pointer; }
.kpi-label { @apply text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider mb-1; }
.kpi-value { @apply text-3xl sm:text-4xl font-bold text-districorr-primary mt-1 transition-transform transform group-hover:scale-105; }
.kpi-description { @apply text-xs text-gray-500 mt-2 flex-grow; }
.btn-action-primary { @apply w-full bg-districorr-accent text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:ring-offset-2 transition-all duration-150 ease-in-out transform hover:scale-105 flex items-center justify-center text-sm shadow-md hover:shadow-lg; }
.btn-action-secondary { @apply w-full bg-green-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-150 ease-in-out transform hover:scale-105 flex items-center justify-center text-sm shadow-md hover:shadow-lg; }
/* CAMBIO CLAVE: La palabra 'group' se ha eliminado de esta línea */
.btn-vehiculo { @apply w-full flex items-center justify-between text-left p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-white hover:border-districorr-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:ring-offset-2 transition-all duration-200; }
.no-data-placeholder-sm { @apply text-center text-gray-500 py-10 text-sm flex flex-col items-center justify-center h-full; }
.link-more { @apply block w-full mt-4 text-sm text-center text-districorr-accent hover:underline font-medium py-2 rounded-md hover:bg-districorr-accent/10 transition-colors; }
.lg\:col-span-3.section-container { display: flex; flex-direction: column; align-items: center; justify-content: center; }
</style>