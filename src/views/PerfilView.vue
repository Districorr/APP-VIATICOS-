<script setup>
import { ref, inject, onMounted, watch, computed } from 'vue';
import { supabase } from '../supabaseClient.js';

// --- Inyección de Estado Global ---
const userProfileInjected = inject('userProfile'); 
const userSessionInjected = inject('currentUserSession');
const loadingAuthInjected = inject('loadingAuthSession');
const initialAuthCheckDoneInjected = inject('initialAuthCheckDone');

// --- Estado Local ---
const localProfile = ref(null);
const localUserAuth = ref(null);

// --- Formulario de Información Personal ---
const editNombre = ref('');
const editEmail = ref('');
const savingProfile = ref(false);
const profileMsg = ref('');
const profileError = ref(false);

// --- Formulario de Cambio de Contraseña ---
const newPassword = ref('');
const confirmNewPassword = ref('');
const showNewPassword = ref(false);
const showConfirmNewPassword = ref(false);
const changingPassword = ref(false);
const passwordMsg = ref('');
const passwordError = ref(false);

// Observadores para sincronizar datos inyectados
watch(userProfileInjected, (newVal) => {
  if (newVal) {
    localProfile.value = { ...newVal };
    if (!editNombre.value) editNombre.value = newVal.nombre_completo || '';
  } else {
    localProfile.value = null;
  }
}, { immediate: true, deep: true });

watch(userSessionInjected, (newVal) => {
  if (newVal?.user) {
    localUserAuth.value = { ...newVal.user };
    if (!editEmail.value) editEmail.value = newVal.user.email || '';
  } else {
    localUserAuth.value = null;
  }
}, { immediate: true, deep: true });

// Iniciales del usuario
const userInitials = computed(() => {
  const name = editNombre.value || localProfile.value?.nombre_completo || localUserAuth.value?.email || 'U';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
});

// Nivel de fuerza de la contraseña
const passwordStrength = computed(() => {
  if (!newPassword.value) return { score: 0, label: '', color: '' };
  const len = newPassword.value.length;
  if (len < 6) return { score: 1, label: 'Muy débil (mínimo 6 caracteres)', color: 'text-red-600 font-bold' };
  if (len < 9) return { score: 2, label: 'Aceptable', color: 'text-yellow-600 font-bold' };
  return { score: 3, label: 'Fuerte', color: 'text-emerald-600 font-bold' };
});

// Formateador de fecha
const formatDateLocal = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Fecha inválida';
    return date.toLocaleString('es-AR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return 'Error al formatear';
  }
};

// --- Guardar Datos Personales ---
const handleSaveProfile = async () => {
  profileMsg.value = '';
  profileError.value = false;

  const nombreLimpio = editNombre.value.trim();
  const emailLimpio = editEmail.value.trim().toLowerCase();

  if (!nombreLimpio) {
    profileMsg.value = 'El nombre completo no puede estar vacío.';
    profileError.value = true;
    return;
  }

  if (!emailLimpio || !/\S+@\S+\.\S+/.test(emailLimpio)) {
    profileMsg.value = 'Ingresá un correo electrónico válido.';
    profileError.value = true;
    return;
  }

  savingProfile.value = true;

  try {
    const userId = localUserAuth.value.id;
    const emailChanged = emailLimpio !== localUserAuth.value.email;
    const nombreChanged = nombreLimpio !== (localProfile.value?.nombre_completo || '');

    if (!emailChanged && !nombreChanged) {
      profileMsg.value = 'No se detectaron cambios para guardar.';
      profileError.value = false;
      savingProfile.value = false;
      return;
    }

    // 1. Actualizar Nombre en la tabla perfiles
    if (nombreChanged || emailChanged) {
      const { error: profileErr } = await supabase
        .from('perfiles')
        .update({
          nombre_completo: nombreLimpio,
          email: emailLimpio
        })
        .eq('id', userId);

      if (profileErr) throw profileErr;
      if (localProfile.value) localProfile.value.nombre_completo = nombreLimpio;
    }

    // 2. Si cambió el correo en Auth de Supabase
    if (emailChanged) {
      const { data: authData, error: authErr } = await supabase.auth.updateUser({
        email: emailLimpio
      });
      if (authErr) throw authErr;
      
      localUserAuth.value.email = emailLimpio;
      profileMsg.value = '¡Perfil y correo actualizados con éxito! Revisa la casilla de entrada si Supabase requiere confirmación.';
    } else {
      profileMsg.value = '¡Perfil actualizado con éxito!';
    }

    profileError.value = false;
  } catch (err) {
    console.error('Error al guardar datos del perfil:', err);
    profileMsg.value = `Error al actualizar perfil: ${err.message || 'No se pudo procesar la solicitud'}`;
    profileError.value = true;
  } finally {
    savingProfile.value = false;
  }
};

