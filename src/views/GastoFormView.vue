<script setup>
import { ref, computed, watch, onMounted, inject } from 'vue'; // 'computed' importado aquí una sola vez
import { useRouter, useRoute } from 'vue-router';
import GastoForm from '../components/GastoForm.vue'; // Asegúrate que la ruta al componente sea correcta
import { supabase } from '../supabaseClient.js'; // Necesario para fetchNombreFormato

const router = useRouter();
const route = useRoute();

// Inyectar userProfile que es proveído desde App.vue
const userProfile = inject('userProfile', ref(null));

const gastoIdToEdit = ref(route.params.id || null);
const viajeIdPredeterminadoQuery = ref(route.query.viajeId || null);

const loadingView = ref(true); // Para controlar la carga inicial de esta vista (ej. info del formato)
const tituloFormulario = ref('Registrar Nuevo Gasto'); // Título dinámico
const nombreDelFormatoActual = ref(''); // Para mostrar el nombre del formato

// Determina el formatoId que se pasará al GastoForm.
// Para nuevos gastos, usa el predeterminado del perfil.
// Para edición, GastoForm.vue cargará el formato_id del gasto existente (pasamos null aquí).
const formatoIdParaGastoForm = computed(() => {
  if (gastoIdToEdit.value) { // Modo Edición
    console.log('GastoFormView: Modo EDICIÓN. GastoForm cargará su propio formato_id. Gasto ID:', gastoIdToEdit.value);
    return null; // GastoForm.vue se encargará de obtener el formato_id del gasto existente
  }
  // Modo Creación: usar el formato predeterminado del perfil del usuario
  if (userProfile.value && userProfile.value.formato_predeterminado_id !== null && userProfile.value.formato_predeterminado_id !== undefined) {
    console.log('GastoFormView: Modo CREACIÓN. Usando formato_predeterminado_id del perfil:', userProfile.value.formato_predeterminado_id);
    return userProfile.value.formato_predeterminado_id;
  }
  console.warn('GastoFormView: Modo CREACIÓN, pero no se pudo determinar un formato_predeterminado_id desde el perfil. userProfile:', userProfile.value ? JSON.parse(JSON.stringify(userProfile.value)) : 'userProfile es null');
  return null; // Fallback si no hay formato predeterminado (GastoForm.vue debería manejar esto o mostrar error)
});

// Propiedad computada para determinar si estamos en modo de desarrollo
const isDevelopmentMode = computed(() => import.meta.env.DEV);

async function fetchNombreFormato(formatoId) {
  if (!formatoId) {
    nombreDelFormatoActual.value = gastoIdToEdit.value ? 'Formato del Gasto Existente' : 'Formato General/No Especificado';
    return;
  }
  loadingView.value = true; // Indicar carga del nombre del formato
  try {
    const { data, error } = await supabase
      .from('formatos_gasto_config')
      .select('nombre_formato')
      .eq('id', formatoId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: No rows found
        throw error;
    }
    if (data) {
      nombreDelFormatoActual.value = data.nombre_formato;
    } else {
      nombreDelFormatoActual.value = `ID ${formatoId} (Formato no encontrado)`;
      console.warn(`GastoFormView: Formato con ID ${formatoId} no encontrado.`);
    }
  } catch (err) {
    console.error('GastoFormView: Error cargando nombre del formato:', err.message);
    nombreDelFormatoActual.value = 'Error al cargar nombre';
  } finally {
    loadingView.value = false;
  }
}

// Watcher para formatoIdParaGastoForm (que depende de userProfile y gastoIdToEdit)
// Este watcher se encarga de actualizar el título y cargar el nombre del formato.
watch(formatoIdParaGastoForm, (newFormatoId, oldFormatoId) => {
  console.log('GastoFormView: Watcher formatoIdParaGastoForm. Nuevo ID:', newFormatoId, 'Viejo ID:', oldFormatoId);
  if (gastoIdToEdit.value) {
    tituloFormulario.value = 'Modificar Gasto Existente';
    // Para edición, el nombre del formato se podría obtener junto con los datos del gasto si fuera necesario mostrarlo aquí.
    // O GastoForm.vue podría emitir el nombre del formato una vez cargado.
    // Por ahora, lo dejamos genérico para edición en esta vista.
    nombreDelFormatoActual.value = ''; // Se podría cargar después si es necesario.
    loadingView.value = false; // En modo edición, la vista principal no espera por el nombre del formato aquí.
  } else { // Modo Creación
    tituloFormulario.value = 'Registrar Nuevo Gasto';
    if (newFormatoId) {
      fetchNombreFormato(newFormatoId);
    } else {
      nombreDelFormatoActual.value = 'No asignado / General';
      loadingView.value = false; // No hay formato ID para buscar, así que no hay que esperar.
    }
  }
}, { immediate: true }); // immediate:true para que se ejecute al montar el componente

