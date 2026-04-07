<template>
  <div class="container mx-auto p-8">
    <h1 class="text-2xl font-bold mb-4">Actualizar Contraseña</h1>
    <p>Aquí irá el formulario para ingresar la nueva contraseña.</p>
    <!-- TODO: Implementar formulario de actualización de contraseña -->
  </div>
</template>

<script setup>
// Lógica para manejar la actualización de contraseña con el token de Supabase irá aquí.
import { ref, onMounted } from 'vue';
import { supabase } from '../supabaseClient.js'; // O donde esté tu cliente Supabase
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();
const newPassword = ref('');
const confirmPassword = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const loading = ref(false);
const token = ref(null); // Para el token de la URL

// Supabase maneja el token de reseteo en el hash de la URL (#)
// y el evento 'PASSWORD_RECOVERY'
onMounted(() => {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      console.log('Evento PASSWORD_RECOVERY detectado, sesión:', session);
      // Supabase JS client v2 automáticamente maneja el hash y te da la sesión.
      // No necesitas extraer el token manualmente del hash en la mayoría de los casos con v2.
      // Si la sesión existe, el usuario ya está "en proceso de recuperación".
      // Si necesitas el access_token para algo específico, está en session.access_token
      if (session && session.access_token) {
        token.value = session.access_token;
        // No necesitas llamar a verifyOtp si usas onAuthStateChange, ya que Supabase lo hace.
        // El usuario ya está en un estado donde puede actualizar su contraseña.
        successMessage.value = "Puedes establecer tu nueva contraseña.";
      } else {
        errorMessage.value = "No se pudo verificar el token de recuperación. El enlace podría haber expirado o ser inválido.";
      }
    }
  });
});

const handlePasswordUpdate = async () => {
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = "Las contraseñas no coinciden.";
    return;
  }
  if (newPassword.value.length < 6) { // O la longitud mínima que tengas configurada en Supabase
    errorMessage.value = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    // Con Supabase JS Client v2, si el evento PASSWORD_RECOVERY ya te dio una sesión,
    // el usuario está autenticado temporalmente para este propósito.
    // Simplemente actualizas la contraseña del usuario.
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword.value
    });

    if (error) throw error;

    successMessage.value = "¡Contraseña actualizada con éxito! Ahora puedes iniciar sesión con tu nueva contraseña.";
    newPassword.value = '';
    confirmPassword.value = '';
    // Opcional: Redirigir a login después de un momento
    setTimeout(() => {
      router.push({ name: 'Login' });
    }, 3000);

  } catch (error) {
    console.error("Error actualizando contraseña:", error);
    errorMessage.value = "Error al actualizar la contraseña: " + error.message;
  } finally {
    loading.value = false;
  }
};
</script>