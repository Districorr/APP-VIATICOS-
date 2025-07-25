<!-- src/views/CajaDiariaView.vue -->
<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { useRouter } from 'vue-router';
import HistorialMovimientosCaja from '../components/HistorialMovimientosCaja.vue';
import { useReportGenerator } from '../composables/useReportGenerator.js';
import HistorialSolicitudesCaja from '../components/HistorialSolicitudesCaja.vue';

const router = useRouter();
const { generateCajaReportePDF } = useReportGenerator(); 

const loading = ref(true);
const errorMessage = ref('');
const cajaChica = ref(null);
const solicitudes = ref([]);
const loadingSolicitudes = ref(true);

const showReportModal = ref(false);
const loadingReport = ref(false);
const reportData = ref({ from: '', to: '' });
const reportError = ref('');

const showSolicitarReposicionDialog = ref(false);
const solicitandoReposicion = ref(false);
const solicitudExitosa = ref(false);
const solicitudError = ref('');
const montoReposicion = ref(null);

let cajaChannel = null;

const saldoPorcentaje = computed(() => {
  if (!cajaChica.value || !cajaChica.value.monto_objetivo || cajaChica.value.monto_objetivo <= 0) return 0;
  return Math.max(0, Math.min((cajaChica.value.saldo_actual / cajaChica.value.monto_objetivo) * 100, 100));
});

const umbralPorcentaje = computed(() => {
  if (!cajaChica.value || !cajaChica.value.monto_objetivo || cajaChica.value.monto_objetivo <= 0) return 0;
  return Math.max(0, Math.min((cajaChica.value.umbral_reposicion / cajaChica.value.monto_objetivo) * 100, 100));
});

const necesitaReposicion = computed(() => {
  if (!cajaChica.value) return false;
  return cajaChica.value.saldo_actual < cajaChica.value.umbral_reposicion;
});

async function cargarCajaChica() {
  loading.value = true;
  errorMessage.value = '';
  cajaChica.value = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado.');

    const { data, error } = await supabase
      .from('cajas_chicas')
      .select('*')
      .eq('responsable_id', user.id)
      .eq('activo', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new Error('No se encontró una Caja Diaria activa asignada a tu usuario.');
      throw error;
    }
    
    cajaChica.value = data;
    await Promise.all([
        fetchSolicitudes(data.id),
        subscribeToCajaRealtime(data.id)
    ]);

  } catch (e) {
    errorMessage.value = `Error al cargar la Caja Diaria: ${e.message}`;
    cajaChica.value = null;
  } finally {
    loading.value = false;
  }
}

async function fetchSolicitudes(cajaId) {
    loadingSolicitudes.value = true;
    try {
        // CORRECCIÓN: Cambiar 'fecha_solicitud' por 'created_at'
        const { data, error } = await supabase
            .from('solicitudes_reposicion')
            .select('*, revisado_por:revisado_por_id(nombre_completo)')
            .eq('caja_id', cajaId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        solicitudes.value = data;
    } catch (e) {
        errorMessage.value = `No se pudo cargar el historial de solicitudes: ${e.message}`;
    } finally {
        loadingSolicitudes.value = false;
    }
}


function subscribeToCajaRealtime(cajaId) {
  if (cajaChannel) supabase.removeChannel(cajaChannel);

  cajaChannel = supabase.channel(`caja_chica_${cajaId}`);
  cajaChannel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'cajas_chicas', filter: `id=eq.${cajaId}` },
      (payload) => {
        if (payload.new) cajaChica.value = payload.new;
      }
    )
   .subscribe();
}

onUnmounted(() => {
  if (cajaChannel) supabase.removeChannel(cajaChannel);
});

onMounted(cargarCajaChica);

function registrarGastoDesdeCaja() {
  if (cajaChica.value) {
    router.push({ name: 'GastoFormCreate', query: { caja_id: cajaChica.value.id } });
  }
}

function solicitarReposicion() {
   if (cajaChica.value) {
        showSolicitarReposicionDialog.value = true;
        solicitandoReposicion.value = false;
        solicitudExitosa.value = false;
        solicitudError.value = '';
        montoReposicion.value = parseFloat((cajaChica.value.monto_objetivo - cajaChica.value.saldo_actual).toFixed(2));
   }
}

