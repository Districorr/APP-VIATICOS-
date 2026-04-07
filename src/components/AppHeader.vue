<!-- src/components/AppHeader.vue -->
<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { supabase } from '../supabaseClient.js';
import { formatDate } from '../utils/formatters.js';

const props = defineProps({ user: Object, profile: Object });
const emit = defineEmits(['logout-event']);
const router = useRouter();

const isMobileMenuOpen = ref(false);
const isProfileMenuOpen = ref(false);
const isNotificationsMenuOpen = ref(false);
const isNewActionMenuOpen = ref(false);

const notifications = ref([]);
const notificationCount = computed(() => notifications.value.filter(n => !n.leido).length);
let notificationChannel = null;

const isLoggedIn = computed(() => !!props.user);
const userDisplayName = computed(() => props.profile?.nombre_completo || props.user?.email?.split('@')[0] || 'Perfil');
const userInitials = computed(() => {
    if (props.profile?.nombre_completo) {
        const parts = props.profile.nombre_completo.split(' ');
        return (parts[0][0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
    }
    return 'U';
});
const isAdmin = computed(() => props.profile?.rol === 'admin');
const isResponsibleForCaja = ref(false);
const showCajaDiariaLink = computed(() => isAdmin.value || isResponsibleForCaja.value);

async function checkIfUserIsResponsibleForCaja() {
    if (!props.user) {
        isResponsibleForCaja.value = false;
        return;
    }
    try {
        const { count, error } = await supabase
            .from('cajas_chicas')
            .select('id', { count: 'exact', head: true })
            .eq('responsable_id', props.user.id)
            .eq('activo', true);
        if (error) throw error;
        isResponsibleForCaja.value = count > 0;
    } catch (e) {
        console.error('AppHeader: Error al verificar responsabilidad de caja chica:', e.message);
        isResponsibleForCaja.value = false;
    }
}

async function fetchNotifications() {
  if (!props.user) return;
  try {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', props.user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    notifications.value = data;
  } catch (e) {
    console.error("Error al obtener notificaciones:", e.message);
  }
}

// --- Lógica de suscripción comentada para evitar errores ---
/*
const cleanupSubscription = async () => { ... };
const setupSubscription = (userId) => { ... };
*/

async function markAsRead(notificationId) {
  try {
    const { error } = await supabase.from('notificaciones').update({ leido: true }).eq('id', notificationId);
    if (error) throw error;
    const notif = notifications.value.find(n => n.id === notificationId);
    if (notif) notif.leido = true;
  } catch (e) {
    console.error("Error al marcar notificación como leída:", e.message);
  }
}

async function markAllAsRead() {
  if (!props.user || notificationCount.value === 0) return;
  try {
    const { error } = await supabase.from('notificaciones').update({ leido: true }).eq('user_id', props.user.id).eq('leido', false);
    if (error) throw error;
    notifications.value.forEach(n => { if (!n.leido) n.leido = true; });
  } catch (e) {
    console.error("Error al marcar todas como leídas:", e.message);
  }
}

function handleNotificationClick(notification) {
  markAsRead(notification.id);
  closeAllMenus();
  if (notification.link_a) {
    router.push(notification.link_a);
  }
}

const closeAllMenus = () => {
  isMobileMenuOpen.value = false;
  isProfileMenuOpen.value = false;
  isNotificationsMenuOpen.value = false;
  isNewActionMenuOpen.value = false;
};
const toggleMobileMenu = () => { const n = !isMobileMenuOpen.value; closeAllMenus(); isMobileMenuOpen.value = n; };
const toggleProfileMenu = () => { const n = !isProfileMenuOpen.value; closeAllMenus(); isProfileMenuOpen.value = n; };
const toggleNotificationsMenu = () => { const n = !isNotificationsMenuOpen.value; closeAllMenus(); isNotificationsMenuOpen.value = n; };
const toggleNewActionMenu = () => { const n = !isNewActionMenuOpen.value; closeAllMenus(); isNewActionMenuOpen.value = n; };
const handleLogout = () => { closeAllMenus(); emit('logout-event'); };
const handleNavLinkClick = () => { closeAllMenus(); };

watch(() => props.user, (newUser) => {
  if (newUser) {
    fetchNotifications();
    checkIfUserIsResponsibleForCaja();
    // setupSubscription(newUser.id); // Comentado
  } else {
    notifications.value = [];
    isResponsibleForCaja.value = false;
    // cleanupSubscription(); // Comentado
  }
}, { immediate: true });

onUnmounted(() => {
  // cleanupSubscription(); // Comentado
});
</script>

<template>
  <header class="bg-gradient-to-r from-blue-800 to-blue-700 text-white h-16 sticky top-0 z-50 shadow-lg print:hidden">
    <div class="container mx-auto flex h-full items-center justify-between px-4">
      
      <div class="flex h-full items-center space-x-6">
        <RouterLink :to="{ name: 'Dashboard' }" @click="handleNavLinkClick" class="flex items-center space-x-3 hover:opacity-90 transition-opacity">
          <img src="/districorr-logo-circular.png" alt="Logo Districorr" class="h-10 w-10 flex-shrink-0">
          <div class="hidden sm:flex flex-col -space-y-1">
            <span class="text-lg font-bold tracking-wider">InfoGastos</span>
            <span class="text-xs text-blue-200">Gestión de Rendiciones</span>
          </div>
        </RouterLink>
        <nav class="hidden md:flex h-full items-center space-x-2">
          <RouterLink v-if="isLoggedIn" :to="{ name: 'Dashboard' }" class="nav-link-desktop" active-class="nav-link-desktop-active">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
            <span>Inicio</span>
          </RouterLink>
          <RouterLink v-if="isLoggedIn" :to="{ name: 'ViajesListUser' }" class="nav-link-desktop" active-class="nav-link-desktop-active">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fill-rule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" /></svg>
            <span>Rendiciones</span>
          </RouterLink>
          <RouterLink v-if="isLoggedIn" :to="{ name: 'GastosDelegados' }" class="nav-link-desktop" active-class="nav-link-desktop-active">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" /></svg>
            <span>Delegados</span>
          </RouterLink>
          <RouterLink v-if="isLoggedIn && showCajaDiariaLink" :to="{ name: 'CajaDiaria' }" class="nav-link-desktop" active-class="nav-link-desktop-active">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 6a2 2 0 00-2 2v2a2 2 0 002 2h12a2 2 0 002-2v-2a2 2 0 00-2-2H4z" clip-rule="evenodd" /></svg>
            <span>Caja</span>
          </RouterLink>
          <RouterLink v-if="isLoggedIn && isAdmin" :to="{ name: 'AdminDashboard' }" class="nav-link-desktop" active-class="nav-link-desktop-active">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>
            <span>Admin</span>
          </RouterLink>
        </nav>
      </div>

      <div class="flex items-center space-x-2 sm:space-x-3">
        <div v-if="isLoggedIn" class="relative">
          <button @click="toggleNewActionMenu" class="btn-primary-header">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
            <span class="hidden md:inline">Nuevo</span>
          </button>
          <transition leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="isNewActionMenuOpen" @click.away="closeAllMenus" class="dropdown-menu text-gray-800 w-56">
              <RouterLink :to="{ name: 'ViajeCreate' }" @click="handleNavLinkClick" class="dropdown-item">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
                Nueva Rendición
              </RouterLink>
              <RouterLink :to="{ name: 'GastoFormCreate' }" @click="handleNavLinkClick" class="dropdown-item">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clip-rule="evenodd" /></svg>
                Cargar Gasto
              </RouterLink>
            </div>
          </transition>
        </div>

        <div v-if="isLoggedIn" class="relative">
          <button @click="toggleNotificationsMenu" class="btn-icon-header relative" aria-label="Notificaciones">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            <span v-if="notificationCount > 0" class="notification-badge">{{ notificationCount }}</span>
          </button>
          <transition leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="isNotificationsMenuOpen" @click.away="closeAllMenus" class="dropdown-menu text-gray-800 w-80">
              <div class="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <p class="text-sm font-semibold">Notificaciones</p>
                <button v-if="notificationCount > 0" @click="markAllAsRead()" class="text-xs text-blue-600 hover:underline">Marcar todas como leídas</button>
              </div>
              <div class="max-h-80 overflow-y-auto">
                <div v-if="notifications.length === 0" class="p-4 text-center text-sm text-gray-500">No tienes notificaciones.</div>
                <a v-for="notif in notifications" :key="notif.id" @click.prevent="handleNotificationClick(notif)" :href="notif.link_a || '#'"
                   class="block px-4 py-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
                   :class="{ 'bg-blue-50': !notif.leido }">
                  <p class="text-sm text-gray-800">{{ notif.mensaje }}</p>
                  <p class="text-xs text-gray-500 mt-1">{{ formatDate(notif.created_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</p>
                </a>
              </div>
            </div>
          </transition>
        </div>

        <div v-if="isLoggedIn" class="hidden md:relative md:inline-block">
          <button @click="toggleProfileMenu" class="flex items-center space-x-2 p-1 rounded-full hover:bg-white/10">
             <div class="avatar-header">{{ userInitials }}</div>
          </button>
          <transition leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="isProfileMenuOpen" @click.away="closeAllMenus" class="dropdown-menu text-gray-800">
              <div class="px-4 py-3 border-b border-gray-200">
                <p class="text-sm font-semibold">{{ userDisplayName }}</p>
                <p class="text-xs text-gray-500 capitalize">{{ profile?.rol?.replace('_', ' ') || 'Usuario' }}</p>
              </div>
              <RouterLink :to="{ name: 'Perfil' }" @click="handleNavLinkClick" class="dropdown-item">Mi Perfil</RouterLink>
              <button @click="handleLogout" class="dropdown-item w-full text-left">Cerrar Sesión</button>
            </div>
          </transition>
        </div>
        
        <button v-if="isLoggedIn" @click="toggleMobileMenu" class="md:hidden btn-icon-header" aria-label="Abrir menú">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
    </div>

    <transition leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0"
                enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100">
      <div v-if="isMobileMenuOpen" class="md:hidden absolute top-full left-0 w-full bg-blue-800 shadow-lg rounded-b-lg p-4 border-t border-white/20">
        <nav class="flex flex-col space-y-2">
          <RouterLink :to="{ name: 'Dashboard' }" @click="handleNavLinkClick" class="nav-link-mobile" active-class="nav-link-mobile-active">Inicio</RouterLink>
          <RouterLink :to="{ name: 'ViajesListUser' }" @click="handleNavLinkClick" class="nav-link-mobile" active-class="nav-link-mobile-active">Rendiciones</RouterLink>
          <RouterLink :to="{ name: 'GastosDelegados' }" @click="handleNavLinkClick" class="nav-link-mobile" active-class="nav-link-mobile-active">Delegados</RouterLink>
          <RouterLink v-if="isAdmin || isResponsibleForCaja" :to="{ name: 'CajaDiaria' }" @click="handleNavLinkClick" class="nav-link-mobile" active-class="nav-link-mobile-active">Caja</RouterLink>
          <RouterLink v-if="isAdmin" :to="{ name: 'AdminDashboard' }" @click="handleNavLinkClick" class="nav-link-mobile" active-class="nav-link-mobile-active">Admin</RouterLink>
          <hr class="border-white/20 my-2">
          <RouterLink :to="{ name: 'Perfil' }" @click="handleNavLinkClick" class="nav-link-mobile">Mi Perfil</RouterLink>
          <button @click="handleLogout" class="nav-link-mobile text-red-400 hover:bg-red-500/20">Cerrar Sesión</button>
        </nav>
      </div>
    </transition>
  </header>
</template>

<style scoped>
/* Estilos de Navegación Desktop */
.nav-link-desktop {
  @apply flex items-center gap-x-2 px-3 py-2 rounded-md text-sm font-medium text-blue-100 hover:bg-white/10 hover:text-white transition-colors border-b-2 border-transparent;
}
.nav-link-desktop-active {
  @apply bg-white/10 text-white border-white;
}

/* Estilos de Navegación Móvil */
.nav-link-mobile {
  @apply block px-4 py-2 rounded-md text-base font-medium text-blue-100 hover:bg-white/10 hover:text-white;
}
.nav-link-mobile-active {
  @apply bg-white/10 text-white;
}

/* Botones de Header */
.btn-primary-header {
  @apply inline-flex items-center gap-x-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 shadow-sm transition-all hover:bg-blue-50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white;
}
.btn-icon-header {
  @apply p-2 rounded-full text-blue-200 hover:text-white hover:bg-white/10 transition-colors;
}

/* Avatar y Notificaciones */
.avatar-header {
  @apply h-8 w-8 rounded-full bg-white text-blue-700 flex items-center justify-center font-bold text-sm;
}
.notification-badge {
  @apply absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-blue-800;
}

/* Menús Desplegables */
.dropdown-menu {
  @apply absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none;
}
.dropdown-item {
  @apply flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100;
}
</style>