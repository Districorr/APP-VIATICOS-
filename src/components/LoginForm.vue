<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient.js'; 
import { useRouter, useRoute, RouterLink } from 'vue-router';

const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const loading = ref(false);
const rememberMe = ref(false);

const handleLogin = async () => {
  errorMessage.value = ''; successMessage.value = ''; loading.value = true;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value });
    if (error) throw error;
    const redirectToPath = route.query.redirectTo ? String(route.query.redirectTo) : null;
    const redirectTo = redirectToPath ? { path: redirectToPath } : { name: 'Dashboard' }; 
    router.push(redirectTo);
  } catch (error) {
    if (error.message === 'Invalid login credentials') { errorMessage.value = 'Credenciales incorrectas.'; }
    else if (error.message === 'Email not confirmed') { errorMessage.value = 'Correo no confirmado.'; }
    else { errorMessage.value = 'Error al iniciar sesión.'; }
    console.error('Error de login:', error);
  } finally { loading.value = false; }
};

const handleForgotPassword = async () => {
  if (!email.value) { errorMessage.value = "Ingresa tu correo para recuperar contraseña."; successMessage.value = ''; return; }
  loading.value = true; errorMessage.value = ''; successMessage.value = '';
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, { redirectTo: `${window.location.origin}/actualizar-contrasena` });
    if (error) { errorMessage.value = "Error al enviar correo: " + error.message; }
    else { successMessage.value = "Si existe una cuenta para " + email.value + ", recibirás un correo con instrucciones."; }
  } catch (e) { errorMessage.value = "Error inesperado al recuperar contraseña."; }
  finally { loading.value = false; }
};
</script>
<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700 px-4">
    <div class="w-full max-w-md bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-8 text-white">
      
      <div class="flex justify-center mb-6">
        <img class="h-14 w-14" src="/districorr-logo-circular.png" alt="Districorr Logo" />
      </div>

      <h2 class="text-center text-2xl font-bold mb-1">Iniciar Sesión </h2>
      <p class="text-center text-sm text-blue-100 mb-6">Porfavor, ingresa tus datos.</p>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <input
          id="login-email"
          v-model="email"
          type="email"
          required
          placeholder="Correo electrónico"
          class="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 placeholder-blue-200 text-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        <input
          id="login-password"
          v-model="password"
          type="password"
          required
          placeholder="Contraseña"
          class="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 placeholder-blue-200 text-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        <div class="flex justify-end text-sm">
          <button
            type="button"
            @click.prevent="handleForgotPassword"
            :disabled="loading"
            class="text-blue-200 hover:text-white transition"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        <div v-if="errorMessage" class="bg-red-100 text-red-800 text-sm text-center px-3 py-2 rounded-lg border border-red-300">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="bg-green-100 text-green-800 text-sm text-center px-3 py-2 rounded-lg border border-green-300">
          {{ successMessage }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full flex justify-center items-center py-3 px-4 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:opacity-90 transition shadow-lg"
        >
          <svg v-if="loading" class="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"></path>
          </svg>
          {{ loading ? 'Ingresando...' : 'Iniciar Sesión' }}
        </button>

        <p class="text-center text-sm text-blue-100 mt-4">
          ¿No tienes una cuenta?
          <RouterLink :to="{ name: 'Register' }" class="text-blue-300 hover:text-white ml-1">
            Crea una aquí
          </RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* Sin estilos personalizados extra: Tailwind se encarga de todo. */
</style>
