<script setup>
import { ref, onMounted, provide, readonly, watch, computed, onUnmounted } from 'vue';
import AppHeader from './components/AppHeader.vue'; // Ajusta si está en otra ruta
import { supabase } from './supabaseClient.js';    // Ajusta si está en otra ruta
import { useRouter, useRoute } from 'vue-router';

const user = ref(null); 
const userProfile = ref(null);
const loadingAuth = ref(true); 
const initialAuthCheckDone = ref(false);

const router = useRouter();
const route = useRoute();

const isDevelopmentMode = computed(() => import.meta.env.DEV);

provide('userProfile', readonly(userProfile));
provide('currentUser', readonly(user));

let authListenerSubscription = null;

async function fetchUserProfile(userId) {
  console.log(`App.vue fetchUserProfile: INICIO - Buscando perfil para userId: ${userId}`);
  if (!userId) { userProfile.value = null; console.log('App.vue fetchUserProfile: FIN - No userId.'); return null; }
  try {
    const { data, error, status } = await supabase.from('perfiles').select(`rol, nombre_completo, formato_predeterminado_id`).eq('id', userId).single();
    if (error && status !== 406) { console.error('App.vue fetchUserProfile: Error Supabase:', error.message, `(Status: ${status})`); userProfile.value = { rol: 'error_bd', nombre_completo: '(Error BD)'}; }
    else if (data) { console.log('App.vue fetchUserProfile: Perfil ENCONTRADO:', data); userProfile.value = data; }
    else { console.warn('App.vue fetchUserProfile: Perfil NO encontrado en BD:', userId); userProfile.value = { rol: 'no_perfil', nombre_completo: '(No Perfil DB)'}; }
  } catch (e) { console.error('App.vue fetchUserProfile: EXCEPCIÓN:', e.message); userProfile.value = { rol: 'excepcion', nombre_completo: '(Excepción)'}; }
  console.log('App.vue fetchUserProfile: FIN - userProfile.value:', userProfile.value ? JSON.parse(JSON.stringify(userProfile.value)) : null);
  return userProfile.value;
}

async function handleLogoutEvent() {
  console.log('App.vue: handleLogoutEvent INICIO');
  const { error } = await supabase.auth.signOut();
  if (error) { console.error('App.vue: Error signOut:', error.message); }
  else { console.log('App.vue: signOut exitoso.'); user.value = null; userProfile.value = null; router.push({ name: 'Login' }); }
}

onMounted(() => {
  console.log('App.vue: onMounted - Suscribiendo a onAuthStateChange.');
  loadingAuth.value = true; initialAuthCheckDone.value = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
    console.log(`App.vue: onAuthStateChange - Evento: ${_event}, Sesión: ${session ? 'Sí (' + (session.user?.email || 'N/A') + ')' : 'No'}`);
    const currentUser = session?.user ?? null;
    user.value = currentUser;
    if (currentUser) {
      await fetchUserProfile(currentUser.id);
    } else {
      userProfile.value = null;
    }
    if (!initialAuthCheckDone.value || _event === 'INITIAL_SESSION' || _event === 'SIGNED_IN' || _event === 'SIGNED_OUT') {
        loadingAuth.value = false; initialAuthCheckDone.value = true; 
        console.log('App.vue: onAuthStateChange - loadingAuth:',loadingAuth.value, 'initialAuthCheckDone:', initialAuthCheckDone.value);
    }
  });
  authListenerSubscription = subscription;
});

onUnmounted(() => {
  if (authListenerSubscription) { authListenerSubscription.unsubscribe(); console.log('App.vue: Suscripción Auth cancelada.'); }
});

watch(loadingAuth, (nv, ov) => { if (isDevelopmentMode.value) console.log(`App.vue: Watcher loadingAuth: ${ov} -> ${nv}`); });
watch(userProfile, (nv, ov) => { if (isDevelopmentMode.value && JSON.stringify(nv) !== JSON.stringify(ov)) console.log('App.vue: Watcher userProfile cambió:', nv ? JSON.parse(JSON.stringify(nv)) : null); }, { deep: true });
const isAuthRoute = computed(() => { const names = ['Login', 'Register', 'ActualizarContrasena']; return names.includes(String(route.name)); });
</script>

