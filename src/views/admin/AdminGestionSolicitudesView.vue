<!-- src/views/admin/AdminGestionSolicitudesView.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

// --- ESTADO PRINCIPAL ---
const solicitudes = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const filtroEstado = ref('pendiente'); // Por defecto, mostrar las pendientes

// --- ESTADO DE MODALES ---
const showApproveModal = ref(false);
const showRejectModal = ref(false);
const selectedRequest = ref(null);
const modalLoading = ref(false);
const modalError = ref('');

// --- DATOS PARA MODALES ---
const approveAmount = ref(null);
const rejectReason = ref('');

// --- LÓGICA DE DATOS ---
const fetchSolicitudes = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    let query = supabase.from('admin_solicitudes_view').select('*');
    if (filtroEstado.value) {
      query = query.eq('estado', filtroEstado.value);
    }
    const { data, error } = await query.order('fecha_solicitud', { ascending: false });
    if (error) throw error;
    solicitudes.value = data;
  } catch (e) {
    errorMessage.value = `Error al cargar solicitudes: ${e.message}`;
  } finally {
    loading.value = false;
  }
};

const filteredSolicitudes = computed(() => {
  if (!filtroEstado.value) return solicitudes.value;
  return solicitudes.value.filter(s => s.estado === filtroEstado.value);
});

onMounted(fetchSolicitudes);

// --- LÓGICA DE MODALES ---
const openApproveModal = (solicitud) => {
  selectedRequest.value = solicitud;
  approveAmount.value = null;
  modalError.value = '';
  showApproveModal.value = true;
};

const openRejectModal = (solicitud) => {
  selectedRequest.value = solicitud;
  rejectReason.value = '';
  modalError.value = '';
  showRejectModal.value = true;
};

const closeModals = () => {
  showApproveModal.value = false;
  showRejectModal.value = false;
  selectedRequest.value = null;
  modalLoading.value = false;
};

// --- LÓGICA DE ACCIONES ---
const confirmApproval = async () => {
  if (!approveAmount.value || approveAmount.value <= 0) {
    modalError.value = 'El monto de reposición debe ser un número positivo.';
    return;
  }
  modalLoading.value = true;
  modalError.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No se pudo obtener el usuario admin.');

    // 1. Ejecutar la reposición usando la RPC existente
    const { data: rpcData, error: rpcError } = await supabase.rpc('ajustar_saldo_caja_manual', {
      p_caja_id: selectedRequest.value.caja_id,
      p_monto_ajuste: approveAmount.value,
      p_descripcion: `Reposición aprobada para solicitud #${selectedRequest.value.id}`,
      p_realizado_por_id: user.id
    });
    if (rpcError) throw new Error(`Error en RPC: ${rpcError.message}`);
    if (!rpcData.success) throw new Error(rpcData.message);

    // 2. Actualizar el estado de la solicitud
    const { error: updateError } = await supabase
      .from('solicitudes_reposicion')
      .update({
        estado: 'aprobada',
        revisado_por_id: user.id,
        fecha_revision: new Date().toISOString(),
        comentarios_revision: `Aprobado con un monto de ${formatCurrency(approveAmount.value)}.`
      })
      .eq('id', selectedRequest.value.id);
    if (updateError) throw new Error(`Error al actualizar solicitud: ${updateError.message}`);

    // 3. Enviar notificación al usuario
    const { error: notifError } = await supabase
      .from('notificaciones')
      .insert({
        user_id: selectedRequest.value.solicitante_id,
        mensaje: `Tu solicitud de reposición para la caja "${selectedRequest.value.nombre_caja}" ha sido aprobada.`,
        link_a: '/caja',
        tipo: 'aprobacion'
      });
    if (notifError) console.error("Error al crear notificación, pero la operación principal fue exitosa:", notifError.message);

    await fetchSolicitudes();
    closeModals();
  } catch (e) {
    modalError.value = e.message;
  } finally {
    modalLoading.value = false;
  }
};

