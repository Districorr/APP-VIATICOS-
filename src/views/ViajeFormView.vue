<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../supabaseClient.js'; // Ajusta la ruta si es necesario

const props = defineProps({
  viajeId: { // ID del viaje si estamos editando, null o undefined si es nuevo
    type: [String, Number],
    default: null
  }
});

const emit = defineEmits(['viajeGuardado', 'cancelar']);

const form = ref({
  id: null,
  nombre_viaje: '',       // Para el input con datalist
  destino: '',
  fecha_inicio: new Date().toISOString().split('T')[0], // Default a hoy
  fecha_fin: null,          // Se inicializa como null, no se pide al crear
  monto_adelanto: null,    // Lo hacemos numérico, podría ser 0
  // user_id se añadirá en handleSubmit
});

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref(''); // Para feedback al usuario

const isEditMode = computed(() => !!props.viajeId);
const pageTitle = computed(() => isEditMode.value ? 'Editar Viaje / Período' : 'Registrar Nuevo Viaje / Período');

// Opciones predefinidas para el datalist del nombre del viaje/concepto
// En una app más grande, esto podría venir de la BD o ser configurable
const conceptosSugeridos = ref([
  'Viaje Ventas Interior',
  'Rendición Compras Oficina Mensual',
  'Logística Cliente Principal',
  'Asistencia Quirúrgica (Nombre Hospital/Doctor)',
  'Visita a Sucursal (Nombre Sucursal)',
  'Capacitación Externa',
  'Período de Rendición General'
]);
onMounted(async () => {
  console.log("ViajeForm: Montado. Edit Mode:", isEditMode.value, "Viaje ID:", props.viajeId);
  if (isEditMode.value && props.viajeId) {
    loading.value = true;
    errorMessage.value = '';
    try {
      const { data: viajeData, error } = await supabase
        .from('viajes')
        .select('*') // Seleccionar todas las columnas para llenar el formulario
        .eq('id', props.viajeId)
        .single();

      if (error) {
        console.error("Error cargando datos del viaje para editar:", error);
        throw error;
      }

      if (viajeData) {
        console.log("ViajeForm: Datos cargados para edición:", viajeData);
        form.value.id = viajeData.id;
        form.value.nombre_viaje = viajeData.nombre_viaje;
        form.value.destino = viajeData.destino;
        form.value.fecha_inicio = viajeData.fecha_inicio ? viajeData.fecha_inicio.split('T')[0] : new Date().toISOString().split('T')[0];
        // fecha_fin solo se carga si existe, de lo contrario permanece null
        form.value.fecha_fin = viajeData.fecha_fin ? viajeData.fecha_fin.split('T')[0] : null;
        form.value.monto_adelanto = viajeData.monto_adelanto;
        // Cargar otras columnas si las tienes (ej. cerrado_en, observacion_cierre, pero estas no se editan aquí directamente)
      } else {
        errorMessage.value = "No se encontró el viaje/período para editar.";
        console.warn("ViajeForm: No se encontraron datos para el viaje ID:", props.viajeId);
      }
    } catch (error) {
      errorMessage.value = `Error al cargar los datos del viaje: ${error.message}`;
    } finally {
      loading.value = false;
    }
  } else {
    // Modo Creación: Asegurar que fecha_fin sea null y monto_adelanto tenga un valor numérico inicial
    form.value.fecha_fin = null;
    form.value.monto_adelanto = form.value.monto_adelanto === null ? 0 : parseFloat(form.value.monto_adelanto) || 0; // Default a 0 si es null/undefined/NaN
    console.log("ViajeForm: Modo Creación, formulario inicializado:", JSON.parse(JSON.stringify(form.value)));
  }
});

