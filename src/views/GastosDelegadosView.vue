--- START OF FILE src/views/GastosDelegadosView.vue ---
<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import DelegatedExpenseCard from '../components/DelegatedExpenseCard.vue';

// --- ESTADO PRINCIPAL ---
const activeTab = ref('pendientes'); // 'pendientes' o 'historial'
// CORRECCIÓN: Los filtros para el historial ahora deben ser singulares para coincidir con la DB
const historyFilter = ref('aceptado'); // 'aceptado' o 'rechazado'
const pendingExpenses = ref([]);
const historyExpenses = ref([]); // Nuevo estado para el historial
const loading = ref(true);
const errorMessage = ref('');

// --- ESTADO DEL MODAL ---
const showAcceptModal = ref(false);
const showEditModal = ref(false);
const selectedGasto = ref(null);
const editableGasto = ref({});
const modalLoading = ref(false);
const modalError = ref('');
const rendicionesActivas = ref([]);
const tiposDeGasto = ref([]);
const selectedRendicionId = ref(null);

// --- LÓGICA DE DATOS ---
const filteredHistory = computed(() => {
  if (!historyExpenses.value) return [];
  // Normalizamos para asegurar la comparación, aunque los valores ya deberían coincidir
  return historyExpenses.value.filter(h => 
    String(h.decision || '').trim().toLowerCase() === String(historyFilter.value || '').trim().toLowerCase()
  );
});

async function fetchPendingExpenses() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado.');
    
    // La RPC devuelve TODOS los gastos delegados para este usuario, sin importar su estado final.
    const { data, error } = await supabase
      .rpc('obtener_gastos_recibidos', { p_user_id: user.id })
      .select(`*, creador:creado_por_id (nombre_completo, email), tipo:tipo_gasto_id (nombre_tipo_gasto)`);
      
    if (error) throw error;
    
    // CORRECCIÓN CRÍTICA: Filtrar los resultados localmente para obtener solo los pendientes
    pendingExpenses.value = (data || []).filter(gasto => 
      gasto.estado_delegacion === 'pendiente_aceptacion'
    );

  } catch (e) {
    errorMessage.value = `Error al cargar pendientes: ${e.message}`;
    console.error("Error in fetchPendingExpenses:", e);
  }
}

async function fetchHistory() {
  try {
    // Esta RPC está diseñada para traer los datos del historial de decisiones.
    const { data, error } = await supabase.rpc('obtener_mi_historial_delegaciones');
    if (error) throw error;
    historyExpenses.value = data || [];
  } catch (e) {
    errorMessage.value = `Error al cargar el historial: ${e.message}`;
    console.error("Error in fetchHistory:", e);
  }
}

async function loadAllData() {
  loading.value = true;
  errorMessage.value = '';
  await Promise.all([
    fetchPendingExpenses(),
    fetchHistory(),
    fetchDropdownData()
  ]);
  loading.value = false;
}

onMounted(loadAllData);

async function fetchDropdownData() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [rendicionesRes, tiposRes] = await Promise.all([
      supabase.from('viajes').select('id, nombre_viaje').eq('user_id', user.id).is('cerrado_en', null),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true)
    ]);
    if (rendicionesRes.error) throw rendicionesRes.error;
    rendicionesActivas.value = rendicionesRes.data || [];
    if (tiposRes.error) throw tiposRes.error;
    tiposDeGasto.value = tiposRes.data || [];
  } catch (e) {
    console.error("Error cargando datos para modales:", e);
  }
}

// --- LÓGICA DE MODALES Y ACCIONES ---
function openAcceptModal(gasto) {
  selectedGasto.value = gasto;
  selectedRendicionId.value = null;
  modalError.value = '';
  showAcceptModal.value = true;
}

function openEditModal(gasto) {
  selectedGasto.value = gasto;
  editableGasto.value = { ...gasto };
  selectedRendicionId.value = null;
  modalError.value = '';
  showEditModal.value = true;
}

function closeModal() {
  showAcceptModal.value = false;
  showEditModal.value = false;
  selectedGasto.value = null;
  modalLoading.value = false;
}

async function handleAccept(gasto, rendicionId) {
  modalLoading.value = true;
  modalError.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    // 1. Actualizar el gasto
    const { error: updateError } = await supabase
      .from('gastos')
      .update({ viaje_id: rendicionId, estado_delegacion: 'aceptado' })
      .eq('id', gasto.id);
    if (updateError) throw updateError;

    // 2. Registrar en el historial
    await supabase.from('historial_delegaciones').insert({
      gasto_id: gasto.id,
      delegador_id: gasto.creado_por_id,
      receptor_id: user.id,
      decision: 'aceptado'
    });

    // 3. Notificar (opcional)
    await supabase.from('notificaciones').insert({
      user_id: gasto.creado_por_id,
      mensaje: `Tu gasto delegado de ${formatCurrency(gasto.monto_total)} fue aceptado.`,
      link_a: `/gastos/editar/${gasto.id}`, tipo: 'aprobacion'
    });

    closeModal();
    await loadAllData(); // Recargamos todo
  } catch (e) {
    modalError.value = `Error al aceptar el gasto: ${e.message}`;
  } finally {
    modalLoading.value = false;
  }
}

