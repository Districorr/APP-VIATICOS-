<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import DelegatedExpenseCard from '../components/DelegatedExpenseCard.vue';

// --- ESTADO PRINCIPAL ---
const activeTab = ref('pendientes');
const historyFilter = ref('aceptado');
const pendingExpenses = ref([]);
const historyExpenses = ref([]);
const loading = ref(true);
const errorMessage = ref('');

// --- ESTADO DEL MODAL ---
const showAcceptModal = ref(false);
const showEditModal = ref(false);
const selectedGasto = ref(null);
const editableGasto = ref({});
const modalLoading = ref(false);
const modalError = ref('');

// --- MODIFICACIÓN: Estados para selección de destino ---
const rendicionesActivas = ref([]);
const cajasChicasDisponibles = ref([]); // NUEVO: Para guardar las cajas del usuario
const tiposDeGasto = ref([]);
const selectedRendicionId = ref(null);
const selectedCajaChicaId = ref(null); // NUEVO: Para el ID de la caja seleccionada
const destinoAceptacion = ref('rendicion'); // NUEVO: 'rendicion' o 'caja_chica'

// --- LÓGICA DE DATOS ---
const filteredHistory = computed(() => {
  if (!historyExpenses.value) return [];
  return historyExpenses.value.filter(h => 
    String(h.decision || '').trim().toLowerCase() === String(historyFilter.value || '').trim().toLowerCase()
  );
});

async function fetchPendingExpenses() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado.');
    
    const { data, error } = await supabase
      .rpc('obtener_gastos_recibidos', { p_user_id: user.id })
      .select(`*, creador:creado_por_id (nombre_completo, email), tipo:tipo_gasto_id (nombre_tipo_gasto)`);
      
    if (error) throw error;
    
    pendingExpenses.value = (data || []).filter(gasto => 
      gasto.estado_delegacion === 'pendiente_aceptacion'
    );
  } catch (e) {
    errorMessage.value = `Error al cargar pendientes: ${e.message}`;
  }
}

async function fetchHistory() {
  try {
    const { data, error } = await supabase.rpc('obtener_mi_historial_delegaciones');
    if (error) throw error;
    historyExpenses.value = data || [];
  } catch (e) {
    errorMessage.value = `Error al cargar el historial: ${e.message}`;
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

// MODIFICACIÓN: Ahora también carga las Cajas Chicas
async function fetchDropdownData() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [rendicionesRes, tiposRes, cajasRes] = await Promise.all([
      supabase.from('viajes').select('id, nombre_viaje').eq('user_id', user.id).is('cerrado_en', null),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true),
      supabase.from('cajas_chicas').select('id, nombre, saldo_actual').eq('responsable_id', user.id).eq('activo', true) // NUEVO
    ]);
    if (rendicionesRes.error) throw rendicionesRes.error;
    rendicionesActivas.value = rendicionesRes.data || [];
    if (tiposRes.error) throw tiposRes.error;
    tiposDeGasto.value = tiposRes.data || [];
    if (cajasRes.error) throw cajasRes.error;
    cajasChicasDisponibles.value = cajasRes.data || []; // NUEVO
  } catch (e) {
    console.error("Error cargando datos para modales:", e);
  }
}

// --- LÓGICA DE MODALES Y ACCIONES ---
function openAcceptModal(gasto) {
  selectedGasto.value = gasto;
  selectedRendicionId.value = null;
  selectedCajaChicaId.value = null; // NUEVO: Resetear
  destinoAceptacion.value = 'rendicion'; // NUEVO: Resetear
  modalError.value = '';
  showAcceptModal.value = true;
}

function openEditModal(gasto) {
  selectedGasto.value = gasto;
  editableGasto.value = { ...gasto };
  selectedRendicionId.value = null;
  selectedCajaChicaId.value = null; // NUEVO: Resetear
  destinoAceptacion.value = 'rendicion'; // NUEVO: Resetear
  modalError.value = '';
  showEditModal.value = true;
}

function closeModal() {
  showAcceptModal.value = false;
  showEditModal.value = false;
  selectedGasto.value = null;
  modalLoading.value = false;
}

// --- MODIFICACIÓN: Lógica de aceptación refactorizada ---
async function handleAccept() {
  modalLoading.value = true;
  modalError.value = '';
  try {
    if (destinoAceptacion.value === 'rendicion') {
      if (!selectedRendicionId.value) throw new Error("Debes seleccionar una rendición de destino.");
      await handleAcceptToRendicion(selectedGasto.value, selectedRendicionId.value);
    } else if (destinoAceptacion.value === 'caja_chica') {
      if (!selectedCajaChicaId.value) throw new Error("Debes seleccionar una caja chica de destino.");
      await handleAcceptToCajaChica(selectedGasto.value, selectedCajaChicaId.value);
    } else {
      throw new Error("Destino de aceptación no válido.");
    }
    closeModal();
    await loadAllData();
  } catch (e) {
    modalError.value = `Error al aceptar el gasto: ${e.message}`;
  } finally {
    modalLoading.value = false;
  }
}

