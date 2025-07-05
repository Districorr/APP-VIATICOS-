<!-- src/views/GastosDelegadosView.vue -->
<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import { useRouter } from 'vue-router';

const router = useRouter();

// --- ESTADO PRINCIPAL ---
const solicitudes = ref([]);
const loading = ref(true);
const errorMessage = ref('');

// --- ESTADO DEL MODAL ---
const showModal = ref(false);
const selectedGasto = ref(null);
const modalLoading = ref(false);
const modalError = ref('');
const rendicionesActivas = ref([]);
const selectedRendicionId = ref(null);

// --- LÓGICA DE DATOS ---
async function fetchSolicitudesPendientes() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado.');

    // Buscamos gastos donde el usuario actual es el "dueño" (user_id),
    // pero fueron creados por otra persona y están pendientes.
    const { data, error } = await supabase
      .from('gastos')
      .select(`
        *,
        creador:creado_por_id (nombre_completo, email),
        tipo:tipo_gasto_id (nombre_tipo_gasto)
      `)
      .eq('user_id', user.id)
      .eq('estado_delegacion', 'pendiente_aceptacion')
      .not('creado_por_id', 'is', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    solicitudes.value = data;

  } catch (e) {
    errorMessage.value = `Error al cargar solicitudes: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

async function fetchRendicionesActivas() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('viajes')
      .select('id, nombre_viaje')
      .eq('user_id', user.id)
      .is('cerrado_en', null);
    if (error) throw error;
    rendicionesActivas.value = data || [];
  } catch (e) {
    console.error("Error cargando rendiciones activas:", e);
  }
}

onMounted(() => {
  fetchSolicitudesPendientes();
  fetchRendicionesActivas();
});

// --- LÓGICA DEL MODAL ---
function openAcceptModal(gasto) {
  selectedGasto.value = gasto;
  selectedRendicionId.value = null;
  modalError.value = '';
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  selectedGasto.value = null;
  modalLoading.value = false;
}

async function handleAccept() {
  if (!selectedRendicionId.value) {
    modalError.value = 'Debes seleccionar una rendición para asociar el gasto.';
    return;
  }
  modalLoading.value = true;
  modalError.value = '';
  try {
    // Actualizamos el gasto para asociarlo al viaje y cambiar su estado
    const { error: updateError } = await supabase
      .from('gastos')
      .update({
        viaje_id: selectedRendicionId.value,
        estado_delegacion: 'aceptado'
      })
      .eq('id', selectedGasto.value.id);
    if (updateError) throw updateError;

    // Notificamos al usuario original que su gasto fue aceptado
    const { error: notifError } = await supabase.from('notificaciones').insert({
      user_id: selectedGasto.value.creado_por_id,
      mensaje: `Tu gasto delegado de ${formatCurrency(selectedGasto.value.monto_total)} fue aceptado e incluido en una rendición.`,
      link_a: `/gastos/editar/${selectedGasto.value.id}`, // Link para que vea su gasto
      tipo: 'aprobacion'
    });
    if (notifError) console.warn("Fallo al notificar aceptación:", notifError);

    closeModal();
    await fetchSolicitudesPendientes(); // Recargamos la lista
  } catch (e) {
    modalError.value = `Error al aceptar el gasto: ${e.message}`;
  } finally {
    modalLoading.value = false;
  }
}

async function handleReject(gastoId, creadorId) {
  const motivo = prompt("Por favor, ingresa un motivo para el rechazo (opcional):");
  if (motivo === null) return; // El usuario canceló

  try {
    const { error: updateError } = await supabase
      .from('gastos')
      .update({ estado_delegacion: 'rechazado' })
      .eq('id', gastoId);
    if (updateError) throw updateError;

    const { error: notifError } = await supabase.from('notificaciones').insert({
      user_id: creadorId,
      mensaje: `Tu gasto delegado de ${formatCurrency(selectedGasto.value.monto_total)} fue rechazado. ${motivo ? 'Motivo: ' + motivo : ''}`,
      link_a: `/gastos/editar/${gastoId}`,
      tipo: 'rechazo'
    });
    if (notifError) console.warn("Fallo al notificar rechazo:", notifError);

    await fetchSolicitudesPendientes();
  } catch (e) {
    alert(`Error al rechazar el gasto: ${e.message}`);
  }
}
</script>

<template>
  <div class="container mx-auto max-w-4xl px-4 py-8">
    <h1 class="text-3xl font-bold text-gray-800 mb-6">Gastos Delegados Pendientes</h1>
    <p class="text-gray-600 mb-8">Aquí se listan los gastos que otros usuarios te han enviado para que incluyas en tus rendiciones.</p>

    <div v-if="loading" class="text-center py-10">Cargando solicitudes...</div>
    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
    
    <div v-else-if="solicitudes.length === 0" class="bg-white p-10 rounded-xl shadow-sm text-center border">
      <p class="text-gray-700 font-semibold">¡Bandeja de entrada limpia!</p>
      <p class="text-gray-500 mt-1">No tienes gastos delegados pendientes de aceptar.</p>
    </div>

    <div v-else class="space-y-4">
      <div v-for="gasto in solicitudes" :key="gasto.id" class="bg-white p-4 rounded-lg shadow-md border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex-grow">
          <p class="text-sm text-gray-500">
            De: <span class="font-semibold text-gray-700">{{ gasto.creador?.nombre_completo || 'Usuario desconocido' }}</span>
          </p>
          <p class="text-lg font-bold text-indigo-600">{{ formatCurrency(gasto.monto_total) }}</p>
          <p class="text-sm text-gray-800">{{ gasto.tipo?.nombre_tipo_gasto }}: {{ gasto.descripcion_general }}</p>
          <p class="text-xs text-gray-400 mt-1">Enviado el: {{ formatDate(gasto.created_at) }}</p>
        </div>
        <div class="flex-shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button @click="handleReject(gasto.id, gasto.creado_por_id)" class="btn-danger w-full sm:w-auto">Rechazar</button>
          <button @click="openAcceptModal(gasto)" class="btn-success w-full sm:w-auto">Aceptar</button>
        </div>
      </div>
    </div>

    <!-- Modal para Aceptar y Asociar -->
    <div v-if="showModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Aceptar y Asociar Gasto</h3>
        <p class="mt-1 text-sm text-gray-600">
          Vas a añadir el gasto de <span class="font-bold">{{ formatCurrency(selectedGasto.monto_total) }}</span> a una de tus rendiciones.
        </p>
        <div class="mt-4">
          <label for="rendicion_id" class="form-label">Selecciona la rendición de destino <span class="text-red-500">*</span></label>
          <select id="rendicion_id" v-model="selectedRendicionId" class="form-input mt-1">
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
          <button @click="handleAccept" :disabled="modalLoading || rendicionesActivas.length === 0" class="btn-success">
            {{ modalLoading ? 'Procesando...' : 'Confirmar y Asociar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium leading-6 text-gray-900; }
.form-input { @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6; }
.btn-success { @apply rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50; }
.btn-danger { @apply rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.modal-backdrop { @apply fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center; }
.modal-container { @apply relative p-6 bg-white rounded-lg shadow-xl max-w-md mx-auto w-full; }
.modal-title { @apply text-xl font-semibold leading-6 text-gray-900; }
.modal-error { @apply mt-4 bg-red-100 p-3 rounded-md text-sm text-red-700; }
.modal-actions { @apply mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3; }
</style>