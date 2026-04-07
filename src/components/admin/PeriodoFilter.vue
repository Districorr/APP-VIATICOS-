<script setup>
import { ref, watch } from 'vue';

const emit = defineEmits(['periodo-actualizado']);

const activeFilter = ref('mensual');
const fechaDesde = ref(new Date(new Date().setDate(1)).toISOString().split('T')[0]);
const fechaHasta = ref(new Date().toISOString().split('T')[0]);

function setFilter(periodo) {
  activeFilter.value = periodo;
  const hoy = new Date();
  let desde = new Date();
  let hasta = new Date();

  if (periodo === 'semanal') {
    desde.setDate(hoy.getDate() - 6);
  } else if (periodo === 'mensual') {
    desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  } else if (periodo === 'mesAnterior') {
    desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  } else if (periodo === 'personalizado') {
    // No hacemos nada, esperamos a que el usuario elija las fechas
    return;
  }

  fechaDesde.value = desde.toISOString().split('T')[0];
  fechaHasta.value = hasta.toISOString().split('T')[0];
  emit('periodo-actualizado', { desde: fechaDesde.value, hasta: fechaHasta.value });
}

watch([fechaDesde, fechaHasta], () => {
  if (activeFilter.value === 'personalizado') {
    emit('periodo-actualizado', { desde: fechaDesde.value, hasta: fechaHasta.value });
  }
});

// Emitir el período inicial al montar
import { onMounted } from 'vue';
onMounted(() => {
  emit('periodo-actualizado', { desde: fechaDesde.value, hasta: fechaHasta.value });
});
</script>

<template>
  <div class="bg-white p-4 rounded-xl shadow-md border border-gray-200/80 mb-8">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-semibold mr-2">Período:</span>
      <div class="btn-group">
        <button @click="setFilter('semanal')" :class="activeFilter === 'semanal' ? 'btn-filter-active' : 'btn-filter'">Semanal</button>
        <button @click="setFilter('mensual')" :class="activeFilter === 'mensual' ? 'btn-filter-active' : 'btn-filter'">Este Mes</button>
        <button @click="setFilter('mesAnterior')" :class="activeFilter === 'mesAnterior' ? 'btn-filter-active' : 'btn-filter'">Mes Anterior</button>
        <button @click="setFilter('personalizado')" :class="activeFilter === 'personalizado' ? 'btn-filter-active' : 'btn-filter'">Personalizado</button>
      </div>
      <div v-if="activeFilter === 'personalizado'" class="flex items-center gap-2 border-l pl-3 ml-2">
        <input type="date" v-model="fechaDesde" class="input-form-style-charts">
        <span class="text-gray-500">-</span>
        <input type="date" v-model="fechaHasta" class="input-form-style-charts">
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-form-style-charts { @apply rounded-md border-gray-300 shadow-sm sm:text-sm py-2 px-3; }
.btn-group { @apply flex rounded-md shadow-sm; }
.btn-filter { @apply relative inline-flex items-center px-4 py-2 border border-gray-300 bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200; }
.btn-filter:first-child { @apply rounded-l-md; }
.btn-filter:last-child { @apply rounded-r-md; }
.btn-filter:not(:first-child) { @apply -ml-px; }
.btn-filter-active { @apply relative inline-flex items-center px-4 py-2 border border-districorr-primary bg-districorr-primary text-sm font-medium text-white z-10; }
</style>