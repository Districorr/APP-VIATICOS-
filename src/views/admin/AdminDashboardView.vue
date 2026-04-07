<script setup>
import { reactive, onMounted, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency } from '../../utils/formatters.js';
import {
  ChartBarIcon, PresentationChartLineIcon, UsersIcon, Cog6ToothIcon, WrenchScrewdriverIcon, BuildingLibraryIcon, TruckIcon, KeyIcon, InboxStackIcon, DocumentCheckIcon, BanknotesIcon,
  ShoppingBagIcon,
  CreditCardIcon // <-- AÑADIDO: Nuevo icono para Pagos Directos
} from '@heroicons/vue/24/outline';

// --- ESTADO PARA ACCIONES PENDIENTES ---
const actionableItems = reactive({
  rendicionesPendientes: null,
  solicitudesPendientes: null,
  loading: true,
  error: ''
});

// --- ESTADO PARA KPI INTELIGENTE DE DINERO EN CURSO ---
const dineroEnCurso = reactive({
  totalGeneral: 0,
  responsablePrincipal: null,
  cantidadResponsables: 0,
  loading: true,
});

// --- ESTRUCTURA DE LOS MÓDulos DEL DASHBOARD (MODIFICADO) ---
const dashboardSections = reactive([
  {
    title: 'Módulos de Análisis e Inteligencia',
    modules: [
      // AÑADIDO: Nueva tarjeta para Pagos Directos
      { name: 'Pagos Directos', description: 'Registrar transferencias y otros pagos de gerencia.', to: { name: 'AdminPagosDirectos' }, icon: CreditCardIcon, color: 'bg-green-100 text-green-600' },
      { name: 'Análisis Estratégico', description: 'Análisis visual de todos los datos.', to: { name: 'AdminAnalytics' }, icon: ChartBarIcon, color: 'bg-teal-100 text-teal-600' },
      { name: 'Análisis por Cliente', description: 'Desglose de gastos por cliente.', to: { name: 'AdminAnalisisClientes' }, icon: PresentationChartLineIcon, color: 'bg-sky-100 text-sky-600' },
    ]
  },
  {
    title: 'Configuración del Sistema',
    modules: [
      { name: 'Gestión de Usuarios', description: 'Administrar roles y perfiles.', to: { name: 'AdminUsuarios' }, icon: UsersIcon, color: 'bg-pink-100 text-pink-600' },
      { name: 'Clientes', description: 'Administrar la base de clientes.', to: { name: 'AdminClientes' }, icon: BuildingLibraryIcon, color: 'bg-orange-100 text-orange-600' },
      { name: 'Proveedores', description: 'Gestionar estaciones de servicio y otros.', to: { name: 'AdminProveedores' }, icon: ShoppingBagIcon, color: 'bg-red-100 text-red-600' },
      { name: 'Transportes', description: 'Gestionar medios de transporte.', to: { name: 'AdminTransportes' }, icon: TruckIcon, color: 'bg-amber-100 text-amber-600' },
      { name: 'Vehículos', description: 'Gestionar la flota de la empresa.', to: { name: 'AdminVehiculos' }, icon: KeyIcon, color: 'bg-gray-100 text-gray-600' },
      { name: 'Cajas Diarias', description: 'Configurar saldos y responsables.', to: { name: 'AdminGestionCajas' }, icon: Cog6ToothIcon, color: 'bg-green-100 text-green-600' },
      { name: 'Formatos de Gasto', description: 'Configurar plantillas y campos.', to: { name: 'AdminFormatosGasto' }, icon: WrenchScrewdriverIcon, color: 'bg-indigo-100 text-indigo-600' },
      { name: 'Tipos de Gasto', description: 'Administrar categorías globales.', to: { name: 'AdminTiposGastoGlobales' }, icon: Cog6ToothIcon, color: 'bg-purple-100 text-purple-600' },
    ]
  }
]);

