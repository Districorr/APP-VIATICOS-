// src/views/admin/VehiculoDetalleView.vue
<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { useExcelExporter } from '../../composables/useExcelExporter';

import StatCard from '../../components/admin/StatCard.vue';
import ToastNotification from '../../components/ToastNotification.vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { ArrowLeftIcon, PlusIcon, FireIcon, TruckIcon, CurrencyDollarIcon, MapIcon, ArrowDownTrayIcon, UsersIcon } from '@heroicons/vue/24/outline';

const props = defineProps({
  id: { type: [String, Number], required: true },
});

const route = useRoute();
const router = useRouter();
const { exportToExcel } = useExcelExporter();

const loading = ref({
  data: true,
  formOptions: true,
  formSubmit: false,
  usuarios: true,
  asignacionesSubmit: false,
  conductores: true,
});
const error = ref('');
const notification = ref({});

const data = ref(null);
const showFormModal = ref(false);

const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];

const filters = ref({
  fechaDesde: thirtyDaysAgo,
  fechaHasta: today,
});

// --- REFACTORIZACIÓN DEL FORMULARIO ---
const newChargeForm = ref({
  fecha_carga: today,
  litros: null,
  monto_total: null,
  odometro_actual: null,
  numero_comprobante: '',
  descripcion: '',
});
const selectedProveedor = ref(null);
const selectedConductor = ref(null);
// --- FIN DE REFACTORIZACIÓN ---

const formOptions = ref({
  proveedores: [],
  conductores: [],
});

const usuariosParaAsignar = ref([]);
const usuariosSeleccionados = ref(new Set());

const vehiculoInfo = computed(() => data.value?.info || {});
const kpis = computed(() => data.value?.kpis || {});
const historial = computed(() => data.value?.historial || []);
const pageTitle = computed(() => vehiculoInfo.value.patente ? `${vehiculoInfo.value.marca} ${vehiculoInfo.value.modelo} (${vehiculoInfo.value.patente})` : 'Detalle de Vehículo');

async function fetchData() {
  loading.value.data = true;
  error.value = '';
  try {
    const { data: result, error: rpcError } = await supabase.rpc('get_vehiculo_analisis', {
      p_vehiculo_id: props.id,
      p_start_date: filters.value.fechaDesde,
      p_end_date: filters.value.fechaHasta,
    });
    if (rpcError) throw rpcError;
    data.value = result;
  } catch (e) {
    error.value = `Error al cargar los datos del vehículo: ${e.message}`;
    notification.value = { title: 'Error', message: error.value, type: 'error', timestamp: new Date() };
  } finally {
    loading.value.data = false;
  }
}

async function fetchFormOptions() {
  loading.value.formOptions = true;
  try {
    const { data: proveedoresData, error } = await supabase.from('proveedores').select('id, nombre').order('nombre');
    if (error) throw error;
    formOptions.value.proveedores = proveedoresData.map(p => ({ label: p.nombre, code: p.id }));
  } catch(e) { console.error("Error cargando proveedores:", e); }
  finally { loading.value.formOptions = false; }
}

async function fetchConductores() {
  loading.value.conductores = true;
  try {
    const { data, error } = await supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo');
    if (error) throw error;
    formOptions.value.conductores = data.map(p => ({ label: p.nombre_completo, code: p.id }));
  } catch(e) {
    console.error("Error cargando conductores:", e);
  } finally {
    loading.value.conductores = false;
  }
}

async function fetchUsuariosParaAsignar() {
  loading.value.usuarios = true;
  try {
    const { data, error } = await supabase.rpc('get_usuarios_para_asignacion', { p_vehiculo_id: props.id });
    if (error) throw error;
    usuariosParaAsignar.value = data;
    const asignadosIniciales = data.filter(u => u.esta_asignado).map(u => u.id);
    usuariosSeleccionados.value = new Set(asignadosIniciales);
  } catch (e) {
    console.error("Error cargando usuarios para asignar:", e);
    notification.value = { title: 'Error', message: 'No se pudo cargar la lista de usuarios.', type: 'error', timestamp: new Date() };
  } finally {
    loading.value.usuarios = false;
  }
}

