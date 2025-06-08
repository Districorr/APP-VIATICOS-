<script setup>
import { ref, onMounted, computed, onUnmounted, provide, readonly, nextTick } from 'vue';
import AppHeader from './components/AppHeader.vue'; 
import { supabase } from './supabaseClient.js';    
import { useRouter, useRoute } from 'vue-router'; 

console.log("App.vue (V4.3 - SIN TIMEOUTS FETCH): Script setup INICIADO");

const isDevelopmentMode = computed(() => import.meta.env.DEV);

const userSession = ref(null); 
const userProfile = ref(null); 
const loadingAuthSession = ref(true); 
const loadingUserProfile = ref(false); 
const initialAuthCheckDone = ref(false); 
const errorUserProfile = ref('');

const router = useRouter(); 
const route = useRoute();   

provide('currentUserSession', readonly(userSession)); 
provide('userProfile', readonly(userProfile)); 
provide('loadingAuthSession', readonly(loadingAuthSession)); 
provide('loadingUserProfile', readonly(loadingUserProfile)); 
provide('initialAuthCheckDone', readonly(initialAuthCheckDone));
provide('errorUserProfile', readonly(errorUserProfile));

let authListenerSubscription = null;

async function fetchUserProfile(userId) {
  console.log(`%cApp.vue (V4.3) fetchUserProfile: INICIO para userId: ${userId}`, "color: blueviolet;");
  if (!userId) { 
    userProfile.value = null; 
    loadingUserProfile.value = false;
    return null; 
  }
  
  loadingUserProfile.value = true; 
  errorUserProfile.value = ''; 
  
  try {
    // ***** SIN Promise.race, await directo *****
    console.log("App.vue (V4.3) fetchUserProfile: Ejecutando consulta a 'perfiles' (SELECT COMPLETO)...");
    const startTime = performance.now();
    const { data, error, status } = await supabase
      .from('perfiles')
      .select('id, email, rol, nombre_completo, puesto, formato_predeterminado_id') 
      .eq('id', userId)
      .single();
    const endTime = performance.now();
    console.log(`%cApp.vue (V4.3) fetchUserProfile: Consulta a 'perfiles' completada en: ${(endTime - startTime).toFixed(2)} ms`, "color: #28a745;");
    // *****************************************

    if (error && status !== 406) { 
      console.error('App.vue (V4.3) fetchUserProfile: Error Supabase:', error.message, `(Status: ${status})`); 
      userProfile.value = { id: userId, email: userSession.value?.user?.email, rol: 'error_db_v43', nombre_completo: '(Error BD V4.3)' }; 
      errorUserProfile.value = `Error cargando perfil (V4.3): ${error.message}`;
    } else if (data) { 
      console.log('%cApp.vue (V4.3) fetchUserProfile: Perfil COMPLETO ENCONTRADO.', "color: green;"); 
      userProfile.value = data; 
    } else { 
      console.warn('App.vue (V4.3) fetchUserProfile: Perfil NO encontrado. Status:', status); 
      userProfile.value = { id: userId, email: userSession.value?.user?.email, rol: 'no_perfil_v43', nombre_completo: '(No en BD V4.3)'}; 
      if (status !== 406) errorUserProfile.value = 'Perfil de usuario no encontrado.';
    }
  } catch (e) { 
    console.error('App.vue (V4.3) fetchUserProfile: EXCEPCIÓN:', e.message); 
    userProfile.value = { id: userId, email: userSession.value?.user?.email, rol: 'excepcion_v43', nombre_completo: '(Excepción V4.3)' };
    errorUserProfile.value = `Excepción al cargar perfil (V4.3): ${e.message}`;
  } finally {
    loadingUserProfile.value = false; 
  }
}

// testOtraTabla() se mantiene eliminada. Si la necesitas para el "efecto de timing" en onMounted,
// puedes usar la versión con await directo también.
// async function testOtraTabla() { ... }


async function handleLogoutEvent() {
  // ... (igual que V4.0/V4.1.1) ...
  const { error } = await supabase.auth.signOut();
  if (error) { console.error('App.vue (V4.3): Error en signOut:', error.message); }
  else { router.push({ name: 'Login' }); }
}

