<script setup>
import { ref, onMounted, computed, inject } from 'vue';
import { supabase } from '../supabaseClient.js'; // Ajusta la ruta si es necesario
import { useRouter } from 'vue-router';

// Para el gráfico con Chart.js y vue-chartjs
import { Bar } from 'vue-chartjs';
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

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, Filler);

const router = useRouter();
const userProfile = inject('userProfile', ref(null));

const userName = ref(''); 
const stats = ref({
  viajesCount: 0,
  gastosCount: 0,
});
const ultimosGastos = ref([]); // Para la lista de los 3 más recientes

// Estados de carga individuales
const loadingStats = ref(true);
const loadingGastosRecientes = ref(true); 
const loadingChartData = ref(true); 

const errorMessage = ref('');

// Para el gráfico
const chartData = ref(null); 
const chartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'x', 
  scales: {
    y: {
      beginAtZero: true,
      ticks: { 
        color: '#4b5563', 
        font: { family: 'Inter, system-ui, sans-serif' },
        callback: function(value) { 
          return '$' + value.toLocaleString('es-AR', {minimumFractionDigits: 0, maximumFractionDigits: 0});
        }
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
      text: 'Últimos 5 Gastos Registrados', 
      padding: { top: 10, bottom: 25 },
      color: '#1f2937',
      font: { size: 16, weight: '600', family: 'Inter, system-ui, sans-serif' }
    },
    tooltip: {
      enabled: true,
      backgroundColor: 'rgba(0,0,0,0.75)',
      titleFont: { family: 'Inter, system-ui, sans-serif', weight: 'bold' },
      bodyFont: { family: 'Inter, system-ui, sans-serif' },
      padding: 12,
      boxPadding: 4,
      cornerRadius: 4,
      callbacks: {
        label: function(context) {
          let label = context.dataset.label || '';
          if (label) { label += ': '; }
          if (context.parsed.y !== null) {
            label += new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.parsed.y);
          }
          return label;
        }
      }
    }
  },
  elements: {
    bar: {
      backgroundColor: 'rgba(59, 130, 246, 0.7)', 
      borderColor: 'rgba(59, 130, 246, 1)',     
      borderWidth: 1,
      hoverBackgroundColor: 'rgba(37, 99, 235, 0.9)', 
      hoverBorderColor: 'rgba(37, 99, 235, 1)',
      borderRadius: { topLeft: 6, topRight: 6 },
      borderSkipped: false,
    }
  }
});

const isLoadingDashboard = computed(() => {
  // Verdadero si CUALQUIERA de las cargas principales está activa
  return loadingStats.value || loadingGastosRecientes.value || loadingChartData.value;
});

const nombreCompletoUsuario = computed(() => {
  return userName.value || userProfile.value?.nombre_completo || userProfile.value?.email || 'Estimado Usuario';
});
// --- Funciones de formato ---
const formatCurrency = (amount, currency = 'ARS') => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 2 }).format(amount);
};

const formatDate = (dateString, options = { day: '2-digit', month: 'short' }) => {
  if (!dateString) return 'N/A';
  // Intentar parsear asumiendo que la fecha de Supabase es YYYY-MM-DD
  const parts = String(dateString).split('-');
  let date;
  if (parts.length === 3) {
    // Date.UTC para evitar problemas de timezone si solo es fecha
    date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  } else {
    // Fallback para otros formatos o timestamps completos
    date = new Date(dateString);
  }
  if (isNaN(date.getTime())) return 'Fecha Inválida';
  // Usar es-ES para formatos como "10 may", pero es-AR para otros si se prefiere
  return date.toLocaleDateString('es-ES', {...options, timeZone: 'UTC'}); // Añadir timeZone UTC para consistencia
};

