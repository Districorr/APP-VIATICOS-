<script setup>
import { ref, onMounted, computed, onUnmounted, provide, readonly } from 'vue';
import AppHeader from './components/AppHeader.vue'; 
import { supabase } from './supabaseClient.js';    
import { useRouter, useRoute } from 'vue-router'; 

console.log("App.vue (V-Final-Restaurado): Script setup INICIADO");

const isDevelopmentMode = computed(() => import.meta.env.DEV);

// --- TUS VARIABLES DE ESTADO ORIGINALES ---
const userSession = ref(null); 
const userProfile = ref(null); 
const loadingAuthSession = ref(true);
const loadingUserProfile = ref(false);
const initialAuthCheckDone = ref(false);
const errorUserProfile = ref('');

const router = useRouter(); 
const route = useRoute();   

// --- TUS PROVIDES ORIGINALES ---
provide('currentUserSession', readonly(userSession)); 
provide('userProfile', readonly(userProfile)); 
provide('loadingAuthSession', readonly(loadingAuthSession)); 
provide('loadingUserProfile', readonly(loadingUserProfile)); 
provide('initialAuthCheckDone', readonly(initialAuthCheckDone));
provide('errorUserProfile', readonly(errorUserProfile));

let authListenerSubscription = null;

// --- TU FUNCIÓN fetchUserProfile ORIGINAL ---
async function fetchUserProfile(userId) {
  console.log(`%cApp.vue (V-Final-Restaurado) fetchUserProfile: INICIO para userId: ${userId}`, "color: blueviolet;");
  if (!userId) { 
    userProfile.value = null; 
    loadingUserProfile.value = false;
    return null; 
  }
  
  loadingUserProfile.value = true; 
  errorUserProfile.value = ''; 
  
  try {
    const { data, error, status } = await supabase
      .from('perfiles')
      .select('id, email, rol, nombre_completo, puesto, formato_predeterminado_id') 
      .eq('id', userId)
      .single();

    if (error && status !== 406) { 
      throw error;
    } 
    
    if (data) { 
      console.log('%cApp.vue (V-Final-Restaurado) fetchUserProfile: Perfil COMPLETO ENCONTRADO.', "color: green;"); 
      userProfile.value = data; 
    } else { 
      console.warn('App.vue (V-Final-Restaurado) fetchUserProfile: Perfil NO encontrado.'); 
      userProfile.value = { id: userId, email: userSession.value?.user?.email, rol: 'no_perfil' }; 
    }
  } catch (e) { 
    console.error('App.vue (V-Final-Restaurado) fetchUserProfile: EXCEPCIÓN:', e.message); 
    userProfile.value = { id: userId, email: userSession.value?.user?.email, rol: 'excepcion' };
    errorUserProfile.value = `Excepción al cargar perfil: ${e.message}`;
  } finally {
    loadingUserProfile.value = false; 
  }
}

// --- TU FUNCIÓN handleLogoutEvent ORIGINAL ---
async function handleLogoutEvent() {
  const { error } = await supabase.auth.signOut();
  if (error) { console.error('App.vue (V-Final-Restaurado): Error en signOut:', error.message); }
  else { router.push({ name: 'Login' }); }
}


// --- LÓGICA DE onMounted ---
onMounted(() => { 
  console.log('App.vue (V-Final-Restaurado): onMounted. Suscribiendo a onAuthStateChange...');
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      console.log(`%cApp.vue onAuthStateChange: Evento: ${event}`, "color: teal;");
      
      const isInitialLoad = !initialAuthCheckDone.value;

      loadingAuthSession.value = false;
      userSession.value = session;

      if (session) {
        // Solo llamamos a fetchUserProfile si el perfil no está cargado o si el usuario cambió
        if (!userProfile.value || userProfile.value.id !== session.user.id) {
          await fetchUserProfile(session.user.id);
        }
      } else {
        userProfile.value = null;
      }

      // Marcamos la comprobación inicial como hecha después del primer evento.
      if (isInitialLoad) {
        initialAuthCheckDone.value = true;
        console.log('App.vue (V-Final-Restaurado): Carga inicial (auth + perfil) completada.');
      }
    }
  );
  authListenerSubscription = subscription;
});

// --- TU FUNCIÓN onUnmounted ORIGINAL ---
onUnmounted(() => {
  if (authListenerSubscription) { 
    authListenerSubscription.unsubscribe(); 
    console.log("App.vue (V-Final-Restaurado): onUnmounted - Suscripción de auth desuscrita.");
  }
});

// --- TUS computed properties ORIGINALES ---
const isAuthRoute = computed(() => ['Login', 'Register', 'ActualizarContrasena'].includes(String(route.name)));
const showAppLoader = computed(() => !initialAuthCheckDone.value || (!!userSession.value && loadingUserProfile.value));

console.log("App.vue (V-Final-Restaurado): Script setup FINALIZADO");
</script>

<template>
  <!-- TU TEMPLATE ORIGINAL COMPLETO (SIN CAMBIOS) -->
  <div id="app-container-v371"> 
    <div v-if="isDevelopmentMode" 
         class="fixed bottom-0 left-0 bg-black bg-opacity-85 text-white p-2.5 text-xs z-[9999] max-w-xs overflow-auto max-h-60" 
         style="font-size: 10px; line-height: 1.35; border: 1px solid dimgray;">
      <h4 class="font-bold mb-1 text-yellow-400 border-b border-gray-700 pb-0.5">--- DEBUG (App.vue Final) ---</h4>
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
      v-if="!isAuthRoute" 
      :user="userSession?.user" 
      :profile="userProfile" 
      @logout-event="handleLogoutEvent" 
    />

    <main 
      class="flex-grow w-full" 
      :class="[
        {'pt-[68px]': !isAuthRoute}, 
        isAuthRoute ? 'bg-gradient-to-br from-blue-900 to-blue-700' : 'bg-gray-100/50' 
      ]"
    > 
      <div v-if="showAppLoader" class="flex flex-col items-center justify-center min-h-[calc(100vh-120px)]"
             :class="{'text-white': isAuthRoute}" > 
          <svg class="animate-spin h-12 w-12" 
               :class="isAuthRoute ? 'text-white' : 'text-districorr-primary'" 
               xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-xl mt-4" :class="isAuthRoute ? 'text-blue-200' : 'text-gray-600'">Cargando aplicación...</p>
        </div>
        
        <router-view v-else v-slot="{ Component, route: currentRoute }">
            <component :is="Component" :key="currentRoute.path" />
        </router-view>
    </main>
  </div>
</template>

<style>
/* Tus estilos globales originales */
body { 
  @apply bg-gray-100; 
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0;
  padding: 0;
}

#app-container-v371 { 
  display: flex; 
  flex-direction: column; 
  min-height: 100vh;
}
</style>