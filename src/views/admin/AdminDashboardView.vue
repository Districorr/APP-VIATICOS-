<!-- src/views/admin/AdminDashboardView.vue -->
<script setup> 
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { RouterLink } from 'vue-router';
import { formatCurrency } from '../../utils/formatters.js';

// --- KPIs ---
const kpiTotalGastadoGlobal = ref(null);
const kpiRendicionesPendientes = ref(null);
const kpiResponsablesActivos = ref(null);
const kpiCajasActivas = ref(null);

const loadingKPIs = ref(true);
const errorKPIs = ref('');

// --- Función de Carga de Datos ---
async function fetchAdminDashboardData() {
  loadingKPIs.value = true;
  errorKPIs.value = '';
  try {
    const [totalResult, pendientesResult, activosResult, cajasResult] = await Promise.all([
      supabase.rpc('get_total_gastado_global'),
      supabase.rpc('get_count_rendiciones_pendientes'),
      supabase.rpc('get_count_responsables_activos', { dias_atras: 30 }),
      supabase.rpc('get_count_cajas_activas')
    ]);

    if (totalResult.error) throw totalResult.error;
    kpiTotalGastadoGlobal.value = totalResult.data;

    if (pendientesResult.error) throw pendientesResult.error;
    kpiRendicionesPendientes.value = pendientesResult.data;
    
    if (activosResult.error) throw activosResult.error;
    kpiResponsablesActivos.value = activosResult.data;

    if (cajasResult.error) throw cajasResult.error;
    kpiCajasActivas.value = cajasResult.data;

  } catch (error) {
    console.error("AdminDashboardView: Error al cargar KPIs:", error.message);
    errorKPIs.value = `Error al cargar KPIs: ${error.message}`;
  } finally {
    loadingKPIs.value = false;
  }
}

