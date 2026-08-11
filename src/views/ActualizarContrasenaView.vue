<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter } from 'vue-router';

console.log("ActualizarContrasenaView.vue: Script setup INICIADO");

const router = useRouter();
const newPassword = ref('');
const confirmPassword = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const loading = ref(false);
const checkingToken = ref(true);
const isValidSession = ref(false);
const tokenError = ref('');
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const redirectCountdown = ref(4);

let authListenerSubscription = null;
let countdownInterval = null;

// Validación básica de fuerza de contraseña
const passwordMinLength = computed(() => newPassword.value.length >= 6);
const passwordsMatch = computed(() => newPassword.value.length > 0 && newPassword.value === confirmPassword.value);

const isFormValid = computed(() => {
  return passwordMinLength.value && passwordsMatch.value && !loading.value;
});

onMounted(async () => {
  console.log("ActualizarContrasenaView.vue: Verificando sesión de recuperación...");

  // Suscripción a cambios de autenticación
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("ActualizarContrasenaView.vue onAuthStateChange - Evento:", event, "Sesión:", !!session);
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
      isValidSession.value = true;
      checkingToken.value = false;
      tokenError.value = '';
    }
  });
  authListenerSubscription = subscription;

  // Verificación directa de sesión actual por si ya se procesó el hash de la URL
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error("ActualizarContrasenaView.vue: Error obteniendo sesión:", error);
    }
    if (session) {
      console.log("ActualizarContrasenaView.vue: Sesión válida detectada.");
      isValidSession.value = true;
      checkingToken.value = false;
    }
  } catch (e) {
    console.error("ActualizarContrasenaView.vue: Excepción verificando sesión:", e);
  }

  // Timeout de seguridad: Si tras 2.5s no hay sesión, asumimos token caducado o acceso directo sin token
  setTimeout(() => {
    if (checkingToken.value) {
      checkingToken.value = false;
      if (!isValidSession.value) {
        tokenError.value = "El enlace de recuperación es inválido o ha expirado. Por favor, solicita uno nuevo.";
      }
    }
  }, 2500);
});

onUnmounted(() => {
  if (authListenerSubscription) {
    authListenerSubscription.unsubscribe();
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});

const handlePasswordUpdate = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  if (!passwordMinLength.value) {
    errorMessage.value = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  if (!passwordsMatch.value) {
    errorMessage.value = "Las contraseñas no coinciden.";
    return;
  }

  loading.value = true;

  try {
    console.log("ActualizarContrasenaView.vue: Enviando solicitud updateUser...");
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword.value
    });

    if (error) throw error;

    console.log("ActualizarContrasenaView.vue: Contraseña actualizada correctamente.", data);
    successMessage.value = "¡Tu contraseña ha sido actualizada con éxito!";

    // Cerrar sesión temporal de recuperación para forzar un login limpio con la nueva clave
    await supabase.auth.signOut();

    // Iniciar cuenta regresiva para la redirección
    countdownInterval = setInterval(() => {
      redirectCountdown.value -= 1;
      if (redirectCountdown.value <= 0) {
        clearInterval(countdownInterval);
        router.push({ name: 'Login' });
      }
    }, 1000);

  } catch (error) {
    console.error("ActualizarContrasenaView.vue: Error al actualizar contraseña:", error);
    if (error.message?.toLowerCase().includes('same password')) {
      errorMessage.value = "La nueva contraseña debe ser diferente a la contraseña anterior.";
    } else {
      errorMessage.value = "Error al actualizar la contraseña: " + (error.message || "Inténtalo de nuevo.");
    }
  } finally {
    loading.value = false;
  }
};

const goToLogin = () => {
  if (countdownInterval) clearInterval(countdownInterval);
  router.push({ name: 'Login' });
};
</script>

