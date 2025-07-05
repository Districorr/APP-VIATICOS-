<!-- src/views/GastosListView.vue -->
<script setup>
// ... (toda la sección <script> se mantiene exactamente igual que en mi respuesta anterior)
import { ref, onMounted, computed, watch, inject } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
import { useReportGenerator } from '../composables/useReportGenerator.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import DetallesJson from '../components/DetallesJson.vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import SummaryCard from '../components/SummaryCard.vue';

const router = useRouter();
const route = useRoute();
const userProfile = inject('userProfile', ref(null));

const { generateRendicionCompletaPDF } = useReportGenerator();

const gastos = ref([]);
const viajeSeleccionadoInfo = ref(null);
const loading = ref(true);
const errorMessage = ref('');
const listaViajesParaFiltro = ref([]);
const tiposDeGastoDisponibles = ref([]);
const filtroViajeId = ref('');
const filtroTipoGastoIds = ref([]);
const filtroDescripcion = ref('');
const isExportMenuOpen = ref(false);
const expandedRows = ref(new Set());
const isClosingRendicion = ref(false);
const feedbackMessage = ref('');

const toggleRowExpansion = (gastoId) => {
  if (expandedRows.value.has(gastoId)) {
    expandedRows.value.delete(gastoId);
  } else {
    expandedRows.value.add(gastoId);
  }
};

const gastosAgrupados = computed(() => {
  if (!gastos.value) return {};
  const grupos = {};
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const formatoFechaClave = (fecha) => fecha.toISOString().split('T')[0];
  const hoyClave = formatoFechaClave(hoy);
  const ayerClave = formatoFechaClave(ayer);

  gastos.value.forEach(gasto => {
    const [year, month, day] = gasto.fecha_gasto.split('-').map(Number);
    const fechaGasto = new Date(year, month - 1, day);
    const fechaClave = formatoFechaClave(fechaGasto);
    let grupoKey = '';
    if (fechaClave === hoyClave) grupoKey = 'Hoy';
    else if (fechaClave === ayerClave) grupoKey = 'Ayer';
    else {
      grupoKey = fechaGasto.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      grupoKey = grupoKey.charAt(0).toUpperCase() + grupoKey.slice(1);
    }
    if (!grupos[grupoKey]) grupos[grupoKey] = [];
    grupos[grupoKey].push(gasto);
  });
  return grupos;
});

const totalGastado = computed(() => gastos.value.reduce((sum, g) => sum + (g.monto_total || 0), 0));
const adelantoTotal = computed(() => viajeSeleccionadoInfo.value?.monto_adelanto || 0);
const saldoActualRendicion = computed(() => adelantoTotal.value - totalGastado.value);
const isViajeActualCerrado = computed(() => !!viajeSeleccionadoInfo.value?.cerrado_en);

const fetchInitialData = async () => {
  loading.value = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const [viajesResult, tiposResult] = await Promise.all([
      supabase.from('viajes').select('id, nombre_viaje, codigo_rendicion, monto_adelanto, cerrado_en, fecha_inicio, fecha_fin, estado_aprobacion, comentarios_aprobacion').eq('user_id', user.id).order('fecha_inicio', { ascending: false }),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true).order('nombre_tipo_gasto')
    ]);

    if (viajesResult.error) throw viajesResult.error;
    listaViajesParaFiltro.value = viajesResult.data || [];
    if (tiposResult.error) throw tiposResult.error;
    tiposDeGastoDisponibles.value = tiposResult.data.map(t => ({ label: t.nombre_tipo_gasto, code: t.id })) || [];

    const viajeIdDeURL = route.query.viajeId;
    if (viajeIdDeURL && listaViajesParaFiltro.value.some(v => v.id == viajeIdDeURL)) {
      filtroViajeId.value = viajeIdDeURL;
    } else if (listaViajesParaFiltro.value.length > 0) {
      filtroViajeId.value = listaViajesParaFiltro.value[0].id;
    } else {
      loading.value = false;
    }
  } catch (error) { 
    errorMessage.value = "Error al cargar datos iniciales: " + error.message; 
    loading.value = false;
  }
};

