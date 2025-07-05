<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../supabaseClient.js'; 
import { useRouter, useRoute } from 'vue-router'; // useRouter para la navegación

console.log("ViajeFormView.vue (Corregido): Script setup INICIADO");

const router = useRouter(); // Instancia del router para navegar
const route = useRoute();   // Para acceder a parámetros de ruta como viajeId

// Props: viajeId se pasará a través de la ruta si props:true está en la definición de la ruta
// o se puede leer directamente de route.params.id
const viajeIdFromRoute = computed(() => route.params.id || null);

const form = ref({
  id: null,
  nombre_viaje: '',
  destino: '',
  fecha_inicio: new Date().toISOString().split('T')[0],
  fecha_fin: null,
  monto_adelanto: 0,
});

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const isEditMode = computed(() => !!viajeIdFromRoute.value); // Basado en el parámetro de la ruta
const pageTitle = computed(() => isEditMode.value ? 'Editar Viaje / Período' : 'Registrar Nuevo Viaje / Período');

const conceptosSugeridos = ref([
  'Viaje Ventas Interior',
  'Rendición Compras Oficina Mensual',
  'Logística Cliente Principal',
  'Asistencia Quirúrgica',
  'Visita a Sucursal',
  'Capacitación Externa',
  'Período de Rendición General',
  'Adelanto para Gastos Varios'
]);

onMounted(async () => {
  console.log("ViajeFormView.vue: Componente MONTADO. Modo Edición:", isEditMode.value, "Viaje ID:", viajeIdFromRoute.value);
  if (isEditMode.value && viajeIdFromRoute.value) {
    loading.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    try {
      console.log(`ViajeFormView.vue: Cargando datos para editar viaje ID: ${viajeIdFromRoute.value}`);
      const { data: viajeData, error } = await supabase
        .from('viajes')
        .select('id, nombre_viaje, destino, fecha_inicio, fecha_fin, monto_adelanto') 
        .eq('id', viajeIdFromRoute.value)
        .single();

      if (error) throw error;

      if (viajeData) {
        console.log("ViajeFormView.vue: Datos cargados para edición:", viajeData);
        form.value.id = viajeData.id;
        form.value.nombre_viaje = viajeData.nombre_viaje || '';
        form.value.destino = viajeData.destino || '';
        form.value.fecha_inicio = viajeData.fecha_inicio ? viajeData.fecha_inicio.split('T')[0] : new Date().toISOString().split('T')[0];
        form.value.fecha_fin = viajeData.fecha_fin ? viajeData.fecha_fin.split('T')[0] : null;
        form.value.monto_adelanto = parseFloat(viajeData.monto_adelanto) || 0;
      } else {
        errorMessage.value = "No se encontró el viaje/período especificado para editar.";
      }
    } catch (error) {
      console.error("ViajeFormView.vue: Error al cargar datos del viaje:", error.message);
      errorMessage.value = `Error al cargar los datos del viaje: ${error.message || 'Error desconocido.'}`;
    } finally {
      loading.value = false;
    }
  } else {
    console.log("ViajeFormView.vue: Modo Creación. Formulario inicializado.");
    form.value = {
        id: null, nombre_viaje: '', destino: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: null, monto_adelanto: 0,
    };
  }
});

