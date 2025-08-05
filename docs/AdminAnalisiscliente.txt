<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

// Componentes que usaremos en la vista
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import StatCard from '../../components/admin/StatCard.vue';
import LineChart from '../../components/charts/LineChart.vue'; 

const router = useRouter();
const route = useRoute();

// --- Estados Reactivos ---
const loadingClientes = ref(true); // Para la carga inicial de la lista de clientes
const loadingAnalisis = ref(false); // Para la carga de datos del cliente seleccionado
const errorMessage = ref('');
const clientesOptions = ref([]); // Opciones para el selector v-select
const selectedClienteId = ref(null);
const analisisData = ref(null); // Aquí se guardará la respuesta completa de la RPC

// --- Lógica de Carga de Datos ---

// Función para cargar la lista completa de clientes para el selector
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

// Función para cargar los datos de análisis para un cliente específico
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

// --- Ciclo de Vida y Watchers ---

onMounted(() => {
  fetchClientes();
  
  // Revisar si la URL ya tiene un ID de cliente para cargarlo al inicio
  const clienteIdFromUrl = route.query.clienteId;
  if (clienteIdFromUrl) {
    selectedClienteId.value = parseInt(clienteIdFromUrl, 10);
  }
});

// Vigilar cambios en el cliente seleccionado para buscar sus datos
watch(selectedClienteId, (newId) => {
  fetchAnalisisData(newId);
  // Actualizar la URL para que sea compartible, sin recargar la página
  router.replace({ query: { clienteId: newId || undefined } });
});

// --- Propiedades Computadas para el Template ---

const kpis = computed(() => {
  if (!analisisData.value?.kpis) return null;
  const { total_gastado, cantidad_gastos, fecha_primer_gasto, fecha_ultimo_gasto } = analisisData.value.kpis;
  return {
    totalGastado: formatCurrency(total_gastado || 0),
    cantidadGastos: cantidad_gastos || 0,
    fechaPrimerGasto: fecha_primer_gasto ? formatDate(fecha_primer_gasto) : 'N/A',
    fechaUltimoGasto: fecha_ultimo_gasto ? formatDate(fecha_ultimo_gasto) : 'N/A',
  };
});

const evolucionChartData = computed(() => {
  if (!analisisData.value?.evolucion_mensual || analisisData.value.evolucion_mensual.length === 0) {
    return null;
  }
  const labels = analisisData.value.evolucion_mensual.map(item => formatDate(item.mes, { month: 'short', year: '2-digit' }));
  const data = analisisData.value.evolucion_mensual.map(item => item.total_mes);
  
  return {
    labels: labels,
    datasets: [{
      label: 'Gasto Mensual',
      backgroundColor: 'rgba(79, 70, 229, 0.1)',
      borderColor: '#4F46E5',
      data: data,
      fill: true,
      tension: 0.4,
    }]
  };
});

const gastosDetallados = computed(() => {
  return analisisData.value?.gastos_detallados || [];
});
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8">
    
    <!-- Encabezado de la Página -->
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 tracking-tight">Análisis por Cliente</h1>
      <p class="mt-1 text-gray-600">Selecciona un cliente para ver un desglose detallado de sus gastos asociados.</p>
    </header>

    <!-- Barra de Selección de Cliente -->
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

    <!-- Contenedor de Análisis -->
    <div v-if="loadingAnalisis" class="text-center py-16">
        <svg class="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="mt-3 text-gray-600">Cargando análisis del cliente...</p>
    </div>
    
    <div v-else-if="errorMessage" class="p-4 bg-red-100 text-red-700 rounded-lg text-center">
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="!selectedClienteId" class="text-center py-16 text-gray-500">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      <p class="font-semibold">Esperando selección</p>
      <p class="text-sm">Por favor, elige un cliente del menú superior para comenzar el análisis.</p>
    </div>

    <div v-else-if="analisisData" class="space-y-8">
      
      <!-- Sección de KPIs -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Gasto Total Histórico" :value="kpis.totalGastado" />
        <StatCard title="Cantidad de Gastos" :value="kpis.cantidadGastos" :formatAsCurrency="false" />
        <StatCard title="Primer Gasto Registrado" :value="kpis.fechaPrimerGasto" :is-date="true" />
        <StatCard title="Último Gasto Registrado" :value="kpis.fechaUltimoGasto" :is-date="true" />
      </section>

      <!-- Sección de Gráfico de Evolución -->
      <section class="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Evolución de Gastos Mensuales</h2>
        <div v-if="evolucionChartData" class="h-80">
          <LineChart :chart-data="evolucionChartData" />
        </div>
        <div v-else class="text-center py-10 text-gray-500">No hay suficientes datos para mostrar la evolución.</div>
      </section>
      
      <!-- Sección de Tabla de Gastos Detallados -->
      <section>
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Historial de Gastos</h2>
        <div class="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th class="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Descripción del Gasto</th>
                  <th class="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Responsable</th>
                  <th class="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Rendición Asociada</th>
                  <th class="px-6 py-3 text-right font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-if="gastosDetallados.length === 0">
                  <td colspan="5" class="px-6 py-10 text-center text-gray-500">No se encontraron gastos para este cliente.</td>
                </tr>
                <tr v-for="gasto in gastosDetallados" :key="gasto.id" class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-gray-700">{{ formatDate(gasto.fecha_gasto) }}</td>
                  <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{{ gasto.descripcion_general }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-gray-500">{{ gasto.responsable_nombre }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-gray-500">{{ gasto.nombre_viaje }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-right font-semibold text-gray-800">{{ formatCurrency(gasto.monto_total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style>
/* Estilos para v-select */
.v-select-style {
  --vs-controls-color: #6b7280;
  --vs-border-color: #d1d5db;
  --vs-border-radius: 0.5rem;
  --vs-dropdown-bg: #ffffff;
  --vs-dropdown-option-bg: #ffffff;
  --vs-dropdown-option-color: #374151;
  --vs-dropdown-option-padding: 0.75rem 1rem;
  --vs-dropdown-option--active-bg: #4f46e5;
  --vs-dropdown-option--active-color: #ffffff;
  --vs-selected-bg: #4f46e5;
  --vs-selected-color: #ffffff;
  --vs-search-input-color: #4b5563;
  --vs-line-height: 1.5;
  --vs-font-size: 1rem;
  --vs-actions-padding: 0.5rem 0.5rem 0 0.5rem;
}
.v-select-style .vs__dropdown-toggle {
    padding: 0.4rem;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}
</style>