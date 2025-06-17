<script setup>
import { computed } from 'vue';

const props = defineProps({
  datos: {
    type: Object,
    default: () => ({})
  }
});

// Formatea una clave de JSON (ej. 'numero_remito') a un texto legible (ej. 'Número Remito')
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
  // Filtramos para no mostrar claves con valores vacíos o nulos
  return Object.entries(props.datos)
    .filter(([key, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key: formatKey(key),
      value: value
    }));
});
</script>
<template>
  <div v-if="itemsValidos.length > 0" class="text-xs text-gray-500 space-y-0.5">
    <div v-for="item in itemsValidos" :key="item.key">
      <span class="font-semibold">{{ item.key }}:</span> {{ item.value }}
    </div>
  </div>
  <div v-else class="text-xs text-gray-400">
    -
  </div>
</template>