// NUEVO: Lógica específica para aceptar en una rendición
async function handleAcceptToRendicion(gasto, rendicionId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error: updateError } = await supabase
    .from('gastos')
    .update({ viaje_id: rendicionId, caja_id: null, estado_delegacion: 'aceptado' })
    .eq('id', gasto.id)
    .select()
    .single();
  if (updateError) throw updateError;
  await registrarDecisionEnHistorial(gasto.id, gasto.creado_por_id, user.id);
  await notificarDelegador(gasto.creado_por_id, gasto.monto_total, gasto.id);
}

// NUEVO: Lógica específica para aceptar en una caja chica
async function handleAcceptToCajaChica(gasto, cajaId) {
  const { data: { user } } = await supabase.auth.getUser();
  
  // 1. Actualizar el gasto para asociarlo a la caja
  const { data: gastoActualizado, error: updateError } = await supabase
    .from('gastos')
    .update({ caja_id: cajaId, viaje_id: null, estado_delegacion: 'aceptado' })
    .eq('id', gasto.id)
    .select()
    .single();
  if (updateError) throw updateError;

  // 2. Registrar el movimiento en la caja chica llamando a la RPC
  const { error: rpcError } = await supabase
    .rpc('registrar_gasto_caja_chica', { p_gasto_id: gastoActualizado.id, p_caja_id: cajaId });
  if (rpcError) {
    // Si la RPC falla, es importante intentar revertir el estado del gasto para no dejar datos inconsistentes.
    await supabase.from('gastos').update({ estado_delegacion: 'pendiente_aceptacion', caja_id: null }).eq('id', gasto.id);
    throw new Error(`No se pudo registrar el gasto en la caja chica: ${rpcError.message}. El gasto ha sido devuelto a pendientes.`);
  }

  await registrarDecisionEnHistorial(gasto.id, gasto.creado_por_id, user.id);
  await notificarDelegador(gasto.creado_por_id, gasto.monto_total, gasto.id);
}

// NUEVO: Funciones de ayuda reutilizables
async function registrarDecisionEnHistorial(gastoId, delegadorId, receptorId) {
  return supabase.from('historial_delegaciones').insert({
    gasto_id: gastoId,
    delegador_id: delegadorId,
    receptor_id: receptorId,
    decision: 'aceptado'
  });
}