async function handleUpdateAsignaciones() {
  loading.value.asignacionesSubmit = true;
  try {
    const idsParaGuardar = Array.from(usuariosSeleccionados.value);
    const { error } = await supabase.rpc('actualizar_asignaciones_vehiculo', {
      p_vehiculo_id: props.id,
      p_usuarios_asignados_ids: idsParaGuardar,
    });
    if (error) throw error;
    notification.value = { title: 'Éxito', message: 'Asignaciones actualizadas correctamente.', type: 'success', timestamp: new Date() };
  } catch (e) {
    notification.value = { title: 'Error', message: `No se pudieron guardar los cambios: ${e.message}`, type: 'error', timestamp: new Date() };
  } finally {
    loading.value.asignacionesSubmit = false;
  }
}

function toggleUsuario(userId) {
  if (usuariosSeleccionados.value.has(userId)) {
    usuariosSeleccionados.value.delete(userId);
  } else {
    usuariosSeleccionados.value.add(userId);
  }
}

function openFormModal() {
  newChargeForm.value = {
    fecha_carga: new Date().toISOString().split('T')[0],
    litros: null, monto_total: null,
    odometro_actual: vehiculoInfo.value.ultimo_odometro > 0 ? vehiculoInfo.value.ultimo_odometro : null,
    numero_comprobante: '', descripcion: '',
  };
  selectedProveedor.value = null;
  selectedConductor.value = null;
  showFormModal.value = true;
}

function closeFormModal() { showFormModal.value = false; }

async function handleRegisterCharge() {
  loading.value.formSubmit = true;
  try {
    const { data: result, error: rpcError } = await supabase.rpc('registrar_gasto_combustible_unificado', {
      p_vehiculo_id: props.id,
      p_fecha_carga: newChargeForm.value.fecha_carga,
      p_litros: newChargeForm.value.litros,
      p_monto_total: newChargeForm.value.monto_total,
      p_odometro_actual: newChargeForm.value.odometro_actual,
      p_proveedor_id: selectedProveedor.value?.code || null,
      p_conductor_id: selectedConductor.value?.code || null,
      p_numero_comprobante: newChargeForm.value.numero_comprobante,
      p_descripcion: newChargeForm.value.descripcion,
      p_viaje_id: null,
      p_caja_id: null,
      p_user_id: null
    });
    
    if (rpcError) throw rpcError;

    notification.value = { title: 'Éxito', message: result.message, type: 'success', timestamp: new Date() };
    closeFormModal();
    await fetchData();
  } catch (e) {
    notification.value = { title: 'Error', message: e.message || 'No se pudo registrar la carga.', type: 'error', timestamp: new Date() };
  } finally {
    loading.value.formSubmit = false;
  }
}

function exportToXLS() {
  if (!historial.value.length) {
    notification.value = { title: 'Aviso', message: 'No hay datos en el historial para exportar.', type: 'info', timestamp: new Date() };
    return;
  }
  const dataToExport = historial.value.map(h => ({
    'Fecha Carga': formatDate(h.fecha_carga), 
    'Proveedor': h.nombre_proveedor, 
    'N Comprobante': h.numero_comprobante,
    'Descripcion': h.descripcion,
    'Conductor': h.nombre_conductor,
    'Odometro (km)': h.odometro_actual, 
    'Distancia Recorrida (km)': h.distancia_recorrida,
    'Litros': h.litros, 
    'Monto Total': h.monto_total,
    'Costo por Litro': (h.monto_total && h.litros) ? (h.monto_total / h.litros).toFixed(2) : 0,
  }));
  const filename = `historial_combustible_${vehiculoInfo.value.patente}_${new Date().toISOString().split('T')[0]}`;
  exportToExcel(dataToExport, filename);
  notification.value = { title: 'Éxito', message: 'El historial se ha exportado correctamente.', type: 'success', timestamp: new Date() };
}

onMounted(() => {
  fetchData();
  fetchFormOptions();
  fetchUsuariosParaAsignar();
  fetchConductores();
});