const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  // Validaciones básicas
  if (!form.value.nombre_viaje.trim()) {
    errorMessage.value = "El concepto o nombre del viaje/período es obligatorio.";
    loading.value = false;
    return;
  }
  if (!form.value.fecha_inicio) {
    errorMessage.value = "La fecha de inicio es obligatoria.";
    loading.value = false;
    return;
  }
  // Monto de adelanto es obligatorio y debe ser numérico (puede ser 0)
  if (form.value.monto_adelanto === null || form.value.monto_adelanto === undefined || isNaN(parseFloat(form.value.monto_adelanto))) {
    errorMessage.value = "El monto de adelanto es obligatorio y debe ser un número (puede ser 0).";
    loading.value = false;
    return;
  }


  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const payload = {
      nombre_viaje: form.value.nombre_viaje.trim(),
      destino: form.value.destino ? form.value.destino.trim() : null,
      fecha_inicio: form.value.fecha_inicio,
      // fecha_fin: solo se envía si tiene valor (en edición).
      // Al crear, no se envía o se envía como null si la BD lo requiere explícitamente,
      // pero como es nullable, no enviarlo es suficiente si el default es NULL.
      monto_adelanto: parseFloat(form.value.monto_adelanto) || 0,
      user_id: user.id, // Siempre asignar el user_id
    };

    // Solo incluir fecha_fin en el payload si tiene un valor.
    // Si está en modo edición y el usuario borra la fecha_fin, se enviará como null.
    if (form.value.fecha_fin) {
      payload.fecha_fin = form.value.fecha_fin;
    } else {
      // Si no hay fecha_fin (o fue borrada), asegurar que se envíe null si la columna existe en el payload
      // o simplemente no incluirla si la BD la toma como NULL por defecto.
      // Para ser explícitos y cubrir el caso de edición donde se borra:
      payload.fecha_fin = null;
    }


    let resultData;
    let resultError;

    if (isEditMode.value) {
      // MODO EDICIÓN
      console.log("ViajeForm: Actualizando viaje ID", props.viajeId, "con payload:", payload);
      // No deberíamos actualizar user_id ni codigo_rendicion
      const { user_id, ...updatePayload } = payload;
      const { data, error } = await supabase
        .from('viajes')
        .update(updatePayload)
        .eq('id', props.viajeId)
        .select()
        .single(); // Para obtener el registro actualizado
      resultData = data;
      resultError = error;
    } else {
      // MODO CREACIÓN
      // Al crear, codigo_rendicion se genera por la BD (SERIAL o DEFAULT nextval)
      // y cerrado_en y observacion_cierre serán NULL por defecto.
      // No incluimos fecha_fin en el payload inicial si queremos que sea null.
      // El payload ya tiene user_id.
      const { fecha_fin, ...insertPayload } = payload; // Excluir fecha_fin del payload de inserción si debe ser null
      console.log("ViajeForm: Creando nuevo viaje con payload:", insertPayload);
      
      const { data, error } = await supabase
        .from('viajes')
        .insert(insertPayload)
        .select()
        .single(); // Para obtener el registro creado con su ID y codigo_rendicion
      resultData = data;
      resultError = error;
    }

    if (resultError) {
      console.error("Error guardando viaje:", resultError);
      throw resultError;
    }

    console.log("ViajeForm: Viaje guardado/actualizado exitosamente:", resultData);
    successMessage.value = isEditMode.value ? '¡Viaje/Período actualizado con éxito!' : '¡Viaje/Período registrado con éxito!';
    
    // Limpiar formulario si fue creación
    if (!isEditMode.value) {
      form.value = {
        id: null,
        nombre_viaje: '',
        destino: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: null,
        monto_adelanto: 0,
      };
    }
    
    emit('viajeGuardado', resultData);

  } catch (error) {
    console.error('Error en handleSubmit de ViajeForm:', error);
    errorMessage.value = `Error al guardar: ${error.message || 'Ocurrió un error desconocido.'}`;
  } finally {
    loading.value = false;
  }
};
// Este es el final del <script setup> que ya teníamos del bloque anterior.
// Lo incluyo aquí para que el código sea ejecutable si alguien copia solo este bloque,
// pero en tu archivo real, este script ya está cerrado.
// La función navigateTo no está definida aquí, pero no se usa en este componente.
</script>

