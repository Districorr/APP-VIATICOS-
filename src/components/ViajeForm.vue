<script setup>
import { ref, onMounted, watch } from 'vue';
import { supabase } from '../supabaseClient.js';

const props = defineProps({
  viajeId: String
});
const emit = defineEmits(['viajeGuardado', 'cancelar']);

const form = ref({
  nombre_viaje: '',
  destino: '',
  fecha_inicio: new Date().toISOString().split('T')[0],
  fecha_fin: '',
  monto_adelanto: null,
  descripcion_periodo: '',
});

const tipoEntrada = ref('nombre'); // 'nombre' o 'periodo'

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

watch(tipoEntrada, (newVal) => {
  if (newVal === 'periodo') {
    // Opcional: form.value.nombre_viaje = '';
  }
});

onMounted(async () => {
  if (props.viajeId) {
    loading.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    try {
      const { data, error } = await supabase
        .from('viajes')
        .select('*')
        .eq('id', props.viajeId)
        .single();
      if (error) throw error;
      if (data) {
        if (data.nombre_viaje && data.nombre_viaje.startsWith('Rendición ') && data.fecha_fin) {
            tipoEntrada.value = 'periodo';
            const partesNombre = data.nombre_viaje.split(' (');
            if (partesNombre.length > 1 && partesNombre[1].endsWith(')')) {
                form.value.descripcion_periodo = partesNombre[1].slice(0, -1);
            }
        } else {
            tipoEntrada.value = 'nombre';
            form.value.nombre_viaje = data.nombre_viaje;
        }
        form.value.destino = data.destino || '';
        form.value.fecha_inicio = data.fecha_inicio ? data.fecha_inicio.split('T')[0] : new Date().toISOString().split('T')[0];
        form.value.fecha_fin = data.fecha_fin ? data.fecha_fin.split('T')[0] : '';
        form.value.monto_adelanto = data.monto_adelanto;
      } else {
        errorMessage.value = 'No se encontró el registro para editar.';
      }
    } catch (error) {
      console.error('Error cargando viaje/periodo para editar:', error.message);
      errorMessage.value = 'No se pudo cargar el registro: ' + error.message;
    } finally {
      loading.value = false;
    }
  }
});