onMounted(() => {
  fetchAdminDashboardData(); 
});
</script>
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-10">
      <h1 class="text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight">
        Panel de Administración
      </h1>
      <p class="mt-2 text-lg text-gray-600">
        Gestión centralizada y resumen de actividad de Districorr InfoGastos.
      </p>
    </div>

    <!-- Sección de KPIs -->
    <section class="mb-12">
      <h2 class="section-title">Resumen Clave</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="kpi-card">
          <p class="kpi-label">Total Gastado (Global ARS)</p>
          <div v-if="loadingKPIs" class="kpi-loading"></div>
          <p v-else class="kpi-value">{{ kpiTotalGastadoGlobal !== null ? formatCurrency(kpiTotalGastadoGlobal, 'ARS') : 'N/A' }}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Rendiciones Pendientes</p>
          <div v-if="loadingKPIs" class="kpi-loading"></div>
          <p v-else class="kpi-value">{{ kpiRendicionesPendientes !== null ? kpiRendicionesPendientes : 'N/A' }}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Responsables Activos</p>
          <div v-if="loadingKPIs" class="kpi-loading"></div>
          <p v-else class="kpi-value">{{ kpiResponsablesActivos !== null ? kpiResponsablesActivos : 'N/A' }}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Cajas Diarias Activas</p>
          <div v-if="loadingKPIs" class="kpi-loading"></div>
          <p v-else class="kpi-value">{{ kpiCajasActivas !== null ? kpiCajasActivas : 'N/A' }}</p>
        </div>
      </div>
      <div v-if="errorKPIs" class="error-banner mt-6">{{ errorKPIs }}</div>
    </section>

    <!-- Sección de Módulos de Gestión -->
    <section class="mb-12">
      <h2 class="section-title">Módulos de Gestión y Análisis</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        
        <router-link :to="{ name: 'AdminGestionCajas' }" class="module-card group">
          <div class="module-card-icon bg-green-100 text-green-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H4a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <div>
            <h3 class="module-card-title">Cajas Diarias</h3>
            <p class="module-card-description">Administrar saldos, responsables y cajas.</p>
          </div>
        </router-link>

        <!-- --- INICIO DE MI MODIFICACIÓN --- -->
        <!-- He añadido esta nueva tarjeta para acceder a la gestión de solicitudes. -->
        <router-link :to="{ name: 'AdminGestionSolicitudes' }" class="module-card group">
          <div class="module-card-icon bg-cyan-100 text-cyan-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h3 class="module-card-title">Solicitudes de Caja</h3>
            <p class="module-card-description">Aprobar o rechazar las solicitudes de reposición.</p>
          </div>
        </router-link>
        <!-- --- FIN DE MI MODIFICACIÓN --- -->

        <router-link :to="{ name: 'AdminViajesList' }" class="module-card group">
          <div class="module-card-icon bg-blue-100 text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2a4 4 0 00-4-4H3V9a4 4 0 004-4h2a4 4 0 004 4v2m-6 4h12M9 4h12v8a4 4 0 01-4 4H9a4 4 0 01-4-4V9a4 4 0 014-4z" />
            </svg>
          </div>
          <div>
            <h3 class="module-card-title">Todas las Rendiciones</h3>
            <p class="module-card-description">Supervisar y aprobar todas las rendiciones.</p>
          </div>
        </router-link>

        <router-link :to="{ name: 'AdminUsuarios' }" class="module-card group">
          <div class="module-card-icon bg-pink-100 text-pink-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h3 class="module-card-title">Gestión de Usuarios</h3>
            <p class="module-card-description">Administrar roles y permisos de los usuarios.</p>
          </div>
        </router-link>

        <router-link :to="{ name: 'AdminAnalytics' }" class="module-card group">
          <div class="module-card-icon bg-teal-100 text-teal-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div>
          <div><h3 class="module-card-title">Gráficos y Estadísticas</h3><p class="module-card-description">Análisis visual de todos los datos.</p></div>
        </router-link>

        <router-link :to="{ name: 'AdminFormatosGasto' }" class="module-card group">
          <div class="module-card-icon bg-indigo-100 text-indigo-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
          <div><h3 class="module-card-title">Formatos de Gasto</h3><p class="module-card-description">Configurar plantillas y campos dinámicos.</p></div>
        </router-link>

        <router-link :to="{ name: 'AdminTiposGastoGlobales' }" class="module-card group">
          <div class="module-card-icon bg-purple-100 text-purple-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.53 0 1.002.211 1.352.56C13.702 3.91 14 4.418 14 5v2h3a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h3V5c0-.582.298-1.09.648-1.44C6.002 3.21 6.47 3 7 3zm0 14v-2" /></svg></div>
          <div><h3 class="module-card-title">Tipos de Gasto</h3><p class="module-card-description">Administrar categorías globales de gastos.</p></div>
        </router-link>

        <router-link :to="{ name: 'AdminClientes' }" class="module-card group">
          <div class="module-card-icon bg-sky-100 text-sky-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg></div>
          <div><h3 class="module-card-title">Clientes</h3><p class="module-card-description">Gestionar la base de datos de clientes.</p></div>
        </router-link>

        <router-link :to="{ name: 'AdminTransportes' }" class="module-card group">
          <div class="module-card-icon bg-amber-100 text-amber-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v8h11zM12 5l1.5 1.5M12 5l-1.5 1.5M12 5v2M17 16h-4M17 11h-4M17 8h-4" /></svg></div>
          <div><h3 class="module-card-title">Transportes</h3><p class="module-card-description">Gestionar la lista de transportes.</p></div>
        </router-link>

      </div>
    </section>
  </div>
</template>
<style scoped>
.section-title { @apply text-2xl font-semibold text-gray-800 mb-6 border-b-2 border-gray-200 pb-3; }
.kpi-card { @apply bg-white p-6 rounded-xl shadow-lg border; }
.kpi-label { @apply text-sm font-medium text-gray-500 uppercase tracking-wider; }
.kpi-value { @apply text-3xl font-bold text-gray-700 mt-1.5; }
.kpi-loading { @apply mt-1.5 h-9 w-24 bg-gray-200 rounded-md animate-pulse; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.module-card { @apply flex items-center gap-4 p-6 bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border; }
.module-card-icon { @apply flex-shrink-0 p-3 rounded-lg; }
.module-card-title { @apply text-lg font-semibold text-gray-800; }
.module-card-description { @apply text-sm text-gray-600 mt-1; }
</style>