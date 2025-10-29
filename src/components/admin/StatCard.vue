<script setup>
import { computed } from 'vue';
import { formatCurrency } from '../../utils/formatters.js';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/vue/24/solid';

const props = defineProps({
  title: { type: String, required: true },
  // MODIFICADO: Acepta Number para cálculos y String para valores pre-formateados como fechas.
  value: { type: [Number, String], default: null },
  change: { type: Number, default: null },
  // MODIFICADO: Renombro 'format' a 'formatAs' para evitar conflictos y añado 'date'
  formatAs: { type: String, default: 'number' }, // 'number', 'currency', 'percentage'
  loading: { type: Boolean, default: false },
  suffix: { type: String, default: '' },
  icon: { type: Function, default: null },
  // AÑADIDO: Prop para identificar si el valor es una fecha y no debe ser formateado.
  isDate: { type: Boolean, default: false }
});

const formattedValue = computed(() => {
  if (props.loading) return '...';
  if (props.value === null || props.value === undefined || props.value === 'N/A') return '--';

  // AÑADIDO: Si es una fecha, simplemente devuelve el valor como está.
  if (props.isDate) {
    return props.value;
  }
  
  // Se asegura de que el valor sea numérico para las siguientes operaciones
  const numericValue = Number(props.value);
  if (isNaN(numericValue)) return props.value; // Si no es un número válido, lo muestra tal cual

  if (props.formatAs === 'currency') {
    return formatCurrency(numericValue);
  }
  if (props.formatAs === 'percentage') {
    return `${numericValue.toFixed(1)}%`;
  }
  return numericValue.toLocaleString('es-AR');
});

const changeClasses = computed(() => {
  if (props.change === null) return '';
  return props.change >= 0 ? 'text-green-600' : 'text-red-600';
});
</script>

<template>
  <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
    <div class="flex justify-between items-start">
      <p class="text-sm font-medium text-gray-500 truncate">{{ title }}</p>
      
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