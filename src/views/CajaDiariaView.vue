<!-- src/views/CajaDiariaView.vue -->
<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { useRouter } from 'vue-router';
import HistorialMovimientosCaja from '../components/HistorialMovimientosCaja.vue'; // <-- IMPORTAMOS EL NUEVO COMPONENTE

const router = useRouter();

// --- Estado del Componente ---
const loading = ref(true);
const errorMessage = ref('');
const cajaChica = ref(null);

// Estados para el diálogo de confirmación de reposición
const showSolicitarReposicionDialog = ref(false);
const solicitandoReposicion = ref(false);
const solicitudExitosa = ref(false);
const solicitudError = ref('');

// Estado para el canal de Realtime
let cajaChannel = null;

// --- Propiedades computadas para la UI ---
const saldoPorcentaje = computed(() => {
  if (!cajaChica.value || !cajaChica.value.monto_objetivo || cajaChica.value.monto_objetivo <= 0) return 0; 
  const percentage = (cajaChica.value.saldo_actual / cajaChica.value.monto_objetivo) * 100;
  return Math.max(0, Math.min(percentage, 100)); 
});

const umbralPorcentaje = computed(() => {
   if (!cajaChica.value || !cajaChica.value.monto_objetivo || cajaChica.value.monto_objetivo <= 0) return 0;
  const percentage = (cajaChica.value.umbral_reposicion / cajaChica.value.monto_objetivo) * 100;
   return Math.max(0, Math.min(percentage, 100)); 
});

const necesitaReposicion = computed(() => {
    if (!cajaChica.value) return false;
    return cajaChica.value.saldo_actual < cajaChica.value.umbral_reposicion;
});

// --- Lógica de Carga de Datos ---
async function cargarCajaChica() {
  loading.value = true;
  errorMessage.value = '';
  cajaChica.value = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      errorMessage.value = 'Usuario no autenticado. No se puede cargar la Caja Diaria.';
      loading.value = false;
      return;
    }

    const { data: profileData } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single();
    
    const userRole = profileData?.rol;

    let query = supabase
      .from('cajas_chicas')
      .select('*')
      .eq('activo', true);

    if (userRole !== 'admin') {
        query = query.eq('responsable_id', user.id);
    }
    
     const { data, error } = userRole === 'admin'
        ? await query.order('created_at').limit(1).single()
        : await query.single();

    if (error) {
      console.error('Error de Supabase al cargar caja chica:', error);
      if (error.code === 'PGRST116') {
        errorMessage.value = userRole === 'admin' ? 'No se encontraron Cajas Chicas activas en el sistema.' : 'No se encontró una Caja Diaria activa asignada a tu usuario.';
      } else {
        errorMessage.value = `Error al cargar la Caja Diaria: ${error.message}`;
      }
      cajaChica.value = null;
    } else {
      cajaChica.value = data;
      if (cajaChica.value) {
        subscribeToCajaRealtime(cajaChica.value.id);
      } else {
         errorMessage.value = userRole === 'admin' ? 'No se encontraron Cajas Chicas activas en el sistema.' : 'No se encontró una Caja Diaria activa asignada a tu usuario.';
      }
    }
  } catch (e) {
    console.error('Error general en cargarCajaChica:', e);
    errorMessage.value = `Error al cargar la Caja Diaria: ${e.message}`;
    cajaChica.value = null;
  } finally {
    loading.value = false;
  }
}

