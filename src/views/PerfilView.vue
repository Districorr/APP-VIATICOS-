<script setup>
// PerfilView.vue - <script setup>

import { ref, inject, onMounted, watch } from 'vue';
import { supabase } from '../supabaseClient.js'; // Ajusta la ruta si es necesario
// import { formatCurrency, formatDate } from '../utils/formatters.js'; // formatDate añadido // Ya no se usa formatDate aquí, se usa formatDateLocal

console.log("PerfilView.vue: Script setup INICIADO");

// --- Inyección de Estado Global ---
// CORREGIR LOS NOMBRES DE INYECCIÓN AQUÍ:
const userProfileInjected = inject('userProfile'); 
const userSessionInjected = inject('currentUserSession'); // ANTES: 'currentUser'
const loadingAuthInjected = inject('loadingAuthSession'); // ANTES: 'loadingAuth'
const initialAuthCheckDoneInjected = inject('initialAuthCheckDone');

console.log("PerfilView.vue: Datos inyectados:", {
  userProfileInjected: userProfileInjected ? 'Presente' : 'Ausente/Error',
  userSessionInjected: userSessionInjected ? 'Presente' : 'Ausente/Error',
  loadingAuthInjected: loadingAuthInjected ? 'Presente' : 'Ausente/Error',
  initialAuthCheckDoneInjected: initialAuthCheckDoneInjected ? 'Presente' : 'Ausente/Error',
});

// --- Estado Local del Componente ---
const localProfile = ref(null);
const localUserAuth = ref(null); // Renombrado para claridad, contendrá userSessionInjected.value.user

const loadingData = ref(false); // No se usa actualmente, pero se mantiene por si acaso
const errorMessage = ref(''); // No se usa actualmente, pero se mantiene
const successMessage = ref(''); // No se usa actualmente, pero se mantiene

// --- Estado para Cambio de Contraseña ---
const oldPassword = ref(''); // No se usa en la lógica actual de Supabase para cambiar contraseña si ya estás logueado
const newPassword = ref('');
const confirmNewPassword = ref('');
const passwordChangeMessage = ref('');
const passwordChangeError = ref(false);
const changingPassword = ref(false);

// --- Observadores para actualizar datos locales ---
watch(userProfileInjected, (newProfileData) => {
  console.log("PerfilView Watcher: userProfileInjected cambió:", newProfileData ? {...newProfileData} : null);
  if (newProfileData) {
    localProfile.value = { ...newProfileData }; 
  } else {
    localProfile.value = null;
  }
}, { immediate: true, deep: true }); 

watch(userSessionInjected, (newUserSessionData) => {
  console.log("PerfilView Watcher: userSessionInjected cambió:", newUserSessionData ? {...newUserSessionData} : null);
  if (newUserSessionData?.user) { // Asegurarse que user exista en la sesión
    localUserAuth.value = { ...newUserSessionData.user }; // Guardar solo la parte .user
    console.log("PerfilView Watcher: localUserAuth actualizado:", {...localUserAuth.value});
  } else {
    localUserAuth.value = null;
    console.log("PerfilView Watcher: localUserAuth puesto a null.");
  }
}, { immediate: true, deep: true });


// --- Funciones de Formato ---
const formatDateLocal = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    // Intentar crear una fecha. Si es inválida, Date la interpretará como NaN o similar.
    const date = new Date(dateString);
    if (isNaN(date.getTime())) { // Comprobar si la fecha es válida
        console.warn("Fecha inválida recibida en formatDateLocal:", dateString);
        return 'Fecha inválida';
    }
    return date.toLocaleString('es-AR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    console.error("Error formateando fecha en formatDateLocal:", dateString, e);
    return 'Error al formatear';
  }
};