const handleSubmit = async () => {
  console.log("ViajeFormView.vue: handleSubmit INICIO. Modo Edición:", isEditMode.value);
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  if (!form.value.nombre_viaje.trim()) {
    errorMessage.value = "El concepto o nombre del viaje/período es obligatorio.";
    loading.value = false; return;
  }
  if (!form.value.fecha_inicio) {
    errorMessage.value = "La fecha de inicio es obligatoria.";
    loading.value = false; return;
  }
  if (form.value.monto_adelanto === null || isNaN(parseFloat(form.value.monto_adelanto))) {
    errorMessage.value = "El monto de adelanto es obligatorio y debe ser un número (puede ser 0).";
    loading.value = false; return;
  }
  if (form.value.fecha_fin && form.value.fecha_inicio > form.value.fecha_fin) {
    errorMessage.value = "La fecha de fin no puede ser anterior a la fecha de inicio.";
    loading.value = false; return;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      errorMessage.value = "Usuario no autenticado. Por favor, inicia sesión de nuevo.";
      loading.value = false;
      router.push({ name: 'Login' }); // Redirigir a login si no hay usuario
      return;
    }

    const payload = {
      nombre_viaje: form.value.nombre_viaje.trim(),
      destino: form.value.destino ? form.value.destino.trim() : null,
      fecha_inicio: form.value.fecha_inicio,
      monto_adelanto: parseFloat(form.value.monto_adelanto) || 0,
      fecha_fin: form.value.fecha_fin || null, // Enviar null si está vacío
    };

    let resultData;
    let resultError;

    if (isEditMode.value) {
      console.log("ViajeFormView.vue: Actualizando viaje ID", viajeIdFromRoute.value, "con payload:", payload);
      const { data, error } = await supabase
        .from('viajes')
        .update(payload) 
        .eq('id', viajeIdFromRoute.value)
        .select()
        .single();
      resultData = data;
      resultError = error;
    } else {
      payload.user_id = user.id; // Añadir user_id solo en creación
      console.log("ViajeFormView.vue: Creando nuevo viaje con payload:", payload);
      const { data, error } = await supabase
        .from('viajes')
        .insert(payload)
        .select()
        .single(); 
      resultData = data;
      resultError = error;
    }

    if (resultError) throw resultError;

    console.log("ViajeFormView.vue: Viaje guardado/actualizado:", resultData);
    successMessage.value = isEditMode.value ? '¡Viaje/Período actualizado!' : '¡Viaje/Período registrado!';
    
    // Después de guardar, redirigir a la lista de viajes
    setTimeout(() => {
        router.push({ name: 'ViajesListUser' });
    }, 1500); // Pequeño delay para que el usuario vea el mensaje de éxito

  } catch (error) {
    console.error('ViajeFormView.vue: Error en handleSubmit:', error);
    errorMessage.value = `Error al guardar: ${error.message || 'Error desconocido.'}`;
  } finally {
    loading.value = false;
    console.log("ViajeFormView.vue: handleSubmit FIN");
  }
};

// ***** FUNCIÓN PARA EL BOTÓN CANCELAR *****
const handleCancel = () => {
  console.log("ViajeFormView.vue: Clic en Cancelar. Navegando a ViajesListUser.");
  // Idealmente, si estamos editando, podríamos querer volver al detalle del viaje o a la lista.
  // Si estamos creando, a la lista.
  // Por simplicidad, siempre a la lista de viajes del usuario.
  router.push({ name: 'ViajesListUser' });
};
// *****************************************

