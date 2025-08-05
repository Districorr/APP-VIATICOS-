<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../../supabaseClient';
import { useRouter } from 'vue-router';

// Importamos los nuevos componentes de las pestañas
import GastosAnalyticsTab from '../../components/admin/analytics/GastosAnalyticsTab.vue';
import RendicionesAnalyticsTab from '../../components/admin/analytics/RendicionesAnalyticsTab.vue';
import ExploracionAvanzadaTab from '../../components/admin/analytics/ExploracionAvanzadaTab.vue';
// src/views/admin/AdminAnalyticsView.vue

import { formatCurrency } from '../../utils/formatters.js'; // <-- ASEGÚRATE DE QUE ESTA LÍNEA EXISTA


import ToastNotification from '../../components/ToastNotification.vue';
import { ChartPieIcon, BriefcaseIcon, MagnifyingGlassIcon, UsersIcon } from '@heroicons/vue/24/outline';

const router = useRouter();

// --- ESTADO DEL CONTENEDOR ---
const activeTab = ref('gastos');
const notification = ref({});

// --- DATOS COMPARTIDOS (Se cargan aquí y se pasan como props) ---
const perfilesOptions = ref([]);
const tipoGastoOptions = ref([]);
const loadingOptions = ref(true);

// --- LÓGICA DEL MODAL (Se queda en el padre) ---
const isDesgloseModalOpen = ref(false);
const desgloseAdelantos = ref([]);
const loadingDesglose = ref(false);

// Mapeo de pestañas a componentes
const tabs = {
  gastos: GastosAnalyticsTab,
  rendiciones: RendicionesAnalyticsTab,
  exploracion: ExploracionAvanzadaTab,
};
const activeComponent = computed(() => tabs[activeTab.value]);

// --- FUNCIONES DEL CONTENEDOR ---
const showNotification = (title, message, type = 'info') => {
  notification.value = { title, message, type, timestamp: new Date() };
};

async function fetchSharedOptions() {
  loadingOptions.value = true;
  try {
    const [perfilesRes, tiposGastoRes] = await Promise.all([
      supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').order('nombre_tipo_gasto')
    ]);
    if (perfilesRes.error) throw perfilesRes.error;
    perfilesOptions.value = perfilesRes.data.map(p => ({ label: p.nombre_completo, code: p.id }));
    
    if (tiposGastoRes.error) throw tiposGastoRes.error;
    tipoGastoOptions.value = tiposGastoRes.data.map(t => ({ label: t.nombre_tipo_gasto, code: t.id }));
  } catch (e) {
    console.error("Error cargando opciones compartidas:", e);
    showNotification('Error', 'No se pudieron cargar los filtros.', 'error');
  } finally {
    loadingOptions.value = false;
  }
}

async function handleOpenDesgloseModal() {
  isDesgloseModalOpen.value = true;
  if (desgloseAdelantos.value.length > 0) return;

  loadingDesglose.value = true;
  try {
    const { data, error: rpcError } = await supabase.rpc('get_desglose_adelantos_por_responsable');
    if (rpcError) throw rpcError;
    desgloseAdelantos.value = data || [];
  } catch(e) {
    console.error("Error al cargar desglose de adelantos:", e);
    showNotification('Error', 'No se pudo cargar el detalle por responsable.', 'error');
  } finally {
    loadingDesglose.value = false;
  }
}

function handleDrillDown(payload) {
  // Lógica para cambiar de pestaña desde un hijo (ej. gráfico de torta)
  activeTab.value = 'exploracion';
  // Aquí podríamos pasar los filtros al componente de exploración si fuera necesario
}