onMounted(async () => { 
  console.log('App.vue (V4.3): onMounted.');
  loadingAuthSession.value = true; 
  initialAuthCheckDone.value = false; 
  loadingUserProfile.value = false;
  errorUserProfile.value = ''; 

  // Si el "await testOtraTabla()" era necesario para el timing en F5,
  // podrías reemplazarlo con un pequeño delay explícito si prefieres no hacer la consulta:
  console.log('App.vue (V4.3): onMounted - Aplicando pequeño delay inicial...');
  await new Promise(resolve => setTimeout(resolve, 100)); // Ejemplo: 100ms delay
  console.log('App.vue (V4.3): onMounted - Delay completado. Suscribiendo a Auth...');

  authListenerSubscription = supabase.auth.onAuthStateChange(
    // ... (Lógica de onAuthStateChange igual que en V3.7.1 / V4.1.1, incluyendo el nextTick) ...
    async (_event, session) => {
      // console.log(`%cApp.vue (V4.3) onAuthStateChange: Evento: ${_event}, Sesión: ${!!session}`, "color: teal;");
      if (!initialAuthCheckDone.value) { initialAuthCheckDone.value = true; }
      const previousUserId = userSession.value?.user?.id;
      userSession.value = session;
      if (session?.user) {
        const necesitaCargarPerfil = !userProfile.value || userProfile.value.id !== session.user.id || userProfile.value.rol?.includes('error') || userProfile.value.rol === 'no_perfil';
        if (necesitaCargarPerfil) {
            await fetchUserProfile(session.user.id); 
            if (_event === 'SIGNED_IN' && userProfile.value && !userProfile.value.rol?.includes('error')) {
              await nextTick(); 
              const currentRedirectTo = route.query.redirectTo ? String(route.query.redirectTo) : null;
              if (route.name === 'Login') {
                if (currentRedirectTo && currentRedirectTo !== '/' && !currentRedirectTo.startsWith('/login')) {
                  router.replace({ path: currentRedirectTo });
                } else {
                  router.replace({ name: 'Dashboard' });
                }
              }
            }
        }
      } else { 
        userProfile.value = null; loadingUserProfile.value = false; 
      }
      if (loadingAuthSession.value) { loadingAuthSession.value = false; }
    }
  );
});

// ... (onUnmounted, isAuthRoute, showAppLoader igual que en V4.0/V4.1.1) ...
onUnmounted(() => {
  if (authListenerSubscription) { authListenerSubscription.unsubscribe(); }
});
const isAuthRoute = computed(() => { /* ... */ return ['Login', 'Register', 'ActualizarContrasena'].includes(String(route.name)); });
const showAppLoader = computed(() => !initialAuthCheckDone.value || (!!userSession.value && loadingUserProfile.value));