async function fetchDashboardData() {
  console.log("%cDashboardView (COMPLETO): fetchDashboardData INICIO", "color: darkcyan; font-weight: bold;");
  loadingStats.value = true;
  loadingGastosRecientes.value = true;
  loadingChartData.value = true;
  errorMessage.value = '';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("DashboardView: Usuario no autenticado en fetchDashboardData");
      errorMessage.value = "Sesión no válida. Por favor, inicie sesión de nuevo.";
      // Establecer todos los loaders a false para que no se quede cargando indefinidamente
      loadingStats.value = false;
      loadingGastosRecientes.value = false;
      loadingChartData.value = false;
      throw new Error("Usuario no autenticado.");
    }
    console.log("DashboardView: Usuario autenticado, UID:", user.id);

    // Actualizar userName (nombre completo) del perfil
    if (userProfile.value && userProfile.value.nombre_completo) {
      userName.value = userProfile.value.nombre_completo;
    } else if (userProfile.value && userProfile.value.email) {
        userName.value = userProfile.value.email;
    } else {
        console.log("DashboardView: userProfile inyectado no tiene nombre/email, intentando fetch directo.");
        const { data: profileData, error: profileError } = await supabase.from('perfiles').select('nombre_completo, email').eq('id', user.id).single();
        if (profileError && profileError.code !== 'PGRST116') { 
            console.warn("DashboardView: Error obteniendo nombre/email del perfil desde BD:", profileError.message);
        }
        userName.value = profileData?.nombre_completo || profileData?.email || user.email || 'Usuario';
    }
    console.log("DashboardView: nombreCompletoUsuario será:", nombreCompletoUsuario.value);


    // --- Sub-función para Cargar Estadísticas (Viajes y Gastos Count) ---
    const cargarStats = async () => {
      console.log("DashboardView: cargarStats INICIO");
      try {
        const [viajesRes, gastosRes] = await Promise.all([
          supabase.from('viajes').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('gastos').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        ]);

        if (viajesRes.error) throw new Error(`Error contando viajes: ${viajesRes.error.message}`);
        stats.value.viajesCount = viajesRes.count || 0;
        console.log("DashboardView: stats.viajesCount:", stats.value.viajesCount);

        if (gastosRes.error) throw new Error(`Error contando gastos: ${gastosRes.error.message}`);
        stats.value.gastosCount = gastosRes.count || 0;
        console.log("DashboardView: stats.gastosCount:", stats.value.gastosCount);

      } catch(e) {
        console.error("DashboardView: ERROR en cargarStats:", e.message);
        errorMessage.value += `\nError cargando estadísticas: ${e.message}.`; // Acumular errores
      } finally {
        loadingStats.value = false;
        console.log("DashboardView: cargarStats FIN, loadingStats:", loadingStats.value);
      }
    };

    // --- Sub-función para Cargar Últimos Gastos Recientes y Datos del Gráfico ---
    const cargarGastosRecientesYGrafico = async () => {
      console.log("DashboardView: cargarGastosRecientesYGrafico INICIO");
      try {
        // !!! VERIFICA que 'adelanto_especifico_aplicado' sea el nombre correcto de la columna en tu tabla 'gastos' !!!
        const nombreColumnaAdelantoGasto = 'adelanto_especifico_aplicado'; 
        const { data: gastosRecientesData, error: gastosRecientesError } = await supabase
          .from('gastos')
          .select(`
            id, fecha_gasto, descripcion_general, monto_total, moneda, 
            ${nombreColumnaAdelantoGasto}, 
            tipos_gasto_config (nombre_tipo_gasto),
            viajes (nombre_viaje)
          `)
          .eq('user_id', user.id)
          .order('fecha_gasto', { ascending: false })
          .order('created_at', { ascending: false }) // Como desempate si hay varios en el mismo día
          .limit(5); // Traer los últimos 5 para tener datos para el gráfico

        if (gastosRecientesError) throw new Error(`Error obteniendo gastos recientes: ${gastosRecientesError.message}`);
        
        ultimosGastos.value = (gastosRecientesData || []).slice(0, 3); // Tomar solo los 3 más recientes para la lista
        console.log("DashboardView: ultimosGastos cargados (primeros 3 de 5):", JSON.parse(JSON.stringify(ultimosGastos.value)));
        
        // Preparar datos para el gráfico
        if (gastosRecientesData && gastosRecientesData.length > 0) {
          const gastosParaGrafico = [...gastosRecientesData].reverse(); // De más antiguo a más nuevo para el eje X
          chartData.value = {
            labels: gastosParaGrafico.map(g => {
              const tipo = g.tipos_gasto_config ? g.tipos_gasto_config.nombre_tipo_gasto : 'Gral';
              const tipoAbreviado = tipo.length > 10 ? tipo.substring(0, 8) + '...' : tipo;
              return `${formatDate(g.fecha_gasto, {day:'numeric', month:'short'})} (${tipoAbreviado})`;
            }),
            datasets: [ { label: 'Monto Gasto', data: gastosParaGrafico.map(g => g.monto_total || 0) } ],
          };
          console.log("DashboardView: chartData preparado.", JSON.parse(JSON.stringify(chartData.value)));
        } else {
            chartData.value = null; // Asegurar que sea null si no hay datos
            console.log("DashboardView: No hay datos suficientes para el gráfico.");
        }
      } catch(e) {
        console.error("DashboardView: ERROR en cargarGastosRecientesYGrafico:", e.message);
        errorMessage.value += `\nError cargando gastos recientes/gráfico: ${e.message}.`;
        chartData.value = null; // Asegurar que chartData es null en caso de error
      } finally {
        loadingGastosRecientes.value = false; 
        console.log("DashboardView: cargarGastosRecientesYGrafico, loadingGastosRecientes:", loadingGastosRecientes.value);
        loadingChartData.value = false; 
        console.log("DashboardView: cargarGastosRecientesYGrafico, loadingChartData:", loadingChartData.value);
      }
    };

    console.log("DashboardView: Ejecutando Promise.allSettled para cargarStats y cargarGastosRecientesYGrafico");
    const results = await Promise.allSettled([
        cargarStats(),
        cargarGastosRecientesYGrafico()
    ]);
    console.log("DashboardView: Promise.allSettled COMPLETADO. Resultados:", results);

    results.forEach(result => {
        if (result.status === 'rejected') {
            // Los errores individuales ya deberían haber sido logueados y añadidos a errorMessage
            console.warn("DashboardView: Una de las promesas de carga del dashboard falló:", result.reason);
        }
    });

  } catch (error) { 
    console.error("DashboardView: Error CAPTURADO en el bloque principal de fetchDashboardData:", error.message);
    errorMessage.value = error.message || "No se pudieron cargar los datos del dashboard.";
    loadingStats.value = false;
    loadingGastosRecientes.value = false;
    loadingChartData.value = false;
  }
  console.log("%cDashboardView: fetchDashboardData FIN. isLoadingDashboard computed:", "color: darkcyan; font-weight: bold;", isLoadingDashboard.value);
}