async function confirmarSolicitarReposicion() {
    solicitandoReposicion.value = true;
    solicitudError.value = '';
    solicitudExitosa.value = false;
    try {
        if (!cajaChica.value) throw new Error("No hay caja chica seleccionada.");
        if (!montoReposicion.value || montoReposicion.value <= 0) throw new Error("El monto a solicitar debe ser mayor a cero.");
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuario no autenticado.");

        const { error } = await supabase
          .from('solicitudes_reposicion')
          .insert({
            caja_id: cajaChica.value.id,
            solicitado_por_id: user.id,
            estado: 'pendiente',
            monto_solicitado: montoReposicion.value
          });

        if (error) throw error;

        solicitudExitosa.value = true;
        await fetchSolicitudes(cajaChica.value.id); 
        setTimeout(() => { cancelarSolicitarReposicion(); }, 2500);

    } catch (e) {
        solicitudError.value = `Error al enviar la solicitud: ${e.message}`;
        solicitudExitosa.value = false;
    } finally {
        solicitandoReposicion.value = false;
    }
}

function cancelarSolicitarReposicion() {
    showSolicitarReposicionDialog.value = false;
    solicitandoReposicion.value = false;
    solicitudExitosa.value = false;
    solicitudError.value = '';
    montoReposicion.value = null;
}

function openReportModal() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    reportData.value.from = firstDayOfMonth.toISOString().split('T')[0];
    reportData.value.to = today.toISOString().split('T')[0];
    reportError.value = '';
    showReportModal.value = true;
}

function closeReportModal() {
    showReportModal.value = false;
}

