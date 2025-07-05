<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter } from 'vue-router';
// --- ¡NUEVA IMPORTACIÓN! ---
import { useReportGenerator } from '../composables/useReportGenerator.js';

const router = useRouter();
const viajes = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

// --- Estado y Lógica para el Modal de Cierre ---
const mostrarModalCierre = ref(false);
const viajeACerrar = ref(null);
const observacionCierreInput = ref('');
const loadingCierre = ref(false);

// --- ¡NUEVO ESTADO Y HOOK! ---
const loadingReporteId = ref(null); // Para el spinner del botón de imprimir
const { generateRendicionCompletaPDF } = useReportGenerator();

// --- Funciones de Formato ---
const formatCurrency = (amount, currency = 'ARS') => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 2 }).format(amount);
};

const formatDate = (dateString, options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) => {
  if (!dateString) return 'N/A';
  let date;
  if (String(dateString).includes('T') || String(dateString).includes(' ')) {
    date = new Date(dateString);
  } else {
    const dateParts = String(dateString).split('-');
    if (dateParts.length === 3) {
      date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
    } else {
      date = new Date(dateString);
    }
  }
  if (isNaN(date.getTime())) return 'Fecha Inválida';
  return date.toLocaleDateString('es-AR', options);
};

// --- Funciones de Estado y UI ---
const getEstadoViajeTexto = (viaje) => {
  if (viaje.cerrado_en) {
    return `CERRADO EL ${formatDate(viaje.cerrado_en, {day: '2-digit', month: 'long', year: 'numeric', hour:'2-digit', minute:'2-digit' })}`;
  }
  return 'EN CURSO';
};

const puedeModificarViaje = (viaje) => {
  return !viaje.cerrado_en; 
};

// --- Funciones de Carga de Datos ---
const fetchViajesConGastos = async () => {
  console.log("ViajesListView: Iniciando fetchViajesConGastos...");
  loading.value = true;
  errorMessage.value = '';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Usuario no autenticado para fetchViajesConGastos.");
    }

    console.log("ViajesListView: Usuario autenticado, obteniendo viajes...");
    const { data: viajesData, error: viajesError } = await supabase
      .from('viajes')
      .select('id, user_id, nombre_viaje, destino, fecha_inicio, fecha_fin, monto_adelanto, codigo_rendicion, cerrado_en, observacion_cierre')
      .eq('user_id', user.id)
      .order('cerrado_en', { ascending: true, nullsFirst: true })
      .order('fecha_inicio', { ascending: false });

    if (viajesError) throw viajesError;

    if (!viajesData || viajesData.length === 0) {
      viajes.value = [];
      console.log("ViajesListView: No se encontraron viajes para el usuario.");
    } else {
      const viajesConInfoDeGastos = await Promise.all(
        viajesData.map(async (viaje) => {
          const { data: gastosRelacionados, error: gastosError } = await supabase
            .from('gastos')
            .select('monto_total, adelanto_especifico_aplicado')
            .eq('viaje_id', viaje.id)
            .eq('user_id', user.id);

          if (gastosError) {
            console.error(`ViajesListView: Error obteniendo gastos para el viaje ID ${viaje.id}:`, gastosError.message);
            return { ...viaje, total_gastado_bruto: 0, saldo_adelanto_viaje: viaje.monto_adelanto || 0 };
          }

          let totalGastadoBruto = 0;
          let totalImpactoEnAdelanto = 0;

          if (gastosRelacionados) {
            gastosRelacionados.forEach(gasto => {
              const costoReal = gasto.monto_total || 0;
              const adelantoAplicado = gasto.adelanto_especifico_aplicado || 0;
              totalGastadoBruto += costoReal;
              totalImpactoEnAdelanto += (costoReal - adelantoAplicado);
            });
          }
          
          const saldoAdelanto = (viaje.monto_adelanto || 0) - totalImpactoEnAdelanto;

          return { ...viaje, total_gastado_bruto: totalGastadoBruto, saldo_adelanto_viaje: saldoAdelanto };
        })
      );
      viajes.value = viajesConInfoDeGastos;
    }
  } catch (error) {
    console.error('ViajesListView: Error general en fetchViajesConGastos:', error);
    errorMessage.value = `No se pudieron cargar los viajes/períodos: ${error.message || 'Error desconocido.'}`;
    viajes.value = [];
  } finally {
    loading.value = false;
    console.log("ViajesListView: fetchViajesConGastos FIN.");
  }
};