// --- FUNCIONES DE CARGA ---
async function fetchDashboardData() {
  actionableItems.loading = true;
  dineroEnCurso.loading = true;
  actionableItems.error = '';

  try {
    const [pendientesResult, solicitudesResult, dineroEnCursoResult] = await Promise.all([
      supabase.rpc('get_count_rendiciones_pendientes'),
      supabase.rpc('get_count_solicitudes_pendientes'),
      supabase.rpc('get_desglose_adelantos_por_responsable')
    ]);

    if (pendientesResult.error) throw pendientesResult.error;
    actionableItems.rendicionesPendientes = pendientesResult.data;

    if (solicitudesResult.error) throw solicitudesResult.error;
    actionableItems.solicitudesPendientes = solicitudesResult.data;
    
    if (dineroEnCursoResult.error) throw dineroEnCursoResult.error;
    const data = dineroEnCursoResult.data || [];
    if (data.length > 0) {
      data.sort((a, b) => b.total_adelantado - a.total_adelantado);
      dineroEnCurso.totalGeneral = data.reduce((sum, item) => sum + (item.total_adelantado || 0), 0);
      dineroEnCurso.responsablePrincipal = data[0]; 
      dineroEnCurso.cantidadResponsables = data.length;
    } else {
      dineroEnCurso.totalGeneral = 0;
      dineroEnCurso.responsablePrincipal = null;
      dineroEnCurso.cantidadResponsables = 0;
    }
  } catch (error) {
    console.error("AdminDashboardView: Error al cargar datos:", error.message);
    actionableItems.error = `Error al cargar datos del dashboard: ${error.message}`;
  } finally {
    actionableItems.loading = false;
    dineroEnCurso.loading = false;
  }
}

onMounted(fetchDashboardData);

const insightDineroEnCurso = computed(() => {
  if (dineroEnCurso.loading || dineroEnCurso.totalGeneral === 0) {
    return 'Actualmente no hay adelantos en rendiciones activas.';
  }
  if (dineroEnCurso.responsablePrincipal) {
    const porcentaje = (dineroEnCurso.responsablePrincipal.total_adelantado / dineroEnCurso.totalGeneral) * 100;
    const nombreResponsable = dineroEnCurso.responsablePrincipal.nombre_responsable;
    if (!nombreResponsable) {
        return `Distribuido en ${dineroEnCurso.cantidadResponsables} responsables.`;
    }
    return `Distribuido en ${dineroEnCurso.cantidadResponsables} responsables. ${nombreResponsable} concentra el ${porcentaje.toFixed(0)}%.`;
  }
  return '';
});
</script>
<template>
  <div class="p-4 sm:p-6 lg:p-8">
    
    <!-- Encabezado de la Página -->
    <header class="mb-10">
      <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
        Panel de Administración
      </h1>
      <p class="mt-2 text-lg text-gray-600">
        Bienvenido al centro de control de InfoGastos.
      </p>
    </header>

    <!-- Sección 1: KPIs Inteligentes -->
    <section class="mb-12">
      <div v-if="dineroEnCurso.loading" class="kpi-smart-loading"></div>
      
      <router-link
        v-else
        :to="{ name: 'AdminAnalytics' }"
        class="kpi-smart-card group"
        title="Haz clic para ver el análisis estratégico detallado"
      >
        <div class="flex-shrink-0">
          <div class="kpi-smart-icon">
            <BanknotesIcon class="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div class="flex-grow">
          <p class="kpi-smart-label">Total en Rendiciones Activas</p>
          <p class="kpi-smart-value">{{ formatCurrency(dineroEnCurso.totalGeneral, 'ARS') }}</p>
          <p class="kpi-smart-insight group-hover:text-indigo-700 transition-colors">{{ insightDineroEnCurso }}</p>
        </div>
        <div class="flex-shrink-0 self-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-300 group-hover:text-indigo-500 transition-all duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
        </div>
      </router-link>
    </section>

    <!-- Sección 2: Acciones Rápidas / Tareas Pendientes -->
    <section class="mb-12">
      <h2 class="section-title">Acciones Pendientes</h2>
      <div v-if="actionableItems.loading" class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Skeleton Loaders -->
        <div class="action-card-loading"></div>
        <div class="action-card-loading"></div>
      </div>
      <div v-else-if="actionableItems.error" class="error-banner">{{ actionableItems.error }}</div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Tarjeta de Rendiciones Pendientes -->
        <router-link :to="{ name: 'AdminViajesList' }" class="action-card group">
          <div class="flex items-center">
            <div class="action-card-icon bg-yellow-100 text-yellow-600">
              <DocumentCheckIcon class="h-8 w-8" />
            </div>
            <div>
              <p class="action-card-title">Rendiciones Actuales</p>
              <p class="action-card-description">Revisa y aproba las rendiciones enviadas.</p>
            </div>
          </div>
          <div class="action-card-counter">
            {{ actionableItems.rendicionesPendientes }}
          </div>
        </router-link>
        
        <!-- Tarjeta de Solicitudes de Caja -->
        <router-link :to="{ name: 'AdminGestionSolicitudes' }" class="action-card group">
          <div class="flex items-center">
            <div class="action-card-icon bg-cyan-100 text-cyan-600">
              <InboxStackIcon class="h-8 w-8" />
            </div>
            <div>
              <p class="action-card-title">Solicitudes de Reposición</p>
              <p class="action-card-description">Gestiona las solicitudes de fondos para cajas.</p>
            </div>
          </div>
          <div class="action-card-counter">
            {{ actionableItems.solicitudesPendientes }}
          </div>
        </router-link>
      </div>
    </section>

    <!-- Secciones de Módulos (generadas dinámicamente) -->
    <section v-for="section in dashboardSections" :key="section.title" class="mb-12">
      <h2 class="section-title">{{ section.title }}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <router-link v-for="module in section.modules" :key="module.name" :to="module.to" class="module-card group">
          <div class="module-card-icon" :class="module.color">
            <component :is="module.icon" class="h-8 w-8" />
          </div>
          <div>
            <h3 class="module-card-title">{{ module.name }}</h3>
            <p class="module-card-description">{{ module.description }}</p>
          </div>
        </router-link>
      </div>
    </section>

  </div>
