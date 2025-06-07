<script setup>
import { ref, onMounted, computed, inject, watch } from 'vue';
import { supabase } from '../supabaseClient.js'; 
import { useRouter } from 'vue-router';
import { Bar as BarChart } from 'vue-chartjs'; // Renombrado para evitar conflicto con 'BarElement'
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

console.log("DashboardView.vue (Mejorado): Script setup INICIADO");

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, Filler);

const router = useRouter();

// --- Inyección de Dependencias de App.vue ---
// Usar valores por defecto (refs que contienen null) para mayor resiliencia
const userProfileInjected = inject('userProfile', ref(null));
const currentUserSessionInjected = inject('currentUserSession', ref(null));
const appLoading = inject('loadingAuthSession', ref(true)); // Loader principal de sesión de App.vue
const appProfileLoading = inject('loadingUserProfile', ref(false)); // Loader de perfil de App.vue
const appInitialAuthCheckDone = inject('initialAuthCheckDone', ref(false));

// --- Estado Reactivo Local del Componente ---
const userNameForGreeting = ref(''); 
const dashboardStats = ref({
  viajesCount: 0,
  gastosCount: 0,
  // Podrías añadir más estadísticas aquí si las necesitas
});
const ultimosGastosMostrados = ref([]); // Para la lista de los N más recientes

// Estados de carga específicos para las secciones de este dashboard
const isLoadingDashboardKPIs = ref(true);
const isLoadingGastosRecientes = ref(true);
const isLoadingChartData = ref(true);
const dashboardErrorMessage = ref(''); // Un único mensaje de error para el dashboard

// Para el gráfico de barras
const barChartData = ref(null); 
const barChartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'x', 
  scales: {
    y: {
      beginAtZero: true,
      ticks: { 
        color: '#4b5563', 
        font: { family: 'Inter, system-ui, sans-serif' }, // Asegúrate que esta fuente esté cargada
        callback: function(value) { 
          return formatCurrency(value, 'ARS', 0); // Usar formatter
        }
      },
      grid: { color: '#e5e7eb', drawBorder: false }
    },
    x: {
      ticks: { color: '#4b5563', font: { family: 'Inter, system-ui, sans-serif' }},
      grid: { display: false } // Ocultar líneas de la cuadrícula X para un look más limpio
    }
  },
  plugins: {
    legend: { display: false }, // Usualmente no necesaria para un solo dataset
    title: {
      display: true,
      text: 'Últimos 5 Gastos Registrados (ARS)', 
      padding: { top: 10, bottom: 25 },
      color: '#1f2937',
      font: { size: 16, weight: '600', family: 'Inter, system-ui, sans-serif' }
    },
    tooltip: {
      enabled: true,
      backgroundColor: 'rgba(0,0,0,0.8)', // Ligeramente más opaco
      titleFont: { family: 'Inter, system-ui, sans-serif', weight: 'bold', size: 13 },
      bodyFont: { family: 'Inter, system-ui, sans-serif', size: 12 },
      padding: 10, // Ajustar padding
      boxPadding: 3,
      cornerRadius: 6, // Bordes más redondeados
      callbacks: {
        label: function(context) {
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
      backgroundColor: 'rgba(59, 130, 246, 0.6)', // Ligeramente más transparente
      borderColor: 'rgba(59, 130, 246, 1)',     
      borderWidth: 1,
      hoverBackgroundColor: 'rgba(37, 99, 235, 0.8)', 
      hoverBorderColor: 'rgba(37, 99, 235, 1)',
      borderRadius: 5, // Aplicar a todas las esquinas
      // borderSkipped: false, // Puede ser útil si quieres bordes en todos lados
    }
  }
});

// --- Propiedades Computadas ---

// Loader general para el contenido de este dashboard (KPIs, gastos recientes, gráfico)
const isLoadingDashboardContentOverall = computed(() => {
  return isLoadingDashboardKPIs.value || isLoadingGastosRecientes.value || isLoadingChartData.value;
});

