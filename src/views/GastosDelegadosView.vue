<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import DelegatedExpenseCard from '../components/DelegatedExpenseCard.vue';
import { useRouter } from 'vue-router';

// --- ESTADO PRINCIPAL ---
const router = useRouter();
const mainTab = ref('recibidos'); // Pestaña principal
const loading = ref(true);
const errorMessage = ref('');

// --- ESTADO PARA "RECIBIDOS" ---
const receivedPendingExpenses = ref([]);
const receivedHistoryExpenses = ref([]);
const receivedHistoryFilter = ref('aceptado');
const receivedActiveSubTab = ref('pendientes'); // Sub-pestaña para Recibidos

// --- ESTADO PARA "ENVIADOS" ---
const sentPendingExpenses = ref([]);
const sentHistoryExpenses = ref([]);
const sentHistoryFilter = ref('aceptado');
const sentActiveSubTab = ref('pendientes'); // Sub-pestaña para Enviados

// --- ESTADO DEL MODAL ---
const showAcceptModal = ref(false);
const showEditModal = ref(false);
const selectedGasto = ref(null);
const editableGasto = ref({});
const modalLoading = ref(false);
const modalError = ref('');
const rendicionesActivas = ref([]);
const cajasChicasDisponibles = ref([]);
const tiposDeGasto = ref([]);
const selectedRendicionId = ref(null);
const selectedCajaChicaId = ref(null);
const destinoAceptacion = ref('rendicion');

// --- FUNCIONES DE CARGA ---
async function fetchReceivedPending() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data, error } = await supabase
    .from('gastos')
    .select(`*, creador:creado_por_id (nombre_completo, email), tipo:tipo_gasto_id (nombre_tipo_gasto)`)
    .eq('user_id', user.id)
    .eq('estado_delegacion', 'pendiente_aceptacion');
  if (error) throw error;
  receivedPendingExpenses.value = data || [];
}

async function fetchReceivedHistory() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data, error } = await supabase
    .from('historial_delegaciones')
    .select(`id, decision, motivo_rechazo, fecha_decision, gasto:gasto_id (monto_total, descripcion_general), delegador:delegador_id (nombre_completo)`)
    .eq('receptor_id', user.id)
    .neq('decision', 'pendiente');
  if (error) throw error;
  receivedHistoryExpenses.value = data || [];
}

async function fetchSentPending() {
  const { data, error } = await supabase.rpc('get_mis_delegaciones_enviadas_pendientes');
  if (error) throw error;
  sentPendingExpenses.value = data || [];
}

async function fetchSentHistory() {
  const { data, error } = await supabase.rpc('get_mi_historial_delegaciones_enviadas');
  if (error) throw error;
  sentHistoryExpenses.value = data || [];
}

