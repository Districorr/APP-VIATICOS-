<!-- src/components/SummaryCard.vue -->
<script setup>
import { computed } from 'vue';
import VueApexCharts from 'vue3-apexcharts';
import { formatCurrency } from '../utils/formatters.js';

const props = defineProps({
  title: { type: String, required: true },
  value: { type: Number, required: true },
  total: { type: Number, default: 0 },
  color: { type: String, default: '#3B82F6' },
  formatAsCurrency: { type: Boolean, default: true },
  // --- INICIO DE MI MODIFICACIÓN ---
  // Nueva prop para controlar la visibilidad del gráfico
  showChart: { type: Boolean, default: true }
  // --- FIN DE MI MODIFICACIÓN ---
});

const chartSeries = computed(() => {
  if (props.total <= 0 || props.value < 0) {
    return [0];
  }
  const percentage = (props.value / props.total) * 100;
  const clampedPercentage = Math.max(0, Math.min(percentage, 100));
  return [Math.round(clampedPercentage)];
});

const chartOptions = computed(() => ({
  chart: {
    type: 'radialBar',
    sparkline: {
      enabled: true
    }
  },
  plotOptions: {
    radialBar: {
      hollow: {
        size: '65%',
      },
      track: {
        background: '#e5e7eb',
      },
      dataLabels: {
        show: true,
        name: {
          show: false,
        },
        value: {
          show: true,
          fontSize: '18px',
          fontWeight: 700,
          color: '#1f2937',
          offsetY: 6,
          formatter: (val) => {
            // Muestra el porcentaje real, incluso si es > 100%
            if (props.total > 0) {
              return `${Math.round((props.value / props.total) * 100)}%`
            }
            return '0%'
          }
        }
      }
    }
  },
  fill: {
    colors: [props.color]
  },
  stroke: {
    lineCap: 'round'
  },
  labels: [props.title],
}));

const formattedValue = computed(() => {
  return props.formatAsCurrency ? formatCurrency(props.value) : props.value.toLocaleString('es-AR');
});
</script>

<template>
  <div class="summary-card-rich">
    <!-- --- INICIO DE MI MODIFICACIÓN --- -->
    <!-- El gráfico solo se renderiza si showChart es true -->
    <div v-if="showChart" class="chart-wrapper">
      <VueApexCharts
        type="radialBar"
        height="100"
        width="100"
        :options="chartOptions"
        :series="chartSeries"
      />
    </div>
    <!-- --- FIN DE MI MODIFICACIÓN --- -->
    <div class="info-wrapper" :class="{ 'pl-0': !showChart }">
      <p class="summary-label">{{ title }}</p>
      <p class="summary-value">{{ formattedValue }}</p>
    </div>
  </div>
</template>

<style scoped>
.summary-card-rich {
  @apply bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4 transition-all duration-200 hover:shadow-md hover:border-blue-300;
}
.chart-wrapper {
  @apply flex-shrink-0;
}
.info-wrapper {
  @apply flex flex-col;
}
.summary-label {
  @apply text-sm font-medium text-gray-500;
}
.summary-value {
  @apply text-2xl font-bold text-gray-800;
}
</style>