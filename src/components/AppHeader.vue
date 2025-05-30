<script setup>
import { ref } from 'vue'; // Necesitamos ref para el estado del menú móvil
import { RouterLink } from 'vue-router';

defineProps({
  user: Object | null,
  profile: Object | null
});
const emit = defineEmits(['logout-event']);

const appName = 'Districorr InfoGastos';
const isMobileMenuOpen = ref(false); // Estado para el menú hamburguesa

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};

const closeMobileMenu = () => { // Para cerrar el menú al hacer clic en un enlace
  isMobileMenuOpen.value = false;
};

const triggerLogout = () => {
  closeMobileMenu(); // Cerrar menú si estaba abierto
  emit('logout-event');
}
</script>

<template>
  <header class="bg-districorr-primary text-white p-4 shadow-lg sticky top-0 z-50 h-[68px] flex items-center print:hidden">
    <div class="container mx-auto flex justify-between items-center">
      <router-link :to="user ? { name: 'Dashboard' } : { name: 'Login' }" 
                   class="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity"
                   @click="closeMobileMenu">
        <img src="/districorr-logo-circular.png" alt="Districorr Logo" class="h-9 w-9 sm:h-10 sm:w-10">
        <span class="text-lg sm:text-xl lg:text-2xl font-bold">{{ appName }}</span>
      </router-link>

      <!-- Navegación para Desktop y Tablets (md y más grandes) -->
      <nav class="hidden md:flex items-center space-x-1 lg:space-x-2">
        <router-link v-if="user" :to="{ name: 'Dashboard' }"
          class="text-sm font-medium hover:text-districorr-accent transition-colors px-2 py-1.5 lg:px-3 rounded-md"
          active-class="text-districorr-accent bg-white bg-opacity-10">
          Inicio
        </router-link>
        <router-link v-if="user" :to="{ name: 'ViajesList' }"
          class="text-sm font-medium hover:text-districorr-accent transition-colors px-2 py-1.5 lg:px-3 rounded-md"
          active-class="text-districorr-accent bg-white bg-opacity-10">
          Viajes
        </router-link>
        <router-link v-if="user" :to="{ name: 'GastosList' }"
          class="text-sm font-medium hover:text-districorr-accent transition-colors px-2 py-1.5 lg:px-3 rounded-md"
          active-class="text-districorr-accent bg-white bg-opacity-10">
          Gastos
        </router-link>
        <router-link v-if="user && profile && profile.rol === 'admin'" :to="{ name: 'AdminDashboard' }"
          class="text-sm font-medium bg-yellow-400 hover:bg-yellow-500 text-districorr-primary px-2 py-1.5 lg:px-3 rounded-md transition-colors shadow-sm hover:shadow-md"
          active-class="ring-2 ring-yellow-600 ring-offset-2 ring-offset-districorr-primary">
          Admin
        </router-link>
        <router-link v-if="user" :to="{ name: 'Perfil' }"
          class="text-sm font-medium hover:text-districorr-accent transition-colors px-2 py-1.5 lg:px-3 rounded-md flex items-center gap-1.5"
          active-class="text-districorr-accent bg-white bg-opacity-10"
          :title="user.email">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clip-rule="evenodd" />
          </svg>
          <span class="hidden lg:inline">{{ profile?.nombre_completo?.split(' ')[0] || user?.email?.split('@')[0] || 'Perfil' }}</span>
          <span class="lg:hidden sm:inline">{{ user?.email?.split('@')[0] || 'Perfil' }}</span>
        </router-link>
        <button v-if="user" @click="triggerLogout"
          class="bg-districorr-accent hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded-md text-sm transition shadow-sm hover:shadow-md">
          Salir
        </button>
      </nav>

      <!-- Botón Hamburguesa para Móvil (visible hasta md) -->
      <div class="md:hidden flex items-center">
        <button @click="toggleMobileMenu" class="text-white p-2 rounded-md hover:bg-white hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                aria-label="Abrir menú principal" :aria-expanded="isMobileMenuOpen.toString()">
          <svg v-if="!isMobileMenuOpen" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Panel de Navegación Móvil (Off-canvas o dropdown) -->
    <transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div v-if="isMobileMenuOpen" 
           class="md:hidden absolute top-[68px] inset-x-0 bg-districorr-primary shadow-xl rounded-b-lg p-4 space-y-2 border-t border-districorr-accent/30">
        <router-link v-if="user" :to="{ name: 'Dashboard' }" @click="closeMobileMenu"
          class="block text-base font-medium hover:text-districorr-accent transition-colors px-3 py-2.5 rounded-md hover:bg-white hover:bg-opacity-10"
          active-class="text-districorr-accent bg-white bg-opacity-10">
          Inicio
        </router-link>
        <router-link v-if="user" :to="{ name: 'ViajesList' }" @click="closeMobileMenu"
          class="block text-base font-medium hover:text-districorr-accent transition-colors px-3 py-2.5 rounded-md hover:bg-white hover:bg-opacity-10"
          active-class="text-districorr-accent bg-white bg-opacity-10">
          Viajes / Rendiciones
        </router-link>
        <router-link v-if="user" :to="{ name: 'GastosList' }" @click="closeMobileMenu"
          class="block text-base font-medium hover:text-districorr-accent transition-colors px-3 py-2.5 rounded-md hover:bg-white hover:bg-opacity-10"
          active-class="text-districorr-accent bg-white bg-opacity-10">
          Gastos
        </router-link>
        <router-link v-if="user && profile && profile.rol === 'admin'" :to="{ name: 'AdminDashboard' }" @click="closeMobileMenu"
          class="block text-base font-medium bg-yellow-400 hover:bg-yellow-500 text-districorr-primary px-3 py-2.5 rounded-md transition-colors shadow-sm hover:shadow-md"
          active-class="ring-2 ring-yellow-600">
          Panel de Admin
        </router-link>
        <router-link v-if="user" :to="{ name: 'Perfil' }" @click="closeMobileMenu"
          class="block text-base font-medium hover:text-districorr-accent transition-colors px-3 py-2.5 rounded-md hover:bg-white hover:bg-opacity-10"
          active-class="text-districorr-accent bg-white bg-opacity-10"
          :title="user.email">
          Mi Perfil <span class="text-xs opacity-70">({{ profile?.nombre_completo || user?.email?.split('@')[0] }})</span>
        </router-link>
        <hr class="border-districorr-accent/20 my-2">
        <button v-if="user" @click="triggerLogout"
          class="w-full text-left bg-districorr-accent/80 hover:bg-blue-700 text-white font-semibold py-2.5 px-3 rounded-md text-base transition shadow-sm hover:shadow-md">
          Cerrar Sesión
        </button>
      </div>
    </transition>
  </header>
</template>