async function notificarDelegador(delegadorId, monto, gastoId) {
  return supabase.from('notificaciones').insert({
    user_id: delegadorId,
    mensaje: `Tu gasto delegado de ${formatCurrency(monto)} fue aceptado.`,
    link_a: `/gastos/editar/${gastoId}`, // Esto puede necesitar ajuste si la ruta de edición de un gasto aceptado es diferente
    tipo: 'aprobacion'
  });
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

    // Después de actualizar, llamamos al handleAccept general que decidirá el destino
    await handleAccept();

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
    
    const { error: updateError } = await supabase
      .from('gastos')
      .update({ 
        estado_delegacion: 'rechazado',
        user_id: gasto.creado_por_id
      })
      .eq('id', gasto.id);
    if (updateError) throw updateError;

    await supabase.from('historial_delegaciones').insert({
      gasto_id: gasto.id,
      delegador_id: gasto.creado_por_id,
      receptor_id: user.id,
      decision: 'rechazado',
      motivo_rechazo: motivo || null
    });

    await supabase.from('notificaciones').insert({
      user_id: gasto.creado_por_id,
      mensaje: `Tu gasto delegado de ${formatCurrency(gasto.monto_total)} fue rechazado. ${motivo ? 'Motivo: ' + motivo : ''}`,
      link_a: `/gastos/editar/${gasto.id}`,
      tipo: 'rechazo'
    });

    await loadAllData();
  } catch (e) {
    alert(`Error al rechazar el gasto: ${e.message}`);
  }
}
</script>
--- START OF FILE src/views/GastosDelegadosView.vue (template ONLY) ---
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

    <!-- MODIFICACIÓN: Modal para Aceptar ahora incluye la selección de destino -->
    <div v-if="showAcceptModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Aceptar y Asociar Gasto</h3>
        <p class="mt-1 text-sm text-gray-600">
          Vas a añadir el gasto de <span class="font-bold">{{ formatCurrency(selectedGasto.monto_total) }}</span> a tu nombre.
        </p>

        <!-- Selección de Destino -->
        <fieldset class="mt-4">
          <legend class="form-label mb-2">Selecciona el destino del gasto:</legend>
          <div class="space-y-3">
            <div class="flex items-center">
              <input id="destino-rendicion" name="destino" type="radio" value="rendicion" v-model="destinoAceptacion" class="radio-input">
              <label for="destino-rendicion" class="ml-3 block text-sm font-medium text-gray-700">Asociar a una Rendición (Viaje)</label>
            </div>
            <div class="flex items-center" v-if="cajasChicasDisponibles.length > 0">
              <input id="destino-caja" name="destino" type="radio" value="caja_chica" v-model="destinoAceptacion" class="radio-input">
              <label for="destino-caja" class="ml-3 block text-sm font-medium text-gray-700">Imputar a mi Caja Chica</label>
            </div>
          </div>
        </fieldset>

        <!-- Selector Condicional de Rendición -->
        <div v-if="destinoAceptacion === 'rendicion'" class="mt-4">
          <label for="rendicion_id_accept" class="form-label">Rendición de destino <span class="text-red-500">*</span></label>
          <select id="rendicion_id_accept" v-model="selectedRendicionId" class="form-input mt-1">
            <option :value="null" disabled>-- Tus rendiciones activas --</option>
            <option v-for="r in rendicionesActivas" :key="r.id" :value="r.id">{{ r.nombre_viaje }}</option>
          </select>
          <p v-if="rendicionesActivas.length === 0" class="text-xs text-red-500 mt-1">
            No tienes rendiciones activas. Debes crear una nueva para poder aceptar este gasto.
          </p>
        </div>

        <!-- Selector Condicional de Caja Chica -->
        <div v-if="destinoAceptacion === 'caja_chica'" class="mt-4">
          <label for="caja_id_accept" class="form-label">Caja Chica de destino <span class="text-red-500">*</span></label>
          <select id="caja_id_accept" v-model="selectedCajaChicaId" class="form-input mt-1">
            <option :value="null" disabled>-- Tus Cajas Chicas --</option>
            <option v-for="caja in cajasChicasDisponibles" :key="caja.id" :value="caja.id">
              {{ caja.nombre }} (Saldo: {{ formatCurrency(caja.saldo_actual) }})
            </option>
          </select>
        </div>
        
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions">
          <button @click="closeModal" :disabled="modalLoading" class="btn-secondary">Cancelar</button>
          <button @click="handleAccept" :disabled="modalLoading || (destinoAceptacion === 'rendicion' && !selectedRendicionId) || (destinoAceptacion === 'caja_chica' && !selectedCajaChicaId)" class="btn-success">
            {{ modalLoading ? 'Procesando...' : 'Confirmar y Asociar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal para Editar y Aceptar (Mantiene la misma lógica de destino) -->
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
              <div class="flex items-center">
                <input id="edit-destino-rendicion" name="edit-destino" type="radio" value="rendicion" v-model="destinoAceptacion" class="radio-input">
                <label for="edit-destino-rendicion" class="ml-3 block text-sm font-medium text-gray-700">Rendición (Viaje)</label>
              </div>
              <select v-if="destinoAceptacion === 'rendicion'" v-model="selectedRendicionId" class="form-input mt-1"><option :value="null" disabled>-- Selecciona rendición --</option><option v-for="r in rendicionesActivas" :key="r.id" :value="r.id">{{ r.nombre_viaje }}</option></select>
              <div class="flex items-center" v-if="cajasChicasDisponibles.length > 0">
                <input id="edit-destino-caja" name="edit-destino" type="radio" value="caja_chica" v-model="destinoAceptacion" class="radio-input">
                <label for="edit-destino-caja" class="ml-3 block text-sm font-medium text-gray-700">Caja Chica</label>
              </div>
              <select v-if="destinoAceptacion === 'caja_chica'" v-model="selectedCajaChicaId" class="form-input mt-1"><option :value="null" disabled>-- Selecciona tu caja --</option><option v-for="caja in cajasChicasDisponibles" :key="caja.id" :value="caja.id">{{ caja.nombre }} (Saldo: {{ formatCurrency(caja.saldo_actual) }})</option></select>
            </div>
          </fieldset>
        </div>
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions">
          <button @click="closeModal" :disabled="modalLoading" class="btn-secondary">Cancelar</button>
          <button @click="handleUpdateAndAccept" :disabled="modalLoading || (destinoAceptacion === 'rendicion' && !selectedRendicionId) || (destinoAceptacion === 'caja_chica' && !selectedCajaChicaId)" class="btn-success">
            {{ modalLoading ? 'Procesando...' : 'Guardar y Aceptar' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
<style scoped>
/* Estilos existentes */
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
.radio-input { @apply h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600; }
</style>