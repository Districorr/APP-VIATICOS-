<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

// Componentes
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import StatCard from '../../components/admin/StatCard.vue';
// ELIMINADO: import LineChart from '../../components/charts/LineChart.vue';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

// CORREGIDO: Se quita el plugin 'Filler' que ya no se usa
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const router = useRouter();
const route = useRoute();

// --- Estados Reactivos ---
const loadingClientes = ref(true);
const loadingAnalisis = ref(false);
const errorMessage = ref('');
const clientesOptions = ref([]);
const selectedClienteId = ref(null);
const analisisData = ref(null);

// --- Lógica de Carga de Datos ---
async function fetchClientes() {
  loadingClientes.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre_cliente')
      .order('nombre_cliente', { ascending: true });
    
    if (error) throw error;

    clientesOptions.value = data.map(cliente => ({
      label: cliente.nombre_cliente,
      value: cliente.id,
    }));
  } catch (e) {
    errorMessage.value = `Error al cargar la lista de clientes: ${e.message}`;
  } finally {
    loadingClientes.value = false;
  }
}

async function fetchAnalisisData(clienteId) {
  if (!clienteId) {
    analisisData.value = null;
    return;
  }
  loadingAnalisis.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase.rpc('get_analisis_por_cliente', {
      p_cliente_id: clienteId,
    });
    if (error) throw error;
    analisisData.value = data;
  } catch (e) {
    errorMessage.value = `Error al cargar el análisis del cliente: ${e.message}`;
    analisisData.value = null;
  } finally {
    loadingAnalisis.value = false;
  }
}

function goToRendicion(viajeId) {
  if (!viajeId) return;
  router.push({ name: 'AdminViajesList', query: { focus: viajeId } });
}

// --- Ciclo de Vida y Watchers ---
onMounted(() => {
  fetchClientes();
  const clienteIdFromUrl = route.query.clienteId;
  if (clienteIdFromUrl) {
    selectedClienteId.value = parseInt(clienteIdFromUrl, 10);
  }
});

watch(selectedClienteId, (newId) => {
  fetchAnalisisData(newId);
  router.replace({ query: { clienteId: newId || undefined } });
});

// --- Propiedades Computadas para el Template ---

// CORREGIDO: Se pasan los valores en crudo al StatCard
const kpis = computed(() => {
  if (!analisisData.value?.kpis) return null;
  const { total_gastado, cantidad_gastos, fecha_primer_gasto, fecha_ultimo_gasto } = analisisData.value.kpis;
  return {
    totalGastado: total_gastado || 0,
    cantidadGastos: cantidad_gastos || 0,
    fechaPrimerGasto: fecha_primer_gasto ? formatDate(fecha_primer_gasto) : 'N/A',
    fechaUltimoGasto: fecha_ultimo_gasto ? formatDate(fecha_ultimo_gasto) : 'N/A',
  };
});

// ELIMINADO: La propiedad computada para el gráfico de evolución
// const evolucionChartData = computed(() => { ... });

const gastosDetallados = computed(() => {
  return analisisData.value?.gastos_detallados || [];
});

// CORREGIDO: La llamada a formatCurrency en el callback
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: '#6b7280',
      }
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: '#6b7280',
        callback: function(value) {
          // La llamada correcta es solo con el valor
          return formatCurrency(value); 
        }
      }
    }
  }
}));

const gastoPorTipoData = computed(() => {
  const data = analisisData.value?.gasto_por_tipo;
  if (!data || data.length === 0) return null;
  
  const labels = data.map(item => item.tipo_gasto);
  const values = data.map(item => item.total_gastado);

  return {
    labels,
    datasets: [{
      label: 'Gasto Total',
      data: values,
      backgroundColor: 'rgba(16, 185, 129, 0.2)',
      borderColor: '#10B981',
      borderWidth: 1,
    }]
  };
});