// Nombre a mostrar en el saludo, con fallbacks
const greetingName = computed(() => {
  if (userNameForGreeting.value) return userNameForGreeting.value;
  if (userProfileInjected.value?.nombre_completo) return userProfileInjected.value.nombre_completo.split(' ')[0]; // Primer nombre
  if (currentUserSessionInjected.value?.user?.email) return currentUserSessionInjected.value.user.email.split('@')[0];
  return 'Usuario';
});

// Determina si se debe mostrar el loader principal de App.vue
const showAppLevelLoader = computed(() => {
  return appLoading.value || (appInitialAuthCheckDone.value && !!currentUserSessionInjected.value && appProfileLoading.value);
});

// Determina si se puede mostrar el contenido principal del dashboard
const canShowDashboardContent = computed(() => {
  return appInitialAuthCheckDone.value && !!currentUserSessionInjected.value && !!userProfileInjected.value;
});

// Determina si se debe mostrar un mensaje para iniciar sesión
const showLoginPrompt = computed(() => {
  return appInitialAuthCheckDone.value && !currentUserSessionInjected.value;
});


// --- Métodos de Carga de Datos ---

async function fetchDashboardKPIs() {
  console.log("%cDashboardView: fetchDashboardKPIs INICIO", "color: dodgerblue;");
  isLoadingDashboardKPIs.value = true;
  const userId = currentUserSessionInjected.value?.user?.id;

  if (!userId) {
    console.warn("DashboardView fetchDashboardKPIs: No hay user_id para cargar KPIs.");
    dashboardStats.value = { viajesCount: 0, gastosCount: 0 }; // Resetear stats
    isLoadingDashboardKPIs.value = false;
    return;
  }

  try {
    // Usar Promise.all para ejecutar ambas consultas en paralelo
    const [viajesRes, gastosRes] = await Promise.all([
      supabase.from('viajes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    if (viajesRes.error) throw new Error(`Contando viajes: ${viajesRes.error.message}`);
    dashboardStats.value.viajesCount = viajesRes.count || 0;

    if (gastosRes.error) throw new Error(`Contando gastos: ${gastosRes.error.message}`);
    dashboardStats.value.gastosCount = gastosRes.count || 0;

    console.log("DashboardView: KPIs cargados:", dashboardStats.value);
  } catch(e) {
    console.error("DashboardView: ERROR en fetchDashboardKPIs:", e.message, e);
    dashboardErrorMessage.value = (dashboardErrorMessage.value ? dashboardErrorMessage.value + '\n' : '') + `Error cargando estadísticas: ${e.message}.`;
    dashboardStats.value = { viajesCount: 0, gastosCount: 0 }; // Resetear en caso de error
  } finally {
    isLoadingDashboardKPIs.value = false;
    console.log("%cDashboardView: fetchDashboardKPIs FIN", "color: dodgerblue;");
  }
}

async function fetchGastosRecientesYParaChart() {
  console.log("%cDashboardView: fetchGastosRecientesYParaChart INICIO", "color: mediumseagreen;");
  isLoadingGastosRecientes.value = true;
  isLoadingChartData.value = true; // Ambos se cargan aquí
  ultimosGastosMostrados.value = [];
  barChartData.value = null;

  const userId = currentUserSessionInjected.value?.user?.id;
  if (!userId) {
    console.warn("DashboardView fetchGastosRecientesYParaChart: No hay user_id.");
    isLoadingGastosRecientes.value = false;
    isLoadingChartData.value = false;
    return;
  }

  try {
    const { data: gastosData, error } = await supabase
      .from('gastos')
      .select('id, fecha_gasto, descripcion_general, monto_total, moneda, tipos_gasto_config (nombre_tipo_gasto), viajes (nombre_viaje)') // Adelanto no se usa aquí
      .eq('user_id', userId)
      .order('fecha_gasto', { ascending: false })
      .order('created_at', { ascending: false }) // Desempate por fecha de creación
      .limit(5); // Obtener los últimos 5 para el gráfico

    if (error) throw new Error(`Obteniendo gastos recientes: ${error.message}`);
    
    ultimosGastosMostrados.value = (gastosData || []).slice(0, 3); // Mostrar los 3 más recientes en la lista
    console.log("DashboardView: Últimos 3 gastos para lista:", ultimosGastosMostrados.value);
    
    if (gastosData && gastosData.length > 0) {
      // Para el gráfico, usar los hasta 5 gastos obtenidos, revertidos para orden cronológico
      const gastosParaGrafico = [...gastosData].reverse(); 
      barChartData.value = {
        labels: gastosParaGrafico.map(g => 
          `${formatDate(g.fecha_gasto, {day:'numeric', month:'short'})} (${(g.tipos_gasto_config?.nombre_tipo_gasto || 'Gral.').substring(0,10)}...)`
        ),
        datasets: [ { 
          label: 'Monto Gasto', // Usado en el tooltip
          data: gastosParaGrafico.map(g => g.monto_total || 0) 
          // Los colores se definen en barChartOptions.elements.bar.backgroundColor
        } ],
      };
      console.log("DashboardView: Datos para gráfico generados:", barChartData.value);
    } else {
      console.log("DashboardView: No se encontraron gastos para el gráfico.");
      // No es necesario setear barChartData a null aquí, el v-if en el template lo manejará
    }
  } catch(e) {
    console.error("DashboardView: ERROR en fetchGastosRecientesYParaChart:", e.message, e);
    dashboardErrorMessage.value = (dashboardErrorMessage.value ? dashboardErrorMessage.value + '\n' : '') + `Error cargando gastos/gráfico: ${e.message}.`;
    // barChartData.value = null; // Ya es null por defecto o si no hay datos
  } finally {
    isLoadingGastosRecientes.value = false;
    isLoadingChartData.value = false;
    console.log("%cDashboardView: fetchGastosRecientesYParaChart FIN", "color: mediumseagreen;");
  }
}

// Función principal para cargar todos los datos del dashboard
async function loadAllDashboardData() {
    console.log("%cDashboardView: loadAllDashboardData INICIO", "color: darkcyan; font-weight: bold;");
    dashboardErrorMessage.value = ''; // Limpiar errores previos
    
    // Establecer el nombre para el saludo
    if (userProfileInjected.value?.nombre_completo) {
        userNameForGreeting.value = userProfileInjected.value.nombre_completo.split(' ')[0]; // Primer nombre
    } else if (currentUserSessionInjected.value?.user?.email) {
        userNameForGreeting.value = currentUserSessionInjected.value.user.email.split('@')[0];
    } else {
        userNameForGreeting.value = 'Usuario';
    }
    console.log("DashboardView loadAllDashboardData: userNameForGreeting establecido a:", userNameForGreeting.value);
    
    // Ejecutar cargas en paralelo
    await Promise.all([
        fetchDashboardKPIs(),
        fetchGastosRecientesYParaChart()
    ]);
    console.log("%cDashboardView: loadAllDashboardData FIN", "color: darkcyan; font-weight: bold;");
}

// --- Watcher para Carga de Datos basada en Estado Global de App.vue ---
watch(
  [appInitialAuthCheckDone, appLoading, appProfileLoading, currentUserSessionInjected, userProfileInjected], 
  ([initialCheckDone, isAppLoading, isProfileLoading, currentSession, currentProfile], 
   [prevInitialCheckDone, prevIsAppLoading, prevIsProfileLoading, prevCurrentSession, prevCurrentProfile]) => {
    
    // Loguear solo si algún valor relevante cambia para evitar spam
    const relevantChange = initialCheckDone !== prevInitialCheckDone || 
                           isAppLoading !== prevIsAppLoading || 
                           isProfileLoading !== prevIsProfileLoading || 
                           !!currentSession !== !!prevCurrentSession ||
                           !!currentProfile !== !!prevCurrentProfile;

    if (relevantChange) {
        console.log(`%cDashboardView Watcher (App State Change):
          InitialAuthDone: ${initialCheckDone}
          AppLoading (Sesión App.vue): ${isAppLoading}
          ProfileLoading (Perfil App.vue): ${isProfileLoading}
          UserSession (App.vue): ${!!currentSession}
          UserProfile (App.vue): ${!!currentProfile}`, "color: purple");
    }

    if (initialCheckDone && !isAppLoading && currentSession) {
      if (!isProfileLoading && currentProfile) {
        console.log("%cDashboardView Watcher: Auth y Perfil de App.vue listos. Cargando datos del dashboard...", "color: green;");
        loadAllDashboardData();
      } else if (isProfileLoading) {
        console.log("%cDashboardView Watcher: Auth de App.vue lista, pero perfil de App.vue aún cargando. Esperando...", "color: orange;");
      } else if (!currentProfile && !isProfileLoading) {
        console.warn("%cDashboardView Watcher: Auth lista, sesión existe, pero no hay perfil de App.vue (y no está cargando). Se intentará cargar datos del dashboard, pero puede faltar información de perfil para el saludo.", "color: orange;");
        loadAllDashboardData(); 
      }
    } else if (initialCheckDone && !currentSession) {
      console.log("%cDashboardView Watcher: No hay sesión de usuario (detectado desde App.vue). Limpiando datos del dashboard.", "color: red;");
      dashboardStats.value = { viajesCount: 0, gastosCount: 0 };
      ultimosGastosMostrados.value = [];
      barChartData.value = null;
      userNameForGreeting.value = '';
      // Asegurar que los loaders locales se reseteen si la sesión se pierde
      isLoadingDashboardKPIs.value = false; 
      isLoadingGastosRecientes.value = false;
      isLoadingChartData.value = false;
    } else if (!initialCheckDone || isAppLoading) {
        // console.log("%cDashboardView Watcher: Esperando que App.vue termine su carga inicial de Auth/Sesión.", "color: lightgray;");
    }
  }, 
  { immediate: true, deep: true } // immediate:true para la carga inicial, deep:true porque observamos objetos anidados
);


// --- Ciclo de Vida ---
onMounted(() => {
  console.log("%cDashboardView.vue: Componente MONTADO (onMounted ejecutado).", "color: sienna; font-weight: bold;");
  // La lógica principal de carga de datos está en el watcher para asegurar que
  // las dependencias inyectadas (userProfile, currentUserSession) estén disponibles y actualizadas.
});

// --- Métodos de Navegación ---
const navigateTo = (routeName, params = {}, query = {}) => {
  console.log(`DashboardView: Navegando a la ruta '${routeName}' con params: ${JSON.stringify(params)} y query: ${JSON.stringify(query)}`);
  router.push({ name: routeName, params, query });
};

console.log("DashboardView.vue (Mejorado): Script setup FINALIZADO");
</script>
<template>
  <div class="min-h-screen bg-gray-100/50 p-4 sm:p-6 lg:p-8 print:hidden">
    <div class="max-w-7xl mx-auto space-y-8">

      <!-- BLOQUE 1: Loader de App.vue o Prompt de Login -->
      <div v-if="showAppLevelLoader" class="text-center py-20">
        <div class="flex justify-center items-center">
          <svg class="animate-spin h-10 w-10 text-districorr-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <p class="ml-4 text-xl text-gray-600">Cargando datos de sesión y perfil...</p>
        </div>
        <!-- {{ console.log("DashboardView Template: BLOQUE 1 - Mostrando loader de App.vue (sesión/perfil global)") }} -->
      </div>
      
      <div v-else-if="showLoginPrompt" class="text-center py-20">
         <p class="text-xl text-gray-700">Por favor, <router-link :to="{name: 'Login'}" class="font-semibold hover:underline text-districorr-accent">inicia sesión</router-link> para ver tu dashboard.</p>
         <!-- {{ console.log("DashboardView Template: BLOQUE 1 - Mostrando mensaje para iniciar sesión") }} -->
      </div>
      
      <!-- BLOQUE 2: Contenido del Dashboard del Usuario (Solo si todo está listo) -->
      <div v-else-if="canShowDashboardContent">
        <!-- {{ console.log("DashboardView Template: BLOQUE 2 - Mostrando contenido principal del dashboard (saludo, etc.)") }} -->
        <div class="mb-10">
          <h1 class="text-3xl sm:text-4xl font-bold text-districorr-primary tracking-tight">
            ¡Hola, {{ greetingName }}!
          </h1>
          <p class="mt-2 text-lg text-districorr-text-medium">
            Bienvenido a tu panel de control de InfoGastos.
          </p>
        </div>

        <!-- Banner de Error para datos del Dashboard -->
        <div v-if="dashboardErrorMessage && !isLoadingDashboardContentOverall" class="error-banner mb-6" role="alert">
          <p class="font-bold">Ocurrió un error al cargar los datos del dashboard:</p>
          <p class="whitespace-pre-line text-sm">{{ dashboardErrorMessage }}</p>
        </div>

        <!-- Loader para el contenido específico del Dashboard -->
        <div v-if="isLoadingDashboardContentOverall && !dashboardErrorMessage" class="text-center text-gray-500 py-10">
            <!-- {{ console.log("DashboardView Template: BLOQUE 2.2 - Mostrando loader interno del dashboard (isLoadingOverall es true)") }} -->
            <svg class="animate-spin h-10 w-10 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p class="mt-3 text-md">Cargando tu información del dashboard...</p>
        </div>

        <!-- Contenido principal del dashboard una vez cargado -->
        <div v-else-if="!isLoadingDashboardContentOverall" class="space-y-10">
          <!-- {{ console.log("DashboardView Template: BLOQUE 2.3 - Mostrando KPIs, gastos y gráfico (isLoadingOverall es false)") }} -->
          <!-- KPIs y Acciones -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="kpi-card border-blue-500">
              <p class="kpi-label">Viajes / Períodos</p>
              <div v-if="isLoadingDashboardKPIs" class="kpi-loading-sm">...</div>
              <div v-else @click="navigateTo('ViajesListUser')" class="cursor-pointer hover:opacity-80">
                <p class="kpi-value">{{ dashboardStats.viajesCount }}</p>
              </div>
              <p class="kpi-description">Total de tus registros de períodos.</p>
            </div>
            <div class="kpi-card border-green-500">
              <p class="kpi-label">Gastos Registrados</p>
              <div v-if="isLoadingDashboardKPIs" class="kpi-loading-sm">...</div>
              <div v-else @click="navigateTo('GastosListUser')" class="cursor-pointer hover:opacity-80">
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

          <!-- Últimos Gastos y Gráfico -->
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            <div class="lg:col-span-2 section-container min-h-[300px]">
              <h2 class="text-lg font-semibold text-districorr-primary mb-4">Últimos Gastos Registrados</h2>
              <div v-if="isLoadingGastosRecientes" class="loading-placeholder-sm">Cargando últimos gastos...</div>
              <div v-else-if="ultimosGastosMostrados.length > 0" class="space-y-3">
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
              <div v-if="isLoadingChartData" class="loading-placeholder-sm">Cargando datos del gráfico...</div>
              <div v-else-if="barChartData && barChartData.datasets && barChartData.datasets[0].data.length > 0" class="w-full h-full relative">
                <BarChart :data="barChartData" :options="barChartOptions" id="dashboard-user-barchart" />
              </div>
              <div v-else class="no-data-placeholder-sm">No hay datos suficientes para mostrar el gráfico de gastos.</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- BLOQUE 3: Fallback por si ninguna condición anterior se cumple (debería ser raro) -->
      <div v-else class="text-center py-20">
        <p class="text-lg text-gray-500">Cargando o estado inesperado del dashboard...</p>
         <!-- {{ console.warn('DashboardView Template: Estado inesperado en la estructura v-if/v-else-if principal.') }} -->
      </div>
    </div>
  </div>
</template>
<style scoped>
/* Estilos Generales para el Dashboard */
.section-container { 
  @apply bg-white p-4 sm:p-6 rounded-xl shadow-lg border border-gray-200/80; 
}
.error-banner { 
  @apply bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md; 
}

/* KPIs (Key Performance Indicators) */
.kpi-card { 
  @apply bg-white p-5 sm:p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border-l-4 min-h-[140px] flex flex-col; 
  /* Los colores de borde se aplican directamente en el template, ej: border-blue-500 */
}
.kpi-label { 
  @apply text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider mb-1; 
}
.kpi-value { 
  @apply text-3xl sm:text-4xl font-bold text-districorr-primary mt-1; 
}
.kpi-description { 
  @apply text-xs text-gray-500 mt-2 flex-grow; /* flex-grow para empujar el contenido si la tarjeta tiene altura fija */
}
.kpi-loading-sm { /* Placeholder para cuando el valor del KPI está cargando */
  @apply text-gray-400 text-2xl font-bold animate-pulse mt-1; 
}

/* Tarjeta de Acciones Rápidas */
.kpi-card-actions { 
  @apply bg-white p-5 sm:p-6 rounded-xl shadow-lg flex flex-col justify-center space-y-3 border-l-4 border-gray-300 min-h-[140px]; 
}
.btn-action-primary { 
  @apply w-full bg-districorr-accent text-white font-semibold py-2.5 px-4 rounded-lg 
         hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:ring-offset-2 
         transition-all duration-150 ease-in-out transform hover:scale-105 
         flex items-center justify-center text-sm shadow-md hover:shadow-lg; 
}
.btn-action-secondary { 
  @apply w-full bg-green-500 text-white font-semibold py-2.5 px-4 rounded-lg 
         hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 
         transition-all duration-150 ease-in-out transform hover:scale-105 
         flex items-center justify-center text-sm shadow-md hover:shadow-lg; 
}

/* Placeholders y Enlaces "Ver más" */
.loading-placeholder-sm { 
  @apply text-center text-gray-400 py-10 text-sm flex flex-col items-center justify-center h-full; 
}
.no-data-placeholder-sm { 
  @apply text-center text-gray-500 py-10 text-sm flex flex-col items-center justify-center h-full; 
}
.link-more { 
  @apply block w-full mt-4 text-sm text-center text-districorr-accent hover:underline font-medium 
         py-2 rounded-md hover:bg-districorr-accent/10 transition-colors; 
}

/* Estilos para asegurar que los gráficos tengan altura y se centren si no hay datos */
.lg\:col-span-3.section-container { /* Específico para el contenedor del gráfico de barras */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.chart-container-wrapper { /* Contenedor para dar altura a los gráficos si hay datos */
  @apply h-80 md:h-96 w-full max-w-3xl mx-auto relative; /* max-w-3xl para que no sea demasiado ancho */
}


/* Colores de Districorr (Asegúrate que estén en tu tailwind.config.js) */
/* Estas son clases de fallback o para referencia si no están en la config de Tailwind */
/* Si ya están en tu config, estas definiciones aquí no son estrictamente necesarias */
/* pero no harán daño si las clases de Tailwind no se aplican por alguna razón. */

/* .text-districorr-primary { color: #0A2D5A; }  */
/* .text-districorr-text-medium { color: #4A5568; }  */
/* .text-districorr-accent { color: #3B82F6; }  */
/* .border-districorr-accent { border-color: #3B82F6; } */
/* .bg-districorr-accent { background-color: #3B82F6; } */
/* .focus\:ring-districorr-accent:focus { --tw-ring-color: #3B82F6; } */
/* .focus\:border-districorr-accent:focus { border-color: #3B82F6; } */

/* Ejemplo de colores para los bordes de las tarjetas KPI si los aplicas con clases */
/* .border-blue-500 { border-left-color: #3b82f6; } */
/* .border-green-500 { border-left-color: #22c55e; } */
/* .border-gray-300 { border-left-color: #d1d5db; } */
</style>