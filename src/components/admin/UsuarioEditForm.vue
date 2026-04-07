<script setup>
import { ref, watch, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js'; // Ajusta la ruta si es necesario

const props = defineProps({
  usuarioAEditar: Object, // Recibe el objeto del usuario (con su perfil)
});
const emit = defineEmits(['guardado', 'cancelar']);

const form = ref({
  id: null, // user_id (uuid)
  email: '', // Solo para mostrar, no editable aquí
  rol: '',
  formato_predeterminado_id: null,
  nombre_completo: '',
});
const formatosGasto = ref([]);
const rolesDisponibles = ['admin', 'coordinador_cirugia', 'logistica_admin', 'usuario_comun']; // Roles posibles
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const fetchFormatosGasto = async () => {
  try {
    const { data, error } = await supabase
      .from('formatos_gasto_config')
      .select('id, nombre_formato')
      .eq('activo', true)
      .order('nombre_formato');
    if (error) throw error;
    formatosGasto.value = data;
  } catch (error) {
    console.error("Error cargando formatos de gasto:", error.message);
  }
};

watch(() => props.usuarioAEditar, (newVal) => {
  if (newVal) {
    form.value.id = newVal.id; // Este es el user.id
    form.value.email = newVal.email;
    form.value.rol = newVal.perfiles?.rol || 'usuario_comun';
    form.value.formato_predeterminado_id = newVal.perfiles?.formato_predeterminado_id || null;
    form.value.nombre_completo = newVal.perfiles?.nombre_completo || '';
  } else {
    // Resetear si no hay usuario
    form.value = { id: null, email: '', rol: 'usuario_comun', formato_predeterminado_id: null, nombre_completo: '' };
  }
}, { immediate: true, deep: true });

onMounted(() => {
  fetchFormatosGasto();
});

const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  if (!form.value.id) {
    errorMessage.value = "No se ha seleccionado un usuario para editar.";
    loading.value = false;
    return;
  }

  try {
    const perfilPayload = {
      rol: form.value.rol,
      formato_predeterminado_id: form.value.formato_predeterminado_id || null,
      nombre_completo: form.value.nombre_completo.trim() || null,
      // El 'id' del perfil es el mismo que el 'user_id'
    };

    // Usamos upsert para crear el perfil si no existe, o actualizarlo si ya existe
    const { data, error } = await supabase
      .from('perfiles')
      .upsert({ id: form.value.id, ...perfilPayload }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    successMessage.value = '¡Perfil de usuario actualizado con éxito!';
    emit('guardado', data); // Emitir el perfil actualizado
    // No cerramos el modal/formulario automáticamente para que el admin vea el mensaje

  } catch (error) {
    console.error('Error al actualizar perfil de usuario:', error.message);
    errorMessage.value = 'Error al actualizar: ' + error.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-4 p-6 border rounded-lg bg-white shadow-md">
    <h3 class="text-lg font-medium leading-6 text-districorr-primary">
      Editar Perfil de Usuario: <span class="font-normal text-districorr-text-dark">{{ form.email }}</span>
    </h3>

    <div>
      <label for="nombre_completo_usuario" class="block text-sm font-medium text-districorr-text-medium">Nombre Completo</label>
      <input type="text" id="nombre_completo_usuario" v-model="form.nombre_completo"
             class="mt-1 block w-full">
    </div>

    <div>
      <label for="rol_usuario" class="block text-sm font-medium text-districorr-text-medium">Rol <span class="text-red-500">*</span></label>
      <select id="rol_usuario" v-model="form.rol" required class="mt-1 block w-full">
        <option v-for="rolOpt in rolesDisponibles" :key="rolOpt" :value="rolOpt">{{ rolOpt.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) }}</option>
      </select>
    </div>

    <div>
      <label for="formato_predeterminado_usuario" class="block text-sm font-medium text-districorr-text-medium">Formato de Gasto Predeterminado</label>
      <select id="formato_predeterminado_usuario" v-model.number="form.formato_predeterminado_id" class="mt-1 block w-full">
        <option :value="null">Ninguno</option>
        <option v-for="formato in formatosGasto" :key="formato.id" :value="formato.id">{{ formato.nombre_formato }}</option>
      </select>
    </div>

    <div v-if="errorMessage" class="my-2 p-3 bg-red-100 border border-districorr-error text-districorr-error rounded-md text-sm">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="my-2 p-3 bg-green-100 border border-districorr-success text-districorr-success rounded-md text-sm">
      {{ successMessage }}
    </div>

    <div class="flex justify-end space-x-3 pt-2">
      <button type="button" @click="emit('cancelar')" class="btn btn-secondary">
        Cancelar
      </button>
      <button type="submit" :disabled="loading" class="btn btn-primary flex items-center">
        <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ loading ? 'Actualizando...' : 'Actualizar Perfil' }}
      </button>
    </div>
  </form>
</template>

<style scoped></style>