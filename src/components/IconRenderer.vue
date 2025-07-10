<!-- src/components/IconRenderer.vue -->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  // El código SVG completo o el nombre de un icono predefinido
  iconData: {
    type: String,
    default: ''
  },
  // El color de acento para el icono y el fondo
  color: {
    type: String,
    default: '#6B7280' // Un gris por defecto
  },
});

// Mapeo de nombres a SVGs (puedes expandir esto si usas nombres en lugar de SVGs completos)
const iconLibrary = {
  default: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`,
  // ... puedes añadir más iconos predefinidos por nombre aquí
};

const finalSvg = computed(() => {
  // Si iconData parece un SVG, úsalo. Si no, búscalo en la librería.
  if (props.iconData && props.iconData.trim().startsWith('<svg')) {
    return props.iconData;
  }
  return iconLibrary[props.iconData] || iconLibrary.default;
});
</script>

<template>
  <div 
    class="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center p-2"
    :style="{ backgroundColor: color ? `${color}20` : '#F3F4F6' }"
  >
    <div 
      class="w-full h-full"
      :style="{ color: color || '#6B7280' }"
      v-html="finalSvg"
    ></div>
  </div>
</template>