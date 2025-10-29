<script setup>
import { computed } from 'vue';
import { formatDate, formatCurrency } from '../utils/formatters.js';

const props = defineProps({
  gasto: {
    type: Object,
    required: true
  },
  // NUEVO: Prop para definir el modo de la tarjeta
  mode: {
    type: String,
    default: 'recibido', // 'recibido' o 'enviado'
  }
});

const emit = defineEmits(['accept', 'reject', 'edit']);

const cardClasses = computed(() => {
  switch (props.gasto.estado_delegacion) {
    case 'aceptado': return 'border-l-4 border-green-500';
    case 'rechazado': return 'border-l-4 border-red-500';
    default: return 'border-l-4 border-blue-500';
  }
});

// Lógica condicional para mostrar el nombre correcto
const partyNameLabel = computed(() => props.mode === 'recibido' ? 'De:' : 'Para:');
const partyName = computed(() => {
  if (props.mode === 'recibido') {
    return props.gasto.creador?.nombre_completo || 'Usuario desconocido';
  }
  // Para el modo 'enviado', los datos vienen de la RPC get_mis_delegaciones_enviadas_pendientes
  return props.gasto.receptor_nombre || 'Usuario desconocido';
});

</script>

<template>
  <div class="bg-white p-4 rounded-lg shadow-md border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" :class="cardClasses">
    <div class="flex-grow">
      <p class="text-sm text-gray-500">
        {{ partyNameLabel }} <span class="font-semibold text-gray-700">{{ partyName }}</span>
      </p>
      <p class="text-lg font-bold text-indigo-600">{{ formatCurrency(gasto.monto_total) }}</p>
      <p class="text-sm text-gray-800">{{ gasto.tipo?.nombre_tipo_gasto || gasto.descripcion_general }}</p>
      <p class="text-xs text-gray-400 mt-1">
        Enviado el: {{ formatDate(gasto.created_at) }}
      </p>
    </div>
    
    <!-- Las acciones solo se muestran en modo 'recibido' -->
    <div v-if="mode === 'recibido'" class="flex-shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      <button @click="emit('reject', gasto)" class="btn-secondary w-full sm:w-auto">Rechazar</button>
      <button @click="emit('edit', gasto)" class="btn-secondary w-full sm:w-auto">Editar</button>
      <button @click="emit('accept', gasto)" class="btn-success w-full sm:w-auto">Aceptar</button>
    </div>

    <!-- En modo 'enviado', solo mostramos un estado -->
    <div v-else class="status-badge bg-blue-100 text-blue-800">
      Pendiente
    </div>
  </div>
</template>

<style scoped>
.btn-success { @apply rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50; }
.btn-secondary { @apply rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50; }
.status-badge { @apply px-3 py-1.5 text-sm font-medium rounded-full; }
</style>