</template>

<style scoped>
.section-title {
  @apply text-xl font-semibold text-gray-800 mb-5 border-b border-gray-200 pb-2;
}

/* Estilos para la nueva tarjeta de KPI Inteligente */
.kpi-smart-card {
  @apply bg-white p-6 rounded-2xl shadow-lg border border-gray-200 flex items-center gap-6 cursor-pointer hover:border-indigo-400 hover:shadow-xl transition-all duration-300;
}
.kpi-smart-loading {
  @apply h-[116px] bg-gray-200 rounded-2xl animate-pulse;
}
.kpi-smart-icon {
  @apply bg-green-100 p-4 rounded-full;
}
.kpi-smart-label {
  @apply text-sm font-medium text-gray-500 uppercase tracking-wider;
}
.kpi-smart-value {
  @apply text-4xl font-bold text-gray-800 mt-1;
}
.kpi-smart-insight {
  @apply text-sm text-gray-600 mt-2 transition-colors;
}

/* Estilos para las tarjetas de acciones pendientes */
.action-card {
  @apply flex items-center justify-between gap-4 p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-transparent hover:border-indigo-500 cursor-pointer;
}
.action-card-loading {
  @apply h-[104px] bg-gray-200 rounded-xl animate-pulse;
}
.action-card-icon {
  @apply flex-shrink-0 p-4 rounded-full mr-5;
}
.action-card-title {
  @apply text-lg font-bold text-gray-900;
}
.action-card-description {
  @apply text-sm text-gray-500;
}
.action-card-counter {
  @apply text-4xl font-bold text-indigo-600 transition-transform group-hover:scale-110;
}

/* Estilos para las tarjetas de módulos */
.module-card {
  @apply flex items-start gap-4 p-5 bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-1 border;
}
.module-card-icon {
  @apply flex-shrink-0 p-3 rounded-lg;
}
.module-card-title {
  @apply font-semibold text-gray-800;
}
.module-card-description {
  @apply text-sm text-gray-600 mt-1;
}

.error-banner {
  @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md;
}
</style>