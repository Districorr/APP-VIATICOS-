<script setup>
// PerfilView.vue - <script setup>

import { ref, inject, onMounted, watch } from 'vue';
import { supabase } from '../supabaseClient.js'; // Ajusta la ruta si es necesario
import { formatCurrency, formatDate } from '../utils/formatters.js'; // formatDate añadido

// --- Inyección de Estado Global ---
const userProfileInjected = inject('userProfile'); 
const userSessionInjected = inject('currentUser'); 
const loadingAuthInjected = inject('loadingAuth');
const initialAuthCheckDoneInjected = inject('initialAuthCheckDone');

// --- Estado Local del Componente ---
const localProfile = ref(null);
const localUser = ref(null);    

const loadingData = ref(false); 
const errorMessage = ref('');
const successMessage = ref('');

// --- Estado para Cambio de Contraseña ---
const oldPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const passwordChangeMessage = ref('');
const passwordChangeError = ref(false);
const changingPassword = ref(false);

// --- Observadores para actualizar datos locales ---
watch(userProfileInjected, (newProfileData) => {
  console.log("PerfilView: userProfileInjected cambió:", newProfileData);
  if (newProfileData) {
    localProfile.value = { ...newProfileData }; 
  } else {
    localProfile.value = null;
  }
}, { immediate: true, deep: true }); 

watch(userSessionInjected, (newUserSessionData) => {
  console.log("PerfilView: userSessionInjected cambió:", newUserSessionData);
  if (newUserSessionData) {
    localUser.value = { ...newUserSessionData };
  } else {
    localUser.value = null;
  }
}, { immediate: true, deep: true });


// --- Funciones de Formato ---
const formatDateLocal = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleString('es-AR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    console.error("Error formateando fecha:", dateString, e);
    return 'Fecha inválida';
  }
};

// --- Lógica para Cambio de Contraseña ---
const handleChangePassword = async () => {
  passwordChangeMessage.value = '';
  passwordChangeError.value = false;

  if (newPassword.value.length < 6) {
    passwordChangeMessage.value = 'La nueva contraseña debe tener al menos 6 caracteres.';
    passwordChangeError.value = true;
    return;
  }
  if (newPassword.value !== confirmNewPassword.value) {
    passwordChangeMessage.value = 'Las nuevas contraseñas no coinciden.';
    passwordChangeError.value = true;
    return;
  }

  changingPassword.value = true;
  console.log('Intentando cambiar contraseña...');

  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword.value
    });

    if (error) {
      console.error("Error al actualizar contraseña en Supabase:", error);
      passwordChangeMessage.value = `Error al actualizar: ${error.message}`;
      passwordChangeError.value = true;
    } else {
      console.log("Contraseña actualizada:", data);
      passwordChangeMessage.value = '¡Contraseña actualizada exitosamente! Es posible que necesites volver a iniciar sesión.';
      passwordChangeError.value = false;
      newPassword.value = '';
      confirmNewPassword.value = '';
      oldPassword.value = ''; 
    }
  } catch (e) {
    console.error("Excepción en handleChangePassword:", e);
    passwordChangeMessage.value = "Ocurrió un error inesperado.";
    passwordChangeError.value = true;
  } finally {
    changingPassword.value = false;
  }
};

onMounted(() => {
  console.log("PerfilView: Componente MONTADO.");
  // Los watchers con immediate:true se encargan de la carga inicial
});