onMounted(fetchSharedOptions);
</script>
<template>
  <div>
    <div class="bg-gray-50/50 min-h-screen">
      <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div class="mb-6">
          <h1 class="text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight">Centro de Análisis</h1>
          <p class="mt-1 text-gray-600">Paneles estratégicos para gastos y rendiciones.</p>
        </div>

        <div class="border-b border-gray-200 mb-6">
          <nav class="-mb-px flex space-x-6" aria-label="Tabs">
            <button @click="activeTab = 'gastos'" :class="[activeTab === 'gastos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
              <ChartPieIcon class="-ml-0.5 mr-2 h-5 w-5" />
              <span>Análisis de Gastos</span>
            </button>
            <button @click="activeTab = 'rendiciones'" :class="[activeTab === 'rendiciones' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
              <BriefcaseIcon class="-ml-0.5 mr-2 h-5 w-5" />
              <span>Análisis de Rendiciones</span>
            </button>
            <button @click="activeTab = 'exploracion'" :class="[activeTab === 'exploracion' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
              <MagnifyingGlassIcon class="-ml-0.5 mr-2 h-5 w-5" />
              <span>Exploración Avanzada</span>
            </button>
          </nav>
        </div>

        <!-- Renderizado dinámico del componente de la pestaña activa -->
        <component 
          :is="activeComponent"
          :tipo-gasto-options="tipoGastoOptions"
          :perfiles-options="perfilesOptions"
          :loading-options="loadingOptions"
          @open-desglose-modal="handleOpenDesgloseModal"
          @drill-down="handleDrillDown"
          @show-notification="showNotification"
        />

      </div>
    </div>
    <ToastNotification :notification="notification" />

    <!-- El Modal se queda en el componente padre -->
    <Transition name="modal-fade">
      <div v-if="isDesgloseModalOpen" @click.self="isDesgloseModalOpen = false" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl transform transition-all">
          <div class="flex items-center justify-between p-5 border-b border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900">Desglose de Adelantos por Responsable</h3>
            <button @click="isDesgloseModalOpen = false" class="p-2 rounded-full hover:bg-gray-100 transition-colors">
              <svg class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div class="p-6 min-h-[20rem]">
            <div v-if="loadingDesglose" class="flex justify-center items-center h-full">
              <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <div v-else-if="desgloseAdelantos.length === 0" class="no-data-placeholder h-full">
              <div class="text-center">
                <UsersIcon class="h-12 w-12 mx-auto text-gray-400" />
                <h4 class="mt-2 text-lg font-medium text-gray-800">Todo en orden</h4>
                <p class="mt-1 text-sm text-gray-500">No hay adelantos activos en circulación en este momento.</p>
              </div>
            </div>
            <div v-else class="overflow-y-auto max-h-96">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="table-header">Responsable</th>
                    <th class="table-header text-center"># Rendiciones</th>
                    <th class="table-header text-right">Monto Total Adelantado</th>
                    <th class="table-header"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="item in desgloseAdelantos" :key="item.responsable_id" class="hover:bg-gray-50">
                    <td class="table-cell font-medium">{{ item.nombre_responsable }}</td>
                    <td class="table-cell text-center">{{ item.cantidad_rendiciones }}</td>
                    <td class="table-cell text-right font-bold text-gray-800">{{ formatCurrency(item.total_adelantado) }}</td>
                    <td class="table-cell text-right">
                      <button @click="router.push({ name: 'AdminViajesList', query: { responsableId: item.responsable_id, estado: 'en_curso' } })" class="text-blue-600 hover:text-blue-800 font-semibold text-xs py-1 px-2 rounded hover:bg-blue-50">Ver Rendiciones →</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style>
/* Estilos globales para la vista que se mantienen */
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.section-title { @apply text-xl font-semibold text-gray-700 mb-4; }
.section-container { @apply bg-white p-6 rounded-xl shadow-lg border relative; }
.no-data-placeholder { @apply flex justify-center items-center h-full text-center text-gray-500; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm text-gray-600; }
.btn-primary { @apply bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors; }
.btn-primary.btn-sm { @apply py-1.5 px-3 text-sm; }
.btn-icon { @apply p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors; }
.v-select-filter { --vs-controls-color: #6b7280; --vs-border-color: #d1d5db; --vs-dropdown-bg: #ffffff; --vs-dropdown-option-bg: #ffffff; --vs-dropdown-option-color: #374151; --vs-dropdown-option-padding: 0.5rem 1rem; --vs-dropdown-option--active-bg: #3b82f6; --vs-dropdown-option--active-color: #ffffff; --vs-selected-bg: #3b82f6; --vs-selected-color: #ffffff; --vs-search-input-color: #4b5563; --vs-line-height: 1.5; --vs-font-size: 0.875rem; }
.tactical-kpi-card { @apply bg-gray-50/70 p-4 rounded-lg border border-gray-200; }
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.3s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-active .transform,
.modal-fade-leave-active .transform { transition: all 0.3s ease; }
.modal-fade-enter-from .transform,
.modal-fade-leave-to .transform { transform: scale(0.95); opacity: 0; }
</style>