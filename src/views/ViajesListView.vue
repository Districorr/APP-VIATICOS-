<script setup>
import { ref, onMounted, computed } from 'vue'; // computed podría no ser estrictamente necesario aquí si no se usa
import { supabase } from '../supabaseClient.js'; // Ajusta la ruta si es necesario
import { useRouter } from 'vue-router';

const router = useRouter();
const viajes = ref([]);
const loading = ref(true); // Loading general de la lista de viajes
const errorMessage = ref('');
const successMessage = ref(''); // Para feedback de acciones como cierre o eliminación

// --- Estado y Lógica para el Modal de Cierre ---
const mostrarModalCierre = ref(false);
const viajeACerrar = ref(null); // El objeto viaje que se está intentando cerrar
const observacionCierreInput = ref('');
// La fecha_fin se tomará como la fecha actual al momento de confirmar el cierre en la BD.
// No necesitamos un input para fecha_fin en el modal si esa es la lógica.
const loadingCierre = ref(false); // Loading específico para la acción de cerrar dentro del modal

// --- Funciones de Formato ---
const formatCurrency = (amount, currency = 'ARS') => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 2 }).format(amount);
};

const formatDate = (dateString, options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) => {
  if (!dateString) return 'N/A';
  let date;
  if (String(dateString).includes('T') || String(dateString).includes(' ')) { // Es un timestamp completo o tiene espacio (podría ser de new Date().toString())
    date = new Date(dateString);
  } else { // Asumir YYYY-MM-DD
    const dateParts = String(dateString).split('-');
    if (dateParts.length === 3) {
      date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
    } else {
      date = new Date(dateString); // Fallback
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

// Determina si un viaje puede ser modificado (editado, eliminado, cerrado)
const puedeModificarViaje = (viaje) => {
  return !viaje.cerrado_en; 
};
// ... (Bloque 1 anterior: imports, refs, formatters, getEstadoViajeTexto, puedeModificarViaje) ...

// --- Funciones de Carga de Datos ---
const fetchViajesConGastos = async () => {
  console.log("ViajesListView: Iniciando fetchViajesConGastos...");
  loading.value = true;
  errorMessage.value = '';
  // No limpiar successMessage aquí, podría venir de una acción previa como un cierre exitoso.
  // Se limpiará si la carga es exitosa o si hay un nuevo error.

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      errorMessage.value = "Usuario no autenticado. Por favor, inicie sesión.";
      loading.value = false; // Detener carga si no hay usuario
      viajes.value = []; // Asegurar que la lista esté vacía
      throw new Error("Usuario no autenticado para fetchViajesConGastos.");
    }

    console.log("ViajesListView: Usuario autenticado, obteniendo viajes...");
    // 1. Obtener todos los viajes del usuario
    // Asegurarse de seleccionar todas las columnas necesarias, incluyendo las nuevas.
    const { data: viajesData, error: viajesError } = await supabase
      .from('viajes')
      .select(`
        id, 
        user_id,
        nombre_viaje, 
        destino, 
        fecha_inicio, 
        fecha_fin, 
        monto_adelanto,
        codigo_rendicion, 
        cerrado_en, 
        observacion_cierre 
      `)
      .eq('user_id', user.id)
      .order('cerrado_en', { ascending: true, nullsFirst: true }) // Abiertos primero
      .order('fecha_inicio', { ascending: false });               // Luego por fecha de inicio

    if (viajesError) {
      console.error("ViajesListView: Error obteniendo viajesData de Supabase:", viajesError);
      throw viajesError; // Lanzar para ser atrapado por el catch principal
    }

    // console.log("ViajesListView: viajesData crudo de Supabase:", JSON.parse(JSON.stringify(viajesData || [])));

    if (!viajesData || viajesData.length === 0) {
      viajes.value = [];
      console.log("ViajesListView: No se encontraron viajes para el usuario.");
      // No es un error, simplemente no hay datos. successMessage se mantiene si venía de otra acción.
      // errorMessage se mantiene vacío.
    } else {
      // 2. Para cada viaje, obtener la suma de sus gastos (considerando adelantos específicos)
      const viajesConInfoDeGastos = await Promise.all(
        viajesData.map(async (viaje) => {
          // !!! VERIFICA que 'adelanto_especifico_aplicado' sea el nombre correcto de la columna en tu tabla 'gastos' !!!
          const nombreColumnaAdelantoGasto = 'adelanto_especifico_aplicado';

          const { data: gastosRelacionados, error: gastosError } = await supabase
            .from('gastos')
            .select(`
              monto_total, 
              ${nombreColumnaAdelantoGasto} 
            `)
            .eq('viaje_id', viaje.id)
            .eq('user_id', user.id); // Importante para seguridad y precisión

          if (gastosError) {
            console.error(`ViajesListView: Error obteniendo gastos para el viaje ID ${viaje.id} (Cod: ${viaje.codigo_rendicion}):`, gastosError.message);
            // Devolver el viaje con totales de gasto en 0 si falla la consulta de gastos, pero mantener el resto de la info del viaje
            return { 
              ...viaje, 
              total_gastado_bruto: 0,
              total_impacto_adelanto_viaje: 0,
              saldo_adelanto_viaje: viaje.monto_adelanto !== null ? viaje.monto_adelanto : 0
            };
          }

          let totalGastadoBrutoCalculado = 0;
          let totalImpactoEnAdelantoViajeCalculado = 0;

          if (gastosRelacionados) {
              gastosRelacionados.forEach(gasto => {
                  const costoRealDelGasto = gasto.monto_total || 0;
                  const adelantoAplicadoDirectoAlGasto = gasto[nombreColumnaAdelantoGasto] || 0;
                  
                  totalGastadoBrutoCalculado += costoRealDelGasto;
                  
                  const impactoNetoEsteGasto = costoRealDelGasto - adelantoAplicadoDirectoAlGasto;
                  
                  if (impactoNetoEsteGasto > 0) {
                      totalImpactoEnAdelantoViajeCalculado += impactoNetoEsteGasto;
                  }
              });
          }
          
          const adelantoViajeMonto = viaje.monto_adelanto !== null ? viaje.monto_adelanto : 0;
          const saldoAdelantoViajeCalculado = adelantoViajeMonto - totalImpactoEnAdelantoViajeCalculado;

          return { 
            ...viaje, 
            total_gastado_bruto: totalGastadoBrutoCalculado,
            total_impacto_adelanto_viaje: totalImpactoEnAdelantoViajeCalculado,
            saldo_adelanto_viaje: saldoAdelantoViajeCalculado
          };
        })
      );
      viajes.value = viajesConInfoDeGastos;
      // console.log("ViajesListView: Viajes procesados con info de gastos:", JSON.parse(JSON.stringify(viajes.value)));
      // Limpiar mensajes si la carga fue exitosa y hay datos
      // successMessage.value = ''; // Se limpia al confirmar cierre o eliminar.
      errorMessage.value = ''; 
    }
  } catch (error) {
    console.error('ViajesListView: Error general en fetchViajesConGastos:', error.message, error);
    errorMessage.value = `No se pudieron cargar los viajes/períodos: ${error.message || 'Error desconocido.'}`;
    viajes.value = []; // Asegurar que la lista esté vacía en caso de error
  } finally {
    loading.value = false;
    console.log("ViajesListView: fetchViajesConGastos FIN, loading:", loading.value);
  }
};

// --- Hooks de Ciclo de Vida ---
onMounted(() => {
  console.log("ViajesListView: Componente MONTADO.");
  fetchViajesConGastos();
});

// ... (Bloque 1 y 2 anteriores) ...

// --- Funciones de Interacción y Navegación ---
const goToNuevoViaje = () => {
  router.push({ name: 'ViajeNuevo' });
};

const editarViaje = (viaje) => {
  if (!puedeModificarViaje(viaje)) { // Usa la función helper
    alert(`El Viaje/Período #${viaje.codigo_rendicion || viaje.id} ya está cerrado y no se puede editar.`);
    return;
  }
  router.push({ name: 'ViajeEditar', params: { id: viaje.id } });
};

const eliminarViaje = async (viaje) => {
  if (!puedeModificarViaje(viaje)) {
    alert(`El Viaje/Período #${viaje.codigo_rendicion || viaje.id} ya está cerrado y no se puede eliminar.`);
    return;
  }

  let gastosCount = 0;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado para verificar gastos.");

    const { count, error: countError } = await supabase
        .from('gastos')
        .select('*', { count: 'exact', head: true })
        .eq('viaje_id', viaje.id)
        .eq('user_id', user.id); // Solo contar gastos del usuario para este viaje
    if (countError) {
        console.warn("ViajesListView: No se pudo verificar si hay gastos asociados antes de eliminar viaje:", countError.message);
    }
    gastosCount = count || 0;
  } catch (e) {
    console.warn("ViajesListView: Excepción al verificar gastos asociados:", e.message);
  }

  const mensajeConfirmacion = gastosCount > 0
    ? `¿Estás seguro de que querés eliminar el Viaje/Período #${viaje.codigo_rendicion || viaje.id}? ¡ATENCIÓN: Se eliminarán también los ${gastosCount} gastos asociados a él (si la BD tiene CASCADE DELETE)!`
    : `¿Estás seguro de que querés eliminar el Viaje/Período #${viaje.codigo_rendicion || viaje.id}?`;

  if (!confirm(mensajeConfirmacion)) {
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = ''; 
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado para eliminar viaje.");

    // Si la FK gastos.viaje_id está configurada con ON DELETE CASCADE, Supabase/Postgres se encarga.
    const { error: viajeError } = await supabase
      .from('viajes')
      .delete()
      .eq('id', viaje.id)
      .eq('user_id', user.id); // Asegurar que solo el dueño pueda eliminar

    if (viajeError) throw viajeError;
    
    viajes.value = viajes.value.filter(v => v.id !== viaje.id); 
    successMessage.value = `Viaje / Período #${viaje.codigo_rendicion || viaje.id} eliminado correctamente.`;
    setTimeout(() => { if (successMessage.value.includes(String(viaje.codigo_rendicion || viaje.id))) successMessage.value = ''; }, 4000);


  } catch (error) {
    console.error('ViajesListView: Error eliminando viaje/periodo:', error.message);
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
  console.log("ViajesListView: Abriendo modal para cerrar viaje ID:", viaje.id, "Código:", viaje.codigo_rendicion);
  viajeACerrar.value = JSON.parse(JSON.stringify(viaje)); 
  observacionCierreInput.value = ''; // Siempre iniciar la observación vacía para un nuevo cierre
  // La fecha de fin se establecerá al momento del cierre, no se pide en el modal por ahora.
  errorMessage.value = ''; // Limpiar errores previos de la página
  successMessage.value = ''; // Limpiar mensajes de éxito previos
  mostrarModalCierre.value = true;
};

const cancelarCierre = () => {
  mostrarModalCierre.value = false;
  viajeACerrar.value = null;
  observacionCierreInput.value = '';
  errorMessage.value = ''; // Limpiar error del modal también
};

const confirmarCierreRendicion = async () => {
  if (!viajeACerrar.value) {
    // Este error se mostraría dentro del modal si el modal tiene un espacio para errores.
    // O podemos setear el errorMessage general.
    errorMessage.value = "Error interno: No hay viaje seleccionado para cerrar.";
    return;
  }

  loadingCierre.value = true;
  // Limpiar solo el error del modal, no el general de la página necesariamente
  // errorMessage.value = ''; 
  let modalErrorMessage = ''; // Error específico para el modal

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado para cerrar rendición.");

    // La fecha de fin será la fecha actual del momento del cierre.
    // La hora de cerrado_en también será la actual.
    const fechaActualISO = new Date().toISOString();
    const fechaFinParaGuardar = fechaActualISO.split('T')[0];

    const updates = {
      cerrado_en: fechaActualISO,
      fecha_fin: fechaFinParaViaje, 
      observacion_cierre: observacionCierreInput.value.trim() || null,
    };

    console.log(`ViajesListView: Confirmando cierre para viaje ID: ${viajeACerrar.value.id}. Updates:`, updates);

    const { data: updatedViaje, error } = await supabase
      .from('viajes')
      .update(updates)
      .eq('id', viajeACerrar.value.id)
      .eq('user_id', user.id) 
      .select('*, codigo_rendicion, cerrado_en, observacion_cierre, fecha_fin')
      .single();

    if (error) {
      console.error("Error al cerrar la rendición en Supabase:", error);
      throw error;
    }

    console.log("Viaje cerrado exitosamente en Supabase:", updatedViaje);

    const index = viajes.value.findIndex(v => v.id === viajeACerrar.value.id);
    if (index !== -1 && updatedViaje) {
      viajes.value.splice(index, 1, updatedViaje); 
    }
    
    successMessage.value = `¡El Viaje/Período #${updatedViaje.codigo_rendicion} ha sido cerrado exitosamente!`;
    // No limpiar successMessage aquí, dejar que se vea en la página principal.
    // setTimeout(() => successMessage.value = '', 4000); // Se limpiará al recargar o en otra acción.

    mostrarModalCierre.value = false; 
    viajeACerrar.value = null;      
    observacionCierreInput.value = ''; 

  } catch (error) {
    console.error("Error en confirmarCierreRendicion:", error.message);
    // Este error se podría mostrar dentro del modal.
    // Por ahora, lo ponemos en el errorMessage general de la página.
    errorMessage.value = "Error al cerrar la rendición: " + error.message;
  } finally {
    loadingCierre.value = false;
  }
};

