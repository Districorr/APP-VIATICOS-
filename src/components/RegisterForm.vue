<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient.js'; // Ajusta la ruta según tu estructura
import { useRouter } from 'vue-router';

const router = useRouter();

// Refs para los campos del formulario
const nombreCompleto = ref('');
const puesto = ref(''); // Asumo que tienes un campo para "Puesto"
const email = ref('');
const password = ref('');
const passwordConfirm = ref(''); // Si tienes confirmación de contraseña

// Refs para mensajes y estado de carga
const errorMessage = ref('');
const successMessage = ref('');
const loading = ref(false);

// Aquí podrías tener otras refs para formato_predeterminado_id si lo seleccionas en el registro

const handleRegister = async () => {
  // Validación básica de contraseña (puedes añadir más validaciones)
  if (password.value !== passwordConfirm.value) {
    errorMessage.value = 'Las contraseñas no coinciden.';
    return;
  }
  if (password.value.length < 6) { // Mínimo de Supabase por defecto
    errorMessage.value = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    // 1. Registrar el usuario en Supabase Auth
    // No es necesario pasar 'nombre_completo' o 'puesto' en options.data
    // si vamos a hacer un UPDATE explícito después.
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      // options: {
      //   redirectTo: `${window.location.origin}/ruta-post-confirmacion` // Opcional
      // }
    });

    if (signUpError) {
      console.error('Error en Supabase signUp:', signUpError);
      if (signUpError.message.includes("User already registered")) {
        errorMessage.value = "Este correo electrónico ya está registrado. Intenta iniciar sesión.";
      } else if (signUpError.message.includes("Password should be at least 6 characters")) {
        errorMessage.value = "La contraseña debe tener al menos 6 caracteres.";
      } else {
        errorMessage.value = `Error en el registro: ${signUpError.message}`;
      }
      loading.value = false;
      return; // Detener ejecución si signUp falla
    }

    // 2. Si signUp fue exitoso y tenemos un usuario (authData.user)
    //    El trigger 'handle_new_user' ya debería haber creado una fila en 'public.perfiles'
    //    con el id y email del usuario. Ahora actualizamos esa fila.
    if (authData.user) {
      console.log('Usuario creado en Auth, actualizando perfil...');
      
      const profileDataToUpdate = {
        nombre_completo: nombreCompleto.value,
        puesto: puesto.value,
        // email: email.value, // El email ya debería estar en perfiles gracias al trigger
        // rol: 'usuario_comun', // El rol debería ser establecido por el trigger o como default en la tabla
        // formato_predeterminado_id: tuRefDeFormatoId.value, // Si lo tienes
      };

      // Filtrar propiedades undefined para no enviar campos vacíos si no se rellenaron (opcional)
      Object.keys(profileDataToUpdate).forEach(key => {
        if (profileDataToUpdate[key] === '' || profileDataToUpdate[key] === undefined) {
          delete profileDataToUpdate[key];
        }
      });
      
      // Solo proceder con el update si hay algo que actualizar además de lo que el trigger pondría
      if (Object.keys(profileDataToUpdate).length > 0) {
          const { error: profileUpdateError } = await supabase
            .from('perfiles')
            .update(profileDataToUpdate)
            .eq('id', authData.user.id); // Condición WHERE para actualizar el perfil correcto

          if (profileUpdateError) {
            console.error('Error actualizando perfil después del registro:', profileUpdateError);
            // Este es un caso complicado: el usuario está en Auth pero su perfil no se completó.
            // Podrías mostrar un error más específico o intentar alguna lógica de compensación.
            // Por ahora, un mensaje de error general.
            errorMessage.value = 'Usuario registrado, pero hubo un problema al guardar los detalles del perfil. Contacta a soporte.';
            // Podrías considerar añadir un log más detallado aquí para ti (ej. a un servicio de logging)
            // sobre authData.user.id para investigar manualmente.
            loading.value = false;
            return; // Detener para no mostrar mensaje de éxito incorrecto
          }
          console.log('Perfil actualizado exitosamente para el usuario:', authData.user.id);
      } else {
          console.log('No se requirió actualización adicional del perfil, el trigger lo manejó todo o no había datos extra.');
      }

      successMessage.value = "¡Registro exitoso! Revisa tu correo electrónico para confirmar tu cuenta. Serás redirigido al login.";
      
      // Opcional: Redirigir al usuario después de un breve retraso
      setTimeout(() => {
        router.push({ name: 'Login' }); // O a una página de "revisa tu email"
      }, 3000); // Redirigir después de 3 segundos

    } else if (authData && !authData.user && authData.session === null) {
      // Este caso es común si "Confirm email" está activado en Supabase.
      // signUp no devuelve un user inmediatamente, sino que espera la confirmación.
      // El trigger handle_new_user SÍ se ejecuta en cuanto el usuario se añade a auth.users.
      // Así que la lógica de UPDATE no se podría hacer aquí si dependemos de authData.user.id directamente.
      // Sin embargo, tu error original era "duplicate key", lo que sugiere que el trigger SÍ crea el perfil.
      // La lógica de UPDATE con .eq('id', authData.user.id) fallaría si authData.user es null.
      //
      // Si "Confirm email" está activado, el flujo cambia:
      // 1. signUp() se llama.
      // 2. auth.users se crea, el trigger handle_new_user crea el perfil básico.
      // 3. El usuario confirma el email.
      // 4. El usuario inicia sesión por primera vez. EN ESTE PUNTO podrías querer completar el perfil
      //    si hay campos que no se pudieron rellenar solo con el trigger.
      //
      // Por ahora, mantenemos la lógica de UPDATE asumiendo que authData.user está disponible
      // o que el trigger ya pobló todo lo necesario desde options.data si eso se usara.
      // El error "duplicate key" indica que el INSERT era el problema. El UPDATE no debería dar ese error.
      console.log("Registro pendiente de confirmación por email. El trigger debería haber creado el perfil base.");
      successMessage.value = "¡Gracias por registrarte! Revisa tu correo electrónico para confirmar tu cuenta y poder iniciar sesión.";
       setTimeout(() => {
        router.push({ name: 'Login' });
      }, 3000);
    }

  } catch (error) { // Catch para errores inesperados o los re-lanzados
    console.error('Error general en handleRegister:', error);
    if (!errorMessage.value) { // Si no se estableció un mensaje de error más específico
      errorMessage.value = 'Ocurrió un error inesperado durante el registro.';
    }
  } finally {
    loading.value = false;
  }
};
</script>
<template>
  <!-- La tarjeta blanca y el layout de la página ahora están en RegisterForm.vue -->
  <!-- Si este componente es usado por RegisterView.vue (que ya tiene el layout de página completo),
       entonces este div raíz podría ser solo la tarjeta del formulario.
       Asumiré que este componente es la tarjeta del formulario en sí. -->
  <div class="bg-white p-8 pt-6 shadow-2xl rounded-xl space-y-6 border border-gray-200/60 w-full">
    <form @submit.prevent="handleRegister" class="space-y-5">
      <div>
        <label for="reg-nombre-completo" class="block text-sm font-medium text-gray-700 mb-1.5">
          Nombre Completo <span class="text-red-500">*</span>
        </label>
        <input 
          id="reg-nombre-completo" 
          name="nombreCompleto" 
          type="text" 
          autocomplete="name" 
          required 
          v-model="nombreCompleto" 
          placeholder="Tu nombre y apellido"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150"
        >
      </div>

      <div>
        <label for="reg-puesto" class="block text-sm font-medium text-gray-700 mb-1.5">
          Puesto / Área <span class="text-red-500">*</span>
        </label>
        <select 
          id="reg-puesto" 
          name="puesto" 
          required 
          v-model="puesto"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 bg-white"
        >
          <option value="" disabled>-- Selecciona tu puesto --</option>
          <option v-for="item in puestosDisponibles" :key="item.valor" :value="item.valor">
            {{ item.etiqueta }}
          </option>
        </select>
      </div>

      <div>
        <label for="reg-email" class="block text-sm font-medium text-gray-700 mb-1.5">
          Correo Electrónico <span class="text-red-500">*</span>
        </label>
        <input 
          id="reg-email" 
          name="email" 
          type="email" 
          autocomplete="email" 
          required 
          v-model="email" 
          placeholder="tu@email.com"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150"
        >
      </div>

      <div>
        <label for="reg-password" class="block text-sm font-medium text-gray-700 mb-1.5">
          Contraseña <span class="text-red-500">*</span>
        </label>
        <input 
          id="reg-password" 
          name="password" 
          type="password" 
          autocomplete="new-password" 
          required 
          v-model="password" 
          placeholder="Mínimo 6 caracteres"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150"
        >
      </div>

      <div>
        <label for="reg-confirm-password" class="block text-sm font-medium text-gray-700 mb-1.5">
          Confirmar Contraseña <span class="text-red-500">*</span>
        </label>
        <input 
          id="reg-confirm-password" 
          name="confirm-password" 
          type="password" 
          autocomplete="new-password" 
          required 
          v-model="confirmPassword" 
          placeholder="Repite la contraseña"
          class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150"
        >
      </div>
      
      <!-- El div para mostrar mensajes de error/éxito ha sido movido a RegisterView.vue -->
      <!-- y RegisterForm.vue ahora emite un evento 'registration-complete' -->

      <div class="pt-2"> <!-- Un poco de espacio extra antes del botón -->
        <button 
          type="submit" 
          :disabled="loading" 
          class="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-districorr-accent hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out transform active:scale-95"
        >
          <svg v-if="loading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {{ loading ? 'Registrando...' : 'Crear Cuenta' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* Estilos adicionales si son necesarios para este componente específico. */
</style>