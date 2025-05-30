<script setup>
import { ref } from 'vue';
import RegisterForm from '../components/RegisterForm.vue';
import { useRouter, RouterLink } from 'vue-router';

const router = useRouter();
const logoSrc = '/districorr-logo-circular.png'; // Asume que está en public/

const registrationFeedback = ref({
  message: '',
  isError: false,
  success: false,
  requiresConfirmation: false
});
const showFeedbackMessage = ref(false);

const handleRegistrationComplete = (feedback) => {
  console.log("RegisterView: Evento 'registration-complete' recibido:", feedback);
  registrationFeedback.value = feedback;
  showFeedbackMessage.value = true;

  // Opcional: si el registro fue exitoso y no requiere confirmación,
  // podrías redirigir a Login después de un delay.
  if (feedback.success && !feedback.requiresConfirmation) {
    setTimeout(() => {
      router.push({ name: 'Login' });
    }, 3000); // Redirigir después de 3 segundos
  }
};
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100/50 px-4 py-12 sm:px-6 lg:px-8">
    <div class="w-full max-w-md space-y-8">
      
      <div>
        <RouterLink :to="{ name: 'Login' }" class="flex justify-center">
          <img class="h-20 w-auto sm:h-24" :src="logoSrc" alt="Districorr InfoGastos Logo">
        </RouterLink>
        <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-districorr-primary">
          Crear Nueva Cuenta
        </h2>
        <p v-if="!showFeedbackMessage || registrationFeedback.isError" class="mt-2 text-center text-sm text-districorr-text-medium">
          Completa tus datos para unirte a InfoGastos.
        </p>
      </div>

      <!-- Mostrar mensaje de feedback o el formulario -->
      <div v-if="showFeedbackMessage" 
           class="bg-white p-8 shadow-2xl rounded-xl border border-gray-200/60 text-center">
          <div :class="[
                 registrationFeedback.isError ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200',
                 'p-4 rounded-lg border'
               ]">
            <p class="font-medium text-lg mb-2">
              {{ registrationFeedback.isError ? 'Error en el Registro' : (registrationFeedback.requiresConfirmation ? '¡Casi Listo!' : '¡Registro Exitoso!') }}
            </p>
            <p class="text-sm">{{ registrationFeedback.message }}</p>
          </div>
          <RouterLink v-if="registrationFeedback.success || registrationFeedback.message.includes('ya está registrado')" 
                      :to="{ name: 'Login' }" 
                      class="mt-6 inline-block w-full sm:w-auto px-6 py-3 bg-districorr-primary text-white font-semibold rounded-lg hover:bg-opacity-85 transition-all">
            Ir a Iniciar Sesión
          </RouterLink>
      </div>

      <RegisterForm v-else @registration-complete="handleRegistrationComplete" />
      
      <p v-if="!showFeedbackMessage || registrationFeedback.isError" class="mt-8 text-center text-sm text-gray-600">
        ¿Ya tienes una cuenta?
        <RouterLink :to="{ name: 'Login' }" class="font-medium text-districorr-accent hover:text-districorr-accent/80 transition-colors">
          Inicia sesión aquí
        </RouterLink>
      </p>
       <p class="mt-4 text-center text-xs text-gray-500">
        © {{ new Date().getFullYear() }} Districorr S.R.L. Todos los derechos reservados.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Estilos específicos para RegisterView si son necesarios */
</style>