console.log("App.vue (V4.3 - SIN TIMEOUTS FETCH): Script setup FINALIZADO");
</script>
<template>
  <div id="app-container-v371"> <!-- ID actualizado para V3.7.1 -->
    <!-- Panel de Debug (se mantiene, es útil para desarrollo) -->
    <div v-if="isDevelopmentMode" 
         class="fixed bottom-0 left-0 bg-black bg-opacity-85 text-white p-2.5 text-xs z-[9999] max-w-xs overflow-auto max-h-60" 
         style="font-size: 10px; line-height: 1.35; border: 1px solid dimgray;">
      <h4 class="font-bold mb-1 text-yellow-400 border-b border-gray-700 pb-0.5">--- DEBUG (App.vue V3.7.1) ---</h4>
      <p>AuthLoad: <span :class="loadingAuthSession ? 'text-orange-400' : 'text-green-400 font-semibold'">{{ loadingAuthSession }}</span></p>
      <p>ProfileLoad: <span :class="loadingUserProfile ? 'text-orange-400' : 'text-green-400 font-semibold'">{{ loadingUserProfile }}</span></p>
      <p>InitialAuthDone: <span :class="initialAuthCheckDone ? 'text-green-400 font-semibold' : 'text-yellow-400'">{{ initialAuthCheckDone }}</span></p>
      <p>ShowAppLoader: <span :class="showAppLoader ? 'text-orange-400 font-semibold' : 'text-green-400'">{{ showAppLoader }}</span></p>
      <hr class="my-0.5 border-gray-700">
      <p>User ID (Auth): <span class="font-mono text-gray-300">{{ userSession?.user?.id || 'null' }}</span></p>
      <p>Email (Auth): <span class="font-mono text-gray-300">{{ userSession?.user?.email || 'null' }}</span></p>
      <hr class="my-0.5 border-gray-700">
      <p>Profile ID: <span class="font-mono text-gray-300">{{ userProfile?.id || 'null' }}</span></p>
      <p>Profile Rol: <span class="font-mono text-gray-300">{{ userProfile?.rol || 'null' }}</span></p>
      <p>Profile Nombre: <span class="font-mono text-gray-300">{{ userProfile?.nombre_completo || 'null' }}</span></p>
      <p v-if="errorUserProfile" class="text-red-400">Error Perfil: {{ errorUserProfile }}</p>
      <hr class="my-1 border-gray-700">
      <p>Route Path: <span class="font-mono text-cyan-400">{{ route.fullPath }}</span></p>
      <p>Route Name: <span class="font-mono text-cyan-400">{{ String(route.name) }}</span> (AuthRoute: {{isAuthRoute}})</p>
      <p class="text-gray-400">Meta: Auth=<span class="font-mono">{{ route.meta.requiresAuth }}</span>, Guest=<span class="font-mono">{{ route.meta.requiresGuest }}</span>, Admin=<span class="font-mono">{{ route.meta.requiresAdmin }}</span></p>
    </div>

    <AppHeader 
      v-if="!isAuthRoute || (isAuthRoute && initialAuthCheckDone && !loadingAuthSession)" 
      :user="userSession?.user" 
      :profile="userProfile" 
      @logout-event="handleLogoutEvent" 
    />

    <main 
      class="flex-grow w-full" 
      :class="[
        {'pt-[68px]': !isAuthRoute || (isAuthRoute && initialAuthCheckDone && !loadingAuthSession)},
        isAuthRoute ? 'bg-gradient-to-br from-blue-900 to-blue-700' : 'bg-districorr-bg-light' 
      ]"
    > 
      <div :class="{ 'container mx-auto': !isAuthRoute }"> 
        <div v-if="showAppLoader" class="flex flex-col items-center justify-center min-h-[calc(100vh-120px)]"
             :class="{'text-white': isAuthRoute}" > 
          <svg class="animate-spin h-12 w-12" 
               :class="isAuthRoute ? 'text-white' : 'text-districorr-primary'" 
               xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-xl mt-4" :class="isAuthRoute ? 'text-blue-200' : 'text-gray-600'">Cargando aplicación...</p>
          <!-- Log de estados del loader, puedes descomentarlo si es necesario -->
          <!-- <p style="font-size: 0.8em; margin-top: 10px;">(initialAuthDone: {{ initialAuthCheckDone }}, userSession: {{!!userSession}}, loadingProfile: {{ loadingUserProfile }})</p> -->
        </div>
        
        <router-view v-else v-slot="{ Component, route: currentRoute }">
          <!-- Log de router-view DESCOMENTADO para asegurar que el componente se resuelve -->
          {{ console.log('App.vue (V3.7.1) <router-view> SLOT ACTIVADO. Ruta Name:', currentRoute.name, 'Componente:', Component ? (Component.__name || Component.name || 'Objeto Componente') : 'undefined') }}
          
          <!-- La transición sigue comentada. Si la necesitas, pruébala con cuidado. -->
          <!-- <transition name="fade" mode="out-in" appear> -->
            <component :is="Component" :key="currentRoute.path" />
          <!-- </transition> -->
        </router-view>
      </div>
    </main>
  </div>
</template>
<style>
/* Estilos globales de la aplicación */
body { 
  @apply bg-gray-100; 
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0;
  padding: 0;
}

/* Contenedor principal de App.vue */
#app-container-v371 { /* ID actualizado para coincidir con el template */
  display: flex; 
  flex-direction: column; 
  min-height: 100vh;
}

/* Clases de transición (si decides usarlas y descomentarlas en el template) */
/*
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
*/
</style>