<template>
  <div class="min-h-full flex items-center justify-center px-4 py-12 text-white">
    <div class="w-full max-w-md bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 sm:p-10">
      
      <!-- LOGO -->
      <div class="flex justify-center mb-6 sm:mb-8">
        <img class="h-16 w-16 sm:h-20 sm:w-20" src="/districorr-logo-circular.png" alt="Districorr Logo" />
      </div>

      <!-- TÍTULO -->
      <h2 class="text-center text-2xl sm:text-3xl font-bold mb-2 tracking-tight text-white">
        Nueva Contraseña
      </h2>
      <p class="text-center text-sm text-blue-200 mb-8">
        Establece una nueva contraseña para tu cuenta de InfoGastos.
      </p>

      <!-- ESTADO 1: VERIFICANDO TOKEN -->
      <div v-if="checkingToken" class="text-center py-6">
        <svg class="animate-spin h-10 w-10 text-white mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"></path>
        </svg>
        <p class="text-sm text-blue-200">Verificando enlace de recuperación...</p>
      </div>

      <!-- ESTADO 2: ÉXITO AL ACTUALIZAR -->
      <div v-else-if="successMessage" class="text-center space-y-6">
        <div class="w-16 h-16 bg-green-500/20 border border-green-500/50 rounded-full flex items-center justify-center mx-auto text-green-400">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        
        <div>
          <h3 class="text-xl font-semibold text-white mb-2">¡Contraseña Actualizada!</h3>
          <p class="text-sm text-blue-200">
            {{ successMessage }}
          </p>
        </div>

        <div class="p-4 bg-white/10 rounded-xl border border-white/10">
          <p class="text-xs text-blue-300">
            Serás redirigido a la página de inicio de sesión en <span class="font-bold text-white text-base">{{ redirectCountdown }}</span> segundos...
          </p>
        </div>

        <button
          type="button"
          @click="goToLogin"
          class="form-button-submit"
        >
          Ir a Iniciar Sesión Ahora
        </button>
      </div>

      <!-- ESTADO 3: ENLACE INVÁLIDO O EXPIRADO -->
      <div v-else-if="tokenError && !isValidSession" class="text-center space-y-6">
        <div class="w-16 h-16 bg-amber-500/20 border border-amber-500/50 rounded-full flex items-center justify-center mx-auto text-amber-400">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>

        <div>
          <h3 class="text-xl font-semibold text-white mb-2">Enlace no disponible</h3>
          <p class="text-sm text-blue-200">
            {{ tokenError }}
          </p>
        </div>

        <button
          type="button"
          @click="goToLogin"
          class="form-button-submit"
        >
          Volver a Iniciar Sesión
        </button>
      </div>

      <!-- ESTADO 4: FORMULARIO DE NUEVA CONTRASEÑA -->
      <form v-else @submit.prevent="handlePasswordUpdate" class="space-y-6">
        
        <!-- CAMPO: NUEVA CONTRASEÑA -->
        <div>
          <label for="new-password" class="block text-xs font-medium text-blue-200 mb-1">
            Nueva Contraseña
          </label>
          <div class="relative">
            <input
              id="new-password"
              v-model="newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              required
              placeholder="Mínimo 6 caracteres"
              class="form-input-login pr-10 placeholder-blue-300/70"
            />
            <button
              type="button"
              @click="showNewPassword = !showNewPassword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-blue-300 hover:text-white transition-colors"
              title="Mostrar/ocultar contraseña"
            >
              <svg v-if="!showNewPassword" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a8.97 8.97 0 013.682-.763c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
              </svg>
            </button>
          </div>
        </div>

        <!-- CAMPO: CONFIRMAR CONTRASEÑA -->
        <div>
          <label for="confirm-password" class="block text-xs font-medium text-blue-200 mb-1">
            Confirmar Contraseña
          </label>
          <div class="relative">
            <input
              id="confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              required
              placeholder="Repite tu nueva contraseña"
              class="form-input-login pr-10 placeholder-blue-300/70"
            />
            <button
              type="button"
              @click="showConfirmPassword = !showConfirmPassword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-blue-300 hover:text-white transition-colors"
              title="Mostrar/ocultar contraseña"
            >
              <svg v-if="!showConfirmPassword" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a8.97 8.97 0 013.682-.763c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
              </svg>
            </button>
          </div>
        </div>

        <!-- REQUISITOS / AYUDAS VISUALES DE VALIDACIÓN -->
        <div class="space-y-1 text-xs">
          <div class="flex items-center space-x-2" :class="passwordMinLength ? 'text-green-300' : 'text-blue-300/70'">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="passwordMinLength ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'"></path>
            </svg>
            <span>Mínimo 6 caracteres</span>
          </div>
          <div v-if="confirmPassword.length > 0" class="flex items-center space-x-2" :class="passwordsMatch ? 'text-green-300' : 'text-red-300'">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="passwordsMatch ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'"></path>
            </svg>
            <span>{{ passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden' }}</span>
          </div>
        </div>

        <!-- MENSAJE DE ERROR -->
        <div v-if="errorMessage" class="form-message error-message" role="alert">
          <p>{{ errorMessage }}</p>
        </div>

        <!-- BOTÓN SUBMIT -->
        <button
          type="submit"
          :disabled="!isFormValid"
          class="form-button-submit group"
        >
          <svg v-if="loading" class="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"></path>
          </svg>
          <span class="group-hover:tracking-wider transition-all duration-200 text-base font-semibold">
            {{ loading ? 'Guardando...' : 'Actualizar Contraseña' }}
          </span>
        </button>

        <!-- ENLACE PARA CANCELAR Y VOLVER -->
        <p class="text-center text-sm text-blue-200 pt-2">
          ¿Recordaste tu clave?
          <button type="button" @click="goToLogin" class="font-semibold text-blue-300 hover:text-white hover:underline ml-1 transition-colors">
            Iniciar sesión
          </button>
        </p>

      </form>
    </div>
  </div>
</template>

<style scoped>
.form-input-login {
  @apply w-full px-4 py-3.5 rounded-xl bg-white/10 border-2 border-transparent text-white 
         text-base
         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300 
         transition-all duration-200 ease-in-out shadow-sm hover:bg-white/20;
}
.form-message {
  @apply text-sm text-center px-4 py-3 rounded-xl border;
}
.error-message {
  @apply bg-red-500/30 text-red-100 border-red-500/50;
}
.form-button-submit {
  @apply w-full flex justify-center items-center py-3.5 px-4 rounded-xl 
         bg-gradient-to-r from-blue-500 via-blue-600 to-cyan-500 
         text-white 
         hover:from-blue-600 hover:to-cyan-600 
         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-blue-900/50
         transition-all duration-200 ease-in-out shadow-lg hover:shadow-blue-500/50
         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-500 disabled:hover:to-cyan-500;
}
</style>