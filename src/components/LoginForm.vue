<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient.js'; // Asegúrate que la ruta sea correcta
import { RouterLink, useRoute } from 'vue-router'; // useRoute para leer query params si es necesario

// No necesitamos useRouter aquí porque la redirección la manejará App.vue y el Router Guard

console.log("LoginForm.vue (Revisado): Script setup INICIADO");

const route = useRoute(); // Para acceder a route.query.redirectTo si fuera necesario

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const successMessage = ref(''); // Para mensajes como el de recuperación de contraseña
const loading = ref(false);
// const rememberMe = ref(false); // Comentado ya que no se usa activamente

const handleLogin = async () => {
  console.log("LoginForm.vue (Revisado): handleLogin - INICIO. Email:", email.value);
  errorMessage.value = ''; 
  successMessage.value = ''; 
  loading.value = true;

  try {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ // Renombrado 'error' para evitar conflicto
      email: email.value,
      password: password.value,
    });

    if (signInError) {
      console.error('LoginForm.vue (Revisado): Error en signInWithPassword:', signInError);
      if (signInError.message.toLowerCase().includes('invalid login credentials')) {
        errorMessage.value = 'Correo o contraseña incorrectos. Por favor, verifica tus datos.';
      } else if (signInError.message.toLowerCase().includes('email not confirmed')) {
        errorMessage.value = 'Tu correo electrónico aún no ha sido confirmado. Revisa tu bandeja de entrada.';
      } else if (signInError.message.toLowerCase().includes('rate limit exceeded')) {
        errorMessage.value = 'Demasiados intentos. Por favor, espera un momento e inténtalo de nuevo.';
      } else {
        errorMessage.value = 'Error al iniciar sesión. Inténtalo de nuevo más tarde.';
      }
      // No se lanza el error, el flujo termina aquí y se muestra el mensaje.
      return; 
    }

    console.log("LoginForm.vue (Revisado): signInWithPassword EXITOSO. Usuario autenticado:", data.user?.id);
    // La redirección ahora es manejada por App.vue (onAuthStateChange + nextTick + router.replace) 
    // y el Router Guard. No se hace router.push() aquí.
    // Si quisieras mostrar un mensaje antes de que App.vue redirija:
    // successMessage.value = "Inicio de sesión exitoso. Redirigiendo...";
    // Pero usualmente la transición es rápida.

  } catch (unexpectedError) { 
    // Este catch es para errores inesperados no manejados por el 'if (signInError)'
    console.error('LoginForm.vue (Revisado): Excepción inesperada en handleLogin:', unexpectedError);
    errorMessage.value = 'Ocurrió un error inesperado. Por favor, contacta a soporte.';
  } finally {
    loading.value = false;
    console.log("LoginForm.vue (Revisado): handleLogin - FIN. Loading:", loading.value);
  }
};

const handleForgotPassword = async () => {
  console.log("LoginForm.vue (Revisado): handleForgotPassword - INICIO. Email:", email.value);
  if (!email.value) {
    errorMessage.value = "Por favor, ingresa tu correo electrónico para iniciar la recuperación de contraseña.";
    successMessage.value = '';
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const recoveryRedirectUrl = `${window.location.origin}/actualizar-contrasena`;
    console.log("LoginForm.vue (Revisado): handleForgotPassword - URL de redirección para recuperación:", recoveryRedirectUrl);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.value, { // Renombrado 'error'
      redirectTo: recoveryRedirectUrl,
    });

    if (resetError) {
      console.error('LoginForm.vue (Revisado): Error en resetPasswordForEmail:', resetError);
      errorMessage.value = "Error al enviar el correo de recuperación: " + resetError.message;
    } else {
      console.log("LoginForm.vue (Revisado): Correo de recuperación enviado (si el email existe).");
      successMessage.value = "Si existe una cuenta para " + email.value + ", recibirás un correo con instrucciones para restablecer tu contraseña.";
    }
  } catch (e) {
    console.error("LoginForm.vue (Revisado): Excepción inesperada en handleForgotPassword:", e);
    errorMessage.value = "Ocurrió un error inesperado al intentar recuperar la contraseña.";
  } finally {
    loading.value = false;
    console.log("LoginForm.vue (Revisado): handleForgotPassword - FIN. Loading:", loading.value);
  }
};