onMounted(() => {
  // Loguear el estado del perfil inyectado al montar.
  // fetchDashboardData se encargará de usarlo o cargar uno nuevo si es necesario.
  console.log("%cDashboardView (COMPLETO): Componente MONTADO.", "color: green; font-weight: bold;");
  console.log("DashboardView (COMPLETO): userProfile inyectado al montar:", userProfile.value ? JSON.parse(JSON.stringify(userProfile.value)) : null);
  
  fetchDashboardData(); // Iniciar la carga de todos los datos del dashboard
});

// Funciones de navegación (sin cambios respecto a la versión anterior)
const navigateTo = (routeName, params = {}, query = {}) => {
  console.log(`DashboardView: Navegando a '${routeName}' con params: ${JSON.stringify(params)} y query: ${JSON.stringify(query)}`);
  router.push({ name: routeName, params, query });
};
</script>
<template>
  <div class="min-h-screen bg-gray-100/50 p-4 sm:p-6 lg:p-8 print:hidden">
    <div class="max-w-7xl mx-auto space-y-8">

      <!-- Saludo al Usuario -->
      <div class="mb-10">
        <h1 class="text-3xl sm:text-4xl font-bold text-districorr-primary tracking-tight">
          ¡Hola, {{ nombreCompletoUsuario }}!
        </h1>
        <p class="mt-2 text-lg text-districorr-text-medium">
          Bienvenido a tu panel de control de InfoGastos. Aquí tienes un resumen de tu actividad.
        </p>
      </div>

      <!-- Indicador de Carga General (mientras alguna de las partes principales carga) o Error General -->
      <!-- Se muestra si todos los loaders principales están activos y no hay error, y aún no hay datos en stats o ultimosGastos -->
      <div v-if="isLoadingDashboard && !errorMessage && !stats.viajesCount && !stats.gastosCount && ultimosGastos.length === 0" 
           class="text-center text-gray-500 py-20">
          <svg class="animate-spin h-12 w-12 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="mt-3 text-lg">Cargando tu información...</p>
      </div>
      <!-- Mostrar error principal si existe y no hay datos principales cargados -->
      <div v-else-if="errorMessage && !stats.viajesCount && !stats.gastosCount && !ultimosGastos.length" 
           class="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md" role="alert">
        <p class="font-bold">Error al cargar el dashboard:</p>
        <p class="whitespace-pre-line">{{ errorMessage }}</p> <!-- whitespace-pre-line para respetar saltos de línea en errores acumulados -->
      </div>

      <!-- Contenido Principal del Dashboard -->
      <!-- Se muestra si no hay un error fatal que impida mostrar CUALQUIER contenido,
           o si el spinner general ya no está activo. Los loaders internos manejan sus secciones. -->
      <div v-else class="space-y-10">
        <!-- Tarjetas de Estadísticas -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Tarjeta Viajes -->
          <div class="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border-l-4 border-districorr-accent min-h-[160px] flex flex-col">
            <div v-if="loadingStats" class="flex-grow flex items-center justify-center">
                <svg class="animate-spin h-8 w-8 text-districorr-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <div v-else @click="navigateTo('ViajesList')" class="cursor-pointer flex-grow flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium text-districorr-text-medium uppercase tracking-wider">Viajes / Períodos</p>
                    <p class="text-4xl font-bold text-districorr-primary mt-1">{{ stats.viajesCount }}</p>
                  </div>
                  <div class="p-3.5 rounded-full bg-districorr-accent/10 text-districorr-accent">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16m-4-1v-1h-4v1m0-4h4" /></svg>
                  </div>
                </div>
              </div>
              <p class="text-xs text-gray-500 mt-3">Total de registros de viajes y períodos de rendición.</p>
            </div>
          </div>

          <!-- Tarjeta Gastos -->
          <div class="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border-l-4 border-green-500 min-h-[160px] flex flex-col">
            <div v-if="loadingStats" class="flex-grow flex items-center justify-center">
                <svg class="animate-spin h-8 w-8 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <div v-else @click="navigateTo('GastosList')" class="cursor-pointer flex-grow flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium text-districorr-text-medium uppercase tracking-wider">Gastos Registrados</p>
                    <p class="text-4xl font-bold text-districorr-primary mt-1">{{ stats.gastosCount }}</p>
                  </div>
                  <div class="p-3.5 rounded-full bg-green-500/10 text-green-600">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                </div>
              </div>
              <p class="text-xs text-gray-500 mt-3">Total de gastos individuales documentados.</p>
            </div>
          </div>

          <!-- Botones de Acción Rápida -->
           <div class="bg-white p-6 rounded-xl shadow-lg flex flex-col justify-center space-y-4 border-l-4 border-gray-400 min-h-[160px]">
              <button @click="navigateTo('ViajeNuevo')"
                      class="w-full bg-districorr-accent text-white font-semibold py-3 px-4 rounded-lg hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:ring-offset-2 transition-all duration-150 ease-in-out transform hover:scale-103 flex items-center justify-center text-sm shadow-md hover:shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                Nuevo Viaje/Período
              </button>
              <button @click="navigateTo('GastoNuevo')" 
                      class="w-full bg-green-500 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-150 ease-in-out transform hover:scale-103 flex items-center justify-center text-sm shadow-md hover:shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                Nuevo Gasto
              </button>
          </div>
        </div>

        <!-- Sección de Últimos Gastos y Gráfico -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <!-- Lista de Últimos Gastos -->
          <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-gray-200/80 min-h-[300px]">
            <h2 class="text-xl font-semibold text-districorr-primary mb-5">Últimos Gastos Registrados</h2>
            <div v-if="loadingGastosRecientes" class="text-center text-gray-400 py-10">
              <svg class="animate-spin h-8 w-8 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <p class="mt-2.5 text-sm">Cargando gastos recientes...</p>
            </div>
            <div v-else-if="ultimosGastos.length > 0" class="space-y-4">
              <div v-for="gasto in ultimosGastos" :key="gasto.id" 
                   class="p-3.5 rounded-lg hover:bg-gray-100/70 transition-colors duration-150 border border-gray-200/70">
                <div class="flex justify-between items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-districorr-text-dark truncate" :title="gasto.descripcion_general || gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto'">
                      {{ gasto.descripcion_general || gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto sin descripción' }}
                    </p>
                    <p class="text-xs text-gray-500 mt-0.5">
                      {{ formatDate(gasto.fecha_gasto, {day: 'numeric', month: 'long'}) }} 
                      <span v-if="gasto.viajes" class="italic">- En: {{ gasto.viajes.nombre_viaje.substring(0,20) }}<span v-if="gasto.viajes.nombre_viaje.length > 20">...</span></span>
                    </p>
                  </div>
                  <p class="text-sm font-semibold text-gray-700 whitespace-nowrap">
                    {{ formatCurrency(gasto.monto_total, gasto.moneda) }}
                  </p>
                </div>
              </div>
              <button @click="navigateTo('GastosList')" class="w-full mt-5 text-sm text-center text-districorr-accent hover:underline font-medium py-2 rounded-md hover:bg-districorr-accent/10 transition-colors">
                Ver todos los gastos →
              </button>
            </div>
            <div v-else class="text-center text-gray-500 py-10">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"> <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17.25v1.508c0 .396.32.716.716.716h2.068a.716.716 0 00.716-.716V17.25m0 0A2.25 2.25 0 0010.5 15V12m0 0A2.25 2.25 0 008.25 9.75V7.5A2.25 2.25 0 006 5.25v.154c0 .431-.076.856-.222 1.25M17.25 6.75V12m0 0a2.25 2.25 0 00-2.25-2.25M17.25 12a2.25 2.25 0 01-2.25 2.25m2.25-2.25a2.25 2.25 0 012.25 2.25M19.5 12h.008v.008H19.5V12zm-2.25-3h.008v.008H17.25V9zm-2.25 3h.008v.008H15V12zm-2.25-3h.008v.008H12.75V9zM7.5 12h.008v.008H7.5V12zm2.25-3h.008v.008H9.75V9z" /> </svg>
              <p class="mt-2 text-sm">Aún no has registrado gastos.</p>
            </div>
          </div>

          <!-- Gráfico (Opcional) -->
          <div class="lg:col-span-3 bg-white p-4 sm:p-6 rounded-xl shadow-lg border border-gray-200/80 min-h-[350px] sm:min-h-[420px] flex flex-col items-center justify-center">
            <div v-if="loadingChartData" class="text-center text-gray-400 w-full">
                <svg class="animate-spin h-8 w-8 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p class="mt-2.5 text-sm">Cargando datos del gráfico...</p>
            </div>
            <div v-else-if="chartData && chartData.datasets && chartData.datasets[0].data && chartData.datasets[0].data.length > 0" class="w-full h-full relative">
              <!-- Descomenta la siguiente línea si Chart.js y vue-chartjs están instalados y configurados -->
              <Bar :data="chartData" :options="chartOptions" id="dashboard-chart" />
            </div>
            <div v-else class="text-center text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"> <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h15.75c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 19.875v-6.75zM3 8.625c0-.621.504-1.125 1.125-1.125h15.75c.621 0 1.125.504 1.125 1.125v0c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 8.625v0zM3 4.125c0-.621.504-1.125 1.125-1.125h15.75c.621 0 1.125.504 1.125 1.125v0c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 4.125v0z" /> </svg>
              <p class="mt-2 text-sm">
                <!-- Pequeña lógica para el mensaje del gráfico -->
                <span v-if="typeof Bar === 'undefined'">Componente de gráfico no activo.</span>
                <span v-else>No hay suficientes datos recientes para mostrar el gráfico.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* #dashboard-chart { 
  height: 300px; 
  width: 100%;
}
@media (min-width: 640px) { #dashboard-chart { height: 350px; } }
@media (min-width: 1024px) { #dashboard-chart { height: 400px; } } */
/* El contenedor del gráfico ya tiene min-h, por lo que el canvas debería expandirse.
   Ajusta las alturas con clases de Tailwind en el div padre si es necesario. */
</style>