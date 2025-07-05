<!-- src/components/TipoGastoSelector.vue -->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: [Number, String],
    default: null
  },
  options: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:modelValue']);

function selectTipo(tipoId) {
  emit('update:modelValue', tipoId);
}

const getCardStyle = (tipo) => {
  if (props.modelValue === tipo.id && tipo.color_accent) {
    return {
      '--card-accent-color': tipo.color_accent
    };
  }
  return {};
};
</script>

<template>
  <div class="tipo-gasto-grid">
    <button
      v-for="tipo in options"
      :key="tipo.id"
      type="button"
      class="tipo-gasto-card"
      :class="{ 'selected': modelValue === tipo.id }"
      :style="getCardStyle(tipo)"
      @click="selectTipo(tipo.id)"
    >
      <!-- --- INICIO DE MI CORRECCIÓN --- -->
      <!-- Añadida la clase 'icon-wrapper' que faltaba para darle tamaño al div -->
      <div v-if="tipo.icono_svg" class="icon-wrapper" v-html="tipo.icono_svg"></div>
      <!-- Si no hay icono, se muestra un placeholder para mantener la estructura -->
      <div v-else class="icon-placeholder"></div>
      <!-- --- FIN DE MI CORRECIÓN --- -->

      <span class="card-text">{{ tipo.nombre_tipo_gasto }}</span>
      
      <transition
        enter-active-class="transition-transform duration-200 ease-out"
        enter-from-class="scale-50 opacity-0"
        enter-to-class="scale-100 opacity-100"
      >
        <div v-if="modelValue === tipo.id" class="selected-checkmark">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
          </svg>
        </div>
      </transition>
    </button>
  </div>
</template>

<style scoped>
.tipo-gasto-grid {
  @apply grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3;
}

.tipo-gasto-card {
  @apply relative flex flex-col items-center justify-center p-3 h-24 rounded-xl border-2 border-gray-200 bg-white text-center font-semibold text-gray-700 transition-all duration-200 ease-in-out; /* Aumentado a rounded-xl */
  @apply hover:border-gray-400 hover:shadow-md;
  @apply focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500;
}

.tipo-gasto-card.selected {
  border-color: var(--card-accent-color, #4f46e5);
  color: var(--card-accent-color, #4f46e5);
  @apply bg-white shadow-lg ring-2 ring-offset-1;
  ring-color: var(--card-accent-color, #4f46e5);
}

.icon-wrapper, .icon-placeholder {
  @apply w-8 h-8 mb-2 text-gray-400 transition-colors;
}

.icon-placeholder {
  @apply bg-gray-100 rounded-lg; /* Placeholder visible si no hay icono */
}

.icon-wrapper :deep(svg) {
  @apply w-full h-full;
  stroke-width: 1.5;
}

.tipo-gasto-card.selected .icon-wrapper {
  color: var(--card-accent-color, #4f46e5);
}

.card-text {
  @apply text-sm font-normal text-gray-600;
}

.tipo-gasto-card.selected .card-text {
  @apply font-semibold;
  color: var(--card-accent-color, #4f46e5);
}

.selected-checkmark {
  @apply absolute top-1.5 right-1.5;
  color: var(--card-accent-color, #4f46e5);
}
</style>