async function loadAllData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    await Promise.all([
      fetchReceivedPending(),
      fetchReceivedHistory(),
      fetchSentPending(),
      fetchSentHistory()
    ]);
  } catch (e) {
    errorMessage.value = `Error al cargar datos: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(loadAllData);

// --- PROPIEDADES COMPUTADAS ---
const filteredReceivedHistory = computed(() => receivedHistoryExpenses.value.filter(h => h.decision === receivedHistoryFilter.value));
const filteredSentHistory = computed(() => sentHistoryExpenses.value.filter(h => h.decision === sentHistoryFilter.value));

// --- LÓGICA DE MODALES ---
async function fetchModalDropdowns() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [rendicionesRes, cajasRes, tiposRes] = await Promise.all([
      supabase.from('viajes').select('id, nombre_viaje').eq('user_id', user.id).is('cerrado_en', null),
      supabase.from('cajas_chicas').select('id, nombre, saldo_actual').eq('responsable_id', user.id).eq('activo', true),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true)
    ]);
    if (rendicionesRes.error) throw rendicionesRes.error;
    rendicionesActivas.value = rendicionesRes.data || [];
    if (cajasRes.error) throw cajasRes.error;
    cajasChicasDisponibles.value = cajasRes.data || [];
    if (tiposRes.error) throw tiposRes.error;
    tiposDeGasto.value = tiposRes.data || [];
  } catch (e) {
    console.error("Error cargando datos para modales:", e);
  }
}

function openAcceptModal(gasto) {
  selectedGasto.value = gasto;
  selectedRendicionId.value = null;
  selectedCajaChicaId.value = null;
  destinoAceptacion.value = 'rendicion';
  modalError.value = '';
  fetchModalDropdowns();
  showAcceptModal.value = true;
}

function openEditModal(gasto) {
  selectedGasto.value = gasto;
  editableGasto.value = { ...gasto };
  selectedRendicionId.value = null;
  selectedCajaChicaId.value = null;
  destinoAceptacion.value = 'rendicion';
  modalError.value = '';
  fetchModalDropdowns();
  showEditModal.value = true;
}

function closeModal() {
  showAcceptModal.value = false;
  showEditModal.value = false;
  selectedGasto.value = null;
  modalLoading.value = false;
}

async function handleAccept() {
  modalLoading.value = true;
  modalError.value = '';
  try {
    const p_viaje_id = destinoAceptacion.value === 'rendicion' ? selectedRendicionId.value : null;
    const p_caja_id = destinoAceptacion.value === 'caja_chica' ? selectedCajaChicaId.value : null;
    if (!p_viaje_id && !p_caja_id) throw new Error("Debes seleccionar un destino.");

    const { error } = await supabase.rpc('aceptar_gasto_delegado', { p_gasto_id: selectedGasto.value.id, p_viaje_id, p_caja_id });
    if (error) throw error;

    await notificarDelegador(selectedGasto.value.creado_por_id, selectedGasto.value.monto_total, 'aceptado');
    closeModal();
    await loadAllData();
    alert('Gasto aceptado y asociado correctamente.');

    if (p_viaje_id) router.push({ name: 'ViajesList' });
    else router.push({ name: 'CajaDiaria' });
    
    return true;
  } catch (e) {
    modalError.value = `Error al aceptar el gasto: ${e.message}`;
    return false;
  } finally {
    modalLoading.value = false;
  }
}

async function handleUpdateAndAccept() {
  modalLoading.value = true;
  modalError.value = '';
  try {
    const { error: updateError } = await supabase
      .from('gastos')
      .update({
        descripcion_general: editableGasto.value.descripcion_general,
        tipo_gasto_id: editableGasto.value.tipo_gasto_id,
        monto_total: editableGasto.value.monto_total
      })
      .eq('id', selectedGasto.value.id);
    if (updateError) throw updateError;
    
    const aceptadoConExito = await handleAccept();
    if (!aceptadoConExito) return;

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
    const { error } = await supabase.rpc('rechazar_gasto_delegado', { p_gasto_id: gasto.id, p_motivo_rechazo: motivo || null });
    if (error) throw error;
    await notificarDelegador(gasto.creado_por_id, gasto.monto_total, 'rechazado', motivo);
    await loadAllData();
    alert('Gasto rechazado correctamente.');
  } catch (e) {
    alert(`Error al rechazar el gasto: ${e.message}`);
  }
}

async function notificarDelegador(delegadorId, monto, decision, motivo = '') {
  let mensaje = decision === 'aceptado'
    ? `Tu gasto delegado de ${formatCurrency(monto)} fue aceptado.`
    : `Tu gasto delegado de ${formatCurrency(monto)} fue rechazado. ${motivo ? 'Motivo: ' + motivo : ''}`;
  return supabase.from('notificaciones').insert({ user_id: delegadorId, mensaje, tipo: decision === 'aceptado' ? 'aprobacion' : 'rechazo' });
}
</script>

<template>
  <div class="container mx-auto max-w-4xl px-4 py-8">
    <h1 class="text-3xl font-bold text-gray-800 mb-2">Gestión de Gastos Delegados</h1>
    <p class="text-gray-600 mb-8">Revisa los gastos que te enviaron o consulta el estado de los que enviaste.</p>

    <!-- PESTAÑAS PRINCIPALES -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        <button @click="mainTab = 'recibidos'" :class="['main-tab-button', { 'main-tab-active': mainTab === 'recibidos' }]">
          Recibidos
          <span v-if="receivedPendingExpenses.length > 0" class="tab-badge bg-blue-100 text-blue-600">{{ receivedPendingExpenses.length }}</span>
        </button>
        <button @click="mainTab = 'enviados'" :class="['main-tab-button', { 'main-tab-active': mainTab === 'enviados' }]">
          Enviados
          <span v-if="sentPendingExpenses.length > 0" class="tab-badge bg-gray-100 text-gray-600">{{ sentPendingExpenses.length }}</span>
        </button>
      </nav>
    </div>

    <div v-if="loading" class="text-center py-10">Cargando...</div>
    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
    
    <div v-else>
      <!-- VISTA PARA GASTOS RECIBIDOS -->
      <div v-show="mainTab === 'recibidos'">
        <div class="border-b border-gray-200 mb-6">
          <nav class="-mb-px flex space-x-8">
            <button @click="receivedActiveSubTab = 'pendientes'" :class="['tab-button', { 'tab-active': receivedActiveSubTab === 'pendientes' }]">Pendientes</button>
            <button @click="receivedActiveSubTab = 'historial'" :class="['tab-button', { 'tab-active': receivedActiveSubTab === 'historial' }]">Historial</button>
          </nav>
        </div>
        
        <div v-show="receivedActiveSubTab === 'pendientes'">
          <div v-if="receivedPendingExpenses.length === 0" class="empty-state"><p class="text-gray-700 font-semibold">¡Bandeja de entrada limpia!</p><p class="text-gray-500 mt-1">No tienes gastos delegados pendientes de aceptar.</p></div>
          <div v-else class="space-y-4">
            <DelegatedExpenseCard v-for="gasto in receivedPendingExpenses" :key="gasto.id" :gasto="gasto" mode="recibido" @accept="openAcceptModal" @reject="handleReject" @edit="openEditModal" />
          </div>
        </div>
        <div v-show="receivedActiveSubTab === 'historial'">
          <div class="flex justify-center gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
            <button @click="receivedHistoryFilter = 'aceptado'" :class="['filter-button', { 'filter-active': receivedHistoryFilter === 'aceptado' }]">Aceptados</button>
            <button @click="receivedHistoryFilter = 'rechazado'" :class="['filter-button', { 'filter-active': receivedHistoryFilter === 'rechazado' }]">Rechazados</button>
          </div>
          <div v-if="filteredReceivedHistory.length === 0" class="empty-state"><p class="text-gray-700 font-semibold">No hay registros</p><p class="text-gray-500 mt-1">Tu historial de gastos {{ receivedHistoryFilter }} está vacío.</p></div>
          <div v-else class="space-y-4">
            <div v-for="item in filteredReceivedHistory" :key="item.id" class="history-card" :class="item.decision === 'aceptado' ? 'border-green-500' : 'border-red-500'">
              <p class="history-amount">{{ formatCurrency(item.gasto.monto_total) }}</p>
              <p class="history-description">{{ item.gasto.descripcion_general }}</p>
              <p class="history-meta">De: <span class="font-semibold">{{ item.delegador.nombre_completo }}</span></p>
              <p class="history-date">Decisión tomada el: {{ formatDate(item.fecha_decision) }}</p>
              <p v-if="item.motivo_rechazo" class="history-rejection-reason">Motivo: {{ item.motivo_rechazo }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- VISTA PARA GASTOS ENVIADOS -->
      <div v-show="mainTab === 'enviados'">
        <div class="border-b border-gray-200 mb-6">
          <nav class="-mb-px flex space-x-8">
            <button @click="sentActiveSubTab = 'pendientes'" :class="['tab-button', { 'tab-active': sentActiveSubTab === 'pendientes' }]">Pendientes</button>
            <button @click="sentActiveSubTab = 'historial'" :class="['tab-button', { 'tab-active': sentActiveSubTab === 'historial' }]">Historial</button>
          </nav>
        </div>

        <div v-show="sentActiveSubTab === 'pendientes'">
          <div v-if="sentPendingExpenses.length === 0" class="empty-state"><p class="text-gray-700 font-semibold">Todo al día</p><p class="text-gray-500 mt-1">No tienes gastos enviados pendientes de respuesta.</p></div>
          <div v-else class="space-y-4">
            <DelegatedExpenseCard v-for="gasto in sentPendingExpenses" :key="gasto.id" :gasto="gasto" mode="enviado" />
          </div>
        </div>
        <div v-show="sentActiveSubTab === 'historial'">
          <div class="flex justify-center gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
            <button @click="sentHistoryFilter = 'aceptado'" :class="['filter-button', { 'filter-active': sentHistoryFilter === 'aceptado' }]">Aceptados</button>
            <button @click="sentHistoryFilter = 'rechazado'" :class="['filter-button', { 'filter-active': sentHistoryFilter === 'rechazado' }]">Rechazados</button>
          </div>
          <div v-if="filteredSentHistory.length === 0" class="empty-state"><p class="text-gray-700 font-semibold">No hay registros</p><p class="text-gray-500 mt-1">Tu historial de gastos enviados {{ sentHistoryFilter }} está vacío.</p></div>
          <div v-else class="space-y-4">
            <div v-for="item in filteredSentHistory" :key="item.id" class="history-card" :class="item.decision === 'aceptado' ? 'border-green-500' : 'border-red-500'">
              <p class="history-amount">{{ formatCurrency(item.monto_gasto) }}</p>
              <p class="history-description">{{ item.descripcion_gasto }}</p>
              <p class="history-meta">Para: <span class="font-semibold">{{ item.nombre_receptor }}</span></p>
              <p class="history-date">Decisión tomada el: {{ formatDate(item.fecha_decision) }}</p>
              <p v-if="item.motivo_rechazo" class="history-rejection-reason">Motivo: {{ item.motivo_rechazo }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODALES -->
    <div v-if="showAcceptModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Aceptar y Asociar Gasto</h3>
        <p class="mt-1 text-sm text-gray-600">Vas a añadir el gasto de <span class="font-bold">{{ formatCurrency(selectedGasto.monto_total) }}</span> a tu nombre.</p>
        <fieldset class="mt-4">
          <legend class="form-label mb-2">Selecciona el destino del gasto:</legend>
          <div class="space-y-3">
            <div class="flex items-center"><input id="destino-rendicion" name="destino" type="radio" value="rendicion" v-model="destinoAceptacion" class="radio-input"><label for="destino-rendicion" class="ml-3 block text-sm font-medium text-gray-700">Asociar a una Rendición</label></div>
            <div class="flex items-center" v-if="cajasChicasDisponibles.length > 0"><input id="destino-caja" name="destino" type="radio" value="caja_chica" v-model="destinoAceptacion" class="radio-input"><label for="destino-caja" class="ml-3 block text-sm font-medium text-gray-700">Imputar a mi Caja Chica</label></div>
          </div>
        </fieldset>
        <div v-if="destinoAceptacion === 'rendicion'" class="mt-4">
          <label for="rendicion_id_accept" class="form-label">Rendición de destino <span class="text-red-500">*</span></label>
          <select id="rendicion_id_accept" v-model="selectedRendicionId" class="form-input mt-1"><option :value="null" disabled>-- Tus rendiciones activas --</option><option v-for="r in rendicionesActivas" :key="r.id" :value="r.id">{{ r.nombre_viaje }}</option></select>
          <p v-if="rendicionesActivas.length === 0" class="text-xs text-red-500 mt-1">No tienes rendiciones activas. Debes crear una nueva para poder aceptar este gasto.</p>
        </div>
        <div v-if="destinoAceptacion === 'caja_chica'" class="mt-4">
          <label for="caja_id_accept" class="form-label">Caja Chica de destino <span class="text-red-500">*</span></label>
          <select id="caja_id_accept" v-model="selectedCajaChicaId" class="form-input mt-1"><option :value="null" disabled>-- Tus Cajas Chicas --</option><option v-for="caja in cajasChicasDisponibles" :key="caja.id" :value="caja.id">{{ caja.nombre }} (Saldo: {{ formatCurrency(caja.saldo_actual) }})</option></select>
        </div>
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions"><button @click="closeModal" :disabled="modalLoading" class="btn-secondary">Cancelar</button><button @click="handleAccept" :disabled="modalLoading || (destinoAceptacion === 'rendicion' && !selectedRendicionId) || (destinoAceptacion === 'caja_chica' && !selectedCajaChicaId)" class="btn-success">{{ modalLoading ? 'Procesando...' : 'Confirmar y Asociar' }}</button></div>
      </div>
    </div>
    <div v-if="showEditModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Editar y Aceptar Gasto</h3>
        <div class="space-y-4 mt-4">
          <div><label class="form-label">Monto</label><input type="number" v-model.number="editableGasto.monto_total" class="form-input mt-1" /></div>
          <div><label class="form-label">Descripción</label><input type="text" v-model="editableGasto.descripcion_general" class="form-input mt-1" /></div>
          <div><label class="form-label">Tipo de Gasto</label><select v-model="editableGasto.tipo_gasto_id" class="form-input mt-1"><option v-for="t in tiposDeGasto" :key="t.id" :value="t.id">{{ t.nombre_tipo_gasto }}</option></select></div>
          <fieldset class="border-t pt-4">
            <legend class="form-label mb-2">Asociar a:</legend>
            <div class="space-y-3">
              <div class="flex items-center"><input id="edit-destino-rendicion" name="edit-destino" type="radio" value="rendicion" v-model="destinoAceptacion" class="radio-input"><label for="edit-destino-rendicion" class="ml-3 block text-sm font-medium text-gray-700">Rendición (Viaje)</label></div>
              <select v-if="destinoAceptacion === 'rendicion'" v-model="selectedRendicionId" class="form-input mt-1"><option :value="null" disabled>-- Selecciona rendición --</option><option v-for="r in rendicionesActivas" :key="r.id" :value="r.id">{{ r.nombre_viaje }}</option></select>
              <div class="flex items-center" v-if="cajasChicasDisponibles.length > 0"><input id="edit-destino-caja" name="edit-destino" type="radio" value="caja_chica" v-model="destinoAceptacion" class="radio-input"><label for="edit-destino-caja" class="ml-3 block text-sm font-medium text-gray-700">Caja Chica</label></div>
              <select v-if="destinoAceptacion === 'caja_chica'" v-model="selectedCajaChicaId" class="form-input mt-1"><option :value="null" disabled>-- Selecciona tu caja --</option><option v-for="caja in cajasChicasDisponibles" :key="caja.id" :value="caja.id">{{ caja.nombre }} (Saldo: {{ formatCurrency(caja.saldo_actual) }})</option></select>
            </div>
          </fieldset>
        </div>
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions"><button @click="closeModal" :disabled="modalLoading" class="btn-secondary">Cancelar</button><button @click="handleUpdateAndAccept" :disabled="modalLoading || (destinoAceptacion === 'rendicion' && !selectedRendicionId) || (destinoAceptacion === 'caja_chica' && !selectedCajaChicaId)" class="btn-success">{{ modalLoading ? 'Procesando...' : 'Guardar y Aceptar' }}</button></div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.form-label { @apply block text-sm font-medium leading-6 text-gray-900; }
.form-input { @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6; }
.btn-success { @apply rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.modal-backdrop { @apply fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center p-4; }
.modal-container { @apply relative p-6 bg-white rounded-lg shadow-xl max-w-md mx-auto w-full; }
.modal-title { @apply text-xl font-semibold leading-6 text-gray-900; }
.modal-error { @apply mt-4 bg-red-100 p-3 rounded-md text-sm text-red-700; }
.modal-actions { @apply mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3; }
.empty-state { @apply bg-white p-10 rounded-xl shadow-sm text-center border; }
.radio-input { @apply h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600; }

/* Pestañas Principales (sin cambios) */
.main-tab-button { @apply whitespace-nowrap border-b-2 py-4 px-1 text-base font-semibold border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700; }
.main-tab-active { @apply border-indigo-500 text-indigo-600; }

/* --- INICIO DE CAMBIOS --- */

/* Sub-Pestañas (Ahora más pequeñas) */
.tab-button { 
  @apply whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium border-transparent text-gray-500 hover:border-gray-400 hover:text-gray-700; /* Se redujo py-4 a py-2 */
}

/* Sub-Pestaña Activa (Ahora en un color más sutil) */
.tab-active { 
  @apply border-gray-500 text-gray-800; /* Se cambió de indigo a gray */
}

/* --- FIN DE CAMBIOS --- */

.tab-badge { @apply ml-2 py-0.5 px-2 rounded-full text-xs font-medium; }
.filter-button { @apply w-full px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-200 transition-colors; }
.filter-active { @apply bg-white text-gray-900 shadow-sm; }
.history-card, .sent-card { @apply bg-white p-4 rounded-lg shadow-md border border-l-4; }
.history-amount { @apply text-lg font-bold text-indigo-600; }
.history-description { @apply text-sm text-gray-800; }
.history-meta { @apply text-sm text-gray-500 mt-2; }
.history-date { @apply text-xs text-gray-400 mt-1; }
.history-rejection-reason { @apply text-xs text-red-600 bg-red-50 p-2 mt-2 rounded; }
</style>