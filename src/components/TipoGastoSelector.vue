<script setup>
// No se necesitan otras importaciones de Vue para esta lógica.

const props = defineProps({
  modelValue: { // Para compatibilidad con v-model
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

// INICIO: FASE 3.2 - Lógica para estilos dinámicos
// Esta función genera los estilos CSS en línea para cada tarjeta.
// Si la tarjeta está seleccionada y tiene un color de acento, lo aplica
// como una variable CSS que el <style> puede usar.
const getCardStyle = (tipo) => {
  if (props.modelValue === tipo.id && tipo.color_accent) {
    return {
      '--card-accent-color': tipo.color_accent
    };
  }
  return {};
};
// FIN: FASE 3.2
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
      <!-- INICIO: FASE 3.2 - Placeholder para un futuro ícono -->
      <div v-if="tipo.icon_name" class="icon-placeholder">
        <!-- Mostramos la primera letra del nombre del icono como un simple placeholder visual -->
        <span>{{ tipo.icon_name.charAt(0).toUpperCase() }}</span>
      </div>
      <!-- FIN: FASE 3.2 -->

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
  @apply grid grid-cols-2 sm:grid-cols-3 gap-3;
}

.tipo-gasto-card {
  @apply relative flex flex-col items-center justify-center p-3 h-20 min-h-[44px] rounded-lg border-2 border-gray-200 bg-white text-center font-semibold text-gray-700 transition-all duration-200 ease-in-out;
  @apply hover:border-gray-400 hover:shadow-md;
  @apply focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500;
}

/* INICIO: FASE 3.2 - Uso de la variable CSS para el color de acento */
.tipo-gasto-card.selected {
  /* Usamos la variable CSS. Si no está definida, usa el color índigo por defecto. */
  border-color: var(--card-accent-color, #4f46e5);
  color: var(--card-accent-color, #4f46e5);
  @apply bg-white shadow-lg ring-2 ring-offset-1;
  ring-color: var(--card-accent-color, #4f46e5);
}
/* FIN: FASE 3.2 */

/* INICIO: FASE 3.2 - Estilos para el placeholder del icono */
.icon-placeholder {
  @apply w-8 h-8 mb-1 rounded-full flex items-center justify-center bg-gray-100 text-gray-400 font-bold text-lg;
}

.tipo-gasto-card.selected .icon-placeholder {
  background-color: var(--card-accent-color, #4f46e5);
  @apply text-white;
}
/* FIN: FASE 3.2 */

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