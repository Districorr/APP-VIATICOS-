<script setup>
import { ref, computed, watch } from 'vue';
// RouterLink se usa directamente en el template, no es necesario importarlo explícitamente en <script setup>
// si no se va a usar programáticamente aquí. Pero es buena práctica tenerlo si se usa.
import { RouterLink } from 'vue-router'; 

const APP_NAME = 'Districorr InfoGastos'; // Constante para el nombre de la app

// --- Props ---
const props = defineProps({
  user: {
    type: Object, // Podrías usar una interfaz o tipo más específico si lo tienes
    default: () => null, // Default como función para objetos/arrays
    validator: (value) => { // Validador opcional para la estructura del user
      if (value === null) return true; // Permitir null
      // console.log('AppHeader Prop user validator:', value); // Log para depurar la prop
      return typeof value === 'object'; // Chequeo básico
    }
  },
  profile: {
    type: Object,
    default: () => null,
    validator: (value) => {
      if (value === null) return true;
      // console.log('AppHeader Prop profile validator:', value); // Log para depurar la prop
      return typeof value === 'object';
    }
  }
});

// --- Emits ---
const emit = defineEmits(['logout-event']);

// --- Estado Reactivo Local ---
const isMobileMenuOpen = ref(false);
console.log(`AppHeader: Estado inicial - isMobileMenuOpen: ${isMobileMenuOpen.value}`);

// --- Propiedades Computadas (para lógica derivada y reactiva) ---

const isLoggedIn = computed(() => {
  const loggedIn = !!props.user && typeof props.user.id !== 'undefined';
  // console.log(`AppHeader Computed: isLoggedIn - User prop:`, props.user, `Result: ${loggedIn}`);
  return loggedIn;
});

const userDisplayName = computed(() => {
  if (props.profile?.nombre_completo) {
    const name = props.profile.nombre_completo.split(' ')[0]; // Primer nombre
    // console.log(`AppHeader Computed: userDisplayName (from profile.nombre_completo) - Result: ${name}`);
    return name;
  }
  if (props.user?.email) {
    const emailName = props.user.email.split('@')[0];
    // console.log(`AppHeader Computed: userDisplayName (from user.email) - Result: ${emailName}`);
    return emailName;
  }
  // console.log(`AppHeader Computed: userDisplayName - Fallback: 'Perfil'`);
  return 'Perfil'; // Fallback
});

const userEmailForTitle = computed(() => {
  const email = props.user?.email || 'No email disponible';
  // console.log(`AppHeader Computed: userEmailForTitle - Result: ${email}`);
  return email;
});

const isAdmin = computed(() => {
  const admin = props.profile?.rol === 'admin';
  // console.log(`AppHeader Computed: isAdmin - Profile prop:`, props.profile, `Result: ${admin}`);
  return admin;
});

// --- Observadores (Watchers) para depuración de props ---
watch(() => props.user, (newUser, oldUser) => {
  console.log('AppHeader Watcher: props.user cambió', { newUser, oldUser });
}, { deep: true });

watch(() => props.profile, (newProfile, oldProfile) => {
  console.log('AppHeader Watcher: props.profile cambió', { newProfile, oldProfile });
}, { deep: true });

// --- Métodos ---

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
  console.log(`AppHeader Method: toggleMobileMenu - Nuevo estado isMobileMenuOpen: ${isMobileMenuOpen.value}`);
};

const closeMobileMenu = (actionContext = 'desconocido') => {
  if (isMobileMenuOpen.value) {
    isMobileMenuOpen.value = false;
    console.log(`AppHeader Method: closeMobileMenu (contexto: ${actionContext}) - Menú cerrado.`);
  }
};

// Función unificada para manejar clics en enlaces, cierra el menú móvil y loguea.
const handleNavLinkClick = (routeName, context = 'desktop') => {
  console.log(`AppHeader Method: handleNavLinkClick - Navegando a '${routeName}' (contexto: ${context})`);
  closeMobileMenu(`clic_enlace_${routeName}`);
  // La navegación real la hace <RouterLink>
};

const handleLogout = () => {
  console.log('AppHeader Method: handleLogout - Iniciando proceso de logout.');
  closeMobileMenu('logout');
  emit('logout-event');
  console.log('AppHeader Method: handleLogout - Evento "logout-event" emitido.');
};

console.log('AppHeader: Script setup ejecutado y montado (o a punto de montar).');

