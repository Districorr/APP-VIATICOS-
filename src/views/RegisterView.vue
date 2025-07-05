<script setup>
import { ref } from 'vue';
import RegisterForm from '../components/RegisterForm.vue'; // Asegúrate que la ruta sea correcta
import { useRouter, RouterLink } from 'vue-router';

console.log("RegisterView.vue: Script setup INICIADO");

const router = useRouter();
const logoSrc = '/districorr-logo-circular.png'; // Asume que está en public/ o ajusta la ruta

// Estado para manejar el feedback del formulario de registro
const registrationFeedback = ref({
  message: '',
  isError: false,
  success: false,
  requiresConfirmation: false // Para saber si se necesita confirmación por email
});
const showFeedbackMessage = ref(false); // Controla si se muestra el mensaje de feedback o el formulario

// Manejador para el evento emitido por RegisterForm
const handleRegistrationComplete = (feedback) => {
  console.log("RegisterView.vue: Evento 'registration-complete' recibido:", feedback);
  registrationFeedback.value = { ...feedback }; // Copiar el objeto de feedback
  showFeedbackMessage.value = true; // Mostrar el bloque de mensaje

  // Opcional: Redirigir automáticamente a Login si el registro fue exitoso
  // y NO requiere confirmación por email.
  if (feedback.success && !feedback.requiresConfirmation) {
    console.log("RegisterView.vue: Registro exitoso y sin confirmación requerida. Redirigiendo a Login en 3 segundos...");
    setTimeout(() => {
      router.push({ name: 'Login' });
    }, 3000); // Redirigir después de 3 segundos
  } else if (feedback.success && feedback.requiresConfirmation) {
    console.log("RegisterView.vue: Registro exitoso, pero requiere confirmación por email.");
    // No redirigir automáticamente, el usuario debe ver el mensaje de "revisa tu email".
  } else if (feedback.isError) {
    console.log("RegisterView.vue: Error en el registro.");
    // No redirigir, el usuario debe ver el error y poder intentarlo de nuevo (si el formulario se volviera a mostrar).
    // En este diseño, el formulario se oculta al mostrar el feedback. El usuario puede usar el enlace para ir a Login.
  }
};

console.log("RegisterView.vue: Script setup FINALIZADO");
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-800 via-blue-600 to-sky-400 px-4 py-12 sm:px-6 lg:px-8">
    <!-- 
      Este div raíz proporciona el fondo degradado y el centrado para toda la página de registro.
      Ajusta los colores del degradado según tu preferencia.
    -->
    <div class="w-full max-w-lg space-y-8"> 
      
      <div>
        <RouterLink :to="{ name: 'Login' }" class="flex justify-center" aria-label="Ir a la página de inicio de sesión">
          <img class="h-20 w-auto sm:h-24" :src="logoSrc" alt="Logo Districorr InfoGastos">
        </RouterLink>
        <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-white">
          Crear Nueva Cuenta
        </h2>
        <!-- Mostrar este párrafo solo si aún no hay feedback o si el feedback es un error (para permitir reintentar si el form se volviera a mostrar) -->
        <p v-if="!showFeedbackMessage || registrationFeedback.isError" class="mt-2 text-center text-sm text-blue-100">
          Completa tus datos para unirte a InfoGastos.
        </p>
      </div>

      <!-- Contenedor para el mensaje de feedback o el formulario -->
      <div class="bg-white p-6 sm:p-8 shadow-2xl rounded-xl border border-gray-200/60">
        <div v-if="showFeedbackMessage" class="text-center">
            <div 
              class="p-4 rounded-lg border mb-6 text-sm"
              :class="{
                 'text-red-700 bg-red-50 border-red-300': registrationFeedback.isError,
                 'text-green-700 bg-green-50 border-green-300': registrationFeedback.success && !registrationFeedback.requiresConfirmation,
                 'text-blue-700 bg-blue-50 border-blue-300': registrationFeedback.success && registrationFeedback.requiresConfirmation
               }"
              role="alert"
            >
              <p class="font-semibold text-base mb-1">
                {{ 
                  registrationFeedback.isError 
                    ? 'Error en el Registro' 
                    : (registrationFeedback.requiresConfirmation 
                        ? '¡Casi Listo!' 
                        : '¡Registro Exitoso!') 
                }}
              </p>
              <p>{{ registrationFeedback.message }}</p>
            </div>
            
            <!-- Botón para ir a Login, siempre visible después del feedback -->
            <RouterLink 
                :to="{ name: 'Login' }" 
                class="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3 bg-districorr-accent text-white font-semibold rounded-lg hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent transition-all duration-150 ease-in-out shadow-md hover:shadow-lg"
            >
              Ir a Iniciar Sesión
            </RouterLink>
        </div>

        <!-- Renderizar el formulario de registro si no se está mostrando un mensaje de feedback -->
        <RegisterForm v-else @registration-complete="handleRegistrationComplete" />
      </div>
      
      <!-- Enlace para ir a Login, se muestra si el formulario está visible o si hubo un error -->
      <p v-if="!showFeedbackMessage || registrationFeedback.isError" class="text-center text-sm text-blue-100">
        ¿Ya tienes una cuenta?
        <RouterLink :to="{ name: 'Login' }" class="font-semibold text-sky-200 hover:text-white hover:underline ml-1 transition-colors">
          Inicia sesión aquí
        </RouterLink>
      </p>
       <p class="mt-6 text-center text-xs text-blue-200/80">
        © {{ new Date().getFullYear() }} Districorr S.R.L. Todos los derechos reservados.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Estilos específicos para RegisterView si son necesarios. */
/* Por ejemplo, si quieres un alto mínimo específico para el contenedor del formulario/feedback */
/* .bg-white { min-height: 400px; } */ /* Ajusta según necesidad */
</style>