<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient.js'; 
import { useRouter } from 'vue-router';

console.log("RegisterForm.vue (V2.1 - con options.data): Script setup INICIADO");

const router = useRouter();

// Refs para los campos del formulario
const nombreCompleto = ref('');
const puesto = ref(''); 
const email = ref('');
const password = ref('');
const confirmPassword = ref(''); 

// Opciones para el select de "Puesto / Área"
const puestosDisponibles = ref([
  { valor: '', etiqueta: '-- Selecciona tu puesto --' },
  { valor: 'Vendedor', etiqueta: 'Vendedor' },
  { valor: 'Administrativo', etiqueta: 'Administrativo' },
  { valor: 'Tecnico', etiqueta: 'Técnico' },
  { valor: 'Gerencia', etiqueta: 'Gerencia' },
  { valor: 'Otro', etiqueta: 'Otro' },
]);

// Refs para mensajes y estado de carga
const errorMessage = ref('');
// successMessage se maneja a través del evento emitido
const loading = ref(false);

const emit = defineEmits(['registration-complete']);

const handleRegister = async () => {
  console.log("RegisterForm.vue (V2.1): handleRegister - INICIO. Email:", email.value);
  errorMessage.value = ''; // Limpiar error previo

  // Validaciones del Frontend
  if (!nombreCompleto.value.trim()) {
    errorMessage.value = 'Por favor, ingresa tu nombre completo.';
    // No emitir aquí, dejar que el usuario corrija y reintente. El mensaje se muestra en el form.
    // Si quieres emitir para que RegisterView lo muestre, puedes hacerlo:
    // emit('registration-complete', { success: false, isError: true, requiresConfirmation: false, message: errorMessage.value });
    return;
  }
  if (!puesto.value) { 
    errorMessage.value = 'Por favor, selecciona tu puesto o área.';
    return;
  }
  if (!email.value.trim()) {
    errorMessage.value = 'Por favor, ingresa tu correo electrónico.';
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Las contraseñas no coinciden.';
    return;
  }
  if (password.value.length < 6) { 
    errorMessage.value = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  loading.value = true;
  let feedback = { success: false, isError: false, requiresConfirmation: false, message: '' };

  try {
    console.log("RegisterForm.vue (V2.1): Llamando a supabase.auth.signUp con options.data:", 
      { nombre_completo: nombreCompleto.value.trim(), puesto: puesto.value }
    );

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: email.value.trim(), // Asegurar trim también en el email
      password: password.value,
      options: {
        data: { 
          nombre_completo: nombreCompleto.value.trim(),
          puesto: puesto.value
          // El rol será asignado por el DEFAULT en la tabla 'perfiles' o por el trigger si lo modifica.
          // formato_predeterminado_id también tomará su DEFAULT.
        }
        // redirectTo: `${window.location.origin}/ruta-post-confirmacion` // Opcional
      }
    });

    if (signUpError) {
      console.error('RegisterForm.vue (V2.1): Error en Supabase signUp:', signUpError);
      if (signUpError.message.toLowerCase().includes("user already registered")) {
        feedback.message = "Este correo electrónico ya está registrado. Intenta iniciar sesión o recuperar tu contraseña.";
      } else if (signUpError.message.toLowerCase().includes("password should be at least 6 characters")) {
        feedback.message = "La contraseña debe tener al menos 6 caracteres.";
      } else if (signUpError.message.toLowerCase().includes("database error saving new user")) {
        // Este es el error que veíamos si el trigger fallaba (ej. por duplicate key ANTES del ON CONFLICT)
        feedback.message = "Hubo un error al guardar tu información de perfil. Por favor, intenta de nuevo o contacta a soporte si el problema persiste.";
      }
      else {
        feedback.message = `Error en el registro: ${signUpError.message}`;
      }
      feedback.isError = true;
    } else {
      console.log('RegisterForm.vue (V2.1): Usuario creado/pendiente en Auth:', authData);
      
      // authData.user será null si la confirmación de email está habilitada y el usuario aún no ha confirmado.
      // authData.session también será null en ese caso.
      // El trigger handle_new_user se habrá ejecutado y creado/actualizado la fila en perfiles.
      
      feedback.requiresConfirmation = !!(authData.session === null && !authData.user && authData.identities && authData.identities.length > 0);
      
      if (feedback.requiresConfirmation) {
        feedback.message = "¡Gracias por registrarte! Revisa tu correo electrónico para confirmar tu cuenta y poder iniciar sesión.";
        feedback.success = true; 
      } else if (authData.user) { 
        feedback.message = "¡Registro exitoso! Serás redirigido al login en unos segundos.";
        feedback.success = true;
      } else {
        // Caso menos común si signUp no da error pero tampoco user ni indica confirmación explícita
        console.warn("RegisterForm.vue (V2.1): Respuesta de signUp no concluyente, asumiendo pendiente de confirmación.", authData);
        feedback.message = "Registro procesado. Por favor, revisa tu correo para los siguientes pasos.";
        feedback.success = true; 
        feedback.requiresConfirmation = true; 
      }
    }
  } catch (error) { 
    console.error('RegisterForm.vue (V2.1): Error general en handleRegister:', error);
    feedback.message = 'Ocurrió un error inesperado durante el registro. Por favor, inténtalo de nuevo.';
    feedback.isError = true;
  } finally {
    loading.value = false;
    // Emitir el feedback al componente padre (RegisterView.vue)
    // RegisterView.vue se encargará de mostrar el mensaje y/o redirigir.
    emit('registration-complete', feedback); 
    console.log("RegisterForm.vue (V2.1): handleRegister - FIN. Feedback emitido:", feedback);
  }
};
console.log("RegisterForm.vue (V2.1 - con options.data): Script setup FINALIZADO");
</script>
<template>
  <!-- 
    Contenedor principal del formulario. 
    Asumimos que RegisterView.vue proporciona el layout de página (centrado, fondo, etc.).
    Este div es la "tarjeta" del formulario.
  -->
  <div class="bg-white p-6 sm:p-8 shadow-xl rounded-xl border border-gray-200/70 w-full space-y-6">
    <!-- El título y subtítulo ahora están en RegisterView.vue para mayor flexibilidad -->
    <!-- Si quieres un título específico para esta tarjeta de formulario, puedes añadirlo aquí -->
    <!-- 
    <div class="text-center mb-6">
      <h2 class="text-2xl font-bold text-districorr-primary">Crear Cuenta</h2>
      <p class="text-sm text-districorr-text-medium">Ingresa tus datos para comenzar.</p>
    </div>
    -->

    <form @submit.prevent="handleRegister" class="space-y-5">
      <div>
        <label for="reg-nombre-completo" class="form-label">
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
          class="form-input"
        />
      </div>

      <div>
        <label for="reg-puesto" class="form-label">
          Puesto / Área <span class="text-red-500">*</span>
        </label>
        <select 
          id="reg-puesto" 
          name="puesto" 
          required 
          v-model="puesto"
          class="form-input form-select" 
        >
          <option value="" disabled>-- Selecciona tu puesto --</option>
          <option v-for="item in puestosDisponibles" :key="item.valor" :value="item.valor">
            {{ item.etiqueta }}
          </option>
        </select>
      </div>

      <div>
        <label for="reg-email" class="form-label">
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
          class="form-input"
        />
      </div>

      <div>
        <label for="reg-password" class="form-label">
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
          class="form-input"
        />
      </div>

      <div>
        <label for="reg-confirm-password" class="form-label">
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
          class="form-input"
        />
      </div>
      
      <!-- Los mensajes de error/éxito ahora son manejados por RegisterView.vue -->
      <!-- a través del evento 'registration-complete'. Si quieres mostrarlos también aquí, -->
      <!-- necesitarías refs locales para errorMessage y successMessage y no emitir, -->
      <!-- o duplicar la lógica de mensajes. Es más limpio manejarlo en el padre. -->

      <div class="pt-3"> 
        <button 
          type="submit" 
          :disabled="loading" 
          class="form-button-submit group w-full" 
        >
          <svg v-if="loading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="group-hover:tracking-wider transition-all duration-200 text-base font-semibold">
            {{ loading ? 'Registrando...' : 'Crear Cuenta' }}
          </span>
        </button>
      </div>
    </form>
  </div>
</template>
<style scoped>
.form-label {
  @apply block text-sm font-medium text-gray-700 mb-1.5;
}

.form-input { /* Estilo base para inputs y select */
  @apply appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm 
         placeholder-gray-400 
         focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent 
         sm:text-sm transition-colors duration-150;
}

.form-select { /* Puede heredar de form-input y añadir/sobrescribir estilos de select */
  @apply bg-white; /* Para asegurar que el fondo del select sea blanco */
}

.form-button-submit { /* Similar al de Login, pero puedes cambiar el color base si quieres */
  @apply w-full flex justify-center items-center py-3.5 px-4 rounded-xl 
         bg-districorr-accent text-white /* Usando tu color de acento */
         hover:bg-opacity-85 
         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent
         disabled:opacity-60 disabled:cursor-not-allowed
         transition-all duration-150 ease-in-out shadow-lg hover:shadow-md 
         transform active:scale-95; /* Efecto al presionar */
}
</style>