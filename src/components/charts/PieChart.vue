<script setup>
import { ref } from 'vue';
import { Pie } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, CategoryScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale);

defineProps({
  chartData: { type: Object, required: true },
  chartOptions: { type: Object, default: () => ({ responsive: true, maintainAspectRatio: false }) }
});

const chartRef = ref(null);

// DEFINIMOS UN MÉTODO PÚBLICO
const getChartInstance = () => {
  // Este método solo será llamado por el padre, y para ese momento, chartRef.value.chart ya existirá.
  return chartRef.value?.chart;
};

// EXPONEMOS EL MÉTODO
defineExpose({
  getChartInstance
});
</script>

<template>
  <Pie
    ref="chartRef"
    :data="chartData"
    :options="chartOptions"
  />
</template>