</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold text-districorr-primary mb-8 text-center sm:text-left">Mi Perfil</h1>

    <div v-if="loadingAuthInjected && !initialAuthCheckDoneInjected" class="flex justify-center items-center py-20">
      <svg class="animate-spin h-10 w-10 text-districorr-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="ml-4 text-xl text-gray-600">Cargando perfil...</p>
    </div>

    <div v-else-if="errorMessage" class="error-banner max-w-lg mx-auto" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    
    <div v-else-if="!localUser && initialAuthCheckDoneInjected" class="text-center py-10 text-red-600 max-w-lg mx-auto">
      No estás autenticado. Por favor, <router-link :to="{name: 'Login'}" class="font-semibold hover:underline text-districorr-accent">inicia sesión</router-link> para ver tu perfil.
    </div>

    <div v-else-if="localUser && localProfile" class="bg-white p-6 sm:p-8 rounded-xl shadow-2xl max-w-2xl mx-auto space-y-6">
      <div>
        <h2 class="text-xl font-semibold text-districorr-primary mb-4 border-b pb-3">Información de la Cuenta</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          
          <div>
            <label class="profile-label">Nombre Completo</label>
            <p class="profile-value">{{ localProfile.nombre_completo || 'No especificado' }}</p>
          </div>
          <div>
            <label class="profile-label">Puesto</label>
            <p class="profile-value">{{ localProfile.puesto || 'No especificado' }}</p>
          </div>
          <div>
            <label class="profile-label">Correo Electrónico</label>
            <p class="profile-value break-all">{{ localUser.email }}</p>
          </div>
          <div>
            <label class="profile-label">Rol</label>
            <p class="profile-value capitalize">{{ localProfile.rol ? localProfile.rol.replace('_', ' ') : 'No especificado' }}</p>
          </div>
           <div v-if="localProfile.formato_predeterminado_id">
            <label class="profile-label">ID Formato Predeterminado</label>
            <p class="profile-value">{{ localProfile.formato_predeterminado_id }}</p>
          </div>
          <div>
            <label class="profile-label">ID de Usuario</label>
            <p class="mt-1 text-xs text-gray-500 break-all">{{ localUser.id }}</p>
          </div>
          <div>
            <label class="profile-label">Último Inicio de Sesión</label>
            <p class="profile-value-sm">{{ formatDateLocal(localUser.last_sign_in_at) }}</p>
          </div>
          <div>
            <label class="profile-label">Registrado el</label>
            <p class="profile-value-sm">{{ formatDateLocal(localUser.created_at) }}</p>
          </div>
        </div>
      </div>

      <div class="pt-6 border-t border-gray-200">
        <h2 class="text-xl font-semibold text-districorr-primary mb-4">Cambiar Contraseña</h2>
        <form @submit.prevent="handleChangePassword" class="space-y-4">
          <div>
            <label for="new-password" class="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
            <input type="password" id="new-password" v-model="newPassword" placeholder="Mínimo 6 caracteres" class="input-form-style">
          </div>
          <div>
            <label for="confirm-new-password" class="block text-sm font-medium text-gray-700 mb-1">Confirmar Nueva Contraseña</label>
            <input type="password" id="confirm-new-password" v-model="confirmNewPassword" class="input-form-style">
          </div>
          
          <div v-if="passwordChangeMessage" 
               :class="passwordChangeError ? 'text-red-600 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'" 
               class="text-sm p-3 rounded-md border">
            {{ passwordChangeMessage }}
          </div>

          <button type="submit"
                  :disabled="changingPassword"
                  class="w-full sm:w-auto btn-primary">
            <svg v-if="changingPassword" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ changingPassword ? 'Actualizando...' : 'Actualizar Contraseña' }}
          </button>
        </form>
      </div>
    </div>

    <div v-else-if="initialAuthCheckDoneInjected" class="text-center py-10 text-gray-600 max-w-lg mx-auto">
      No se pudo cargar la información del perfil. Es posible que necesites completar tu registro o contactar a soporte si el problema persiste.
    </div>
     <div v-else class="text-center py-10 text-gray-500">
      Inicializando...
    </div>
  </div>
</template>

<style scoped>
.profile-label {
  @apply block text-sm font-medium text-districorr-text-medium;
}
.profile-value {
  /* Cambiar text-md a text-base o text-lg según tu preferencia */
  @apply mt-1 text-base text-districorr-text-dark; /* Opción 1: text-base */
  /* @apply mt-1 text-lg text-districorr-text-dark; */ /* Opción 2: text-lg */
}
.profile-value-sm { 
  @apply mt-1 text-sm text-districorr-text-dark;
}
.input-form-style {
  @apply mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-districorr-accent focus:ring focus:ring-districorr-accent focus:ring-opacity-50 sm:text-sm py-2 px-3;
}
.btn-primary {
  @apply inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-districorr-accent hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent disabled:opacity-50 transition-colors;
}
.error-banner { 
  @apply bg-red-100 border-l-4 border-districorr-error text-districorr-error p-4 rounded-md; 
}
</style>
