<!-- src/components/DelegatedExpenseCard.vue -->
<script setup>
import { computed } from 'vue';
import { formatDate, formatCurrency } from '../utils/formatters.js';

const props = defineProps({
  gasto: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['accept', 'reject']);

const cardClasses = computed(() => {
  switch (props.gasto.estado_delegacion) {
    case 'aceptado':
      return 'border-l-4 border-green-500';
    case 'rechazado':
      return 'border-l-4 border-red-500';
    default:
      return 'border-l-4 border-blue-500';
  }
});

const creadorNombre = computed(() => props.gasto.creador?.nombre_completo || 'Usuario desconocido');
</script>

<template>
  <div class="bg-white p-4 rounded-lg shadow-md border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" :class="cardClasses">
    <div class="flex-grow">
      <p class="text-sm text-gray-500">
        De: <span class="font-semibold text-gray-700">{{ creadorNombre }}</span>
      </p>
      <p class="text-lg font-bold text-indigo-600">{{ formatCurrency(gasto.monto_total) }}</p>
      <p class="text-sm text-gray-800">{{ gasto.tipo?.nombre_tipo_gasto }}: {{ gasto.descripcion_general }}</p>
      <p class="text-xs text-gray-400 mt-1">
        <span v-if="gasto.estado_delegacion === 'pendiente_aceptacion'">Enviado el: {{ formatDate(gasto.created_at) }}</span>
        <span v-else-if="gasto.estado_delegacion === 'aceptado'">Aceptado el: {{ formatDate(gasto.updated_at) }}</span>
        <span v-else-if="gasto.estado_delegacion === 'rechazado'">Rechazado el: {{ formatDate(gasto.updated_at) }}</span>
      </p>
    </div>
    <div class="flex-shrink-0 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      <!-- Acciones para gastos pendientes -->
      <template v-if="gasto.estado_delegacion === 'pendiente_aceptacion'">
        <button @click="emit('reject', gasto)" class="btn-danger w-full sm:w-auto">Rechazar</button>
        <button @click="emit('accept', gasto)" class="btn-success w-full sm:w-auto">Aceptar</button>
      </template>
      <!-- Información para gastos aceptados -->
      <div v-else-if="gasto.estado_delegacion === 'aceptado'" class="status-badge bg-green-100 text-green-800">
        Aceptado
      </div>
      <!-- Información para gastos rechazados -->
      <div v-else-if="gasto.estado_delegacion === 'rechazado'" class="status-badge bg-red-100 text-red-800">
        Rechazado
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-success { @apply rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50; }
.btn-danger { @apply rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50; }
.status-badge { @apply px-3 py-1.5 text-sm font-medium rounded-full; }
</style>