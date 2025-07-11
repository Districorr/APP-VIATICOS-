<!-- src/components/admin/StatCard.vue -->
<script setup>
import { computed } from 'vue';
import { formatCurrency } from '../../utils/formatters.js';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/vue/24/solid';

const props = defineProps({
  title: { type: String, required: true },
  value: { type: Number, required: true },
  change: { type: Number, default: null },
  format: { type: String, default: 'number' } // 'number', 'currency', 'percentage'
});

const formattedValue = computed(() => {
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

<template>
  <div class="bg-white p-5 rounded-xl shadow-lg border">
    <div class="flex justify-between items-start">
      <p class="text-sm font-medium text-gray-500 truncate">{{ title }}</p>
      <div v-if="change !== null" :class="changeClasses" class="flex items-center text-xs font-semibold">
        <ArrowUpIcon v-if="change >= 0" class="h-4 w-4" />
        <ArrowDownIcon v-else class="h-4 w-4" />
        <span>{{ Math.abs(change).toFixed(1) }}%</span>
      </div>
    </div>
    <p class="mt-2 text-3xl font-bold text-gray-800">{{ formattedValue }}</p>
  </div>
</template>