// --- Cambiar Contraseña ---
const handleChangePassword = async () => {
  passwordMsg.value = '';
  passwordError.value = false;

  if (!newPassword.value || newPassword.value.length < 6) {
    passwordMsg.value = 'La nueva contraseña debe tener al menos 6 caracteres.';
    passwordError.value = true;
    return;
  }

  if (newPassword.value !== confirmNewPassword.value) {
    passwordMsg.value = 'Las nuevas contraseñas no coinciden.';
    passwordError.value = true;
    return;
  }

  changingPassword.value = true;

  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword.value
    });

    if (error) {
      passwordMsg.value = `Error al cambiar contraseña: ${error.message}`;
      passwordError.value = true;
    } else {
      passwordMsg.value = '¡Contraseña modificada exitosamente!';
      passwordError.value = false;
      newPassword.value = '';
      confirmNewPassword.value = '';
    }
  } catch (err) {
    console.error('Excepción al cambiar contraseña:', err);
    passwordMsg.value = 'Ocurrió un error inesperado al actualizar la contraseña.';
    passwordError.value = true;
  } finally {
    changingPassword.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
    <div class="max-w-3xl mx-auto space-y-6">

      <!-- Estado de Carga -->
      <div v-if="loadingAuthInjected && !initialAuthCheckDoneInjected" class="flex justify-center items-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
        <svg class="animate-spin h-8 w-8 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="ml-3 text-base font-semibold text-slate-600">Cargando información del usuario...</p>
      </div>

      <!-- Usuario no autenticado -->
      <div v-else-if="!localUserAuth && initialAuthCheckDoneInjected" class="bg-white p-8 rounded-2xl shadow-sm border border-red-200 text-center max-w-md mx-auto space-y-4">
        <div class="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </div>
        <h2 class="text-lg font-bold text-slate-800">Sesión no detectada</h2>
        <p class="text-sm text-slate-600">Para ver y modificar los datos de tu perfil, necesitás iniciar sesión.</p>
        <router-link :to="{name: 'Login'}" class="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors">
          Iniciar Sesión
        </router-link>
      </div>

      <!-- Contenido Principal cuando existe sesión -->
      <template v-else-if="localUserAuth">

        <!-- Card de Encabezado de Usuario -->
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <!-- Avatar de Iniciales -->
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-black text-2xl flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
            {{ userInitials }}
          </div>

          <div class="flex-grow text-center sm:text-left space-y-1">
            <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 class="text-xl font-black text-slate-900">{{ editNombre || localProfile?.nombre_completo || 'Usuario' }}</h1>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                {{ localProfile?.rol ? localProfile.rol.replace('_', ' ') : 'Usuario' }}
              </span>
            </div>
            <p class="text-sm font-medium text-slate-500">{{ localUserAuth.email }}</p>
            <p class="text-xs text-slate-400 font-mono">ID: {{ localUserAuth.id }}</p>
          </div>
        </div>

        <!-- Formulario 1: Datos de la Cuenta (Nombre y Correo) -->
        <div class="bg-white rounded-2xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-5">
          <div class="border-b border-slate-200 pb-3">
            <h2 class="text-base font-bold text-slate-800 uppercase tracking-wider">Datos Personales y de Cuenta</h2>
            <p class="text-xs text-slate-500">Modificá tu nombre completo o dirección de correo electrónico.</p>
          </div>

          <form @submit.prevent="handleSaveProfile" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Campo Nombre Completo -->
              <div>
                <label for="edit-nombre" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Nombre Completo <span class="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="edit-nombre"
                  v-model="editNombre"
                  placeholder="Ej. Juan Ramón Diloff"
                  required
                  class="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>

              <!-- Campo Correo Electrónico -->
              <div>
                <label for="edit-email" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Correo Electrónico <span class="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="edit-email"
                  v-model="editEmail"
                  placeholder="ejemplo@dominio.com"
                  required
                  class="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                />
              </div>
            </div>

            <!-- Información adicional de la cuenta -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                <span class="block font-bold text-slate-500 uppercase tracking-wider">Último Inicio de Sesión</span>
                <span class="font-semibold text-slate-800">{{ formatDateLocal(localUserAuth.last_sign_in_at) }}</span>
              </div>
              <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                <span class="block font-bold text-slate-500 uppercase tracking-wider">Fecha de Creación</span>
                <span class="font-semibold text-slate-800">{{ formatDateLocal(localUserAuth.created_at) }}</span>
              </div>
            </div>

            <!-- Alerta de Feedback del Perfil -->
            <div v-if="profileMsg" :class="profileError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'" class="p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2">
              <svg v-if="!profileError" class="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
              <svg v-else class="w-4 h-4 text-red-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
              <span>{{ profileMsg }}</span>
            </div>

            <!-- Botón Guardar Datos -->
            <div class="flex justify-end pt-2">
              <button
                type="submit"
                :disabled="savingProfile"
                class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg v-if="savingProfile" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ savingProfile ? 'Guardando...' : 'Guardar Datos de Cuenta' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Formulario 2: Cambio de Contraseña -->
        <div class="bg-white rounded-2xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-5">
          <div class="border-b border-slate-200 pb-3">
            <h2 class="text-base font-bold text-slate-800 uppercase tracking-wider">Seguridad y Cambio de Contraseña</h2>
            <p class="text-xs text-slate-500">Ingresá tu nueva clave. Mínimo 6 caracteres.</p>
          </div>

          <form @submit.prevent="handleChangePassword" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <!-- Nueva Contraseña con botón de ojo -->
              <div>
                <label for="new-password" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Nueva Contraseña <span class="text-red-500">*</span>
                </label>
                <div class="relative">
                  <input
                    :type="showNewPassword ? 'text' : 'password'"
                    id="new-password"
                    v-model="newPassword"
                    placeholder="Mínimo 6 caracteres"
                    required
                    class="w-full rounded-xl border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                  />
                  <button
                    type="button"
                    @click="showNewPassword = !showNewPassword"
                    class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="Mostrar / Ocultar Contraseña"
                  >
                    <svg v-if="!showNewPassword" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a8.959 8.959 0 013.682-.792c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18"/></svg>
                  </button>
                </div>
              </div>

              <!-- Confirmar Nueva Contraseña -->
              <div>
                <label for="confirm-new-password" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Confirmar Contraseña <span class="text-red-500">*</span>
                </label>
                <div class="relative">
                  <input
                    :type="showConfirmNewPassword ? 'text' : 'password'"
                    id="confirm-new-password"
                    v-model="confirmNewPassword"
                    placeholder="Repetir contraseña"
                    required
                    class="w-full rounded-xl border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                  />
                  <button
                    type="button"
                    @click="showConfirmNewPassword = !showConfirmNewPassword"
                    class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="Mostrar / Ocultar Contraseña"
                  >
                    <svg v-if="!showConfirmNewPassword" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a8.959 8.959 0 013.682-.792c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18"/></svg>
                  </button>
                </div>
              </div>

            </div>

            <!-- Indicador visual de fuerza de contraseña -->
            <div v-if="newPassword" class="space-y-1">
              <div class="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                <span class="text-slate-500">Seguridad:</span>
                <span :class="passwordStrength.color">{{ passwordStrength.label }}</span>
              </div>
              <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-1">
                <div class="h-full rounded-full transition-all duration-300" :class="passwordStrength.score >= 1 ? 'w-1/3 bg-red-500' : 'bg-transparent'"></div>
                <div class="h-full rounded-full transition-all duration-300" :class="passwordStrength.score >= 2 ? 'w-1/3 bg-yellow-500' : 'bg-transparent'"></div>
                <div class="h-full rounded-full transition-all duration-300" :class="passwordStrength.score >= 3 ? 'w-1/3 bg-emerald-500' : 'bg-transparent'"></div>
              </div>
            </div>

            <!-- Alerta de Feedback de la Contraseña -->
            <div v-if="passwordMsg" :class="passwordError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'" class="p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2">
              <svg v-if="!passwordError" class="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
              <svg v-else class="w-4 h-4 text-red-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
              <span>{{ passwordMsg }}</span>
            </div>

            <!-- Botón Actualizar Contraseña -->
            <div class="flex justify-end pt-2">
              <button
                type="submit"
                :disabled="changingPassword || !newPassword || !confirmNewPassword"
                class="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg v-if="changingPassword" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ changingPassword ? 'Actualizando...' : 'Actualizar Contraseña' }}
              </button>
            </div>
          </form>
        </div>

      </template>

    </div>
  </div>
</template>