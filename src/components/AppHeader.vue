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

const cleanupSubscription = async () => {
  if (notificationChannel) {
    console.log('AppHeader: Limpiando suscripción de notificaciones existente...');
    await supabase.removeChannel(notificationChannel);
    notificationChannel = null;
  }
};

const setupSubscription = (userId) => {
  cleanupSubscription().then(() => {
    console.log(`AppHeader: Creando nueva suscripción para el usuario: ${userId}`);
    notificationChannel = supabase
      .channel(`public:notificaciones:user_id=eq.${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${userId}` },
        () => {
          console.log('AppHeader: ¡Notificación en tiempo real recibida!');
          fetchNotifications();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`AppHeader: Suscrito exitosamente al canal de notificaciones.`);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('AppHeader: Error en el canal de notificaciones', err);
        }
      });
  });
};

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
};
const toggleMobileMenu = () => { const n = !isMobileMenuOpen.value; closeAllMenus(); isMobileMenuOpen.value = n; };
const toggleProfileMenu = () => { const n = !isProfileMenuOpen.value; closeAllMenus(); isProfileMenuOpen.value = n; };
const toggleNotificationsMenu = () => { const n = !isNotificationsMenuOpen.value; closeAllMenus(); isNotificationsMenuOpen.value = n; };
const handleLogout = () => { closeAllMenus(); emit('logout-event'); };
const handleNavLinkClick = () => { closeAllMenus(); };

watch(() => props.user, (newUser) => {
  if (newUser) {
    console.log("AppHeader: watcher detecta un usuario. Iniciando cargas.");
    fetchNotifications();
    checkIfUserIsResponsibleForCaja();
    setupSubscription(newUser.id);
  } else {
    console.log("AppHeader: watcher detecta que no hay usuario. Limpiando todo.");
    notifications.value = [];
    isResponsibleForCaja.value = false;
    cleanupSubscription();
  }
}, { immediate: true });

onUnmounted(() => {
  cleanupSubscription();
});
</script>

