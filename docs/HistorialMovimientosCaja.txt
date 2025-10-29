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
const expandedRows = ref(new Set());

// --- ESTADO DE FILTRADO Y PAGINACIÓN ---
const filterDateDesde = ref('');
const filterDateHasta = ref('');
const filterTipoMovimiento = ref('');
const searchTerm = ref('');
const currentPage = ref(1);
const itemsPerPage = ref(10);

// --- NUEVO: ESTADO PARA MODALES DE ACCIÓN ---
const showEditModal = ref(false);
const showDeleteRequestModal = ref(false);
const selectedGasto = ref(null);
const editableDescription = ref('');
const deleteReason = ref('');
const actionLoading = ref(false);
const modalError = ref('');

// --- LÓGICA DE CARGA DE DATOS (REFACTORIZADA) ---
async function cargarMovimientos() {
  if (!props.caja?.id) return;
  
  movimientosLoading.value = true;
  movimientosError.value = '';
  try {
    let query = supabase
      .from('movimientos_caja')
      .select(`
        *,
        gasto:gastos(
          *,
          tipo_gasto:tipos_gasto_config(nombre_tipo_gasto),
          creador:creado_por_id(nombre_completo),
          proveedor:proveedores(nombre),
          cliente:clientes(nombre_cliente)
        ), 
        realizado_por:realizado_por_id(nombre_completo) 
      `)
      .eq('caja_id', props.caja.id);

    if (filterDateDesde.value) query = query.gte('created_at', `${filterDateDesde.value}T00:00:00Z`);
    if (filterDateHasta.value) query = query.lte('created_at', `${filterDateHasta.value}T23:59:59Z`);
    if (filterTipoMovimiento.value) query = query.eq('tipo_movimiento', filterTipoMovimiento.value);
    if (searchTerm.value) query = query.ilike('gasto.descripcion_general', `%${searchTerm.value}%`);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    
    movimientos.value = data;
  } catch (e) {
    console.error('Error al cargar movimientos de caja:', e);
    movimientosError.value = `No se pudieron cargar los movimientos: ${e.message}`;
    movimientos.value = [];
  } finally {
    movimientosLoading.value = false;
  }
}

// --- COMPUTED PARA PAGINACIÓN (CLIENT-SIDE) ---
const paginatedMovimientos = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return movimientos.value.slice(start, end);
});

const totalItems = computed(() => movimientos.value.length);
const totalPages = computed(() => Math.ceil(totalItems.value / itemsPerPage.value));

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
  if (page >= 1 && page <= totalPages.value) currentPage.value = page;
}
function nextPage() {
  if (currentPage.value < totalPages.value) goToPage(currentPage.value + 1);
}
function prevPage() {
  if (currentPage.value > 1) goToPage(currentPage.value - 1);
}

// --- NUEVO: LÓGICA DE MODALES Y ACCIONES ---
function toggleRowExpansion(movimientoId) {
  const newSet = new Set(expandedRows.value);
  if (newSet.has(movimientoId)) newSet.delete(movimientoId);
  else newSet.add(movimientoId);
  expandedRows.value = newSet;
}

function abrirModalEdicion(movimiento) {
  selectedGasto.value = movimiento.gasto;
  editableDescription.value = movimiento.gasto.descripcion_general;
  modalError.value = '';
  showEditModal.value = true;
}

async function confirmarEdicion() {
  actionLoading.value = true;
  modalError.value = '';
  try {
    const { error } = await supabase.rpc('usuario_editar_gasto_caja', {
      p_gasto_id: selectedGasto.value.id,
      p_nueva_descripcion: editableDescription.value
    });
    if (error) throw error;
    
    const movIndex = movimientos.value.findIndex(m => m.gasto?.id === selectedGasto.value.id);
    if (movIndex !== -1) {
      movimientos.value[movIndex].gasto.descripcion_general = editableDescription.value;
    }
    
    showEditModal.value = false;
  } catch (e) {
    modalError.value = `Error al editar: ${e.message}`;
  } finally {
    actionLoading.value = false;
  }
}

function abrirModalSolicitudEliminacion(movimiento) {
  selectedGasto.value = movimiento.gasto;
  deleteReason.value = '';
  modalError.value = '';
  showDeleteRequestModal.value = true;
}