const confirmRejection = async () => {
  if (!rejectReason.value.trim()) {
    modalError.value = 'El motivo del rechazo es obligatorio.';
    return;
  }
  modalLoading.value = true;
  modalError.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No se pudo obtener el usuario admin.');

    // 1. Actualizar el estado de la solicitud
    const { error: updateError } = await supabase
      .from('solicitudes_reposicion')
      .update({
        estado: 'rechazada',
        revisado_por_id: user.id,
        fecha_revision: new Date().toISOString(),
        comentarios_revision: rejectReason.value
      })
      .eq('id', selectedRequest.value.id);
    if (updateError) throw new Error(`Error al actualizar solicitud: ${updateError.message}`);

    // 2. Enviar notificación al usuario
    const { error: notifError } = await supabase
      .from('notificaciones')
      .insert({
        user_id: selectedRequest.value.solicitante_id,
        mensaje: `Tu solicitud de reposición para la caja "${selectedRequest.value.nombre_caja}" fue rechazada. Motivo: ${rejectReason.value}`,
        link_a: '/caja',
        tipo: 'rechazo'
      });
    if (notifError) console.error("Error al crear notificación, pero la operación principal fue exitosa:", notifError.message);

    await fetchSolicitudes();
    closeModals();
  } catch (e) {
    modalError.value = e.message;
  } finally {
    modalLoading.value = false;
  }
};
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-4">Gestión de Solicitudes</h1>
    
    <div class="mb-6 border-b border-gray-200">
      <nav class="-mb-px flex space-x-6" aria-label="Tabs">
        <button @click="filtroEstado = 'pendiente'" :class="['tab-button', { 'tab-button-active': filtroEstado === 'pendiente' }]">Pendientes</button>
        <button @click="filtroEstado = 'aprobada'" :class="['tab-button', { 'tab-button-active': filtroEstado === 'aprobada' }]">Aprobadas</button>
        <button @click="filtroEstado = 'rechazada'" :class="['tab-button', { 'tab-button-active': filtroEstado === 'rechazada' }]">Rechazadas</button>
      </nav>
    </div>

    <div v-if="loading" class="text-center py-12">Cargando solicitudes...</div>
    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
    
    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="table-header">Fecha Solicitud</th>
              <th class="table-header">Solicitante</th>
              <th class="table-header">Caja</th>
              <th class="table-header">Estado</th>
              <th class="table-header">Revisión</th>
              <th class="table-header text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="filteredSolicitudes.length === 0">
              <td colspan="6" class="p-6 text-center text-gray-500">No hay solicitudes en este estado.</td>
            </tr>
            <tr v-for="solicitud in filteredSolicitudes" :key="solicitud.id">
              <td class="table-cell">{{ formatDate(solicitud.fecha_solicitud) }}</td>
              <td class="table-cell font-medium">{{ solicitud.nombre_solicitante }}</td>
              <td class="table-cell">{{ solicitud.nombre_caja }}</td>
              <td class="table-cell">
                <span class="status-badge" :class="{
                  'bg-yellow-100 text-yellow-800': solicitud.estado === 'pendiente',
                  'bg-green-100 text-green-800': solicitud.estado === 'aprobada',
                  'bg-red-100 text-red-800': solicitud.estado === 'rechazada',
                }">{{ solicitud.estado }}</span>
              </td>
              <td class="table-cell text-xs text-gray-500">
                <div v-if="solicitud.fecha_revision">
                  <p>{{ formatDate(solicitud.fecha_revision) }}</p>
                  <p>por {{ solicitud.nombre_revisor }}</p>
                  <p class="italic mt-1">"{{ solicitud.comentarios_revision }}"</p>
                </div>
                <span v-else>-</span>
              </td>
              <td class="table-cell text-right">
                <div v-if="solicitud.estado === 'pendiente'" class="flex justify-end gap-2">
                  <button @click="openApproveModal(solicitud)" class="btn-success text-xs">Aprobar</button>
                  <button @click="openRejectModal(solicitud)" class="btn-danger text-xs">Rechazar</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal de Aprobación -->
    <div v-if="showApproveModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Aprobar Reposición</h3>
        <p class="mt-1 text-sm text-gray-600">Para: <span class="font-bold">{{ selectedRequest?.nombre_caja }}</span></p>
        <div class="mt-4">
          <label for="approve_amount" class="form-label">Monto a Reponer <span class="text-red-500">*</span></label>
          <input type="number" id="approve_amount" v-model.number="approveAmount" class="form-input mt-1" placeholder="Ej: 150000">
        </div>
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions">
          <button @click="closeModals" :disabled="modalLoading" class="btn-secondary">Cancelar</button>
          <button @click="confirmApproval" :disabled="modalLoading" class="btn-success">
            {{ modalLoading ? 'Procesando...' : 'Confirmar Aprobación' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Rechazo -->
    <div v-if="showRejectModal" class="modal-backdrop">
      <div class="modal-container">
        <h3 class="modal-title">Rechazar Reposición</h3>
        <p class="mt-1 text-sm text-gray-600">Para: <span class="font-bold">{{ selectedRequest?.nombre_caja }}</span></p>
        <div class="mt-4">
          <label for="reject_reason" class="form-label">Motivo del Rechazo <span class="text-red-500">*</span></label>
          <textarea id="reject_reason" v-model="rejectReason" rows="3" class="form-input mt-1" placeholder="Ej: Fondos insuficientes, solicitud duplicada..."></textarea>
        </div>
        <div v-if="modalError" class="modal-error">{{ modalError }}</div>
        <div class="modal-actions">
          <button @click="closeModals" :disabled="modalLoading" class="btn-secondary">Cancelar</button>
          <button @click="confirmRejection" :disabled="modalLoading" class="btn-danger">
            {{ modalLoading ? 'Procesando...' : 'Confirmar Rechazo' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-button { @apply whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300; }
.tab-button-active { @apply border-indigo-500 text-indigo-600; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-6 py-4 whitespace-nowrap text-sm text-gray-700; }
.status-badge { @apply px-2 inline-flex text-xs leading-5 font-semibold rounded-full; }
.form-label { @apply block text-sm font-medium leading-6 text-gray-900; }
.form-input { @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6; }
.btn-success { @apply rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50; }
.btn-danger { @apply rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.modal-backdrop { @apply fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center; }
.modal-container { @apply relative p-6 bg-white rounded-lg shadow-xl max-w-md mx-auto w-full; }
.modal-title { @apply text-xl font-semibold leading-6 text-gray-900; }
.modal-error { @apply mt-4 bg-red-100 p-3 rounded-md text-sm text-red-700; }
.modal-actions { @apply mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3; }
</style>