// Watcher para userProfile (por si se carga después de que el componente se monte)
watch(userProfile, (newProfile, oldProfile) => {
    // Este log es útil para debuggear cuándo se actualiza el perfil inyectado.
    console.log('GastoFormView: userProfile (inyectado) ha cambiado:', newProfile ? JSON.parse(JSON.stringify(newProfile)) : null);
    // La propiedad computada `formatoIdParaGastoForm` reaccionará a este cambio y su watcher se disparará.
    // Si estamos en modo creación y el formato predeterminado cambia, el watcher de formatoIdParaGastoForm
    // debería llamar a fetchNombreFormato.
    if (!gastoIdToEdit.value && newProfile && oldProfile?.formato_predeterminado_id !== newProfile.formato_predeterminado_id) {
        // No es necesario llamar a fetchNombreFormato directamente aquí,
        // el watcher de formatoIdParaGastoForm lo hará.
    }
}, { deep: true });


onMounted(() => {
  console.log('GastoFormView: Componente Montado.');
  console.log('GastoFormView: gastoIdToEdit (desde params):', gastoIdToEdit.value);
  console.log('GastoFormView: viajeIdPredeterminadoQuery (desde query):', viajeIdPredeterminadoQuery.value);
  console.log('GastoFormView: userProfile INICIAL (inyectado en mounted):', userProfile.value ? JSON.parse(JSON.stringify(userProfile.value)) : 'userProfile es null o undefined');
  
  // La lógica principal de `formatoIdParaGastoForm` y su watcher con `immediate: true`
  // se encarga de la configuración inicial del título y la carga del nombre del formato.
  // Si no estamos editando y no hay un formatoID para GastoForm inicialmente (ej. userProfile tarda en cargar),
  // el `loadingView` se pondrá en `false` por el watcher de formatoIdParaGastoForm.
  if (!gastoIdToEdit.value && !formatoIdParaGastoForm.value) {
      loadingView.value = false; // Asegurar que no se quede cargando si no hay formato que buscar
  }
});

const handleGastoGuardado = (gastoGuardado) => {
  console.log('GastoFormView: Evento "gastoGuardado" recibido con:', gastoGuardado);
  alert('¡Gasto procesado con éxito!'); // Feedback simple, GastoForm ya da uno más específico.

  // Redirigir a la lista de gastos, idealmente filtrada por el viaje si el gasto guardado tiene uno.
  if (gastoGuardado && gastoGuardado.viaje_id) {
    router.push({ name: 'GastosList', query: { viajeId: gastoGuardado.viaje_id } });
  } else if (viajeIdPredeterminadoQuery.value) { // Si veníamos de un viaje específico
    router.push({ name: 'GastosList', query: { viajeId: viajeIdPredeterminadoQuery.value } });
  }
  else {
    router.push({ name: 'GastosList' }); // Fallback a la lista general
  }
};

