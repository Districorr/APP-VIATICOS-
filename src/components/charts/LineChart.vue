<script setup>
import { ref } from 'vue';
import { Line } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale);

defineProps({
  chartData: { type: Object, required: true },
  chartOptions: { type: Object, default: () => ({ responsive: true, maintainAspectRatio: false }) }
});

const chartRef = ref(null);

// DEFINIMOS UN MÉTODO PÚBLICO
const getChartInstance = () => {
  return chartRef.value?.chart;
};

// EXPONEMOS EL MÉTODO
defineExpose({
  getChartInstance
});
</script>

<template>
  <Line
    ref="chartRef"
    :data="chartData"
    :options="chartOptions"
  />
</template>