console.log("ViajeFormView.vue (Corregido): Script setup FINALIZADO");
</script>
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="bg-white p-6 sm:p-8 rounded-xl shadow-xl border border-gray-200/80 max-w-3xl mx-auto">
      <h3 class="text-2xl font-semibold text-districorr-primary mb-6 sm:mb-8 text-center">
        {{ pageTitle }}
      </h3>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <div>
          <label for="nombre_viaje" class="form-label">
            Concepto / Nombre del Viaje o Período <span class="text-red-500">*</span>
          </label>
          <input 
            type="text" 
            id="nombre_viaje" 
            v-model.trim="form.nombre_viaje" 
            list="conceptos-viaje-list" 
            required
            placeholder="Ej: Viaje Ventas Rosario, Rendición Compras Mayo"
            class="form-input"
          />
          <datalist id="conceptos-viaje-list">
            <option v-for="concepto in conceptosSugeridos" :key="concepto" :value="concepto"></option>
          </datalist>
          <p class="form-hint">Un nombre descriptivo para identificar esta rendición.</p>
        </div>

        <div>
          <label for="destino" class="form-label">
            Destino / Área <span class="text-gray-500 text-xs">(Opcional)</span>
          </label>
          <input 
            type="text" 
            id="destino" 
            v-model.trim="form.destino"
            placeholder="Ej: Rosario, Santa Fe / Compras Oficina Central"
            class="form-input"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-start">
          <div>
            <label for="fecha_inicio" class="form-label">
              Fecha de Inicio <span class="text-red-500">*</span>
            </label>
            <input 
              type="date" 
              id="fecha_inicio" 
              v-model="form.fecha_inicio" 
              required
              class="form-input"
            />
          </div>

          <div>
            <label for="fecha_fin" class="form-label">
              Fecha de Fin <span class="text-gray-500 text-xs">(Si ya finalizó)</span>
            </label>
            <input 
              type="date" 
              id="fecha_fin" 
              v-model="form.fecha_fin"
              :min="form.fecha_inicio" 
              class="form-input"
              aria-describedby="fecha_fin_helper_text"
            />
            <p id="fecha_fin_helper_text" class="form-hint">
              {{ isEditMode ? 'Dejar en blanco si el período aún está en curso.' : 'Se establece al cerrar la rendición.' }}
            </p>
          </div>
        </div>

        <div>
          <label for="monto_adelanto" class="form-label">
            Monto de Adelanto Recibido <span class="text-red-500">*</span>
          </label>
          <div class="relative rounded-md shadow-sm">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span class="text-gray-500 sm:text-sm">$</span>
              </div>
              <input 
                type="number" 
                id="monto_adelanto" 
                v-model.number="form.monto_adelanto" 
                step="0.01" 
                required
                placeholder="0.00"
                class="form-input pl-7" 
              />
          </div>
          <p class="form-hint">Monto total del adelanto principal para este viaje/período. Puede ser 0.</p>
        </div>

        <!-- Mensajes de Feedback -->
        <div v-if="errorMessage" class="form-message error-message" role="alert">
          <p class="font-semibold">Error:</p>
          <p class="whitespace-pre-line mt-1">{{ errorMessage }}</p>
        </div>
        <div v-if="successMessage && !errorMessage" class="form-message success-message" role="alert">
          {{ successMessage }}
        </div>

        <!-- Botones de Acción -->
        <div class="flex flex-col sm:flex-row justify-end items-center space-y-3 sm:space-y-0 sm:space-x-4 pt-5 border-t border-gray-200 mt-8">
          <button 
            type="button" 
            @click="handleCancel"
            class="btn btn-secondary-outline w-full sm:w-auto"
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            :disabled="loading"
            class="btn btn-primary w-full sm:w-auto group"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2.5 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="group-hover:tracking-wider transition-all">
              <span v-if="loading">Guardando...</span>
              <span v-else>{{ isEditMode ? 'Actualizar Viaje/Período' : 'Registrar Viaje/Período' }}</span>
            </span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
<style scoped>
.form-label {
  @apply block text-sm font-medium text-gray-700 mb-1.5;
}

.form-input {
  @apply block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm 
         placeholder-gray-400 
         focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent 
         sm:text-sm transition-colors duration-150 ease-in-out;
}

.form-select {
  @apply bg-white;
}

.form-hint {
  @apply mt-1.5 text-xs text-gray-500;
}

.form-message {
  @apply my-4 p-3.5 border-l-4 rounded-r-md text-sm shadow-md;
}
.error-message {
  @apply bg-red-50 border-red-500 text-red-700;
}
.success-message {
  @apply bg-green-50 border-green-500 text-green-700;
}

.btn {
  @apply px-6 py-2.5 rounded-lg shadow-sm text-sm font-medium 
         transition-all duration-150 ease-in-out
         focus:outline-none focus:ring-2 focus:ring-offset-2 
         disabled:opacity-60 disabled:cursor-not-allowed
         flex justify-center items-center;
}

.btn-primary {
  @apply bg-districorr-primary text-white hover:bg-opacity-85 focus:ring-districorr-accent transform active:scale-95;
}

.btn-secondary-outline {
  @apply border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-gray-400 transform active:scale-95;
}

input[type="date"]::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.6;
}
input[type="date"]::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
}
</style>