// --- Lógica para Cambio de Contraseña ---
const handleChangePassword = async () => {
  console.log('PerfilView: Iniciando handleChangePassword...');
  passwordChangeMessage.value = '';
  passwordChangeError.value = false;

  if (!newPassword.value || newPassword.value.length < 6) {
    passwordChangeMessage.value = 'La nueva contraseña debe tener al menos 6 caracteres.';
    passwordChangeError.value = true;
    console.warn('PerfilView handleChangePassword: Validación fallida - longitud contraseña.');
    return;
  }
  if (newPassword.value !== confirmNewPassword.value) {
    passwordChangeMessage.value = 'Las nuevas contraseñas no coinciden.';
    passwordChangeError.value = true;
    console.warn('PerfilView handleChangePassword: Validación fallida - contraseñas no coinciden.');
    return;
  }

  changingPassword.value = true;
  console.log('PerfilView handleChangePassword: Intentando cambiar contraseña en Supabase...');

  try {
    // Para actualizar la contraseña del usuario logueado, solo necesitas la nueva contraseña.
    // Supabase usa la sesión activa para identificar al usuario.
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword.value
    });

    if (error) {
      console.error("PerfilView handleChangePassword: Error al actualizar contraseña en Supabase:", error);
      passwordChangeMessage.value = `Error al actualizar: ${error.message}`;
      passwordChangeError.value = true;
    } else {
      console.log("PerfilView handleChangePassword: Contraseña actualizada exitosamente en Supabase:", data);
      passwordChangeMessage.value = '¡Contraseña actualizada exitosamente! Es posible que necesites volver a iniciar sesión si la sesión se invalidó.';
      passwordChangeError.value = false;
      // Limpiar campos
      newPassword.value = '';
      confirmNewPassword.value = '';
      // oldPassword.value = ''; // oldPassword no es necesario para updateUser si ya estás logueado
    }
  } catch (e) {
    console.error("PerfilView handleChangePassword: Excepción durante el cambio de contraseña:", e);
    passwordChangeMessage.value = "Ocurrió un error inesperado al intentar cambiar la contraseña.";
    passwordChangeError.value = true;
  } finally {
    changingPassword.value = false;
    console.log('PerfilView: handleChangePassword finalizado.');
  }
};

onMounted(() => {
  console.log("PerfilView.vue: Componente MONTADO (onMounted).");
  // Los watchers con immediate:true se encargan de la carga inicial de localProfile y localUserAuth
  // basados en los datos inyectados.
});

console.log("PerfilView.vue: Script setup FINALIZADO");
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <!-- {{ console.log("PerfilView Template Render:", { localUserAuth: localUserAuth, localProfile: localProfile, initialAuthCheckDoneInjected: initialAuthCheckDoneInjected }) }} -->
    <h1 class="text-3xl font-bold text-districorr-primary mb-8 text-center sm:text-left">Mi Perfil</h1>

    <div v-if="loadingAuthInjected && !initialAuthCheckDoneInjected" class="flex justify-center items-center py-20">
      <svg class="animate-spin h-10 w-10 text-districorr-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="ml-4 text-xl text-gray-600">Cargando información de autenticación...</p>
    </div>

    <div v-else-if="errorMessage" class="error-banner max-w-lg mx-auto" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    
    <!-- Condición corregida para usar localUserAuth -->
    <div v-else-if="!localUserAuth && initialAuthCheckDoneInjected" class="text-center py-10 text-red-600 max-w-lg mx-auto">
      <p>No estás autenticado o tu sesión no pudo ser verificada.</p>
      <p>Por favor, <router-link :to="{name: 'Login'}" class="font-semibold hover:underline text-districorr-accent">inicia sesión</router-link> para ver tu perfil.</p>
    </div>

    <!-- Condición corregida para usar localUserAuth y localProfile -->
    <div v-else-if="localUserAuth && localProfile" class="bg-white p-6 sm:p-8 rounded-xl shadow-2xl max-w-2xl mx-auto space-y-6">
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
            <p class="profile-value break-all">{{ localUserAuth.email }}</p>
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
            <label class="profile-label">ID de Usuario (Auth)</label>
            <p class="mt-1 text-xs text-gray-500 break-all">{{ localUserAuth.id }}</p>
          </div>
          <div>
            <label class="profile-label">Último Inicio de Sesión (Auth)</label>
            <p class="profile-value-sm">{{ formatDateLocal(localUserAuth.last_sign_in_at) }}</p>
          </div>
          <div>
            <label class="profile-label">Registrado el (Auth)</label>
            <p class="profile-value-sm">{{ formatDateLocal(localUserAuth.created_at) }}</p>
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
                  :disabled="changingPassword || !newPassword || !confirmNewPassword"
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

    <!-- Fallback si el perfil no está disponible pero la sesión sí -->
    <div v-else-if="localUserAuth && !localProfile && initialAuthCheckDoneInjected" class="text-center py-10 text-orange-600 max-w-lg mx-auto">
      <p>Tu sesión está activa, pero no se pudo cargar la información detallada de tu perfil.</p>
      <p>Esto puede ser temporal o indicar que tu perfil no está completamente configurado. Intenta recargar o contacta a soporte.</p>
    </div>
    
    <div v-else-if="initialAuthCheckDoneInjected" class="text-center py-10 text-gray-600 max-w-lg mx-auto">
      No se pudo cargar la información del perfil. Es posible que necesites completar tu registro o contactar a soporte si el problema persiste.
    </div>
     <div v-else class="text-center py-10 text-gray-500">
      Inicializando y verificando estado de autenticación...
    </div>
  </div>
</template>