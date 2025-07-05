<!-- src/components/HistorialMovimientosCaja.vue -->
<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import CajaReportExporter from './CajaReportExporter.vue';

const props = defineProps({
  caja: {
    type: Object,
    required: true
  },
  isAdminReport: {
    type: Boolean,
    default: false
  }
});

// --- ESTADO INTERNO DEL COMPONENTE ---
const movimientos = ref([]);
const movimientosLoading = ref(true);
const movimientosError = ref('');

// --- ESTADO DE FILTRADO Y PAGINACIÓN ---
const filterDateDesde = ref('');
const filterDateHasta = ref('');
const filterTipoMovimiento = ref('');
const searchTerm = ref('');
const currentPage = ref(1);
const itemsPerPage = ref(10);
const totalItems = ref(0);
const totalPages = computed(() => Math.ceil(totalItems.value / itemsPerPage.value));

// --- LÓGICA DE CARGA DE DATOS ---
async function cargarMovimientos() {
  if (!props.caja?.id) return;
  
  movimientosLoading.value = true;
  movimientosError.value = '';
  try {
    let query = supabase
      .from('movimientos_caja')
      .select(`
        *,
        gastos ( descripcion_general, monto_total ), 
        realizado_por_id: perfiles ( nombre_completo ) 
      `, { count: 'exact' });

    query = query.eq('caja_id', props.caja.id);

    if (filterDateDesde.value) query = query.gte('created_at', `${filterDateDesde.value}T00:00:00Z`);
    if (filterDateHasta.value) query = query.lte('created_at', `${filterDateHasta.value}T23:59:59Z`);
    if (filterTipoMovimiento.value) query = query.eq('tipo_movimiento', filterTipoMovimiento.value);
    if (searchTerm.value) query = query.ilike('descripcion', `%${searchTerm.value}%`);

    query = query.order('created_at', { ascending: false });

    const offset = (currentPage.value - 1) * itemsPerPage.value;
    query = query.range(offset, offset + itemsPerPage.value - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    
    movimientos.value = data;
    totalItems.value = count;
  } catch (e) {
    console.error('Error al cargar movimientos de caja:', e);
    movimientosError.value = `No se pudieron cargar los movimientos: ${e.message}`;
    movimientos.value = [];
    totalItems.value = 0;
  } finally {
    movimientosLoading.value = false;
  }
}

// --- LÓGICA DE FILTROS Y PAGINACIÓN ---
function applyFiltersAndPagination() {
  currentPage.value = 1;
  cargarMovimientos();
}

function resetFilters() {
  filterDateDesde.value = '';
  filterDateHasta.value = '';
  filterTipoMovimiento.value = '';
  searchTerm.value = '';
  applyFiltersAndPagination();
}

function goToPage(page) {
  if (page >= 1 && page <= totalPages.value && !movimientosLoading.value) {
    currentPage.value = page;
    cargarMovimientos();
  }
}
function nextPage() {
  if (currentPage.value < totalPages.value) goToPage(currentPage.value + 1);
}
function prevPage() {
  if (currentPage.value > 1) goToPage(currentPage.value - 1);
}

// --- Carga inicial y watchers ---
onMounted(cargarMovimientos);
watch(() => props.caja.id, (newId, oldId) => {
  if (newId !== oldId) {
    resetFilters(); // Resetea filtros si cambia la caja
  }
});
</script>

<template>
  <div class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
    <div class="p-6 bg-gray-50 border-b border-gray-200">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h2 class="text-xl font-bold text-gray-800">Historial de Movimientos</h2>
        <CajaReportExporter 
          :movimientos="movimientos" 
          :caja="caja"
          :is-admin-report="isAdminReport"
        />
      </div>
      
      <!-- Controles de Filtro -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label for="filterDateDesde" class="form-label">Desde:</label>
          <input type="date" id="filterDateDesde" v-model="filterDateDesde" class="form-input mt-1">
        </div>
        <div>
          <label for="filterDateHasta" class="form-label">Hasta:</label>
          <input type="date" id="filterDateHasta" v-model="filterDateHasta" class="form-input mt-1">
        </div>
        <div>
          <label for="filterTipoMovimiento" class="form-label">Tipo:</label>
          <select id="filterTipoMovimiento" v-model="filterTipoMovimiento" class="form-input mt-1">
            <option value="">Todos</option>
            <option value="gasto">Gasto</option>
            <option value="reposicion">Reposición</option>
            <option value="ajuste_manual">Ajuste Manual</option>
          </select>
        </div>
        <div class="sm:col-span-2 md:col-span-2">
          <label for="searchTerm" class="form-label">Buscar descripción:</label>
          <input type="text" id="searchTerm" v-model="searchTerm" @keydown.enter.prevent="applyFiltersAndPagination" placeholder="Ej: Nafta, Almuerzo..." class="form-input mt-1">
        </div>
         <div class="flex flex-col sm:flex-row items-end justify-end gap-3 mt-4 sm:mt-0">
             <button @click="applyFiltersAndPagination" type="button" class="btn-primary min-h-[44px]">Aplicar Filtros</button>
             <button @click="resetFilters" type="button" class="btn-secondary min-h-[44px]">Limpiar</button>
         </div>
      </div>
    </div>

    <!-- Estados de carga, error o vacío del historial -->
    <div v-if="movimientosLoading" class="text-center py-8">
      <svg class="animate-spin h-8 w-8 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p class="mt-2 text-gray-500">Cargando movimientos...</p>
    </div>
    <div v-else-if="movimientosError" class="bg-red-50 p-4 text-red-700">{{ movimientosError }}</div>
    <div v-else-if="movimientos.length === 0" class="p-8 text-center text-gray-500">No hay movimientos que coincidan.</div>
    
    <!-- Tabla de Movimientos -->
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Realizado Por</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="movimiento in movimientos" :key="movimiento.id">
            <td class="px-6 py-4 text-sm">{{ formatDate(movimiento.created_at) }}</td>
            <td class="px-6 py-4 text-sm font-medium" :class="movimiento.tipo_movimiento === 'gasto' ? 'text-red-600' : 'text-green-600'">
              {{ movimiento.tipo_movimiento.charAt(0).toUpperCase() + movimiento.tipo_movimiento.slice(1).replace('_', ' ') }}
            </td>
            <td class="px-6 py-4 text-sm">{{ movimiento.tipo_movimiento === 'gasto' ? movimiento.gastos?.descripcion_general || 'N/A' : movimiento.descripcion || 'N/A' }}</td>
            <td class="px-6 py-4 text-sm text-right font-semibold" :class="movimiento.tipo_movimiento === 'gasto' ? 'text-red-600' : 'text-green-600'">
              {{ (movimiento.tipo_movimiento === 'gasto' ? '-' : '+') + formatCurrency(movimiento.monto) }}
            </td>
            <td class="px-6 py-4 text-sm">{{ movimiento.realizado_por_id?.nombre_completo || 'Sistema' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="px-6 py-4 bg-gray-50 flex justify-between items-center">
        <div class="text-sm text-gray-700">Mostrando {{ movimientos.length }} de {{ totalItems }}</div>
        <div class="flex items-center gap-2">
             <button @click="prevPage" :disabled="currentPage === 1" class="btn-secondary text-sm">Anterior</button>
             <span>Página {{ currentPage }} de {{ totalPages }}</span>
             <button @click="nextPage" :disabled="currentPage === totalPages" class="btn-secondary text-sm">Siguiente</button>
        </div>
    </div>
  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium leading-6 text-gray-900; }
.form-input { @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
</style>