const gastoPorProvinciaData = computed(() => {
  const data = analisisData.value?.gasto_por_provincia;
  if (!data || data.length === 0) return null;

  const labels = data.map(item => item.provincia_nombre);
  const values = data.map(item => item.total_gastado);

  return {
    labels,
    datasets: [{
      label: 'Gasto Total',
      data: values,
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      borderColor: '#3B82F6',
      borderWidth: 1,
    }]
  };
});
</script>
<template>
  <div class="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
    
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 tracking-tight">Análisis por Cliente</h1>
      <p class="mt-1 text-gray-600">Selecciona un cliente para ver un desglose detallado de sus gastos asociados.</p>
    </header>

    <div class="mb-8 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
      <label for="cliente-selector" class="block text-sm font-medium text-gray-700 mb-2">Seleccionar Cliente</label>
      <v-select
        id="cliente-selector"
        v-model="selectedClienteId"
        :options="clientesOptions"
        :reduce="option => option.value"
        placeholder="Escribe para buscar un cliente..."
        :loading="loadingClientes"
        class="v-select-style"
      >
        <template #no-options>No se encontraron clientes.</template>
      </v-select>
    </div>

    <div v-if="loadingAnalisis" class="text-center py-16">
        <svg class="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="mt-3 text-gray-600">Cargando análisis del cliente...</p>
    </div>
    
    <div v-else-if="errorMessage" class="p-4 bg-red-100 text-red-700 rounded-lg text-center">
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="!selectedClienteId" class="text-center py-16 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      <p class="font-semibold">Esperando selección</p>
      <p class="text-sm">Por favor, elige un cliente del menú superior para comenzar el análisis.</p>
    </div>

    <div v-else-if="analisisData" class="space-y-8">
      
      <!-- Sección de KPIs -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- CORREGIDO: Se usa 'formatAs' y se pasan los valores correctos -->
        <StatCard title="Gasto Total Histórico" :value="kpis.totalGastado" formatAs="currency" />
        <StatCard title="Cantidad de Gastos" :value="kpis.cantidadGastos" formatAs="number" />
        <StatCard title="Primer Gasto Registrado" :value="kpis.fechaPrimerGasto" :is-date="true" />
        <StatCard title="Último Gasto Registrado" :value="kpis.fechaUltimoGasto" :is-date="true" />
      </section>

      <!-- ELIMINADO: Sección de Gráfico de Evolución -->
      
      <!-- Sección de Tabla de Gastos Detallados -->
      <section>
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Historial de Gastos</h2>
        <div class="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
              <thead class="bg-gray-100">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                  <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Tipo de Gasto</th>
                  <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción / Detalles</th>
                  <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Responsable</th>
                  <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Rendición</th>
                  <th class="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">Monto</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-if="gastosDetallados.length === 0">
                  <td colspan="6" class="px-6 py-10 text-center text-gray-500">No se encontraron gastos para este cliente.</td>
                </tr>
                <tr v-for="gasto in gastosDetallados" :key="gasto.id" class="hover:bg-gray-50 transition-colors duration-150">
                  <td class="px-4 py-4 whitespace-nowrap text-gray-700">{{ formatDate(gasto.fecha_gasto) }}</td>
                  <td class="px-4 py-4 whitespace-nowrap text-gray-600">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {{ gasto.tipo_gasto }}
                    </span>
                  </td>
                  <td class="px-4 py-4">
                    <div class="font-medium text-gray-900">{{ gasto.descripcion_general }}</div>
                    <div v-if="gasto.detalles_adicionales" class="text-gray-500 text-xs mt-1">{{ gasto.detalles_adicionales }}</div>
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap text-gray-500">{{ gasto.responsable_nombre }}</td>
                  <td class="px-4 py-4 whitespace-nowrap">
                    <a
                      v-if="gasto.viaje_id"
                      @click.prevent="goToRendicion(gasto.viaje_id)"
                      href="#"
                      class="text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                    >
                      {{ gasto.nombre_viaje || 'Ver Rendición' }}
                    </a>
                    <span v-else class="text-gray-400">N/A</span>
                  </td>
                  <td class="px-4 py-4 whitespace-nowrap text-right font-semibold text-gray-800">{{ formatCurrency(gasto.monto_total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Cuadros de Análisis Táctico -->
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div class="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <h3 class="text-xl font-semibold text-gray-800 mb-4">Gasto por Tipo</h3>
          <div v-if="gastoPorTipoData" class="h-80">
            <Bar :data="gastoPorTipoData" :options="chartOptions" />
          </div>
          <div v-else class="text-center py-10 text-gray-500">No hay datos para mostrar.</div>
        </div>
        
        <div class="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <h3 class="text-xl font-semibold text-gray-800 mb-4">Gasto por Provincia</h3>
          <div v-if="gastoPorProvinciaData" class="h-80">
            <Bar :data="gastoPorProvinciaData" :options="chartOptions" />
          </div>
          <div v-else class="text-center py-10 text-gray-500">No hay datos para mostrar.</div>
        </div>
      </section>

    </div>
  </div>
</template>