</script>
<template>
  <header class="bg-districorr-primary text-white p-4 shadow-lg sticky top-0 z-50 h-[68px] flex items-center print:hidden">
    <div class="container mx-auto flex justify-between items-center">
      <!-- Logo y Nombre de la App -->
      <RouterLink 
        :to="isLoggedIn ? { name: 'Dashboard' } : { name: 'Login' }"
        class="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity"
        @click="handleNavLinkClick(isLoggedIn ? 'Dashboard' : 'Login', 'logo_o_nombre_app')"
        aria-label="Ir a la página de inicio o login"
      >
        <img src="/districorr-logo-circular.png" alt="Logo Districorr" class="h-9 w-9 sm:h-10 sm:w-10">
        <span class="text-lg sm:text-xl lg:text-2xl font-bold">{{ APP_NAME }}</span>
      </RouterLink>

      <!-- Navegación Desktop (md y más grandes) -->
      <nav class="hidden md:flex items-center space-x-1 lg:space-x-2">
        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'Dashboard' }"
          class="nav-link" 
          active-class="nav-link-active"
          @click="handleNavLinkClick('Dashboard', 'desktop_nav')"
        >
          Inicio
        </RouterLink>
        
        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'ViajesListUser' }"  
          class="nav-link" 
          active-class="nav-link-active"
          @click="handleNavLinkClick('ViajesListUser', 'desktop_nav')"
        >
          Viajes
        </RouterLink>

        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'GastosListUser' }" 
          class="nav-link" 
          active-class="nav-link-active"
          @click="handleNavLinkClick('GastosListUser', 'desktop_nav')"
        >
          Gastos
        </RouterLink>

        <RouterLink v-if="isLoggedIn && isAdmin" 
          :to="{ name: 'AdminDashboard' }"
          class="nav-link-admin" 
          active-class="nav-link-admin-active"
          @click="handleNavLinkClick('AdminDashboard', 'desktop_nav')"
        >
          Admin
        </RouterLink>

        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'Perfil' }"
          class="nav-link flex items-center gap-1.5" 
          active-class="nav-link-active" 
          :title="userEmailForTitle"
          @click="handleNavLinkClick('Perfil', 'desktop_nav')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5" aria-hidden="true">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clip-rule="evenodd" />
          </svg>
          <span class="hidden lg:inline">{{ userDisplayName }}</span>
          <span class="lg:hidden sm:inline">{{ userDisplayName }}</span> <!-- Simplificado para mostrar siempre userDisplayName -->
        </RouterLink>

        <button v-if="isLoggedIn" 
          @click="handleLogout"
          class="btn-logout"
        >
          Salir
        </button>
      </nav>

      <!-- Botón Hamburguesa para Móvil (visible hasta md) -->
      <div class="md:hidden flex items-center">
        <button 
          @click="toggleMobileMenu" 
          class="text-white p-2 rounded-md hover:bg-white hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
          aria-label="Abrir o cerrar menú principal" 
          :aria-expanded="isMobileMenuOpen.toString()"
        >
          <svg v-if="!isMobileMenuOpen" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Panel de Navegación Móvil -->
    <transition
      enter-active-class="transition ease-out duration-200" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95"
    >
      <div v-if="isMobileMenuOpen" 
           class="md:hidden absolute top-[68px] inset-x-0 bg-districorr-primary shadow-xl rounded-b-lg p-4 space-y-2 border-t border-districorr-accent/30"
           role="navigation"
           aria-label="Navegación principal móvil"
      >
        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'Dashboard' }" 
          @click="handleNavLinkClick('Dashboard', 'mobile_nav')" 
          class="mobile-nav-link" 
          active-class="mobile-nav-link-active"
        >
          Inicio
        </RouterLink>

        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'ViajesListUser' }" 
          @click="handleNavLinkClick('ViajesListUser', 'mobile_nav')" 
          class="mobile-nav-link" 
          active-class="mobile-nav-link-active"
        >
          Viajes / Rendiciones
        </RouterLink>

        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'GastosListUser' }" 
          @click="handleNavLinkClick('GastosListUser', 'mobile_nav')" 
          class="mobile-nav-link" 
          active-class="mobile-nav-link-active"
        >
          Gastos
        </RouterLink>

        <RouterLink v-if="isLoggedIn && isAdmin" 
          :to="{ name: 'AdminDashboard' }" 
          @click="handleNavLinkClick('AdminDashboard', 'mobile_nav')" 
          class="mobile-nav-link-admin" 
          active-class="mobile-nav-link-admin-active"
        >
          Panel de Admin
        </RouterLink>

        <RouterLink v-if="isLoggedIn" 
          :to="{ name: 'Perfil' }" 
          @click="handleNavLinkClick('Perfil', 'mobile_nav')" 
          class="mobile-nav-link" 
          active-class="mobile-nav-link-active" 
          :title="userEmailForTitle"
        >
          Mi Perfil <span class="text-xs opacity-70">({{ userDisplayName }})</span>
        </RouterLink>

        <hr class="border-districorr-accent/20 my-2">
        
        <button v-if="isLoggedIn" 
          @click="handleLogout" 
          class="mobile-btn-logout"
        >
          Cerrar Sesión
        </button>
      </div>
    </transition>
  </header>
</template>