<template>
  <div class="bg-white p-6 sm:p-8 rounded-xl shadow-2xl border border-gray-200/80">
    <h3 class="text-2xl font-semibold text-districorr-primary mb-6 text-center">
      {{ pageTitle }}
    </h3>

    <form @submit.prevent="handleSubmit" class="space-y-6">
      <div>
        <label for="nombre_viaje" class="block text-sm font-medium text-gray-700 mb-1.5">
          Concepto / Nombre del Viaje o Período <span class="text-red-500">*</span>
        </label>
        <input 
          type="text" 
          id="nombre_viaje" 
          v-model.trim="form.nombre_viaje" 
          list="conceptos-viaje-list" 
          required
          placeholder="Ej: Viaje Ventas Rosario, Rendición Compras Mayo"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors"
        >
        <datalist id="conceptos-viaje-list">
          <option v-for="concepto in conceptosSugeridos" :key="concepto" :value="concepto"></option>
        </datalist>
        <p class="mt-1 text-xs text-gray-500">Un nombre descriptivo para identificar esta rendición.</p>
      </div>

      <div>
        <label for="destino" class="block text-sm font-medium text-gray-700 mb-1.5">
          Destino / Área <span class="text-gray-400 text-xs">(Opcional)</span>
        </label>
        <input 
          type="text" 
          id="destino" 
          v-model.trim="form.destino"
          placeholder="Ej: Rosario, Santa Fe / Compras Oficina Central"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors"
        >
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        <div>
          <label for="fecha_inicio" class="block text-sm font-medium text-gray-700 mb-1.5">
            Fecha de Inicio <span class="text-red-500">*</span>
          </label>
          <input 
            type="date" 
            id="fecha_inicio" 
            v-model="form.fecha_inicio" 
            required
            class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors"
          >
        </div>

        <!-- Campo Fecha Fin: Solo se muestra y es editable si estamos en modo edición. -->
        <!-- Al crear, no se muestra, ya que se establecerá al cerrar la rendición. -->
        <div v-if="isEditMode">
          <label for="fecha_fin" class="block text-sm font-medium text-gray-700 mb-1.5">
            Fecha de Fin <span class="text-gray-400 text-xs">(Si ya finalizó)</span>
          </label>
          <input 
            type="date" 
            id="fecha_fin" 
            v-model="form.fecha_fin"
            :min="form.fecha_inicio" 
            class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors"
          >
          <p class="mt-1 text-xs text-gray-500">Dejar en blanco o borrar si el período aún está en curso.</p>
        </div>
        <div v-else>
            <!-- Espacio reservado o mensaje indicando que se define al cerrar -->
             <label class="block text-sm font-medium text-gray-700 mb-1.5 opacity-0 select-none pointer-events-none">Fecha de Fin</label> <!-- Label invisible para alinear -->
             <div class="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 italic text-center">
                La fecha de fin se establece al cerrar la rendición.
             </div>
        </div>
      </div>

      <div>
        <label for="monto_adelanto" class="block text-sm font-medium text-gray-700 mb-1.5">
          Monto de Adelanto Recibido (para este viaje/período) <span class="text-red-500">*</span>
        </label>
        <input 
          type="number" 
          id="monto_adelanto" 
          v-model.number="form.monto_adelanto" 
          step="0.01" 
          required
          placeholder="0.00"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors"
        >
        <p class="mt-1 text-xs text-gray-500">Ingresa el monto total del adelanto principal para este viaje o período. Puede ser 0.</p>
      </div>

      <div v-if="errorMessage" class="my-4 p-3.5 bg-red-100 border-l-4 border-red-600 text-red-700 rounded-r-md text-sm shadow-md">
        <p class="font-semibold">Error:</p>
        <p class="whitespace-pre-line mt-1">{{ errorMessage }}</p>
      </div>
      <div v-if="successMessage && !errorMessage" class="my-4 p-3.5 bg-green-50 border-l-4 border-green-600 text-green-700 rounded-r-md text-sm shadow-md">
        {{ successMessage }}
      </div>

      <div class="flex flex-col sm:flex-row justify-end items-center space-y-3 sm:space-y-0 sm:space-x-4 pt-5 border-t border-gray-200 mt-8">
        <button 
          type="button" 
          @click="emit('cancelar')"
          class="w-full sm:w-auto px-6 py-2.5 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-all duration-150 ease-in-out"
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          :disabled="loading"
          class="w-full sm:w-auto flex justify-center items-center px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-districorr-primary hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out transform active:scale-95"
        >
          <svg v-if="loading" class="animate-spin -ml-1 mr-2.5 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span v-if="loading">Guardando...</span>
          <span v-else>{{ isEditMode ? 'Actualizar Viaje/Período' : 'Registrar Viaje/Período' }}</span>
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* Estilos específicos para ViajeForm si fueran necesarios */
input[type="date"]::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.6;
}
input[type="date"]::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
}
</style>