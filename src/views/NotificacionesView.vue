<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter } from 'vue-router';
import { formatDate } from '../utils/formatters.js';

const router = useRouter();
const notificaciones = ref([]);
const loading = ref(true);
const errorMessage = ref('');

// Cargar todas las notificaciones del usuario
async function fetchAllNotifications() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    notificaciones.value = data || [];
  } catch (e) {
    console.error('Error al cargar notificaciones:', e.message);
    errorMessage.value = 'No se pudieron cargar tus notificaciones.';
  } finally {
    loading.value = false;
  }
}

onMounted(fetchAllNotifications);

// Marcar una notificación como leída y navegar
async function handleNotificationClick(notification) {
  if (!notification.leido) {
    try {
      const { error } = await supabase
        .from('notificaciones')
        .update({ leido: true })
        .eq('id', notification.id);
      if (error) throw error;
      notification.leido = true; // Actualizar estado local
    } catch (e) {
      console.error('Error al marcar como leída:', e.message);
    }
  }
  if (notification.link_a) {
    router.push(notification.link_a);
  }
}

// Marcar todas como leídas
async function markAllAsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leido: true })
      .eq('user_id', user.id)
      .eq('leido', false);
    if (error) throw error;
    // Actualizar estado local
    notificaciones.value.forEach(n => n.leido = true);
  } catch (e) {
    console.error('Error al marcar todas como leídas:', e.message);
    alert('Hubo un error al procesar la solicitud.');
  }
}
</script>
<template>
  <div class="container mx-auto max-w-4xl px-4 py-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-800">Mis Notificaciones</h1>
      <button 
        @click="markAllAsRead" 
        class="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!notificaciones.some(n => !n.leido)"
      >
        Marcar todas como leídas
      </button>
    </div>

    <div v-if="loading" class="text-center py-10">Cargando...</div>
    <div v-else-if="errorMessage" class="error-banner">{{ errorMessage }}</div>
    
    <div v-else class="bg-white rounded-lg shadow-md border">
      <ul class="divide-y divide-gray-200">
        <li v-if="notificaciones.length === 0" class="p-6 text-center text-gray-500">
          No tienes notificaciones.
        </li>
        <li v-for="notif in notificaciones" :key="notif.id" 
            @click="handleNotificationClick(notif)"
            class="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center space-x-4">
          
          <!-- Indicador de No Leído -->
          <div class="flex-shrink-0">
            <span v-if="!notif.leido" class="h-3 w-3 bg-blue-500 rounded-full block" title="No leído"></span>
            <span v-else class="h-3 w-3 bg-gray-300 rounded-full block" title="Leído"></span>
          </div>

          <!-- Contenido de la Notificación -->
          <div class="flex-grow">
            <p class="text-sm text-gray-800">{{ notif.mensaje }}</p>
            <p class="text-xs text-gray-500 mt-1">
              {{ formatDate(notif.created_at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
            </p>
          </div>

          <!-- Icono de Chevron -->
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.error-banner {
  @apply bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md;
}
</style>