const handleCancelar = () => {
  // Volver a la página anterior o a una específica
  if (viajeIdPredeterminadoQuery.value) {
    router.push({ name: 'GastosList', query: { viajeId: viajeIdPredeterminadoQuery.value } });
  } else if (route.meta.from === 'ViajesList') { // Esto es un ejemplo, necesitarías pasar esta info en la navegación
    router.push({ name: 'ViajesList' });
  } else if (gastoIdToEdit.value) { // Si estaba editando, quizás volver a la lista general
    router.push({ name: 'GastosList'});
  }
  else {
    router.back(); // Opción más simple para "volver atrás"
  }
};
</script>
<template>
  <div class="min-h-screen bg-gray-100/50 py-6 sm:py-8 lg:py-12">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

      <!-- Botón Volver y Título de la Vista -->
      <div class="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button @click="handleCancelar" 
                  class="text-sm text-districorr-accent hover:text-districorr-primary font-medium inline-flex items-center transition-colors duration-150 group">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" 
                 class="w-5 h-5 mr-1.5 transform group-hover:-translate-x-0.5 transition-transform duration-150">
              <path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd" />
            </svg>
            Volver
          </button>
          <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary mt-1 tracking-tight">
            {{ gastoIdToEdit ? 'Modificar Gasto Existente' : 'Registrar Nuevo Gasto' }}
          </h1>
          <p v-if="!gastoIdToEdit && nombreDelFormatoActual" class="text-sm text-districorr-text-medium mt-1">
            Formato aplicado: <span class="font-semibold">{{ nombreDelFormatoActual }}</span>
          </p>
        </div>
      </div>

      <!-- Bloque de DEBUG (solo en desarrollo) -->
      <div v-if="isDevelopmentMode" class="mb-6 p-4 bg-yellow-50 text-xs border border-yellow-300 rounded-lg shadow-sm">
        <p class="font-bold text-yellow-700 mb-1.5">DEBUG - GastoFormView (Vista contenedora):</p>
        <ul class="space-y-0.5 text-yellow-600">
          <li>ID Gasto a Editar (param): <span class="font-mono bg-yellow-100 px-1 rounded">{{ gastoIdToEdit || 'Ninguno (Nuevo)' }}</span></li>
          <li>Viaje ID Predeterminado (query): <span class="font-mono bg-yellow-100 px-1 rounded">{{ viajeIdPredeterminadoQuery || 'Ninguno' }}</span></li>
          <li>Formato ID para GastoForm (prop): <span class="font-mono bg-yellow-100 px-1 rounded">{{ formatoIdParaGastoForm === null ? 'null (edición)' : formatoIdParaGastoForm }}</span></li>
          <li>User Profile Inyectado: <span class="font-mono bg-yellow-100 px-1 rounded">rol={{ userProfile?.rol }}, formato_id={{ userProfile?.formato_predeterminado_id }}</span></li>
          <li>Nombre Formato Actual (vista): <span class="font-mono bg-yellow-100 px-1 rounded">{{ nombreDelFormatoActual }}</span></li>
          <li>loadingView (vista): <span class="font-mono bg-yellow-100 px-1 rounded">{{ loadingView }}</span></li>
        </ul>
      </div>

      <!-- Contenedor del Componente GastoForm -->
      <!-- GastoForm.vue ya tiene su propio padding y shadow, por lo que no necesitamos envolverlo en otra tarjeta aquí,
           a menos que queramos un efecto de tarjeta anidada o un borde/fondo diferente alrededor del formulario. -->
      
      <div v-if="loadingView && !gastoIdToEdit" class="text-center py-12">
        <svg class="animate-spin h-10 w-10 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="mt-3 text-gray-600">Cargando detalles del formato...</p>
      </div>
      
      <GastoForm
        v-else-if="formatoIdParaGastoForm || gastoIdToEdit"
        :key="gastoIdToEdit || (formatoIdParaGastoForm ? formatoIdParaGastoForm.toString() : 'nuevo-gasto')"
        :gasto-id="gastoIdToEdit"
        :viaje-id-predeterminado="viajeIdPredeterminadoQuery"
        :formato-id-usuario="formatoIdParaGastoForm"
        @gasto-guardado="handleGastoGuardado"
        @cancelar="handleCancelar"
      />
      <div v-else class="bg-white p-8 rounded-xl shadow-lg text-center border border-red-200">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-red-600 font-semibold text-lg">No se Pudo Cargar el Formulario</p>
        <p class="text-sm text-gray-500 mt-2">
          No se pudo determinar el formato de gasto necesario. 
          Asegúrate de tener un formato predeterminado asignado a tu perfil en la configuración de administrador,
          o que se esté pasando un formato válido si esta vista lo requiere.
        </p>
        <button @click="handleCancelar" class="mt-6 px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium">
            Volver
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Estilos específicos para esta vista si fueran necesarios */
</style>