async function handleUpdateAndAccept() {
  if (!selectedRendicionId.value) {
    modalError.value = 'Debes seleccionar una rendición para asociar el gasto.';
    return;
  }
  modalLoading.value = true;
  modalError.value = '';
  try {
    // 1. Actualizar los detalles del gasto
    const { error: updateError } = await supabase
      .from('gastos')
      .update({
        descripcion_general: editableGasto.value.descripcion_general,
        tipo_gasto_id: editableGasto.value.tipo_gasto_id,
        monto_total: editableGasto.value.monto_total
      })
      .eq('id', selectedGasto.value.id);
    if (updateError) throw updateError;

    // 2. Aceptar el gasto (reutiliza la lógica de handleAccept)
    await handleAccept(selectedGasto.value, selectedRendicionId.value);

  } catch (e) {
    modalError.value = `Error al actualizar y aceptar: ${e.message}`;
  } finally {
    modalLoading.value = false;
  }
}

async function handleReject(gasto) {
  const motivo = prompt("Por favor, ingresa un motivo para el rechazo (opcional):");
  if (motivo === null) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    // 1. Actualizar el gasto para devolverlo
    const { error: updateError } = await supabase
      .from('gastos')
      .update({ 
        estado_delegacion: 'rechazado',
        user_id: gasto.creado_por_id // Devolvemos el gasto al creador
      })
      .eq('id', gasto.id);
    if (updateError) throw updateError;

    // 2. Registrar en el historial
    await supabase.from('historial_delegaciones').insert({
      gasto_id: gasto.id,
      delegador_id: gasto.creado_por_id,
      receptor_id: user.id,
      decision: 'rechazado',
      motivo_rechazo: motivo || null
    });

    // 3. Notificar
    await supabase.from('notificaciones').insert({
      user_id: gasto.creado_por_id,
      mensaje: `Tu gasto delegado de ${formatCurrency(gasto.monto_total)} fue rechazado. ${motivo ? 'Motivo: ' + motivo : ''}`,
      link_a: `/gastos/editar/${gasto.id}`, tipo: 'rechazo'
    });

    await loadAllData();
  } catch (e) {
    alert(`Error al rechazar el gasto: ${e.message}`);
  }
}
</script>
<template>
  <div class="container mx-auto max-w-4xl px-4 py-8">
    <h1 class="text-3xl font-bold text-gray-800 mb-2">Gestión de Gastos Delegados</h1>
    <p class="text-gray-600 mb-8">Revisa los gastos pendientes o consulta tu historial de decisiones.</p>

    <!-- Pestañas de Navegación -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        <button @click="activeTab = 'pendientes'" :class="['tab-button', { 'tab-active': activeTab === 'pendientes' }]">
          Pendientes
          <span v-if="pendingExpenses.length > 0" class="tab-badge bg-blue-100 text-blue-600">{{ pendingExpenses.length }}</span>
        </button>
        <button @click="activeTab = 'historial'" :class="['tab-button', { 'tab-active': activeTab === 'historial' }]">
          Historial
        </button>
      </nav>
    </div>

    <div v-if="loading" class="text-center py-10">Cargando...</div>
    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
    
    <div v-else>
      <!-- Contenido Pestaña Pendientes -->
      <div v-if="activeTab === 'pendientes'">
        <div v-if="pendingExpenses.length === 0" class="empty-state">
          <p class="text-gray-700 font-semibold">¡Bandeja de entrada limpia!</p>
          <p class="text-gray-500 mt-1">No tienes gastos delegados pendientes de aceptar.</p>
        </div>
        <div v-else class="space-y-4">
          <DelegatedExpenseCard v-for="gasto in pendingExpenses" :key="gasto.id" :gasto="gasto" @accept="openAcceptModal" @reject="handleReject" @edit="openEditModal" />
        </div>
      </div>

      <!-- Contenido Pestaña Historial -->
      <div v-if="activeTab === 'historial'">
        <div class="flex justify-center gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
          <!-- CORRECCIÓN: Los valores de los botones deben ser singulares para coincidir con la DB -->
          <button @click="historyFilter = 'aceptado'" :class="['filter-button', { 'filter-active': historyFilter === 'aceptado' }]">Aceptados</button>
          <button @click="historyFilter = 'rechazado'" :class="['filter-button', { 'filter-active': historyFilter === 'rechazado' }]">Rechazados</button>
        </div>
        <div v-if="filteredHistory.length === 0" class="empty-state">
          <p class="text-gray-700 font-semibold">No hay registros</p>
          <p class="text-gray-500 mt-1">Tu historial de gastos {{ historyFilter === 'aceptado' ? 'aceptados' : 'rechazados' }} está vacío.</p>
        </div>
        <div v-else class="space-y-4">
           <div v-for="item in filteredHistory" :key="item.id" class="bg-white p-4 rounded-lg shadow-md border"
               :class="item.decision === 'aceptado' ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'">
              <p class="text-lg font-bold text-indigo-600">{{ formatCurrency(item.monto_gasto) }}</p>
              <p class="text-sm text-gray-800">{{ item.descripcion_gasto }}</p>
              <p class="text-sm text-gray-500 mt-2">
                De: <span class="font-semibold text-gray-700">{{ item.nombre_delegador }}</span>
              </p>
              <p class="text-xs text-gray-400 mt-1">
                Decisión tomada el: {{ formatDate(item.fecha_decision) }}
              </p>
              <p v-if="item.motivo_rechazo" class="text-xs text-red-600 bg-red-50 p-2 mt-2 rounded">
                Motivo del rechazo: {{ item.motivo_rechazo }}
              </p>
           </div>
        </div>
      </div>
    </div>

    <!-- Modal para Aceptar -->
    <div v-if="showAcceptModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Aceptar y Asociar Gasto</h3>
        <p class="mt-1 text-sm text-gray-600">
          Vas a añadir el gasto de <span class="font-bold">{{ formatCurrency(selectedGasto.monto_total) }}</span> a una de tus rendiciones.
        </p>
        <div class="mt-4">
          <label for="rendicion_id_accept" class="form-label">Selecciona la rendición de destino <span class="text-red-500">*</span></label>
          <select id="rendicion_id_accept" v-model="selectedRendicionId" class="form-input mt-1">
            <option :value="null" disabled>-- Tus rendiciones activas --</option>
            <option v-for="r in rendicionesActivas" :key="r.id" :value="r.id">{{ r.nombre_viaje }}</option>
          </select>
          <p v-if="rendicionesActivas.length === 0" class="text-xs text-red-500 mt-1">
            No tienes rendiciones activas. Debes crear una nueva para poder aceptar este gasto.
          </p>
        </div>
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions">
          <button @click="closeModal" :disabled="modalLoading" class="btn-secondary">Cancelar</button>
          <button @click="handleAccept(selectedGasto, selectedRendicionId)" :disabled="!selectedRendicionId || modalLoading" class="btn-success">
            {{ modalLoading ? 'Procesando...' : 'Confirmar y Asociar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal para Editar y Aceptar -->
    <div v-if="showEditModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Editar y Aceptar Gasto</h3>
        <div class="space-y-4 mt-4">
          <div>
            <label class="form-label">Monto</label>
            <input type="number" v-model.number="editableGasto.monto_total" class="form-input mt-1" />
          </div>
          <div>
            <label class="form-label">Descripción</label>
            <input type="text" v-model="editableGasto.descripcion_general" class="form-input mt-1" />
          </div>
          <div>
            <label class="form-label">Tipo de Gasto</label>
            <select v-model="editableGasto.tipo_gasto_id" class="form-input mt-1">
              <option v-for="t in tiposDeGasto" :key="t.id" :value="t.id">{{ t.nombre_tipo_gasto }}</option>
            </select>
          </div>
          <div class="border-t pt-4">
            <label class="form-label">Asociar a Rendición <span class="text-red-500">*</span></label>
            <select v-model="selectedRendicionId" class="form-input mt-1">
              <option :value="null" disabled>-- Tus rendiciones activas --</option>
              <option v-for="r in rendicionesActivas" :key="r.id" :value="r.id">{{ r.nombre_viaje }}</option>
            </select>
          </div>
        </div>
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions">
          <button @click="closeModal" :disabled="modalLoading" class="btn-secondary">Cancelar</button>
          <button @click="handleUpdateAndAccept" :disabled="!selectedRendicionId || modalLoading" class="btn-success">
            {{ modalLoading ? 'Procesando...' : 'Guardar Cambios y Aceptar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
/* ... (los estilos que ya tenías, más los nuevos para tabs y filtros) ... */
.form-label { @apply block text-sm font-medium leading-6 text-gray-900; }
.form-input { @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6; }
.btn-success { @apply rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50; }
.btn-danger { @apply rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.modal-backdrop { @apply fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center p-4; }
.modal-container { @apply relative p-6 bg-white rounded-lg shadow-xl max-w-md mx-auto w-full; }
.modal-title { @apply text-xl font-semibold leading-6 text-gray-900; }
.modal-error { @apply mt-4 bg-red-100 p-3 rounded-md text-sm text-red-700; }
.modal-actions { @apply mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3; }
.empty-state { @apply bg-white p-10 rounded-xl shadow-sm text-center border; }
.tab-button { @apply whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700; }
.tab-active { @apply border-indigo-500 text-indigo-600; }
.tab-badge { @apply ml-2 py-0.5 px-2 rounded-full text-xs font-medium; }
.filter-button { @apply w-full px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-200 transition-colors; }
.filter-active { @apply bg-white text-gray-900 shadow-sm; }
</style>