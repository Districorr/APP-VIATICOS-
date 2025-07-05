<script setup>
import { ref, onMounted, computed, inject } from 'vue'; // Se añade 'inject'
import { supabase } from '../supabaseClient.js'; // Se importa solo 'supabase'
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

console.log("DashboardView.vue (Refactorizado v2): Script setup INICIADO");

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, Filler);

const router = useRouter();

// --- ESTADO REACTIVO ---
// Inyectamos el perfil del usuario desde el estado global de App.vue
const userProfile = inject('userProfile');

const userNameForGreeting = ref('');
const dashboardStats = ref({ viajesCount: 0, gastosCount: 0 });
const ultimosGastosMostrados = ref([]);
const barChartData = ref(null);
const isLoading = ref(true);
const dashboardErrorMessage = ref('');

// Opciones del gráfico (SIN CAMBIOS)
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
  if (userNameForGreeting.value) return userNameForGreeting.value;
  // Ahora usamos el userProfile inyectado
  if (userProfile.value?.nombre_completo) return userProfile.value.nombre_completo.split(' ')[0];
  if (userProfile.value?.email) return userProfile.value.email.split('@')[0];
  return 'Usuario';
});

// --- MÉTODOS DE CARGA DE DATOS (SIN CAMBIOS) ---
async function fetchDashboardKPIs(userId) {
  console.log("%cDashboardView: fetchDashboardKPIs INICIO", "color: dodgerblue;");
  try {
    const [viajesRes, gastosRes] = await Promise.all([
      supabase.from('viajes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    if (viajesRes.error) throw new Error(`Contando viajes: ${viajesRes.error.message}`);
    dashboardStats.value.viajesCount = viajesRes.count || 0;
    if (gastosRes.error) throw new Error(`Contando gastos: ${gastosRes.error.message}`);
    dashboardStats.value.gastosCount = gastosRes.count || 0;
  } catch(e) {
    console.error("DashboardView: ERROR en fetchDashboardKPIs:", e.message);
    throw e;
  }
}

async function fetchGastosRecientesYParaChart(userId) {
  console.log("%cDashboardView: fetchGastosRecientesYParaChart INICIO", "color: mediumseagreen;");
  try {
    const { data: gastosData, error } = await supabase
      .from('gastos')
      .select('id, fecha_gasto, descripcion_general, monto_total, moneda, tipos_gasto_config (nombre_tipo_gasto), viajes (nombre_viaje)')
      .eq('user_id', userId)
      .order('fecha_gasto', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(`Obteniendo gastos recientes: ${error.message}`);
    ultimosGastosMostrados.value = (gastosData || []).slice(0, 3);
    if (gastosData && gastosData.length > 0) {
      const gastosParaGrafico = [...gastosData].reverse();
      barChartData.value = {
        labels: gastosParaGrafico.map(g => 
          `${formatDate(g.fecha_gasto, {day:'numeric', month:'short'})} (${(g.tipos_gasto_config?.nombre_tipo_gasto || 'Gral.').substring(0,10)}...)`
        ),
        datasets: [{ 
          label: 'Monto Gasto',
          data: gastosParaGrafico.map(g => g.monto_total || 0)
        }],
      };
    }
  } catch(e) {
    console.error("DashboardView: ERROR en fetchGastosRecientesYParaChart:", e.message);
    throw e;
  }
}

// --- CICLO DE VIDA onMounted (MODIFICADO) ---
onMounted(async () => {
  console.log("%cDashboardView.vue: Componente MONTADO. Iniciando carga de datos.", "color: sienna; font-weight: bold;");
  isLoading.value = true;
  dashboardErrorMessage.value = '';

  try {
    // 1. Verificamos si el perfil inyectado existe.
    if (!userProfile.value || !userProfile.value.id) {
      // Esto solo debería ocurrir si hay un problema grave en el arranque.
      throw new Error("No se pudo obtener la información del perfil de usuario.");
    }
    const userId = userProfile.value.id;
    
    // 2. Establecemos el nombre para el saludo.
    userNameForGreeting.value = userProfile.value.nombre_completo?.split(' ')[0] || userProfile.value.email?.split('@')[0] || 'Usuario';
    
    // 3. Cargar todos los datos del dashboard en paralelo, usando el userId del perfil.
    await Promise.all([
      fetchDashboardKPIs(userId),
      fetchGastosRecientesYParaChart(userId)
    ]);

    console.log("%cDashboardView: Carga de todos los datos completada con éxito.", "color: green; font-weight: bold;");

  } catch (error) {
    console.error("DashboardView: Error fatal durante la carga en onMounted:", error.message);
    dashboardErrorMessage.value = `No se pudieron cargar los datos del dashboard: ${error.message}. Por favor, intenta recargar la página.`;
  } finally {
    isLoading.value = false;
  }
});

// --- MÉTODOS DE NAVEGACIÓN (SIN CAMBIOS) ---
const navigateTo = (routeName, params = {}, query = {}) => {
  router.push({ name: routeName, params, query });
};

console.log("DashboardView.vue (Refactorizado v2): Script setup FINALIZADO");
</script>

<template>
  <!-- TU TEMPLATE ORIGINAL COMPLETO (SIN CAMBIOS) -->
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
        <div class="mb-10">
          <h1 class="text-3xl sm:text-4xl font-bold text-districorr-primary tracking-tight">
            ¡Hola, {{ greetingName }}!
          </h1>
          <p class="mt-2 text-lg text-districorr-text-medium">
            Bienvenido a tu panel de control de InfoGastos.
          </p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="kpi-card border-blue-500">
            <p class="kpi-label">Viajes / Períodos</p>
            <div @click="navigateTo('ViajesListUser')" class="cursor-pointer hover:opacity-80">
              <p class="kpi-value">{{ dashboardStats.viajesCount }}</p>
            </div>
            <p class="kpi-description">Total de tus registros de períodos.</p>
          </div>
          <div class="kpi-card border-green-500">
            <p class="kpi-label">Gastos Registrados</p>
            <div @click="navigateTo('GastosListUser')" class="cursor-pointer hover:opacity-80">
              <p class="kpi-value">{{ dashboardStats.gastosCount }}</p>
            </div>
            <p class="kpi-description">Total de tus comprobantes cargados.</p>
          </div>
          <div class="kpi-card-actions">
            <button @click="navigateTo('ViajeCreate')" class="btn-action-primary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>Nuevo Viaje
            </button>
            <button @click="navigateTo('GastoFormCreate')" class="btn-action-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>Nuevo Gasto
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <div class="lg:col-span-2 section-container min-h-[300px]">
            <h2 class="text-lg font-semibold text-districorr-primary mb-4">Últimos Gastos Registrados</h2>
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
/* TU CSS ORIGINAL COMPLETO (SIN CAMBIOS) */
.section-container { @apply bg-white p-4 sm:p-6 rounded-xl shadow-lg border border-gray-200/80; }
.error-banner { @apply bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md; }
.kpi-card { @apply bg-white p-5 sm:p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border-l-4 min-h-[140px] flex flex-col; }
.kpi-label { @apply text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider mb-1; }
.kpi-value { @apply text-3xl sm:text-4xl font-bold text-districorr-primary mt-1; }
.kpi-description { @apply text-xs text-gray-500 mt-2 flex-grow; }
.kpi-card-actions { @apply bg-white p-5 sm:p-6 rounded-xl shadow-lg flex flex-col justify-center space-y-3 border-l-4 border-gray-300 min-h-[140px]; }
.btn-action-primary { @apply w-full bg-districorr-accent text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:ring-offset-2 transition-all duration-150 ease-in-out transform hover:scale-105 flex items-center justify-center text-sm shadow-md hover:shadow-lg; }
.btn-action-secondary { @apply w-full bg-green-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-150 ease-in-out transform hover:scale-105 flex items-center justify-center text-sm shadow-md hover:shadow-lg; }
.no-data-placeholder-sm { @apply text-center text-gray-500 py-10 text-sm flex flex-col items-center justify-center h-full; }
.link-more { @apply block w-full mt-4 text-sm text-center text-districorr-accent hover:underline font-medium py-2 rounded-md hover:bg-districorr-accent/10 transition-colors; }
.lg\:col-span-3.section-container { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.chart-container-wrapper { @apply h-80 md:h-96 w-full max-w-3xl mx-auto relative; }
</style>