<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { useReportGenerator } from '../composables/useReportGenerator.js';

const props = defineProps({
  caja: {
    type: Object,
    required: true
  }
});

const { exportJsonToExcel } = useReportGenerator();

// --- ESTADO INTERNO DEL COMPONENTE ---
const movimientos = ref([]);
const movimientosLoading = ref(true);
const movimientosError = ref('');

// --- ESTADO DE FILTRADO ---
const filterDateDesde = ref('');
const filterDateHasta = ref('');
const filterTipoMovimiento = ref('');
const searchTerm = ref('');
const selectedMonth = ref('');

// --- ESTADO DE UI ---
const showExportMenu = ref(false);

// --- INICIO: ESTADO PARA MODALES DE ACCIÓN ---
const showEditModal = ref(false);
const showDeleteRequestModal = ref(false);
const selectedMovimiento = ref(null);
const editableDescription = ref('');
const deleteReason = ref('');
const actionLoading = ref(false);
const modalError = ref('');
// --- FIN: ESTADO PARA MODALES DE ACCIÓN ---

// --- LÓGICA DE CARGA DE DATOS ---
async function cargarMovimientos() {
  if (!props.caja?.id) return;
  
  movimientosLoading.value = true;
  movimientosError.value = '';
  try {
    let query = supabase
      .from('movimientos_caja_detalle')
      .select('*, gasto_info:gastos(*, creador:creado_por_id(nombre_completo))') // Traemos info del gasto y si fue delegado
      .eq('caja_id', props.caja.id);

    if (filterDateDesde.value) query = query.gte('created_at', `${filterDateDesde.value}T00:00:00Z`);
    if (filterDateHasta.value) query = query.lte('created_at', `${filterDateHasta.value}T23:59:59Z`);
    if (filterTipoMovimiento.value) query = query.eq('tipo_movimiento', filterTipoMovimiento.value);
    if (searchTerm.value) {
      query = query.or(`descripcion.ilike.%${searchTerm.value}%,gasto_descripcion.ilike.%${searchTerm.value}%`);
    }

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

// --- COMPUTED PROPERTIES PARA LA UI ---
const totalIngresosFiltrados = computed(() => {
  return movimientos.value
    .filter(m => m.tipo_movimiento !== 'gasto')
    .reduce((sum, m) => sum + m.monto, 0);
});

const totalEgresosFiltrados = computed(() => {
  return movimientos.value
    .filter(m => m.tipo_movimiento === 'gasto')
    .reduce((sum, m) => sum + m.monto, 0);
});

const availableMonths = computed(() => {
  const months = new Set();
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${date.toLocaleString('es-AR', { month: 'long' })} ${date.getFullYear()}`;
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.add(JSON.stringify({ label: monthStr.charAt(0).toUpperCase() + monthStr.slice(1), value }));
  }
  return Array.from(months).map(item => JSON.parse(item));
});

// --- LÓGICA DE FILTROS ---
function applyFilters() {
  cargarMovimientos();
}

function resetFilters() {
  filterDateDesde.value = '';
  filterDateHasta.value = '';
  filterTipoMovimiento.value = '';
  searchTerm.value = '';
  selectedMonth.value = '';
  applyFilters();
}

watch(selectedMonth, (newMonth) => {
  if (newMonth) {
    const [year, month] = newMonth.split('-');
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    filterDateDesde.value = startDate.toISOString().split('T')[0];
    filterDateHasta.value = endDate.toISOString().split('T')[0];
  } else {
    filterDateDesde.value = '';
    filterDateHasta.value = '';
  }
});

// --- LÓGICA DE EXPORTACIÓN ---
function handleExport(format) {
  showExportMenu.value = false;
  if (format === 'xls') {
    const dataToExport = movimientos.value.map(m => ({
      Fecha: formatDate(m.created_at),
      Tipo: m.tipo_movimiento,
      Categoria: m.categoria_gasto || '-',
      Descripcion: m.gasto_descripcion || m.descripcion,
      Ingreso: m.tipo_movimiento !== 'gasto' ? m.monto : 0,
      Egreso: m.tipo_movimiento === 'gasto' ? m.monto : 0,
      Saldo: m.saldo_posterior
    }));
    exportJsonToExcel(dataToExport, `Movimientos_Caja_${props.caja.nombre}`);
  }
}

// --- INICIO: LÓGICA DE MODALES Y ACCIONES ---
function abrirModalEdicion(movimiento) {
  selectedMovimiento.value = movimiento;
  editableDescription.value = movimiento.gasto_descripcion || '';
  modalError.value = '';
  showEditModal.value = true;
}

async function confirmarEdicion() {
  if (!selectedMovimiento.value?.gasto_id) return;
  actionLoading.value = true;
  modalError.value = '';
  try {
    // Asumimos que existe una RPC para editar la descripción del gasto.
    // Si no existe, habría que crearla o hacer un update directo si RLS lo permite.
    const { error } = await supabase
      .from('gastos')
      .update({ descripcion_general: editableDescription.value })
      .eq('id', selectedMovimiento.value.gasto_id);

    if (error) throw error;
    
    // Actualizar la UI localmente para reflejar el cambio
    const movIndex = movimientos.value.findIndex(m => m.id === selectedMovimiento.value.id);
    if (movIndex !== -1) {
      movimientos.value[movIndex].gasto_descripcion = editableDescription.value;
    }
    
    showEditModal.value = false;
  } catch (e) {
    modalError.value = `Error al editar: ${e.message}`;
  } finally {
    actionLoading.value = false;
  }
}

function abrirModalSolicitudEliminacion(movimiento) {
  selectedMovimiento.value = movimiento;
  deleteReason.value = '';
  modalError.value = '';
  showDeleteRequestModal.value = true;
}

async function confirmarSolicitudEliminacion() {
  if (!deleteReason.value.trim()) {
    modalError.value = "Debes proporcionar un motivo para la solicitud.";
    return;
  }
  if (!selectedMovimiento.value?.gasto_id) return;

  actionLoading.value = true;
  modalError.value = '';
  try {
    // Asumimos que existe una RPC para solicitar la eliminación.
    // Si no, habría que crearla.
    const { error } = await supabase.rpc('solicitar_eliminacion_gasto', {
      p_gasto_id: selectedMovimiento.value.gasto_id,
      p_motivo: deleteReason.value
    });
    if (error) throw error;
    
    showDeleteRequestModal.value = false;
    // Aquí podríamos mostrar una notificación de éxito
  } catch (e) {
    modalError.value = `Error al solicitar: ${e.message}`;
  } finally {
    actionLoading.value = false;
  }
}
// --- FIN: LÓGICA DE MODALES Y ACCIONES ---

onMounted(cargarMovimientos);
</script>
<template>
  <div class="bg-white shadow-lg rounded-xl border border-gray-200">
    <!-- Encabezado con Título y Exportación -->
    <div class="p-4 sm:p-6 border-b border-gray-200">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 class="text-xl font-bold text-gray-800">Historial de Movimientos</h2>
          <p class="text-sm text-gray-500 mt-1">Revisa y filtra todos los movimientos de tu caja.</p>
        </div>
        <div class="relative">
          <button @click="showExportMenu = !showExportMenu" class="btn-secondary">
            <svg xmlns="http://www.w.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
            <span>Exportar</span>
          </button>
          <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
            <div v-if="showExportMenu" @click.away="showExportMenu = false" class="absolute right-0 mt-2 w-48 origin-top-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-10">
              <div class="py-1">
                <a @click.prevent="handleExport('xls')" href="#" class="export-option">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V3zM5 5h2v2H5V5zm4 0h2v2H9V5zm4 0h2v2h-2V5zm-8 4h2v2H5V9zm4 0h2v2H9V9zm4 0h2v2h-2V9zm-8 4h2v2H5v-2zm4 0h2v2H9v-2zm4 0h2v2h-2v-2z" /></svg>
                  <span>Exportar a XLS</span>
                </a>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- Mini Resumen y Filtros -->
    <div class="p-4 sm:p-6">
      <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p class="text-sm text-gray-500">Movimientos</p>
            <p class="text-lg font-bold text-gray-800">{{ movimientos.length }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Ingresos Totales</p>
            <p class="text-lg font-bold text-green-600">{{ formatCurrency(totalIngresosFiltrados) }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Egresos Totales</p>
            <p class="text-lg font-bold text-red-600">{{ formatCurrency(totalEgresosFiltrados) }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Saldo Neto</p>
            <p class="text-lg font-bold text-indigo-600">{{ formatCurrency(totalIngresosFiltrados - totalEgresosFiltrados) }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div class="lg:col-span-2">
          <label for="searchTerm" class="form-label">Buscar descripción:</label>
          <input type="text" id="searchTerm" v-model="searchTerm" @keydown.enter.prevent="applyFilters" placeholder="Ej: Nafta, Almuerzo..." class="form-input mt-1">
        </div>
        <div>
          <label for="filterDateDesde" class="form-label">Desde:</label>
          <input type="date" id="filterDateDesde" v-model="filterDateDesde" class="form-input mt-1">
        </div>
        <div>
          <label for="filterDateHasta" class="form-label">Hasta:</label>
          <input type="date" id="filterDateHasta" v-model="filterDateHasta" class="form-input mt-1">
        </div>
        <div class="flex items-center gap-3">
          <button @click="applyFilters" type="button" class="btn-primary w-full">Aplicar</button>
          <button @click="resetFilters" type="button" class="btn-secondary w-full">Limpiar</button>
        </div>
      </div>
    </div>

    <!-- Tabla de Movimientos -->
    <div v-if="movimientosLoading" class="text-center py-8">
      <svg class="animate-spin h-8 w-8 text-indigo-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
      <p class="mt-2 text-gray-500">Cargando movimientos...</p>
    </div>
    <div v-else-if="movimientosError" class="bg-red-50 p-4 text-red-700 m-6 rounded-lg">{{ movimientosError }}</div>
    <div v-else-if="movimientos.length === 0" class="p-8 text-center text-gray-500">No hay movimientos que coincidan con los filtros aplicados.</div>
    
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="table-header w-24">Fecha</th>
            <th class="table-header w-40">Tipo</th>
            <th class="table-header">Descripción</th>
            <th class="table-header text-right w-32">Monto</th>
            <th class="table-header text-right w-32">Saldo</th>
            <th class="table-header text-center w-24">Acciones</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="movimiento in movimientos" :key="movimiento.id">
            <td class="table-cell text-gray-500">{{ formatDate(movimiento.created_at) }}</td>
            <td class="table-cell font-medium">
              <div class="flex items-center gap-2">
                <span v-if="movimiento.tipo_movimiento === 'gasto'" class="text-red-500" title="Egreso">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414l-3-3z" clip-rule="evenodd" /></svg>
                </span>
                <span v-else class="text-green-500" title="Ingreso">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.707-7.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7a1 1 0 10-2 0v3.586L7.293 9.293z" clip-rule="evenodd" /></svg>
                </span>
                <div>
                  <span>{{ movimiento.tipo_movimiento.replace('_', ' ') }}</span>
                  <span v-if="movimiento.categoria_gasto" class="block text-xs text-gray-500">{{ movimiento.categoria_gasto }}</span>
                </div>
              </div>
            </td>
            <td class="table-cell text-gray-800">
              <div>{{ movimiento.gasto_descripcion || movimiento.descripcion || 'N/A' }}</div>
              <div v-if="movimiento.gasto_info?.creador" class="text-xs text-gray-500 mt-1 italic">(Delegado por: <span class="font-semibold">{{ movimiento.gasto_info.creador.nombre_completo }}</span>)</div>
            </td>
            <td class="table-cell text-right font-semibold" :class="movimiento.tipo_movimiento === 'gasto' ? 'text-red-600' : 'text-green-600'">
              {{ (movimiento.tipo_movimiento !== 'gasto' ? '+' : '-') + formatCurrency(movimiento.monto) }}
            </td>
            <td class="table-cell text-right font-bold text-gray-700">{{ formatCurrency(movimiento.saldo_posterior) }}</td>
            <td class="table-cell text-center">
              <div v-if="movimiento.tipo_movimiento === 'gasto'" class="flex justify-center gap-2">
                <button @click.stop="abrirModalEdicion(movimiento)" class="btn-icon" title="Editar Descripción"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                <button @click.stop="abrirModalSolicitudEliminacion(movimiento)" class="btn-icon text-red-500" title="Solicitar Eliminación"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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
.form-label { @apply block text-sm font-medium text-gray-700; }
.form-input { @apply mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.btn-primary { @apply inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50; }
.btn-secondary { @apply inline-flex items-center justify-center gap-x-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.btn-danger { @apply rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50; }
.btn-icon { @apply p-1.5 text-gray-400 hover:text-gray-700; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm; }
.export-option { @apply flex items-center gap-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100; }
.modal-backdrop { @apply fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4; }
.modal-container { @apply bg-white rounded-lg shadow-xl w-full max-w-md; }
.modal-title { @apply text-lg font-semibold p-4 border-b; }
.modal-error { @apply mt-2 text-sm text-red-600; }
.modal-actions { @apply p-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg; }
</style>