async function handleGenerateReport() {
    if (!reportData.value.from || !reportData.value.to) {
        reportError.value = "Por favor, selecciona un rango de fechas válido.";
        return;
    }
    loadingReport.value = true;
    reportError.value = '';
    try {
        await generateCajaReportePDF(cajaChica.value.id, reportData.value.from, reportData.value.to);
        closeReportModal();
    } catch (e) {
        reportError.value = `No se pudo generar el reporte: ${e.message}`;
    } finally {
        loadingReport.value = false;
    }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Gestión de Caja Diaria</h1>

    <div v-if="loading" class="text-center py-12">
      <svg class="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p class="mt-3 text-gray-600">Cargando datos de la Caja Diaria...</p>
    </div>

    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">
      <p class="font-semibold mb-2">Error al cargar la Caja Diaria:</p>
      <p>{{ errorMessage }}</p>
      <p class="mt-4 text-sm text-gray-600">Si el problema persiste, contacta a tu administrador.</p>
    </div>

    <div v-else-if="cajaChica" class="space-y-8">
      <!-- Sección de Resumen y Saldo de la Caja -->
      <div class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
        <div class="p-6 bg-indigo-600 text-white flex flex-col md:flex-row justify-between md:items-center">
          <div>
            <h2 class="text-2xl font-bold">{{ cajaChica.nombre }}</h2>
             <p class="text-indigo-200 text-sm">Gestionado por ti</p>
          </div>
          <div class="text-left md:text-right mt-4 md:mt-0">
            <p class="text-lg opacity-75">Saldo Actual:</p>
            <p class="text-4xl font-extrabold">{{ formatCurrency(cajaChica.saldo_actual) }}</p>
            <p v-if="cajaChica.deuda_responsable > 0" class="text-red-300 font-semibold mt-1">(Debes reponer: {{ formatCurrency(cajaChica.deuda_responsable) }})</p>
            <p v-else-if="necesitaReposicion" class="text-yellow-300 font-semibold mt-1">(¡Saldo bajo! Necesita reposición)</p>
          </div>
        </div>
        <div class="p-6 pt-2 text-gray-700">
          <div class="relative pt-1">
            <div class="flex mb-2 items-center justify-between">
              <div><span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded text-indigo-600 bg-indigo-200">Progreso al Objetivo</span></div>
              <div class="text-right"><span class="text-xs font-semibold inline-block text-indigo-600">{{ saldoPorcentaje.toFixed(1) }}%</span></div>
            </div>
            <div class="overflow-hidden h-4 mb-4 text-xs flex rounded bg-indigo-200">
              <div :style="{ width: umbralPorcentaje + '%' }" class="absolute h-full border-r-2 border-dashed border-gray-600 z-10"></div>
              <div :style="{ width: saldoPorcentaje + '%' }" class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ease-in-out" :class="{'bg-green-500': !necesitaReposicion && cajaChica.saldo_actual >= 0, 'bg-yellow-500': necesitaReposicion && cajaChica.saldo_actual >= 0, 'bg-red-500': cajaChica.saldo_actual < 0 }"></div>
              <div :style="{ left: umbralPorcentaje + '%' }" class="absolute text-xs text-gray-700 z-10 mt-4 -ml-4">Umbral ({{ formatCurrency(cajaChica.umbral_reposicion) }})</div>
            </div>
          </div>
        </div>
        <div class="p-6 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3">
             <button @click="openReportModal" class="btn-secondary px-4 py-2 text-sm font-semibold">Generar Reporte</button>
             <button @click="solicitarReposicion" class="btn-secondary px-4 py-2 text-sm font-semibold" :disabled="solicitandoReposicion">Solicitar Reposición</button>
             <button @click="registrarGastoDesdeCaja" class="btn-primary px-4 py-2 text-sm font-semibold">Registrar Gasto</button>
        </div>
      </div>
      
      <!-- Historial de Solicitudes de Reposición -->
      <HistorialSolicitudesCaja :solicitudes="solicitudes" :loading="loadingSolicitudes" />

      <!-- Historial de Movimientos de la Caja -->
      <HistorialMovimientosCaja :key="cajaChica.id" :caja="cajaChica" />
    </div>

    <!-- Modal para Solicitar Reposición -->
    <div v-if="showSolicitarReposicionDialog" class="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
        <div class="relative p-6 bg-white rounded-lg shadow-xl max-w-md mx-auto w-full">
            <div class="text-center">
                <svg class="mx-auto h-12 w-12 text-blue-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <h3 class="text-lg font-medium leading-6 text-gray-900 mt-3">Solicitar Reposición de Caja</h3>
            </div>
            <div class="mt-4">
                <label for="monto_solicitud" class="block text-sm font-medium text-gray-700">Monto a solicitar</label>
                <div class="mt-1 relative rounded-md shadow-sm">
                    <div class="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span class="text-gray-500 sm:text-sm">$</span></div>
                    <input type="number" id="monto_solicitud" v-model.number="montoReposicion" class="block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="0.00">
                </div>
                <p class="mt-2 text-xs text-gray-500">Sugerencia para alcanzar el objetivo: {{ formatCurrency(cajaChica.monto_objetivo - cajaChica.saldo_actual) }}</p>
            </div>
            <div v-if="solicitudError" class="mt-4 text-sm text-red-600">{{ solicitudError }}</div>
            <div v-if="solicitudExitosa" class="mt-4 text-sm text-green-600">¡Solicitud enviada con éxito!</div>
            <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                 <button type="button" @click="confirmarSolicitarReposicion" :disabled="solicitandoReposicion || solicitudExitosa" class="btn-primary w-full justify-center">
                    <span v-if="solicitandoReposicion">Enviando...</span><span v-else>Confirmar Solicitud</span>
                </button>
                <button type="button" @click="cancelarSolicitarReposicion" :disabled="solicitandoReposicion" class="mt-3 w-full justify-center btn-secondary sm:mt-0 sm:col-start-1">Cancelar</button>
            </div>
        </div>
    </div>

    <!-- Modal para Generar Reporte -->
    <div v-if="showReportModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex justify-center items-center">
      <div class="relative p-6 bg-white rounded-lg shadow-xl max-w-md mx-auto w-full">
        <h3 class="text-lg font-medium text-gray-900">Generar Reporte de Caja</h3>
        <p class="text-sm text-gray-500 mt-1">Selecciona el rango de fechas para el reporte.</p>
        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="report_from" class="block text-sm font-medium text-gray-700">Desde</label>
            <input type="date" id="report_from" v-model="reportData.from" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
          </div>
          <div>
            <label for="report_to" class="block text-sm font-medium text-gray-700">Hasta</label>
            <input type="date" id="report_to" v-model="reportData.to" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
          </div>
        </div>
        <div v-if="reportError" class="mt-4 text-sm text-red-600">{{ reportError }}</div>
        <div class="mt-6 flex justify-end gap-3">
          <button @click="closeReportModal" class="btn-secondary">Cancelar</button>
          <button @click="handleGenerateReport" :disabled="loadingReport" class="btn-primary">
            <span v-if="loadingReport">Generando...</span>
            <span v-else>Generar PDF</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-primary { @apply inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50; }
.btn-secondary { @apply inline-flex items-center justify-center text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
</style>