const fetchGastos = async () => {
  if (!filtroViajeId.value) {
    gastos.value = [];
    viajeSeleccionadoInfo.value = null;
    return;
  }
  loading.value = true; 
  errorMessage.value = ''; 
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");
    viajeSeleccionadoInfo.value = listaViajesParaFiltro.value.find(v => v.id == filtroViajeId.value) || null;
    
    let query = supabase.from('gastos')
      .select(`id, fecha_gasto, monto_total, descripcion_general, factura_url, datos_adicionales, numero_factura, provincia, tipos_gasto_config (id, nombre_tipo_gasto)`)
      .eq('user_id', user.id)
      .eq('viaje_id', filtroViajeId.value);

    if (filtroTipoGastoIds.value.length > 0) {
      const ids = filtroTipoGastoIds.value.map(t => t.code);
      query = query.in('tipo_gasto_id', ids);
    }
    if (filtroDescripcion.value) query = query.ilike('descripcion_general', `%${filtroDescripcion.value}%`);

    const { data, error } = await query.order('fecha_gasto', { ascending: false });
    if (error) throw error;
    gastos.value = data || [];
  } catch (error) { 
    errorMessage.value = 'No se pudieron cargar los gastos: ' + error.message;
    gastos.value = [];
  } finally { 
    loading.value = false; 
  }
};

function showFeedbackMessage() {
  if (route.query.feedback) {
    feedbackMessage.value = route.query.feedback;
    router.replace({ query: { ...route.query, feedback: undefined } });
    setTimeout(() => { feedbackMessage.value = ''; }, 4000);
  }
}

function editarGasto(gastoId) {
  if (isViajeActualCerrado.value) {
    feedbackMessage.value = "No se pueden editar gastos de una rendición cerrada.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  router.push({ name: 'GastoFormEdit', params: { gastoId } });
}

onMounted(() => {
  fetchInitialData();
  showFeedbackMessage();
});

watch(filtroViajeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    if (String(route.query.viajeId || '') !== String(newId)) {
        router.push({ query: { ...route.query, viajeId: newId } });
    }
    fetchGastos();
  }
});

watch([filtroTipoGastoIds, filtroDescripcion], fetchGastos);