function subscribeToCajaRealtime(cajaId) {
  if (cajaChannel) {
    supabase.removeChannel(cajaChannel);
    cajaChannel = null;
  }

  cajaChannel = supabase.channel(`caja_chica_${cajaId}`);

  cajaChannel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'cajas_chicas', filter: `id=eq.${cajaId}` },
      (payload) => {
        console.log('Realtime: Cambio en caja_chicas recibido!', payload);
        if (payload.new) {
             cajaChica.value = payload.new;
             console.log('Realtime: Saldo actualizado:', cajaChica.value.saldo_actual);
        }
      }
    )
   .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Realtime: Suscrito exitosamente al canal 'caja_chica_${cajaId}'.`);
      }
      if (status === 'CHANNEL_ERROR') {
        console.error(`Realtime: Error en el canal 'caja_chica_${cajaId}':`, err);
      }
       if (status === 'TIMED_OUT') {
           console.warn(`Realtime: Suscripción al canal 'caja_chica_${cajaId}' timed out.`);
       }
    });
}

onUnmounted(() => {
  if (cajaChannel) {
    console.log(`Desuscribiendo del canal Realtime 'caja_chica_${cajaChannel.topic}'.`);
    supabase.removeChannel(cajaChannel);
    cajaChannel = null;
  }
});

onMounted(cargarCajaChica);

// --- Funciones de Acción ---
function registrarGastoDesdeCaja() {
  if (cajaChica.value) {
    router.push({ name: 'GastoFormCreate', query: { caja_id: cajaChica.value.id } });
  } else {
      console.warn("No se puede registrar gasto desde caja: Caja chica no cargada.");
  }
}

function solicitarReposicion() {
   if (cajaChica.value) {
        showSolicitarReposicionDialog.value = true;
        solicitandoReposicion.value = false;
        solicitudExitosa.value = false;
        solicitudError.value = '';
   } else {
       console.warn("No se puede solicitar reposición: Caja chica no cargada.");
   }
}

// --- LÓGICA ACTUALIZADA ---
async function confirmarSolicitarReposicion() {
    solicitandoReposicion.value = true;
    solicitudError.value = '';
    solicitudExitosa.value = false;
    try {
        if (!cajaChica.value) throw new Error("No hay caja chica seleccionada.");
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuario no autenticado.");

        const { error } = await supabase
          .from('solicitudes_reposicion')
          .insert({
            caja_id: cajaChica.value.id,
            solicitado_por_id: user.id,
            estado: 'pendiente'
            // monto_solicitado puede ser añadido aquí si se implementa en el UI
          });

        if (error) throw error;

        solicitudExitosa.value = true;
        setTimeout(() => { cancelarSolicitarReposicion(); }, 2500);

    } catch (e) {
        console.error('Error al solicitar reposición:', e);
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
      <!-- Sección de Resumen y Saldo de la Caja (Sin cambios) -->
      <div class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
        <div class="p-6 bg-indigo-600 text-white flex flex-col md:flex-row justify-between md:items-center">
          <div>
            <h2 class="text-2xl font-bold">{{ cajaChica.nombre }} <span class="md:hidden text-indigo-200 font-normal">(Gestionado por ti)</span></h2>
             <p class="hidden md:block text-indigo-200 text-sm">Gestionado por ti</p>
          </div>
          <div class="text-left md:text-right mt-4 md:mt-0">
            <p class="text-lg opacity-75">Saldo Actual:</p>
            <p class="text-4xl font-extrabold">{{ formatCurrency(cajaChica.saldo_actual) }}</p>
            <p v-if="cajaChica.deuda_responsable > 0" class="text-red-300 font-semibold mt-1">
              (Debes reponer: {{ formatCurrency(cajaChica.deuda_responsable) }})
            </p>
            <p v-else-if="necesitaReposicion && cajaChica.deuda_responsable <= 0" class="text-yellow-300 font-semibold mt-1">
              (¡Saldo bajo! Necesita reposición)
            </p>
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
              <div :style="{ width: saldoPorcentaje + '%' }" class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ease-in-out" :class="{'bg-green-500': !necesitaReposicion && cajaChica.saldo_actual >= 0, 'bg-yellow-500': necesitaReposicion && cajaChica.saldo_actual >= 0, 'bg-red-500': cajaChica.saldo_actual < 0 }">
                   <span v-if="saldoPorcentaje > 15" class="text-xs">{{ formatCurrency(cajaChica.saldo_actual) }}</span>
              </div>
              <div :style="{ left: umbralPorcentaje + '%' }" class="absolute text-xs text-gray-700 z-10 mt-4 -ml-4">Umbral ({{ formatCurrency(cajaChica.umbral_reposicion) }})</div>
            </div>
          </div>
        </div>
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
          <div><p class="text-sm font-medium text-gray-500">Monto Objetivo</p><p class="text-base font-semibold">{{ formatCurrency(cajaChica.monto_objetivo) }}</p></div>
          <div><p class="text-sm font-medium text-gray-500">Umbral de Reposición</p><p class="text-base font-semibold">{{ formatCurrency(cajaChica.umbral_reposicion) }}</p></div>
        </div>
        <transition enter-active-class="transition ease-out duration-300" enter-from-class="opacity-0 translate-y-4" enter-to-class="opacity-100 translate-y-0" leave-active-class="transition ease-in duration-200" leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-4">
            <div v-if="necesitaReposicion && cajaChica.deuda_responsable <= 0" class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mx-6 rounded-md" role="alert">
                <p class="font-bold">¡Atención!</p><p>El saldo actual de la caja ({{ formatCurrency(cajaChica.saldo_actual) }}) está por debajo del umbral de reposición ({{ formatCurrency(cajaChica.umbral_reposicion) }}).</p>
            </div>
             <div v-else-if="cajaChica.deuda_responsable > 0" class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mx-6 rounded-md" role="alert">
                <p class="font-bold">¡Saldo Negativo!</p><p>El responsable (tú) ha cubierto gastos por un total de {{ formatCurrency(cajaChica.deuda_responsable) }}. Solicita la reposición a Gerencia.</p>
            </div>
        </transition>
        <div class="p-6 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3">
             <button @click="solicitarReposicion" class="btn-secondary px-4 py-2 text-sm font-semibold min-h-[44px]" :disabled="solicitandoReposicion">
                <span v-if="solicitandoReposicion">Solicitando...</span><span v-else>Solicitar Reposición</span>
             </button>
             <button @click="registrarGastoDesdeCaja" class="btn-primary px-4 py-2 text-sm font-semibold min-h-[44px]">Registrar Gasto desde Caja</button>
        </div>
        <div class="p-6 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-600"><p>Los gastos registrados con esta caja impactan directamente este saldo.</p></div>
      </div>

      <!-- Componente de historial reutilizado -->
      <HistorialMovimientosCaja 
        :key="cajaChica.id"
        :caja="cajaChica"
      />
    </div>

    <!-- Modal de Confirmación para Solicitar Reposición (Sin cambios) -->
    <div v-if="showSolicitarReposicionDialog" class="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
        <div class="relative p-6 bg-white rounded-lg shadow-xl max-w-sm mx-auto">
            <div class="text-center">
                <svg class="mx-auto h-12 w-12 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4H21a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                <h3 class="text-lg font-medium leading-6 text-gray-900 mt-3">Solicitar Reposición</h3>
                <div class="mt-2 px-7 py-3">
                    <p class="text-sm text-gray-500">¿Estás seguro de que quieres enviar una solicitud de reposición a Gerencia para esta Caja Diaria?</p>
                     <p v-if="cajaChica" class="mt-2 text-xs text-gray-600">Saldo actual: {{ formatCurrency(cajaChica.saldo_actual) }}. Umbral: {{ formatCurrency(cajaChica.umbral_reposicion) }}.</p>
                </div>
                <div v-if="solicitudError" class="mt-4 text-sm text-red-600">{{ solicitudError }}</div>
                <div v-if="solicitudExitosa" class="mt-4 text-sm text-green-600">¡Solicitud enviada con éxito!</div>
            </div>
            <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                 <button type="button" @click="confirmarSolicitarReposicion" :disabled="solicitandoReposicion || solicitudExitosa" class="btn-primary px-4 py-2 w-full justify-center text-sm font-semibold min-h-[44px]">
                    <span v-if="solicitandoReposicion">Enviando...</span><span v-else>Confirmar Solicitud</span>
                </button>
                <button type="button" @click="cancelarSolicitarReposicion" :disabled="solicitandoReposicion" class="mt-3 w-full justify-center rounded-md border border-gray-300 px-4 py-2 bg-white text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm min-h-[44px]">Cancelar</button>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
</style>