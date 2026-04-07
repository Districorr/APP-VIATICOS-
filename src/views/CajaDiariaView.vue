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
const activeTab = ref('movimientos');

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

// --- INICIO DE NUEVAS COMPUTADAS PARA EL REDISEÑO ---
const saldoColorClass = computed(() => {
  if (!cajaChica.value) return 'text-gray-800';
  if (cajaChica.value.saldo_actual < 0) return 'text-red-600';
  if (necesitaReposicion.value) return 'text-yellow-500';
  return 'text-green-600';
});

const progresoTexto = computed(() => {
  if (!cajaChica.value) return '';
  const porcentajeRestante = 100 - saldoPorcentaje.value;
  if (cajaChica.value.saldo_actual < 0) return 'Saldo negativo';
  return `Queda un ${porcentajeRestante.toFixed(0)}% disponible del objetivo`;
});
// --- FIN DE NUEVAS COMPUTADAS ---

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
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Gestión de Caja Diaria</h1>

    <div v-if="loading" class="text-center py-12">
      <svg class="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p class="mt-3 text-gray-600">Cargando datos de la Caja Diaria...</p>
    </div>

    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-lg text-red-700">
      <p class="font-semibold mb-2">Error al cargar la Caja Diaria:</p>
      <p>{{ errorMessage }}</p>
      <p class="mt-4 text-sm text-gray-600">Si el problema persiste, contacta a tu administrador.</p>
    </div>

    <div v-else-if="cajaChica" class="space-y-8">
      <!-- INICIO: NUEVA TARJETA DE SALDO Y ACCIONES -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Tarjeta de Saldo -->
        <div class="lg:col-span-2 bg-white shadow-lg rounded-xl border border-gray-200 p-6 flex flex-col justify-between">
          <div>
            <div class="flex justify-between items-start">
              <div>
                <h2 class="text-xl font-bold text-gray-800">{{ cajaChica.nombre }}</h2>
                <p class="text-sm text-gray-500">Gestionado por ti</p>
              </div>
              <div class="text-right">
                <p class="text-sm text-gray-500">Saldo Actual</p>
                <p class="text-4xl font-extrabold" :class="saldoColorClass">
                  {{ formatCurrency(cajaChica.saldo_actual) }}
                </p>
              </div>
            </div>
            <div v-if="cajaChica.deuda_responsable > 0" class="mt-2 text-right text-sm font-semibold text-red-600">
              (Debes reponer: {{ formatCurrency(cajaChica.deuda_responsable) }})
            </div>
          </div>
          <div class="mt-4">
            <div class="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progreso al Objetivo ({{ formatCurrency(cajaChica.monto_objetivo) }})</span>
              <span>{{ progresoTexto }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5 relative">
              <div class="bg-green-500 h-2.5 rounded-full transition-all duration-500" :style="{ width: saldoPorcentaje + '%' }"></div>
              <div class="absolute top-0 h-2.5 border-r-2 border-dashed border-gray-500" :style="{ left: umbralPorcentaje + '%' }" title="Umbral de reposición"></div>
            </div>
          </div>
        </div>

        <!-- Botones de Acción -->
        <div class="bg-white shadow-lg rounded-xl border border-gray-200 p-6 flex flex-col justify-center gap-4">
          <button @click="registrarGastoDesdeCaja" class="btn-primary w-full">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
            <span>Registrar Gasto</span>
          </button>
          <button @click="solicitarReposicion" class="btn-secondary w-full" :disabled="solicitandoReposicion">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201-4.42 5.5 5.5 0 011.65-1.983l-.65-1.624a.75.75 0 011.423-.569l.65 1.624A5.5 5.5 0 0115.312 11.424zM6.12 7.576a3.5 3.5 0 004.95 4.95l.65 1.624a.75.75 0 101.423-.569l-.65-1.624a3.5 3.5 0 00-4.95-4.95L6.12 7.576z" clip-rule="evenodd" /></svg>
            <span>Solicitar Reposición</span>
          </button>
          <button @click="openReportModal" class="btn-secondary w-full">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3.379a1.5 1.5 0 00-1.06.44l-1.122 1.12a1.5 1.5 0 01-2.12 0L6.44 18.439A1.5 1.5 0 005.38 18H2a1 1 0 110-2V4zm2 0v12h3.379a.5.5 0 01.353.146l1.122 1.121a.5.5 0 00.707 0l1.121-1.121A.5.5 0 0112.621 16H16V4H6z" clip-rule="evenodd" /></svg>
            <span>Generar Reporte</span>
          </button>
        </div>
      </div>
      <!-- FIN: NUEVA TARJETA DE SALDO Y ACCIONES -->
      
      <!-- Pestañas para Historial -->
      <div class="mt-8">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8" aria-label="Tabs">
            <button @click="activeTab = 'movimientos'" :class="['tab-button', { 'tab-active': activeTab === 'movimientos' }]">
              Historial de Movimientos
            </button>
            <button @click="activeTab = 'solicitudes'" :class="['tab-button', { 'tab-active': activeTab === 'solicitudes' }]">
              Mis Solicitudes
            </button>
          </nav>
        </div>
        <div class="mt-6">
          <div v-show="activeTab === 'movimientos'">
            <HistorialMovimientosCaja :key="cajaChica.id" :caja="cajaChica" />
          </div>
          <div v-show="activeTab === 'solicitudes'">
            <HistorialSolicitudesCaja :solicitudes="solicitudes" :loading="loadingSolicitudes" />
          </div>
        </div>
      </div>
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
.btn-primary { @apply inline-flex items-center justify-center gap-x-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50; }
.btn-secondary { @apply inline-flex items-center justify-center gap-x-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.tab-button { @apply whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700; }
.tab-active { @apply border-indigo-500 text-indigo-600; }
</style>