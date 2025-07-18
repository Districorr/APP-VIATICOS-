// src/components/admin/StatCard.vue
<script setup>
import { computed } from 'vue';
import { formatCurrency } from '../../utils/formatters.js';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/vue/24/solid';

const props = defineProps({
  title: { type: String, required: true },
  value: { type: Number, default: null },
  change: { type: Number, default: null },
  format: { type: String, default: 'number' }, // 'number', 'currency', 'percentage'
  loading: { type: Boolean, default: false },
  suffix: { type: String, default: '' },
  icon: { type: Function, default: null },
});

const formattedValue = computed(() => {
  if (props.loading) return '...';
  if (props.value === null || props.value === undefined) return '--';

  if (props.format === 'currency') {
    return formatCurrency(props.value);
  }
  if (props.format === 'percentage') {
    return `${props.value.toFixed(1)}%`;
  }
  return props.value.toLocaleString('es-AR');
});

const changeClasses = computed(() => {
  if (props.change === null) return '';
  return props.change >= 0 ? 'text-green-600' : 'text-red-600';
});
</script>
<!-- src/components/admin/StatCard.vue -->
<template>
  <div class="bg-white p-5 rounded-xl shadow-lg border">
    <div class="flex justify-between items-start">
      <p class="text-sm font-medium text-gray-500 truncate">{{ title }}</p>
      
      <!-- Muestra icono si se provee, o el indicador de cambio en su defecto. No muestra nada durante la carga. -->
      <div v-if="!loading">
        <component v-if="icon" :is="icon" class="h-6 w-6 text-gray-400" />
        <div v-else-if="change !== null" :class="changeClasses" class="flex items-center text-xs font-semibold">
          <ArrowUpIcon v-if="change >= 0" class="h-4 w-4" />
          <ArrowDownIcon v-else class="h-4 w-4" />
          <span>{{ Math.abs(change).toFixed(1) }}%</span>
        </div>
      </div>
    </div>
    
    <div class="mt-2 text-3xl font-bold text-gray-800 flex items-baseline">
      <span :class="{ 'text-gray-400': loading || value === null }">{{ formattedValue }}</span>
      <span v-if="!loading && value !== null && suffix" class="ml-1 text-xl font-medium text-gray-500">{{ suffix }}</span>
    </div>
  </div>
</template>