<template>
  <div id="app-container" class="min-h-screen text-districorr-text-dark font-sans flex flex-col">
    <div v-if="isDevelopmentMode" class="fixed bottom-0 left-0 bg-black bg-opacity-85 text-white p-2.5 text-xs z-[9999] ..." style="font-size: 10px; line-height: 1.35;">
      <h4 class="font-bold mb-1 text-yellow-400 border-b border-gray-700 pb-0.5">--- DEBUG (App.vue) ---</h4>
      <p>loadingAuth: <span :class="loadingAuth ? 'text-orange-400' : 'text-green-400 font-semibold'">{{ loadingAuth }}</span></p>
      <p>initialAuthCheckDone: <span :class="initialAuthCheckDone ? 'text-green-400' : 'text-yellow-400'">{{ initialAuthCheckDone }}</span></p>
      <p>User ID: <span class="font-mono text-gray-300">{{ user ? user.id : 'null' }}</span></p>
      <p>Email: <span class="font-mono text-gray-300">{{ user ? user.email : 'null' }}</span></p>
      <p>Profile Rol: <span class="font-mono text-gray-300">{{ userProfile ? userProfile.rol : 'null' }}</span></p>
      <p>Profile Nombre: <span class="font-mono text-gray-300">{{ userProfile ? userProfile.nombre_completo : 'null' }}</span></p>
      <hr class="my-1 border-gray-700">
      <p>Route Path: <span class="font-mono text-cyan-400">{{ route.fullPath }}</span></p>
      <p>Route Name: <span class="font-mono text-cyan-400">{{ String(route.name) }}</span></p>
      <p class="text-gray-400">Meta: Auth=<span class="font-mono">{{ route.meta.requiresAuth }}</span>, Guest=<span class="font-mono">{{ route.meta.requiresGuest }}</span>, Admin=<span class="font-mono">{{ route.meta.requiresAdmin }}</span></p>
    </div>

    <AppHeader 
      v-if="!isAuthRoute || (isAuthRoute && initialAuthCheckDone && !loadingAuth)" 
      :user="user" 
      :profile="userProfile" 
      @logout-event="handleLogoutEvent" 
    />

    <main class="flex-grow w-full" :class="{'pt-[68px]': !isAuthRoute || (isAuthRoute && initialAuthCheckDone && !loadingAuth)}"> 
      <div class="container mx-auto"> 
        <div v-if="loadingAuth && !initialAuthCheckDone" class="flex flex-col items-center justify-center min-h-[calc(100vh-68px)]">
          <svg class="animate-spin h-12 w-12 text-districorr-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-xl text-gray-600 mt-4">Cargando aplicación...</p>
        </div>
        
        <router-view v-else v-slot="{ Component, route: currentRoute }">
          <!-- LOG ADICIONAL ANTES DE LA TRANSICIÓN -->
          {{ console.log(`%cApp.vue <RouterView>: Preparando para renderizar. Ruta actual: '${String(currentRoute.name)}'. Componente recibido:`, "color: purple", Component ? (Component.__name || Component.name || Component) : 'Componente NULO/Indefinido') }}
          <transition name="fade" mode="out-in" appear>
            <div> <!-- Contenedor para el log y el componente -->
              <!-- LOG ADICIONAL DENTRO DE LA TRANSICIÓN, ANTES DEL COMPONENTE -->
              {{ console.log(`%cApp.vue <transition>: Dentro de transition para '${String(currentRoute.name)}'. Key: ${currentRoute.path}`, "color: purple") }}
              <component :is="Component" :key="currentRoute.path" />
            </div>
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
body { @apply bg-gray-100; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
#app-container { display: flex; flex-direction: column; }
</style>