const goToNuevoGasto = () => {
  if (isViajeActualCerrado.value) {
    feedbackMessage.value = "No se pueden agregar gastos a una rendición cerrada.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  router.push({ name: 'GastoFormCreate', query: { viajeId: filtroViajeId.value } });
};

const eliminarGasto = async (gastoId) => { 
  if (isViajeActualCerrado.value) {
    feedbackMessage.value = "No se pueden eliminar gastos de una rendición cerrada.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  if (!confirm(`¿Estás seguro de que querés eliminar este gasto?`)) return;
  try {
    const { error } = await supabase.from('gastos').delete().eq('id', gastoId);
    if (error) throw error;
    feedbackMessage.value = "Gasto eliminado con éxito.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    fetchGastos();
  } catch (error) {
    errorMessage.value = 'Error al eliminar el gasto: ' + error.message;
  }
};

async function cerrarRendicion() {
  if (!viajeSeleccionadoInfo.value || isViajeActualCerrado.value) return;
  const confirmacion = confirm(`¿Estás seguro de que quieres cerrar la rendición "${viajeSeleccionadoInfo.value.nombre_viaje}"?\n\nUna vez cerrada, no podrás añadir, editar o eliminar más gastos y se enviará para su aprobación.`);
  if (!confirmacion) return;

  isClosingRendicion.value = true;
  errorMessage.value = '';
  try {
    const { error } = await supabase.from('viajes').update({ cerrado_en: new Date().toISOString(), estado_aprobacion: 'pendiente_aprobacion' }).eq('id', viajeSeleccionadoInfo.value.id);
    if (error) throw error;
    
    feedbackMessage.value = "Rendición cerrada y enviada para aprobación con éxito.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    
    await fetchInitialData();
  } catch (error) {
    errorMessage.value = `No se pudo cerrar la rendición: ${error.message}`;
  } finally {
    isClosingRendicion.value = false;
  }
}

const generarRendicionPDFWrapper = () => {
  if (!viajeSeleccionadoInfo.value || gastos.value.length === 0) {
    feedbackMessage.value = 'Selecciona una rendición con gastos para generar el PDF.';
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  const userInfo = { nombre_completo: userProfile.value?.nombre_completo, email: userProfile.value?.email };
  const totales = { gastosBruto: totalGastado.value, adelantosDisponibles: adelantoTotal.value, saldoFinal: saldoActualRendicion.value };
  generateRendicionCompletaPDF(JSON.parse(JSON.stringify(gastos.value)), viajeSeleccionadoInfo.value, userInfo, totales);
  isExportMenuOpen.value = false;
};
</script>

<template>
  <div class="bg-gray-50 min-h-screen font-sans">
    <!-- Toast de Feedback -->
    <div v-if="feedbackMessage" class="fixed top-24 right-6 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300" role="alert">
      {{ feedbackMessage }}
    </div>

    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Encabezado Fijo -->
      <div class="sticky top-0 z-20 bg-gray-50/80 backdrop-blur-sm -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-8 pb-4 mb-6 border-b border-gray-200">
        <div class="flex items-center justify-between mb-6">
          <div class="flex-grow min-w-0">
            <h1 class="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight truncate">{{ viajeSeleccionadoInfo?.nombre_viaje || 'Mis Gastos' }}</h1>
            <p v-if="!viajeSeleccionadoInfo" class="mt-1 text-gray-600">Selecciona una rendición para ver sus gastos.</p>
          </div>
          <div class="relative flex-shrink-0 flex items-center gap-2">
            <button v-if="viajeSeleccionadoInfo && !isViajeActualCerrado" @click="cerrarRendicion" :disabled="isClosingRendicion" class="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
              <svg v-if="!isClosingRendicion" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" /></svg>
              <svg v-if="isClosingRendicion" class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {{ isClosingRendicion ? 'Cerrando...' : 'Cerrar y Enviar' }}
            </button>
            <button @click="isExportMenuOpen = !isExportMenuOpen" class="p-2 rounded-full hover:bg-gray-200 transition-colors" aria-label="Opciones de exportación">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-600"><path d="M10 3.75a2 2 0 100 4 2 2 0 000-4zM10 8.75a2 2 0 100 4 2 2 0 000-4zM10 13.75a2 2 0 100 4 2 2 0 000-4z" /></svg>
            </button>
            <transition name="fade">
              <div v-if="isExportMenuOpen" @click.away="isExportMenuOpen = false" class="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-30">
                <div class="py-1">
                  <button @click="generarRendicionPDFWrapper" class="export-btn">Exportar Rendición (PDF)</button>
                </div>
              </div>
            </transition>
          </div>
        </div>
        <div class="hidden sm:grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard title="Adelanto Total" :value="adelantoTotal" :total="adelantoTotal > 0 ? adelantoTotal : 1" color="#3B82F6" />
          <SummaryCard title="Total Gastado" :value="totalGastado" :total="adelantoTotal" :color="totalGastado > adelantoTotal ? '#EF4444' : '#22C55E'" />
          <SummaryCard title="Saldo Actual" :value="saldoActualRendicion" :format-as-currency="true" :color="saldoActualRendicion >= 0 ? '#6B7280' : '#EF4444'" :show-chart="false" />
        </div>
        <div class="grid grid-cols-2 gap-4 sm:hidden">
            <div class="summary-card-mobile"><p class="summary-label">Total Gastado</p><p class="summary-value-mobile">{{ formatCurrency(totalGastado) }}</p></div>
            <div class="summary-card-mobile"><p class="summary-label">Saldo Actual</p><p class="summary-value-mobile" :class="saldoActualRendicion >= 0 ? 'text-gray-800' : 'text-red-600'">{{ formatCurrency(saldoActualRendicion) }}</p></div>
        </div>
      </div>

      <!-- Filtros -->
      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="filtro-viaje" class="form-label-filter">Rendición Activa</label>
            <select id="filtro-viaje" v-model="filtroViajeId" class="form-input mt-1">
              <option v-if="listaViajesParaFiltro.length === 0" value="" disabled>No tienes rendiciones</option>
              <option v-for="viaje in listaViajesParaFiltro" :key="viaje.id" :value="viaje.id">{{ viaje.nombre_viaje }}</option>
            </select>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="filtro-tipo" class="form-label-filter">Filtrar por Tipo</label>
              <v-select id="filtro-tipo" v-model="filtroTipoGastoIds" :options="tiposDeGastoDisponibles" multiple placeholder="Todos" class="v-select-filter mt-1"></v-select>
            </div>
            <div>
              <label for="filtro-descripcion" class="form-label-filter">Buscar en Descripción</label>
              <input id="filtro-descripcion" type="text" v-model="filtroDescripcion" placeholder="Ej: Nafta, Hotel..." class="form-input mt-1">
            </div>
          </div>
        </div>
      </div>

      <!-- Banners de Estado -->
      <div v-if="viajeSeleccionadoInfo?.estado_aprobacion === 'pendiente_aprobacion'" class="mb-4 p-3 text-center text-sm bg-blue-100 text-blue-800 border border-blue-200 rounded-lg">Esta rendición está cerrada y pendiente de aprobación por un administrador.</div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'aprobado'" class="mb-4 p-3 text-center text-sm bg-green-100 text-green-800 border border-green-200 rounded-lg">¡Felicidades! Esta rendición ha sido aprobada.</div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'rechazado'" class="mb-4 p-3 text-sm bg-red-100 text-red-800 border border-red-200 rounded-lg">
        <p class="font-bold">Esta rendición fue rechazada.</p>
        <p v-if="viajeSeleccionadoInfo.comentarios_aprobacion" class="mt-1">Motivo: "{{ viajeSeleccionadoInfo.comentarios_aprobacion }}"</p>
      </div>
      
      <!-- Estados de Carga y Vacío -->
      <div v-if="loading" class="text-center py-20 text-gray-500">Cargando gastos...</div>
      <div v-else-if="errorMessage" class="p-4 bg-red-100 text-red-700 rounded-lg">{{ errorMessage }}</div>
      <div v-else-if="gastos.length === 0" class="text-center py-20 text-gray-500"><p class="font-semibold">No se encontraron gastos.</p><p class="text-sm mt-1">Intenta ajustar los filtros o registra un nuevo gasto.</p></div>
      
      <div v-else>
        <!-- Tabla de Escritorio -->
        <div class="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="table-header w-px"></th>
                <th class="table-header">Fecha</th>
                <th class="table-header">Tipo de Gasto</th>
                <th class="table-header">Provincia</th>
                <th class="table-header text-center">N° Factura</th>
                <th class="table-header">Descripción</th>
                <th class="table-header text-right">Monto</th>
                <th class="table-header text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <template v-for="gasto in gastos" :key="gasto.id">
                <tr class="hover:bg-blue-50/50 transition-colors duration-150">
                  <td class="table-cell text-center">
                    <button @click="toggleRowExpansion(gasto.id)" class="p-1 rounded-full hover:bg-gray-200" aria-label="Ver detalles">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-gray-400 transition-transform" :class="{'rotate-90': expandedRows.has(gasto.id)}"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" /></svg>
                    </button>
                  </td>
                  <td class="table-cell font-semibold text-gray-700 w-28">{{ formatDate(gasto.fecha_gasto) }}</td>
                  <td class="table-cell w-48">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto }}</td>
                  <td class="table-cell w-32">{{ gasto.provincia || '-' }}</td>
                  <td class="table-cell text-center w-24">{{ gasto.numero_factura || '-' }}</td>
                  <td class="table-cell font-medium text-gray-900 max-w-sm">
                    <span class="truncate" :title="gasto.descripcion_general">{{ gasto.descripcion_general }}</span>
                  </td>
                  <td class="table-cell text-right font-bold text-gray-800 w-36">{{ formatCurrency(gasto.monto_total) }}</td>
                  <td class="table-cell text-center w-32">
                    <div class="flex justify-center items-center gap-2">
                      <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-icon-action btn-icon-link" aria-label="Ver factura">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h7.5A2.25 2.25 0 0 0 14 11.75V7.5a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /><path d="M10 .75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.56L6.03 6.28a.75.75 0 0 1-1.06-1.06L8.69 1.5H7.25a.75.75 0 0 1 0-1.5h3.5Z" /></svg>
                      </a>
                      <button @click="editarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-edit" aria-label="Editar Gasto Completo">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg>
                      </button>
                      <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-delete" aria-label="Eliminar Gasto">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="expandedRows.has(gasto.id)">
                  <td colspan="8" class="p-0">
                    <div class="px-6 py-4">
                      <DetallesJson :datos="gasto.datos_adicionales" />
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        
        <!-- Vista Móvil -->
        <div class="lg:hidden space-y-4">
          <div v-for="(grupoGastos, fechaGrupo) in gastosAgrupados" :key="fechaGrupo">
            <h2 class="px-1 mb-2 text-sm font-bold text-gray-500">{{ fechaGrupo }}</h2>
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
              <div v-for="gasto in grupoGastos" :key="gasto.id" class="p-4">
                <div class="flex justify-between items-start gap-4">
                  <div class="flex-grow">
                    <p class="font-semibold text-gray-800">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto' }}</p>
                    <p class="text-sm text-gray-600">{{ gasto.descripcion_general }}</p>
                    <p class="text-xs text-gray-400 mt-1">
                      {{ formatDate(gasto.fecha_gasto) }}
                      <span v-if="gasto.provincia"> • {{ gasto.provincia }}</span>
                    </p>
                  </div>
                  <div class="flex-shrink-0 text-right">
                    <p class="font-bold text-lg text-gray-800">{{ formatCurrency(gasto.monto_total) }}</p>
                  </div>
                </div>
                <div v-if="(gasto.datos_adicionales && Object.keys(gasto.datos_adicionales).length > 0)" class="mt-3">
                  <DetallesJson :datos="gasto.datos_adicionales" />
                </div>
                <div class="mt-3 pt-3 border-t border-gray-100 flex justify-end items-center gap-2">
                  <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-mobile-action" aria-label="Ver factura">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M12.25 12.25a.75.75 0 001.06 1.06l3.25-3.25a.75.75 0 000-1.06l-3.25-3.25a.75.75 0 10-1.06 1.06L14.44 9.5H3.75a.75.75 0 000 1.5h10.69l-2.19 2.19z" /><path fill-rule="evenodd" d="M3 4.75A2.75 2.75 0 015.75 2h8.5A2.75 2.75 0 0117 4.75v10.5A2.75 2.75 0 0114.25 18h-8.5A2.75 2.75 0 013 15.25V4.75zm2.75-.25a1.25 1.25 0 00-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V4.75c0-.69-.56-1.25-1.25-1.25h-8.5z" clip-rule="evenodd" /></svg>
                    Factura
                  </a>
                  <button @click="editarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="btn-mobile-action" aria-label="Editar Gasto">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                    Editar
                  </button>
                  <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="btn-mobile-action text-red-600" aria-label="Eliminar Gasto">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002 2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Botón de Acción Flotante -->
    <div class="fixed bottom-6 right-6 z-10">
      <button @click="goToNuevoGasto" :disabled="isViajeActualCerrado" class="fab-button" aria-label="Añadir nuevo gasto">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7"><path fill-rule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clip-rule="evenodd" /></svg>
      </button>
    </div>
  </div>
</template>

<style>
.summary-card-mobile { @apply bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center; }
.summary-value-mobile { @apply text-2xl font-bold text-gray-800 mt-1; }
.fab-button { @apply h-14 w-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform duration-150 hover:scale-110 disabled:bg-gray-400; }
.export-btn { @apply flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.1s ease-in-out; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.form-label-filter { @apply block text-xs font-medium text-gray-600 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-3 whitespace-nowrap text-sm text-gray-600; }
.btn-icon-action { @apply inline-flex items-center p-1.5 rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed; }
.btn-icon-edit { @apply text-blue-600 hover:bg-blue-100 hover:scale-110 disabled:hover:bg-transparent disabled:hover:scale-100; }
.btn-icon-delete { @apply text-red-600 hover:bg-red-100 hover:scale-110 disabled:hover:bg-transparent disabled:hover:scale-100; }
.btn-icon-link { @apply text-gray-500 hover:bg-gray-200 hover:scale-110 disabled:hover:bg-transparent disabled:hover:scale-100; }
.v-select-filter { --vs-controls-color: #6b7280; --vs-border-color: #d1d5db; --vs-dropdown-bg: #ffffff; --vs-dropdown-option-bg: #ffffff; --vs-dropdown-option-color: #374151; --vs-dropdown-option-padding: 0.5rem 1rem; --vs-dropdown-option--active-bg: #3b82f6; --vs-dropdown-option--active-color: #ffffff; --vs-selected-bg: #3b82f6; --vs-selected-color: #ffffff; --vs-search-input-color: #4b5563; --vs-line-height: 1.5; --vs-font-size: 0.875rem; }
.btn-mobile-action { @apply inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50; }
</style>