console.log("LoginForm.vue (Revisado): Script setup FINALIZADO");
</script>
<template>
  <div class="min-h-full flex items-center justify-center px-4 py-12 text-white"> 
    <!-- 
      - min-h-full: Para que este div ocupe la altura de su contenedor padre (<main> en App.vue).
      - text-white: Establece el color de texto por defecto para esta vista, asumiendo que el fondo 
                    de App.vue (<main>) será oscuro para las rutas de autenticación.
      - El fondo degradado (bg-gradient-to-br from-blue-900 to-blue-700) se aplica en App.vue.
    -->
    <div class="w-full max-w-md bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 sm:p-10">
      <!-- Cambiado bg-white/10 a bg-black/30 y backdrop-blur-md para un efecto de vidrio más pronunciado -->
      
      <div class="flex justify-center mb-6 sm:mb-8">
        <img class="h-16 w-16 sm:h-20 sm:w-20" src="/districorr-logo-circular.png" alt="Districorr Logo" />
      </div>

      <h2 class="text-center text-3xl sm:text-4xl font-bold mb-2 tracking-tight text-white">
        Iniciar Sesión
      </h2>
      <p class="text-center text-sm text-blue-200 mb-8 sm:mb-10">
        Bienvenido de nuevo. Por favor, ingresa tus datos.
      </p>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label for="login-email" class="sr-only">Correo electrónico</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="tuCorreo@ejemplo.com"
            class="form-input-login placeholder-blue-300/70" 
          />
        </div>

        <div>
          <label for="login-password" class="sr-only">Contraseña</label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            placeholder="Contraseña"
            class="form-input-login placeholder-blue-300/70"
          />
        </div>

        <div class="flex items-center justify-end text-sm">
          <button
            type="button"
            @click.prevent="handleForgotPassword"
            :disabled="loading"
            class="font-medium text-blue-300 hover:text-white hover:underline transition-colors duration-150"
            :class="{'opacity-60 cursor-not-allowed': loading}"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        <!-- Mensajes de Error y Éxito -->
        <div v-if="errorMessage" class="form-message error-message" role="alert">
          <p class="font-semibold">Error al iniciar sesión:</p>
          <p>{{ errorMessage }}</p>
        </div>
        <div v-if="successMessage" class="form-message success-message" role="alert">
          {{ successMessage }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="form-button-submit group"
        >
          <svg v-if="loading" class="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"></path>
          </svg>
          <span class="group-hover:tracking-wider transition-all duration-200 text-base font-semibold">
            {{ loading ? 'Ingresando...' : 'Iniciar Sesión' }}
          </span>
        </button>

        <p class="text-center text-sm text-blue-200 pt-3">
          ¿No tienes una cuenta?
          <RouterLink :to="{ name: 'Register' }" class="font-semibold text-blue-300 hover:text-white hover:underline ml-1 transition-colors duration-150">
            Crea una aquí
          </RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.form-input-login {
  @apply w-full px-4 py-3.5 rounded-xl bg-white/10 border-2 border-transparent placeholder-blue-300/70 text-white 
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
.success-message {
  @apply bg-green-500/30 text-green-100 border-green-500/50;
}
.form-button-submit {
  @apply w-full flex justify-center items-center py-3.5 px-4 rounded-xl 
         bg-gradient-to-r from-blue-500 via-blue-600 to-cyan-500 
         text-white 
         hover:from-blue-600 hover:to-cyan-600 
         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-blue-900/50
         transition-all duration-200 ease-in-out shadow-lg hover:shadow-blue-500/50
         disabled:opacity-70 disabled:cursor-not-allowed;
}
</style>