const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  if (tipoEntrada.value === 'nombre' && !form.value.nombre_viaje.trim()) {
    errorMessage.value = 'El nombre del viaje es obligatorio.';
    loading.value = false;
    return;
  }
  if (!form.value.fecha_inicio) {
    errorMessage.value = 'La fecha de inicio es obligatoria.';
    loading.value = false;
    return;
  }
  if (tipoEntrada.value === 'periodo' && !form.value.fecha_fin) {
    errorMessage.value = 'La fecha de fin es obligatoria para un período de rendición.';
    loading.value = false;
    return;
  }
  if (form.value.fecha_fin && form.value.fecha_fin < form.value.fecha_inicio) {
     errorMessage.value = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
     loading.value = false;
     return;
  }
  if (form.value.monto_adelanto === null || form.value.monto_adelanto < 0 || isNaN(parseFloat(form.value.monto_adelanto))) {
    errorMessage.value = 'El monto de adelanto es obligatorio y debe ser un número válido (puede ser 0 si no hubo adelanto).';
    loading.value = false;
    return;
  }

  let nombreFinalParaGuardar = form.value.nombre_viaje.trim();
  if (tipoEntrada.value === 'periodo') {
    const fInicio = new Date(form.value.fecha_inicio + 'T00:00:00').toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    const fFin = new Date(form.value.fecha_fin + 'T00:00:00').toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    nombreFinalParaGuardar = `Rendición ${fInicio} - ${fFin}`;
    if (form.value.descripcion_periodo && form.value.descripcion_periodo.trim() !== '') {
        nombreFinalParaGuardar += ` (${form.value.descripcion_periodo.trim()})`;
    }
  }

  if (!nombreFinalParaGuardar) {
      errorMessage.value = 'Se requiere un nombre o una definición de período válida.';
      loading.value = false;
      return;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado.');

    const payload = {
      user_id: user.id,
      nombre_viaje: nombreFinalParaGuardar,
      destino: form.value.destino.trim() || null,
      fecha_inicio: form.value.fecha_inicio,
      fecha_fin: form.value.fecha_fin || null,
      monto_adelanto: parseFloat(form.value.monto_adelanto),
    };

    let responseData;
    let responseError;

    if (props.viajeId) {
      const { data, error } = await supabase
        .from('viajes')
        .update(payload)
        .eq('id', props.viajeId)
        .select()
        .single();
      responseData = data;
      responseError = error;
    } else {
      const { data, error } = await supabase
        .from('viajes')
        .insert(payload)
        .select()
        .single();
      responseData = data;
      responseError = error;
    }

    if (responseError) throw responseError;

    successMessage.value = props.viajeId ? '¡Registro actualizado con éxito!' : '¡Registro creado con éxito!';
    emit('viajeGuardado', responseData);

    if (!props.viajeId) {
      form.value = {
        nombre_viaje: '',
        destino: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: '',
        monto_adelanto: null,
        descripcion_periodo: '',
      };
    }
  } catch (error) {
    console.error('Error al guardar viaje/periodo:', error.message);
    errorMessage.value = 'Error al guardar: ' + (error.details || error.message);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6 bg-white p-6 sm:p-8 rounded-xl shadow-xl">
    <h3 class="text-2xl font-semibold text-districorr-primary mb-6 text-center">
      {{ viajeId ? 'Editar Viaje / Período' : 'Registrar Nuevo Viaje / Período de Rendición' }}
    </h3>

    <div class="mb-6">
      <label class="block text-sm font-medium text-districorr-text-medium mb-2">Tipo de Registro:</label>
      <div class="flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0">
        <label class="flex items-center p-2 border rounded-md hover:bg-gray-50 cursor-pointer" :class="{'bg-blue-50 border-districorr-accent ring-2 ring-districorr-accent': tipoEntrada === 'nombre'}">
          <input type="radio" v-model="tipoEntrada" value="nombre" class="focus:ring-districorr-accent h-4 w-4 text-districorr-accent border-gray-300">
          <span class="ml-2 text-sm text-districorr-text-dark">Por Nombre de Viaje</span>
        </label>
        <label class="flex items-center p-2 border rounded-md hover:bg-gray-50 cursor-pointer" :class="{'bg-blue-50 border-districorr-accent ring-2 ring-districorr-accent': tipoEntrada === 'periodo'}">
          <input type="radio" v-model="tipoEntrada" value="periodo" class="focus:ring-districorr-accent h-4 w-4 text-districorr-accent border-gray-300">
          <span class="ml-2 text-sm text-districorr-text-dark">Por Período de Rendición</span>
        </label>
      </div>
    </div>

    <div v-if="tipoEntrada === 'nombre'">
      <label for="nombre_viaje" class="block text-sm font-medium text-districorr-text-medium mb-1">Nombre del Viaje <span class="text-red-500">*</span></label>
      <input type="text" id="nombre_viaje" v-model="form.nombre_viaje" :required="tipoEntrada === 'nombre'"
             class="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
    </div>

    <div>
      <label for="destino" class="block text-sm font-medium text-districorr-text-medium mb-1">
        Destino / Área <span v-if="tipoEntrada === 'nombre'">(Opcional)</span><span v-else>(Opcional si es Período General)</span>
      </label>
      <input type="text" id="destino" v-model="form.destino"
             class="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm"
             placeholder="Ej: Formosa, Chaco / Oficina Central">
    </div>

    <div v-if="tipoEntrada === 'periodo'">
        <label for="descripcion_periodo" class="block text-sm font-medium text-districorr-text-medium mb-1">Descripción Adicional del Período (Opcional)</label>
        <input type="text" id="descripcion_periodo" v-model="form.descripcion_periodo"
                class="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm"
                placeholder="Ej: Compras Mayo, Viáticos Semana 1">
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      <div>
        <label for="fecha_inicio" class="block text-sm font-medium text-districorr-text-medium mb-1">Fecha de Inicio <span class="text-red-500">*</span></label>
        <input type="date" id="fecha_inicio" v-model="form.fecha_inicio" required
               class="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
      </div>
      <div>
        <label for="fecha_fin" class="block text-sm font-medium text-districorr-text-medium mb-1">
          Fecha de Fin <span v-if="tipoEntrada === 'periodo'" class="text-red-500">*</span><span v-else>(Opcional)</span>
        </label>
        <input type="date" id="fecha_fin" v-model="form.fecha_fin" :required="tipoEntrada === 'periodo'"
               class="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
      </div>
    </div>

    <div>
      <label for="monto_adelanto" class="block text-sm font-medium text-districorr-text-medium mb-1">Monto Adelanto Recibido <span class="text-red-500">*</span></label>
      <input type="number" id="monto_adelanto" v-model.number="form.monto_adelanto" step="0.01" required
             min="0"
             class="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm"
             placeholder="0.00">
    </div>

    <div v-if="errorMessage" class="my-3 p-3 bg-red-100 border border-districorr-error text-districorr-error rounded-md text-sm">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="my-3 p-3 bg-green-100 border border-districorr-success text-districorr-success rounded-md text-sm">
      {{ successMessage }}
    </div>

    <div class="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4">
      <button type="button" @click="emit('cancelar')"
              class="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out">
        Cancelar
      </button>
      <button type="submit"
              :disabled="loading"
              class="w-full sm:w-auto flex justify-center items-center px-4 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-districorr-primary hover:bg-opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent disabled:opacity-50 transition duration-150 ease-in-out">
        <svg v-if="loading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ loading ? 'Guardando...' : (viajeId ? 'Actualizar Registro' : 'Crear Registro') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
/* Estilos específicos para ViajeForm si fueran necesarios */
</style>