<template>
  <header class="bg-districorr-primary text-white h-[72px] sticky top-0 z-50 shadow-lg print:hidden">
    <div class="container mx-auto flex h-full items-center justify-between px-4">
      
      <div class="flex h-full items-center space-x-6">
        <RouterLink :to="{ name: 'Dashboard' }" @click="handleNavLinkClick" class="flex items-center space-x-3 hover:opacity-80 transition-opacity">
          <img src="/districorr-logo-circular.png" alt="Logo Districorr" class="h-12 w-12">
          <span class="hidden sm:inline text-xl font-bold">InfoGastos</span>
        </RouterLink>
        <nav class="hidden md:flex h-full items-center space-x-1">
          <RouterLink v-if="isLoggedIn" :to="{ name: 'Dashboard' }" class="nav-link-desktop-dark" active-class="nav-link-desktop-dark-active">Inicio</RouterLink>
          <RouterLink v-if="isLoggedIn" :to="{ name: 'ViajesListUser' }" class="nav-link-desktop-dark" active-class="nav-link-desktop-dark-active">Rendiciones</RouterLink>
          
          <!-- --- INICIO DE MI MODIFICACIÓN --- -->
          <RouterLink v-if="isLoggedIn" :to="{ name: 'GastosDelegados' }" class="nav-link-desktop-dark" active-class="nav-link-desktop-dark-active">Delegados</RouterLink>
          <!-- --- FIN DE MI MODIFICACIÓN --- -->

          <RouterLink v-if="isLoggedIn" :to="{ name: 'Reportes' }" class="nav-link-desktop-dark" active-class="nav-link-desktop-dark-active">Reportes</RouterLink>
          <RouterLink v-if="isLoggedIn && showCajaDiariaLink" :to="{ name: 'CajaDiaria' }" class="nav-link-desktop-dark" active-class="nav-link-desktop-dark-active">Caja</RouterLink>
          <RouterLink v-if="isLoggedIn && isAdmin" :to="{ name: 'AdminDashboard' }" class="nav-link-desktop-dark" active-class="nav-link-desktop-dark-active">Admin</RouterLink>
        </nav>
      </div>

      <div class="md:hidden">
        <h1 class="text-xl font-semibold">Rendiciones</h1>
      </div>

      <div class="flex items-center space-x-2 sm:space-x-4">
        <RouterLink v-if="isLoggedIn" :to="{ name: 'ViajeCreate' }" class="btn-accent-header">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          <span class="hidden md:inline">Nueva Rendición</span>
        </RouterLink>

        <div v-if="isLoggedIn" class="relative">
          <button @click="toggleNotificationsMenu" class="btn-icon-header-dark relative" aria-label="Notificaciones">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            <span v-if="notificationCount > 0" class="notification-badge">{{ notificationCount }}</span>
          </button>
          <transition leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="isNotificationsMenuOpen" @click.away="closeAllMenus" class="dropdown-menu text-districorr-text-primary w-80">
              <div class="px-4 py-3 border-b border-districorr-border flex justify-between items-center">
                <p class="text-sm font-semibold">Notificaciones</p>
                <button v-if="notificationCount > 0" @click="markAllAsRead()" class="text-xs text-districorr-accent hover:underline">Marcar todas como leídas</button>
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
          <button @click="toggleProfileMenu" class="flex items-center space-x-2 p-2 rounded-md hover:bg-white/10">
             <div class="avatar-header-dark">{{ userInitials }}</div>
             <span class="font-medium">{{ userDisplayName.split(' ')[0] }}</span>
          </button>
          <transition leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div v-if="isProfileMenuOpen" @click.away="closeAllMenus" class="dropdown-menu text-districorr-text-primary">
              <div class="px-4 py-3 border-b border-districorr-border"><p class="text-sm font-semibold">{{ userDisplayName }}</p><p class="text-sm text-districorr-text-secondary truncate">{{ props.user.email }}</p></div>
              <RouterLink :to="{ name: 'Perfil' }" @click="handleNavLinkClick" class="dropdown-item">Mi Perfil</RouterLink>
              <button @click="handleLogout" class="dropdown-item w-full text-left">Cerrar Sesión</button>
            </div>
          </transition>
        </div>
        
        <button v-if="isLoggedIn" @click="toggleMobileMenu" class="md:hidden btn-icon-header-dark" aria-label="Abrir menú">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
    </div>

    <transition leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0"
                enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100">
      <div v-if="isMobileMenuOpen" class="md:hidden absolute top-full left-0 w-full bg-districorr-primary shadow-lg rounded-b-lg p-4 border-t border-white/20">
        <nav class="flex flex-col space-y-2">
          <RouterLink :to="{ name: 'Dashboard' }" @click="handleNavLinkClick" class="nav-link-mobile-dark" active-class="nav-link-mobile-dark-active">Inicio</RouterLink>
          <RouterLink :to="{ name: 'ViajesListUser' }" @click="handleNavLinkClick" class="nav-link-mobile-dark" active-class="nav-link-mobile-dark-active">Rendiciones</RouterLink>
          
          <!-- --- INICIO DE MI MODIFICACIÓN --- -->
          <RouterLink :to="{ name: 'GastosDelegados' }" @click="handleNavLinkClick" class="nav-link-mobile-dark" active-class="nav-link-mobile-dark-active">Gastos Delegados</RouterLink>
          <!-- --- FIN DE MI MODIFICACIÓN --- -->

          <RouterLink :to="{ name: 'Reportes' }" @click="handleNavLinkClick" class="nav-link-mobile-dark" active-class="nav-link-mobile-dark-active">Reportes</RouterLink>
          <RouterLink v-if="isAdmin || isResponsibleForCaja" :to="{ name: 'CajaDiaria' }" @click="handleNavLinkClick" class="nav-link-mobile-dark" active-class="nav-link-mobile-dark-active">Caja Diaria</RouterLink>
          <RouterLink v-if="isAdmin" :to="{ name: 'AdminDashboard' }" @click="handleNavLinkClick" class="nav-link-mobile-dark" active-class="nav-link-mobile-dark-active">Panel de Admin</RouterLink>
          <hr class="border-white/20 my-2">
          <RouterLink :to="{ name: 'Perfil' }" @click="handleNavLinkClick" class="dropdown-item">Mi Perfil</RouterLink>
          <button @click="handleLogout" class="nav-link-mobile-dark text-red-400 hover:bg-red-500/20">Cerrar Sesión</button>
        </nav>
      </div>
    </transition>
  </header>
</template>