// --- ¡NUEVA FUNCIÓN PARA GENERAR EL REPORTE! ---
async function generarReporteParaViaje(viaje) {
  if (loadingReporteId.value) return; // Evitar doble clic
  loadingReporteId.value = viaje.id;
  errorMessage.value = ''; // Limpiar errores previos

  try {
    // 1. Obtener el perfil del usuario actual
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');
    
    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('nombre_completo, puesto')
      .eq('id', user.id)
      .single();
    if (perfilError) throw perfilError;

    // 2. Obtener todos los gastos para este viaje
    const { data: gastos, error: gastosError } = await supabase
      .from('gastos')
      .select('*, tipos_gasto_config(nombre_tipo_gasto)')
      .eq('viaje_id', viaje.id)
      .order('fecha_gasto', { ascending: true });
    if (gastosError) throw gastosError;

    // 3. Calcular los totales (similar a como lo haces en fetchViajesConGastos)
    let totalGastadoBruto = 0;
    let adelantosExtras = 0;
    gastos.forEach(g => {
      totalGastadoBruto += g.monto_total || 0;
      adelantosExtras += g.adelanto_especifico_aplicado || 0;
    });
    const adelantosDisponibles = (viaje.monto_adelanto || 0) + adelantosExtras;
    const saldoFinal = adelantosDisponibles - totalGastadoBruto;

    const totales = {
      adelantosDisponibles,
      adelantosExtras,
      gastosBruto: totalGastadoBruto,
      saldoFinal
    };

    // 4. Llamar a la función del composable con todos los datos
    await generateRendicionCompletaPDF(gastos, viaje, perfil, totales);

  } catch (error) {
    console.error('Error al generar el reporte PDF:', error.message);
    errorMessage.value = `No se pudo generar el reporte: ${error.message}`;
  } finally {
    loadingReporteId.value = null; // Desactiva el spinner
  }
}

// --- Hooks de Ciclo de Vida ---
onMounted(() => {
  console.log("ViajesListView: Componente MONTADO.");
  fetchViajesConGastos();
});

// --- Funciones de Interacción y Navegación ---
const goToNuevoViaje = () => {
  router.push({ name: 'ViajeCreate' });
};

const verGastosDelViaje = (viaje) => {
  router.push({ name: 'GastosListUser', query: { viajeId: viaje.id, viajeNombre: viaje.nombre_viaje } });
};

const editarViaje = (viaje) => {
  if (!puedeModificarViaje(viaje)) {
    alert(`El Viaje/Período #${viaje.codigo_rendicion || viaje.id} ya está cerrado y no se puede editar.`);
    return;
  }
  router.push({ name: 'ViajeEdit', params: { id: viaje.id } });
};

const eliminarViaje = async (viaje) => {
  if (!puedeModificarViaje(viaje)) {
    alert(`El Viaje/Período #${viaje.codigo_rendicion || viaje.id} ya está cerrado y no se puede eliminar.`);
    return;
  }

  const { count } = await supabase.from('gastos').select('*', { count: 'exact', head: true }).eq('viaje_id', viaje.id);
  const mensajeConfirmacion = count > 0
    ? `¿Estás seguro de que querés eliminar el Viaje/Período #${viaje.codigo_rendicion || viaje.id}? ¡ATENCIÓN: Se eliminarán también los ${count} gastos asociados!`
    : `¿Estás seguro de que querés eliminar el Viaje/Período #${viaje.codigo_rendicion || viaje.id}?`;

  if (!confirm(mensajeConfirmacion)) return;

  loading.value = true;
  try {
    const { error } = await supabase.from('viajes').delete().eq('id', viaje.id);
    if (error) throw error;
    
    viajes.value = viajes.value.filter(v => v.id !== viaje.id); 
    successMessage.value = `Viaje / Período #${viaje.codigo_rendicion || viaje.id} eliminado correctamente.`;
    setTimeout(() => { successMessage.value = ''; }, 4000);
  } catch (error) {
    errorMessage.value = 'Error al eliminar el registro: ' + error.message;
  } finally {
    loading.value = false;
  }
};

// --- Lógica para Cierre de Rendición ---
const abrirModalCierreRendicion = (viaje) => {
  if (!puedeModificarViaje(viaje)) {
    alert("Este viaje/período ya está cerrado.");
    return;
  }
  viajeACerrar.value = { ...viaje };
  observacionCierreInput.value = '';
  errorMessage.value = '';
  successMessage.value = '';
  mostrarModalCierre.value = true;
};

const cancelarCierre = () => {
  mostrarModalCierre.value = false;
  viajeACerrar.value = null;
};