async function confirmarSolicitudEliminacion() {
  if (!deleteReason.value.trim()) {
    modalError.value = "Debes proporcionar un motivo para la solicitud.";
    return;
  }
  actionLoading.value = true;
  modalError.value = '';
  try {
    const { error } = await supabase.rpc('solicitar_eliminacion_gasto', {
      p_gasto_id: selectedGasto.value.id,
      p_motivo: deleteReason.value
    });
    if (error) throw error;
    
    showDeleteRequestModal.value = false;
    alert('Solicitud de eliminación enviada con éxito.');
  } catch (e) {
    modalError.value = `Error al solicitar: ${e.message}`;
  } finally {
    actionLoading.value = false;
  }
}

// --- Carga inicial y watchers ---
onMounted(cargarMovimientos);
watch(() => props.caja.id, (newId, oldId) => {
  if (newId !== oldId) {
    resetFilters();
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
      
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div><label for="filterDateDesde" class="form-label">Desde:</label><input type="date" id="filterDateDesde" v-model="filterDateDesde" class="form-input mt-1"></div>
        <div><label for="filterDateHasta" class="form-label">Hasta:</label><input type="date" id="filterDateHasta" v-model="filterDateHasta" class="form-input mt-1"></div>
        <div><label for="filterTipoMovimiento" class="form-label">Tipo:</label><select id="filterTipoMovimiento" v-model="filterTipoMovimiento" class="form-input mt-1"><option value="">Todos</option><option value="gasto">Gasto</option><option value="reposicion">Reposición</option><option value="ajuste_manual">Ajuste Manual</option></select></div>
        <div class="sm:col-span-2 md:col-span-2"><label for="searchTerm" class="form-label">Buscar descripción:</label><input type="text" id="searchTerm" v-model="searchTerm" @keydown.enter.prevent="applyFiltersAndPagination" placeholder="Ej: Nafta, Almuerzo..." class="form-input mt-1"></div>
        <div class="flex flex-col sm:flex-row items-end justify-end gap-3 mt-4 sm:mt-0"><button @click="applyFiltersAndPagination" type="button" class="btn-primary min-h-[44px]">Aplicar Filtros</button><button @click="resetFilters" type="button" class="btn-secondary min-h-[44px]">Limpiar</button></div>
      </div>
    </div>

    <div v-if="movimientosLoading" class="text-center py-8"><svg class="animate-spin h-8 w-8 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p class="mt-2 text-gray-500">Cargando movimientos...</p></div>
    <div v-else-if="movimientosError" class="bg-red-50 p-4 text-red-700">{{ movimientosError }}</div>
    <div v-else-if="movimientos.length === 0" class="p-8 text-center text-gray-500">No hay movimientos que coincidan.</div>
    
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="table-header">Fecha</th>
            <th class="table-header">Tipo</th>
            <th class="table-header">Descripción</th>
            <th class="table-header text-right">Monto</th>
            <th class="table-header text-right">Realizado Por</th>
            <th v-if="!isAdminReport" class="table-header text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <template v-for="movimiento in paginatedMovimientos" :key="movimiento.id">
            <tr @click="toggleRowExpansion(movimiento.id)" class="cursor-pointer" :class="{'bg-blue-50 hover:bg-blue-100': movimiento.gasto?.creador}">
              <td class="table-cell">{{ formatDate(movimiento.created_at) }}</td>
              <td class="table-cell font-medium" :class="movimiento.monto < 0 ? 'text-red-600' : 'text-green-600'">
                <div>{{ movimiento.tipo_movimiento.replace('_', ' ') }}</div>
                <div v-if="movimiento.gasto?.tipo_gasto" class="text-xs text-gray-500">{{ movimiento.gasto.tipo_gasto.nombre_tipo_gasto }}</div>
              </td>
              <td class="table-cell">
                <div>{{ movimiento.gasto?.descripcion_general || movimiento.descripcion || 'N/A' }}</div>
                <div v-if="movimiento.gasto?.creador" class="text-xs text-gray-500 mt-1">(Delegado por: <span class="font-semibold">{{ movimiento.gasto.creador.nombre_completo }}</span>)</div>
              </td>
              <td class="table-cell text-right font-semibold" :class="movimiento.monto < 0 ? 'text-red-600' : 'text-green-600'">
                {{ (movimiento.monto > 0 ? '+' : '') + formatCurrency(movimiento.monto) }}
              </td>
              <td class="table-cell text-right">{{ movimiento.realizado_por?.nombre_completo || 'Sistema' }}</td>
              <td v-if="!isAdminReport" class="table-cell text-center">
                <div v-if="movimiento.tipo_movimiento === 'gasto'" class="flex justify-center gap-2">
                  <button @click.stop="abrirModalEdicion(movimiento)" class="btn-icon" title="Editar Descripción"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                  <button @click.stop="abrirModalSolicitudEliminacion(movimiento)" class="btn-icon text-red-500" title="Solicitar Eliminación"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>
                </div>
              </td>
            </tr>
            <tr v-if="expandedRows.has(movimiento.id) && movimiento.gasto">
              <td :colspan="isAdminReport ? 5 : 6" class="p-4 bg-gray-100">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div v-if="movimiento.gasto.proveedor"><strong class="block text-gray-500">Proveedor</strong> {{ movimiento.gasto.proveedor.nombre }}</div>
                  <div v-if="movimiento.gasto.cliente"><strong class="block text-gray-500">Cliente</strong> {{ movimiento.gasto.cliente.nombre_cliente }}</div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="px-6 py-4 bg-gray-50 flex justify-between items-center">
        <div class="text-sm text-gray-700">Mostrando {{ paginatedMovimientos.length }} de {{ totalItems }}</div>
        <div class="flex items-center gap-2">
             <button @click="prevPage" :disabled="currentPage === 1" class="btn-secondary text-sm">Anterior</button>
             <span>Página {{ currentPage }} de {{ totalPages }}</span>
             <button @click="nextPage" :disabled="currentPage === totalPages" class="btn-secondary text-sm">Siguiente</button>
        </div>
    </div>

    <!-- Modales -->
    <div v-if="showEditModal" class="modal-backdrop" @click.self="showEditModal = false">
      <div class="modal-container">
        <h3 class="modal-title">Editar Descripción del Gasto</h3>
        <div class="p-4">
          <label for="edit-desc" class="form-label">Descripción</label>
          <textarea id="edit-desc" v-model="editableDescription" rows="3" class="form-input mt-1"></textarea>
          <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        </div>
        <div class="modal-actions">
          <button @click="showEditModal = false" class="btn-secondary">Cancelar</button>
          <button @click="confirmarEdicion" :disabled="actionLoading" class="btn-primary">{{ actionLoading ? 'Guardando...' : 'Guardar Cambios' }}</button>
        </div>
      </div>
    </div>
    <div v-if="showDeleteRequestModal" class="modal-backdrop" @click.self="showDeleteRequestModal = false">
      <div class="modal-container">
        <h3 class="modal-title">Solicitar Eliminación de Gasto</h3>
        <p class="text-sm text-gray-600 mt-2 p-4">Esta acción enviará una solicitud a un administrador para que revise y elimine este gasto. No se puede deshacer.</p>
        <div class="p-4">
          <label for="delete-reason" class="form-label">Motivo de la solicitud <span class="text-red-500">*</span></label>
          <textarea id="delete-reason" v-model="deleteReason" rows="3" class="form-input mt-1" placeholder="Ej: Gasto duplicado, monto incorrecto, etc."></textarea>
          <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        </div>
        <div class="modal-actions">
          <button @click="showDeleteRequestModal = false" class="btn-secondary">Cancelar</button>
          <button @click="confirmarSolicitudEliminacion" :disabled="actionLoading" class="btn-danger">{{ actionLoading ? 'Enviando...' : 'Enviar Solicitud' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium leading-6 text-gray-900; }
.form-input { @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.btn-danger { @apply rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50; }
.btn-icon { @apply p-1.5 text-gray-400 hover:text-gray-700; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-6 py-4 whitespace-nowrap text-sm; }
.modal-backdrop { @apply fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4; }
.modal-container { @apply bg-white rounded-lg shadow-xl w-full max-w-md; }
.modal-title { @apply text-lg font-semibold p-4 border-b; }
.modal-error { @apply mt-2 text-sm text-red-600; }
.modal-actions { @apply p-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg; }
</style>