</script>
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary tracking-tight">Mis Viajes / Períodos de Rendición</h1>
      <button
        @click="goToNuevoViaje"
        class="w-full sm:w-auto bg-districorr-accent text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-opacity-85 transition duration-150 ease-in-out shadow-md hover:shadow-lg flex items-center justify-center transform hover:scale-103"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Nuevo Viaje/Período
      </button>
    </div>

    <!-- Mensajes de feedback Globales para la vista -->
    <div v-if="successMessage" class="mb-6 p-3.5 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-md text-sm shadow-md transition-all duration-300">
      <p class="font-medium">¡Éxito!</p>
      <p>{{ successMessage }}</p>
    </div>
    <div v-if="errorMessage && !loadingCierre" class="mb-6 p-3.5 bg-red-100 border-l-4 border-red-600 text-red-700 rounded-md text-sm shadow-md transition-all duration-300">
       <p class="font-medium">Error:</p>
      <p class="whitespace-pre-line">{{ errorMessage }}</p>
    </div>

    <!-- Indicador de Carga Principal -->
    <div v-if="loading && viajes.length === 0" class="text-center py-16">
      <svg class="animate-spin h-12 w-12 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
         <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
         <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
       </svg>
      <p class="text-lg text-gray-600 mt-4">Cargando viajes y períodos...</p>
    </div>
    <!-- Mensaje si no hay viajes (después de cargar y sin errores) -->
    <div v-else-if="!loading && viajes.length === 0 && !errorMessage" class="bg-white p-10 rounded-xl shadow-lg text-center border border-gray-200">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-20 h-20 mx-auto text-gray-300 mb-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.375 3.083a2.5 2.5 0 013.25 0l7.167 6.45a2.5 2.5 0 010 3.934l-7.167 6.45a2.5 2.5 0 01-3.25 0V3.083zM4.5 3.083v17.834m0-17.834h1.917m-1.917 17.834h1.917" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.375 3.083a2.5 2.5 0 013.25 0l7.167 6.45a2.5 2.5 0 010 3.934l-7.167 6.45a2.5 2.5 0 01-3.25 0V3.083zM4.5 3.083v17.834m0-17.834h1.917m-1.917 17.834h1.917M8.25 8.25h7.5M8.25 12h5.25M8.25 15.75h3" />
      </svg>
      <p class="text-gray-700 text-xl font-semibold">No hay Viajes o Períodos Registrados</p>
      <p class="mt-2 text-sm text-gray-500">Comienza creando un nuevo registro para organizar tus gastos y rendiciones.</p>
      <button
         @click="goToNuevoViaje"
         class="mt-6 bg-districorr-accent text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-opacity-85 shadow-md hover:shadow-lg transition-all"
       >
         Crear Primer Registro
       </button>
    </div>

    <!-- Lista de Viajes -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div v-for="viaje in viajes" :key="viaje.id" 
           class="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col justify-between hover:shadow-2xl transition-all duration-300 ease-in-out border-t-4"
           :class="viaje.cerrado_en ? 'border-red-400' : 'border-green-400'" >
        <div class="p-5 flex-grow">
          <div class="flex justify-between items-start mb-2">
            <h2 class="text-base sm:text-lg font-semibold text-districorr-primary truncate flex-1 mr-2 leading-tight" :title="viaje.nombre_viaje">
              {{ viaje.nombre_viaje }}
            </h2>
            <span v-if="viaje.codigo_rendicion" 
                  class="text-xs font-mono bg-gray-200 text-gray-800 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap shadow-sm">
              ID: #{{ viaje.codigo_rendicion }}
            </span>
          </div>
          <p class="text-xs font-bold mb-3 uppercase tracking-wider flex items-center"
             :class="viaje.cerrado_en ? 'text-red-600' : 'text-green-600'">
            <svg v-if="viaje.cerrado_en" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v3H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2.5a2.5 2.5 0 00-2.5 2.5V9h5V7a2.5 2.5 0 00-2.5-2.5z" /></svg>
            {{ getEstadoViajeTexto(viaje) }}
          </p>
          <div class="text-sm text-gray-700 space-y-1">
            <p><span class="font-medium text-gray-500">Destino/Área:</span> {{ viaje.destino || 'No especificado' }}</p>
            <p><span class="font-medium text-gray-500">Inicio:</span> {{ formatDate(viaje.fecha_inicio) }}</p>
            <p><span class="font-medium text-gray-500">Fin:</span> 
              <span v-if="viaje.fecha_fin">{{ formatDate(viaje.fecha_fin) }}</span>
              <span v-else-if="viaje.cerrado_en" class="italic text-gray-500">No definida</span>
              <span v-else class="italic text-gray-500">En curso</span>
            </p>
          </div>
          <p v-if="viaje.cerrado_en && viaje.observacion_cierre" class="mt-2.5 text-xs text-gray-600 italic bg-gray-100 p-2 rounded-md border-l-2 border-gray-300 max-h-16 overflow-y-auto">
            <strong>Obs. Cierre:</strong> {{ viaje.observacion_cierre }}
          </p>
          
          <div class="mt-4 pt-4 border-t border-gray-200">
            <p class="text-sm text-gray-700"><span class="font-medium text-gray-500">Adelanto del Viaje:</span> <span class="font-semibold">{{ formatCurrency(viaje.monto_adelanto) }}</span></p>
            <p class="text-xs text-gray-500 mt-1">Gastos (Costo Bruto Total): {{ formatCurrency(viaje.total_gastado_bruto) }}</p>
            <p class="text-xs text-gray-500">Impacto Neto en Adelanto: {{ formatCurrency(viaje.total_impacto_adelanto_viaje) }}</p>
            <p class="text-base mt-2 font-semibold" :class="viaje.saldo_adelanto_viaje >= 0 ? 'text-green-600' : 'text-red-600'">
              <span class="font-medium">Saldo del Viaje:</span> {{ formatCurrency(viaje.saldo_adelanto_viaje) }}
              <span v-if="viaje.saldo_adelanto_viaje < 0 && (viaje.monto_adelanto || 0) > 0" class="text-xs font-normal">(A reponer)</span>
            </p>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-wrap gap-2 justify-end items-center" :class="{'bg-gray-200/70': viaje.cerrado_en}">
          <button v-if="puedeModificarViaje(viaje)"
                  @click="abrirModalCierreRendicion(viaje)"
                  title="Cerrar este período de rendición"
                  class="text-xs bg-orange-500 text-white hover:bg-orange-600 font-medium py-1.5 px-3 rounded-md transition duration-150 shadow-sm hover:shadow-md">
            Cerrar Rendición
          </button>
          <button @click="router.push({ name: 'GastosList', query: { viajeId: viaje.id } })" 
                  title="Ver o agregar gastos a este viaje/período"
                  class="text-xs bg-blue-500 text-white hover:bg-blue-600 font-medium py-1.5 px-3 rounded-md transition duration-150 shadow-sm hover:shadow-md">
            Ver/Cargar Gastos
          </button>
          <button @click="editarViaje(viaje)" 
                  :disabled="!puedeModificarViaje(viaje)"
                  title="Editar detalles de este viaje/período (solo si está en curso)"
                  class="text-xs bg-yellow-400 text-yellow-900 hover:bg-yellow-500 font-medium py-1.5 px-3 rounded-md transition duration-150 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            Editar
          </button>
          <button @click="eliminarViaje(viaje)" 
                  :disabled="!puedeModificarViaje(viaje)"
                  title="Eliminar este viaje/período (solo si está en curso)"
                  class="text-xs bg-red-500 text-white hover:bg-red-600 font-medium py-1.5 px-3 rounded-md transition duration-150 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            Eliminar
          </button>
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
          <!-- Mostrar errores específicos del modal aquí si es necesario -->
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

<style scoped>
/* Puedes añadir estilos para el backdrop-blur si Tailwind no lo soporta nativamente en tu versión,
   o para asegurar que el modal esté siempre encima de todo. */
</style>