watch(filters, fetchData, { deep: true });
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-8">
      <button @click="router.push({ name: 'AdminVehiculos' })" class="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeftIcon class="h-4 w-4 mr-2" />
        Volver a la Flota
      </button>
      <div v-if="loading.data && !data">
         <div class="h-9 bg-gray-200 rounded w-3/4 animate-pulse"></div>
      </div>
      <h1 v-else class="text-3xl font-bold text-gray-800">{{ pageTitle }}</h1>
    </div>

    <!-- Filtros de Fecha -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div>
        <label for="fechaDesde" class="form-label">Fecha Desde</label>
        <input id="fechaDesde" type="date" v-model="filters.fechaDesde" class="form-input">
      </div>
      <div>
        <label for="fechaHasta" class="form-label">Fecha Hasta</label>
        <input id="fechaHasta" type="date" v-model="filters.fechaHasta" class="form-input">
      </div>
      <div class="flex items-end">
        <button @click="openFormModal" class="btn-primary w-full md:w-auto flex items-center justify-center gap-2">
          <PlusIcon class="h-5 w-5" />
          Registrar Carga
        </button>
      </div>
    </div>

    <div v-if="loading.data" class="text-center py-10">Cargando análisis...</div>
    <div v-else-if="error" class="error-banner">{{ error }}</div>
    <div v-else class="space-y-8">
      <!-- KPIs -->
      <section>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Costo por Km" :value="kpis.costo_por_km" format="currency" :icon="CurrencyDollarIcon" />
          <StatCard title="Consumo Promedio" :value="kpis.consumo_lts_100km" suffix=" L/100km" :icon="FireIcon" />
          <StatCard title="Distancia Total" :value="kpis.distancia_total_km" suffix=" km" :icon="MapIcon" />
          <StatCard title="Costo Total Combustible" :value="kpis.costo_total" format="currency" :icon="TruckIcon" />
        </div>
      </section>

      <!-- Historial de Cargas -->
      <section class="bg-white shadow-lg rounded-lg overflow-hidden border">
        <div class="flex justify-between items-center p-6">
            <h2 class="text-xl font-semibold text-gray-700">Historial de Cargas de Combustible</h2>
            <button @click="exportToXLS" :disabled="!historial.length" class="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <ArrowDownTrayIcon class="h-5 w-5" />
                Exportar a XLS
            </button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="table-header">Fecha</th>
                <th class="table-header">Conductor</th>
                <th class="table-header">Proveedor</th>
                <th class="table-header">N° Comp.</th>
                <th class="table-header text-right">Odómetro</th>
                <th class="table-header text-right">Dist. (km)</th>
                <th class="table-header text-right">Litros</th>
                <th class="table-header text-right">Costo / Litro</th>
                <th class="table-header text-right">Monto Total</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="historial.length === 0">
                <td colspan="9" class="text-center py-10 text-gray-500">No hay registros de combustible en este período.</td>
              </tr>
              <tr v-for="h in historial" :key="h.id">
                <td class="table-cell">{{ formatDate(h.fecha_carga) }}</td>
                <td class="table-cell font-medium">{{ h.nombre_conductor || 'N/A' }}</td>
                <td class="table-cell">{{ h.nombre_proveedor || 'N/A' }}</td>
                <td class="table-cell font-mono">{{ h.numero_comprobante }}</td>
                <td class="table-cell text-right">{{ h.odometro_actual.toLocaleString('es-AR') }} km</td>
                <td class="table-cell text-right font-semibold">{{ h.distancia_recorrida ? h.distancia_recorrida.toLocaleString('es-AR') : '--' }}</td>
                <td class="table-cell text-right">{{ h.litros }} Lts</td>
                <td class="table-cell text-right text-gray-600">
                  {{ (h.monto_total && h.litros) ? formatCurrency(h.monto_total / h.litros) : '$ 0,00' }}
                </td>
                <td class="table-cell text-right font-bold">{{ formatCurrency(h.monto_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- GESTIÓN DE ACCESO -->
      <section class="bg-white shadow-lg rounded-lg border">
        <div class="p-6 border-b">
          <h2 class="text-xl font-semibold text-gray-700 flex items-center gap-3">
            <UsersIcon class="h-6 w-6 text-gray-500" />
            Gestión de Acceso de Usuarios
          </h2>
          <p class="text-sm text-gray-500 mt-1">Selecciona qué usuarios pueden ver este vehículo en su dashboard y registrar cargas.</p>
        </div>
        <div v-if="loading.usuarios" class="p-6 text-center">Cargando usuarios...</div>
        <div v-else>
          <div class="max-h-96 overflow-y-auto">
            <div v-for="usuario in usuariosParaAsignar" :key="usuario.id" @click="toggleUsuario(usuario.id)" class="flex items-center justify-between p-4 border-b hover:bg-gray-50 cursor-pointer">
              <div>
                <p class="font-medium text-gray-800">{{ usuario.nombre_completo }}</p>
                <p class="text-sm text-gray-500">{{ usuario.email }}</p>
              </div>
              <input 
                type="checkbox" 
                :checked="usuariosSeleccionados.has(usuario.id)" 
                class="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                @click.stop="toggleUsuario(usuario.id)"
              >
            </div>
          </div>
          <div class="p-6 bg-gray-50 flex justify-end">
            <button @click="handleUpdateAsignaciones" :disabled="loading.asignacionesSubmit" class="btn-primary disabled:bg-indigo-400">
              <span v-if="loading.asignacionesSubmit">Guardando...</span>
              <span v-else>Guardar Cambios</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- Modal para Registrar Carga -->
    <Transition name="modal-fade">
      <div v-if="showFormModal" @click.self="closeFormModal" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl transform transition-all">
          <form @submit.prevent="handleRegisterCharge">
            <div class="p-6 border-b">
              <h3 class="text-lg font-semibold text-gray-900">Registrar Carga de Combustible</h3>
            </div>
            <div class="p-6 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="form-fecha" class="form-label">Fecha de Carga</label>
                  <input id="form-fecha" type="date" v-model="newChargeForm.fecha_carga" required class="form-input">
                </div>
                 <div>
                  <label for="form-proveedor" class="form-label">Proveedor (Cta. Cte.)</label>
                  <v-select id="form-proveedor" v-model="newChargeForm.proveedor_id" :options="formOptions.proveedores" :reduce="option => option.code" :loading="loading.formOptions" class="v-select-filter" placeholder="Seleccionar..."></v-select>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label for="form-odometro" class="form-label">Odómetro Actual (km)</label>
                  <input id="form-odometro" type="number" step="1" v-model.number="newChargeForm.odometro_actual" required class="form-input" placeholder="Ej: 125400">
                </div>
                <div>
                  <label for="form-litros" class="form-label">Litros</label>
                  <input id="form-litros" type="number" step="0.01" v-model.number="newChargeForm.litros" required class="form-input" placeholder="Ej: 45.50">
                </div>
                <div>
                  <label for="form-monto" class="form-label">Monto Total ($)</label>
                  <input id="form-monto" type="number" step="0.01" v-model.number="newChargeForm.monto_total" required class="form-input" placeholder="Ej: 50000.00">
                </div>
              </div>
              <div>
                <label for="form-conductor" class="form-label">Conductor</label>
                <v-select id="form-conductor" v-model="newChargeForm.conductor_id" :options="formOptions.conductores" :reduce="option => option.code" :loading="loading.conductores" class="v-select-filter" placeholder="Seleccionar..."></v-select>
              </div>
              <div>
                <label for="form-comprobante" class="form-label">N° de Comprobante / Remito</label>
                <input id="form-comprobante" type="text" v-model="newChargeForm.numero_comprobante" class="form-input" placeholder="Ej: 0001-00123456">
              </div>
              <div>
                <label for="form-descripcion" class="form-label">Descripción (Opcional)</label>
                <input id="form-descripcion" type="text" v-model="newChargeForm.descripcion" class="form-input" placeholder="Ej: Carga tanque lleno">
              </div>
            </div>
            <div class="p-6 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button type="button" @click="closeFormModal" class="btn-secondary">Cancelar</button>
              <button type="submit" :disabled="loading.formSubmit" class="btn-primary disabled:bg-indigo-300">
                {{ loading.formSubmit ? 'Guardando...' : 'Guardar Registro' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
    
    <ToastNotification :notification="notification" />
  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500; }
.btn-secondary { @apply bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-6 py-4 whitespace-nowrap text-sm text-gray-800; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.v-select-filter { --vs-controls-color: #6b7280; --vs-border-color: #d1d5db; --vs-dropdown-bg: #ffffff; --vs-dropdown-option-bg: #ffffff; --vs-dropdown-option-color: #374151; --vs-dropdown-option-padding: 0.5rem 1rem; --vs-dropdown-option--active-bg: #3b82f6; --vs-dropdown-option--active-color: #ffffff; --vs-selected-bg: #3b82f6; --vs-selected-color: #ffffff; --vs-search-input-color: #4b5563; --vs-line-height: 1.5; --vs-font-size: 0.875rem; }

.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.3s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-active .transform, .modal-fade-leave-active .transform { transition: all 0.3s ease; }
.modal-fade-enter-from .transform, .modal-fade-leave-to .transform { transform: scale(0.95); opacity: 0; }
</style>