const confirmarCierreRendicion = async () => {
  if (!viajeACerrar.value) return;

  loadingCierre.value = true;
  errorMessage.value = '';
  try {
    const fechaActualISO = new Date().toISOString();
    const fechaFinParaGuardar = fechaActualISO.split('T')[0];

    const updates = {
      cerrado_en: fechaActualISO,
      fecha_fin: fechaFinParaGuardar, 
      observacion_cierre: observacionCierreInput.value.trim() || null,
    };

    const { data: updatedViaje, error } = await supabase
      .from('viajes')
      .update(updates)
      .eq('id', viajeACerrar.value.id)
      .select()
      .single();

    if (error) throw error;

    // Refrescar la lista completa para asegurar consistencia de datos
    await fetchViajesConGastos();
    
    successMessage.value = `¡El Viaje/Período #${updatedViaje.codigo_rendicion} ha sido cerrado exitosamente!`;
    mostrarModalCierre.value = false;
  } catch (error) {
    errorMessage.value = "Error al cerrar la rendición: " + error.message;
  } finally {
    loadingCierre.value = false;
  }
};
</script>
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-text-primary tracking-tight">Mis Rendiciones</h1>
      <button
        @click="goToNuevoViaje"
        class="w-full sm:w-auto bg-districorr-accent text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-opacity-85 transition duration-150 ease-in-out shadow-md hover:shadow-lg flex items-center justify-center transform hover:scale-103"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Nueva Rendición
      </button>
    </div>

    <!-- Mensajes de feedback Globales -->
    <div v-if="successMessage" class="mb-6 p-3.5 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-md text-sm shadow-md">
      <p class="font-medium">¡Éxito!</p>
      <p>{{ successMessage }}</p>
    </div>
    <div v-if="errorMessage && !loadingCierre" class="mb-6 p-3.5 bg-red-100 border-l-4 border-red-600 text-red-700 rounded-md text-sm shadow-md">
       <p class="font-medium">Error:</p>
      <p class="whitespace-pre-line">{{ errorMessage }}</p>
    </div>

    <!-- Indicador de Carga Principal -->
    <div v-if="loading && viajes.length === 0" class="text-center py-16">
      <svg class="animate-spin h-12 w-12 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
         <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
         <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
       </svg>
      <p class="text-lg text-gray-600 mt-4">Cargando rendiciones...</p>
    </div>
    
    <!-- Mensaje si no hay viajes -->
    <div v-else-if="!loading && viajes.length === 0 && !errorMessage" class="bg-white p-10 rounded-xl shadow-lg text-center border border-gray-200">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-20 h-20 mx-auto text-gray-300 mb-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.375 3.083a2.5 2.5 0 013.25 0l7.167 6.45a2.5 2.5 0 010 3.934l-7.167 6.45a2.5 2.5 0 01-3.25 0V3.083zM4.5 3.083v17.834m0-17.834h1.917m-1.917 17.834h1.917M8.25 8.25h7.5M8.25 12h5.25M8.25 15.75h3" />
      </svg>
      <p class="text-gray-700 text-xl font-semibold">No hay Rendiciones Registradas</p>
      <p class="mt-2 text-sm text-gray-500">Comienza creando una nueva rendición para organizar tus gastos.</p>
      <button @click="goToNuevoViaje" class="mt-6 bg-districorr-accent text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-opacity-85 shadow-md hover:shadow-lg transition-all">
         Crear Primera Rendición
       </button>
    </div>

    <!-- Lista de Viajes -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div v-for="viaje in viajes" :key="viaje.id" 
           class="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col justify-between hover:shadow-2xl transition-all duration-300 ease-in-out border-t-4"
           :class="viaje.cerrado_en ? 'border-red-400' : 'border-green-400'">
        <div class="p-5 flex-grow">
          <div class="flex justify-between items-start mb-2">
            <h2 class="text-base sm:text-lg font-semibold text-districorr-text-primary truncate flex-1 mr-2 leading-tight" :title="viaje.nombre_viaje">{{ viaje.nombre_viaje }}</h2>
            <span v-if="viaje.codigo_rendicion" class="text-xs font-mono bg-gray-200 text-gray-800 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap shadow-sm">ID: #{{ viaje.codigo_rendicion }}</span>
          </div>
          <p class="text-xs font-bold mb-3 uppercase tracking-wider flex items-center" :class="viaje.cerrado_en ? 'text-red-600' : 'text-green-600'">
            <svg v-if="viaje.cerrado_en" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v3H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2.5a2.5 2.5 0 00-2.5 2.5V9h5V7a2.5 2.5 0 00-2.5-2.5z" /></svg>
            {{ getEstadoViajeTexto(viaje) }}
          </p>
          <div class="text-sm text-gray-700 space-y-1">
            <p><span class="font-medium text-gray-500">Destino/Área:</span> {{ viaje.destino || 'No especificado' }}</p>
            <p><span class="font-medium text-gray-500">Inicio:</span> {{ formatDate(viaje.fecha_inicio) }}</p>
          </div>
          <div class="mt-4 pt-4 border-t border-gray-200">
            <p class="text-sm text-gray-700"><span class="font-medium text-gray-500">Adelanto:</span> <span class="font-semibold">{{ formatCurrency(viaje.monto_adelanto) }}</span></p>
            <p class="text-xs text-gray-500 mt-1">Gastos (Bruto): {{ formatCurrency(viaje.total_gastado_bruto) }}</p>
            <p class="text-base mt-2 font-semibold" :class="viaje.saldo_adelanto_viaje >= 0 ? 'text-green-600' : 'text-red-600'">
              <span class="font-medium">Saldo del Viaje:</span> {{ formatCurrency(viaje.saldo_adelanto_viaje) }}
            </p>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-wrap gap-2 justify-end items-center" :class="{'bg-gray-200/70': viaje.cerrado_en}">
          
          <!-- --- ¡NUEVO BOTÓN DE IMPRIMIR! --- -->
          <button 
            @click="generarReporteParaViaje(viaje)"
            :disabled="loadingReporteId === viaje.id"
            class="btn-admin-action-xs bg-gray-600 hover:bg-gray-700 text-white flex-grow sm:flex-grow-0"
            title="Imprimir Rendición en PDF"
          >
            <span v-if="loadingReporteId === viaje.id" class="flex items-center justify-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Generando...
            </span>
            <span v-else class="flex items-center justify-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" />
              </svg>
              Imprimir
            </span>
          </button>

          <button v-if="puedeModificarViaje(viaje)" @click="abrirModalCierreRendicion(viaje)" class="btn-admin-action-xs btn-orange">Cerrar Rendición</button>
          <button @click="verGastosDelViaje(viaje)" class="btn-admin-action-xs btn-blue">Ver/Cargar Gastos</button>
          <button @click="editarViaje(viaje)" :disabled="!puedeModificarViaje(viaje)" class="btn-admin-action-xs btn-yellow">Editar</button>
          <button @click="eliminarViaje(viaje)" :disabled="!puedeModificarViaje(viaje)" class="btn-admin-action-xs btn-danger">Eliminar</button>
        </div>
      </div>
    </div>

    <!-- Modal para Cierre de Rendición -->
    <div v-if="mostrarModalCierre" 
         class="fixed inset-0 bg-gray-800 bg-opacity-75 backdrop-blur-sm overflow-y-auto h-full w-full flex items-center justify-center z-[100] p-4" 
         @click.self="cancelarCierre">
      <div class="relative w-full max-w-lg bg-white rounded-xl shadow-2xl transform transition-all sm:my-8">
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 rounded-t-xl">
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                Cerrar Rendición #{{ viajeACerrar?.codigo_rendicion }}
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500">
                  Vas a cerrar el período de rendición para: <strong>{{ viajeACerrar?.nombre_viaje }}</strong>.
                  La fecha de cierre y la fecha de fin del período se establecerán al día de hoy.
                  <strong class="text-red-600">Esta acción no se puede deshacer.</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
        <form @submit.prevent="confirmarCierreRendicion" class="px-4 py-3 sm:px-6 space-y-3">
           <div>
            <label for="observacionCierreModal" class="block text-sm font-medium text-gray-700">Observación de Cierre <span class="text-gray-400 text-xs">(Opcional)</span></label>
            <textarea id="observacionCierreModal" v-model="observacionCierreInput" rows="3"
                      class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-districorr-accent focus:ring focus:ring-districorr-accent focus:ring-opacity-50 sm:text-sm p-2"
                      placeholder="Notas adicionales sobre el cierre..."></textarea>
          </div>
          <div v-if="errorMessage && mostrarModalCierre" class="my-2 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs">
            {{ errorMessage }}
          </div>
          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-xl -mx-4 -mb-4 sm:-mx-6 sm:-mb-4">
            <button type="submit" 
                    :disabled="loadingCierre"
                    class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50">
              <svg v-if="loadingCierre" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span v-if="loadingCierre">Cerrando...</span>
              <span v-else>Confirmar y Cerrar</span>
            </button>
            <button type="button" 
                    @click="cancelarCierre" 
                    :disabled="loadingCierre"
                    class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>