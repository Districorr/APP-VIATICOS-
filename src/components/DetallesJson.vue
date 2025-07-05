<!-- src/components/DetallesJson.vue -->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  datos: {
    type: Object,
    default: () => ({})
  }
});

const formatKey = (key) => {
  if (!key) return '';
  return key
    .replace(/_/g, ' ')
    .replace(/(^\w{1})|(\s+\w{1})/g, letra => letra.toUpperCase());
};

const itemsValidos = computed(() => {
  if (!props.datos || typeof props.datos !== 'object') {
    return [];
  }
  return Object.entries(props.datos)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key: formatKey(key),
      value: value
    }));
});
</script>

<template>
  <!-- Contenedor principal con un diseño más limpio -->
  <div v-if="itemsValidos.length > 0" class="bg-blue-50/50 p-3 rounded-lg border border-blue-200">
    <dl class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
      <div v-for="item in itemsValidos" :key="item.key" class="flex flex-col">
        <dt class="text-xs font-semibold text-blue-800 uppercase tracking-wider">{{ item.key }}</dt>
        <dd class="text-sm text-gray-900">{{ item.value }}</dd>
      </div>
    </dl>
  </div>
  <div v-else class="text-xs text-gray-400 italic">
    Sin detalles adicionales.
  </div>
</template>