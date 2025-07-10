<script setup>
import { ref, onMounted, computed, watch, inject } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
// MODIFICACIÓN: Importamos la nueva función junto con la vieja
import { useReportGenerator } from '../composables/useReportGenerator.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import DetallesJson from '../components/DetallesJson.vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import SummaryCard from '../components/SummaryCard.vue';
import IconRenderer from '../components/IconRenderer.vue';

const router = useRouter();
const route = useRoute();
const userProfile = inject('userProfile', ref(null));

// MODIFICACIÓN: Desestructuramos la nueva función
const { generateCanvaStylePDF, generateRendicionCompletaPDF } = useReportGenerator();

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
const sortKey = ref('fecha_gasto');
const sortOrder = ref('desc');
const selectedGastos = ref(new Set());
const showGroupModal = ref(false);
const newGroupName = ref('');
const isGrouping = ref(false);
const groupError = ref('');

// Lógica para Desagrupar
const canUngroup = computed(() => {
  if (selectedGastos.value.size === 0) return false;
  // Verifica si TODOS los gastos seleccionados tienen un grupo_id asignado
  for (const gastoId of selectedGastos.value) {
    const gasto = gastos.value.find(g => g.id === gastoId);
    // Si algún gasto seleccionado no se encuentra o NO tiene grupo_id, no se puede desagrupar
    if (!gasto || !gasto.grupo_id) {
      return false;
    }
  }
  // Si el bucle termina, significa que todos los gastos seleccionados tienen grupo_id
  return true;
});

async function handleUngroup() {
  if (!canUngroup.value) return;
  if (!confirm(`¿Estás seguro de que quieres quitar estos ${selectedGastos.value.size} gastos de su grupo actual?`)) return;

  isGrouping.value = true;
  try {
    const gastoIdsToUpdate = Array.from(selectedGastos.value);
    const { error } = await supabase
      .from('gastos')
      .update({ grupo_id: null })
      .in('id', gastoIdsToUpdate);
    if (error) throw error;
    selectedGastos.value.clear();
    await fetchGastos();
    feedbackMessage.value = "Gastos desagrupados con éxito.";
    setTimeout(() => feedbackMessage.value = '', 4000);
  } catch (e) {
    errorMessage.value = `Error al desagrupar: ${e.message}`;
  } finally {
    isGrouping.value = false;
  }
}
// Fin Lógica para Desagrupar

function sortBy(key) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'desc';
  }
}

// Lógica de Renderizado Mejorada (Agrupación por Grupo de Usuario o por Fecha)
const gastosRenderList = computed(() => {
  const sortedGastos = [...gastos.value].sort((a, b) => {
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];
    let comparison = 0;
    if (valA > valB) comparison = 1;
    else if (valA < valB) comparison = -1;
    return sortOrder.value === 'asc' ? comparison : -comparison;
  });

  const userGroups = {};
  const dateGroups = {};

  sortedGastos.forEach(gasto => {
    if (gasto.grupos_gastos) {
      // Si el gasto pertenece a un grupo creado por el usuario
      const grupoKey = `group-${gasto.grupos_gastos.id}`;
      if (!userGroups[grupoKey]) {
        userGroups[grupoKey] = { isGroup: true, id: gasto.grupos_gastos.id, name: gasto.grupos_gastos.nombre_grupo, gastos: [] };
      }
      userGroups[grupoKey].gastos.push(gasto);
    } else {
      // Si el gasto NO pertenece a un grupo, agrupar por fecha
      const fechaClave = gasto.fecha_gasto; // Asumimos que fecha_gasto es una string 'YYYY-MM-DD'
      if (!dateGroups[fechaClave]) {
        dateGroups[fechaClave] = {
          isGroup: false,
          id: fechaClave,
          name: formatDate(gasto.fecha_gasto, { weekday: 'long', day: 'numeric', month: 'long' }), // Formato para mostrar el día
          gastos: []
        };
      }
      dateGroups[fechaClave].gastos.push(gasto);
    }
  });

  // Convertir objetos a arrays y ordenar
  const finalUserGroups = Object.values(userGroups).sort((a, b) => a.name.localeCompare(b.name));
  // Ordenar grupos por fecha de forma descendente
  const finalDateGroups = Object.values(dateGroups).sort((a, b) => new Date(b.id) - new Date(a.id));

  // Concatenar grupos de usuario y grupos por fecha
  return { userGroups: finalUserGroups, dateGroups: finalDateGroups };
});
// Fin Lógica de Renderizado Mejorada

function toggleGastoSelection(gastoId) {
  if (selectedGastos.value.has(gastoId)) selectedGastos.value.delete(gastoId);
  else selectedGastos.value.add(gastoId);
}

function openGroupModal() {
  if (selectedGastos.value.size === 0) return;
  // Opcional: Verificar si todos los seleccionados NO están ya agrupados
  const allSelectedUngrouped = Array.from(selectedGastos.value).every(gastoId => {
    const gasto = gastos.value.find(g => g.id === gastoId);
    return gasto && !gasto.grupo_id;
  });
  if (!allSelectedUngrouped) {
      groupError.value = "Solo puedes agrupar gastos que no pertenecen a un grupo existente.";
      setTimeout(() => groupError.value = '', 5000); // Limpiar mensaje después de 5s
      return;
  }

  newGroupName.value = '';
  groupError.value = '';
  showGroupModal.value = true;
}

async function handleGroupCreation() {
  if (!newGroupName.value.trim()) {
    groupError.value = "El nombre del grupo no puede estar vacío.";
    return;
  }
  isGrouping.value = true;
  groupError.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    // Verificar nuevamente si todos los seleccionados NO están ya agrupados antes de crear el grupo
    const allSelectedUngrouped = Array.from(selectedGastos.value).every(gastoId => {
        const gasto = gastos.value.find(g => g.id === gastoId);
        return gasto && !gasto.grupo_id;
    });
    if (!allSelectedUngrouped) {
        groupError.value = "Error: Algunos gastos seleccionados ya pertenecen a un grupo.";
        isGrouping.value = false;
        return;
    }

    const { data: newGroup, error: groupError } = await supabase.from('grupos_gastos').insert({ nombre_grupo: newGroupName.value, viaje_id: viajeSeleccionadoInfo.value.id, creado_por_id: user.id }).select().single();
    if (groupError) throw groupError;
    const gastoIdsToUpdate = Array.from(selectedGastos.value);
    const { error: updateError } = await supabase.from('gastos').update({ grupo_id: newGroup.id }).in('id', gastoIdsToUpdate);
    if (updateError) throw updateError;
    selectedGastos.value.clear();
    showGroupModal.value = false;
    await fetchGastos();
    feedbackMessage.value = "Gastos agrupados con éxito.";
    setTimeout(() => feedbackMessage.value = '', 4000);
  } catch (e) {
    groupError.value = `Error al agrupar: ${e.message}`;
  } finally {
    isGrouping.value = false;
  }
}

const toggleRowExpansion = (gastoId) => {
  if (expandedRows.value.has(gastoId)) expandedRows.value.delete(gastoId);
  else expandedRows.value.add(gastoId);
};

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
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto, icono_svg, color_accent').eq('activo', true).order('nombre_tipo_gasto')
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
      // Si no hay viajes y no hay viajeId en la URL, no hay nada que cargar
      loading.value = false;
      gastos.value = []; // Asegurarse de que la lista de gastos esté vacía
      viajeSeleccionadoInfo.value = null; // Asegurarse de que la info del viaje esté vacía
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
    loading.value = false; // Asegurarse de que loading sea false si no hay viaje seleccionado
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");
    viajeSeleccionadoInfo.value = listaViajesParaFiltro.value.find(v => v.id == filtroViajeId.value) || null;
    let query = supabase.from('gastos').select(`id, fecha_gasto, monto_total, descripcion_general, factura_url, datos_adicionales, numero_factura, provincia, grupo_id, tipos_gasto_config (id, nombre_tipo_gasto, icono_svg, color_accent), grupos_gastos (id, nombre_grupo)`).eq('user_id', user.id).eq('viaje_id', filtroViajeId.value);
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
    // Reemplazar la ruta para limpiar el query param sin recargar
    router.replace({ query: { ...route.query, feedback: undefined } }).catch(()=>{}); // Catch para evitar error si la navegación es redundante
    setTimeout(() => { feedbackMessage.value = ''; }, 4000);
  }
}

// Modificado para recibir el objeto gasto completo
function editarGasto(gasto) {
  // Verificar si el objeto gasto o su ID están presentes
  if (!gasto || !gasto.id) {
    console.error("editarGasto fue llamado sin un objeto gasto válido o con ID faltante.", gasto);
    errorMessage.value = "Error: No se pudo identificar el gasto a editar.";
    return;
  }
  if (isViajeActualCerrado.value) {
    feedbackMessage.value = "No se pueden editar gastos de una rendición cerrada.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  // CORRECCIÓN: Usar 'id' en params para que coincida con la definición de ruta esperada
  router.push({ name: 'GastoFormEdit', params: { id: gasto.id } });
}

onMounted(() => {
  fetchInitialData();
  showFeedbackMessage();
});

watch(filtroViajeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    selectedGastos.value.clear();
    // Actualizar la URL solo si el viajeId en la URL es diferente
    if (String(route.query.viajeId || '') !== String(newId)) {
        router.push({ query: { ...route.query, viajeId: newId } }).catch(()=>{}); // Catch para evitar error si la navegación es redundante
    }
    fetchGastos();
  } else if (!newId && oldId) {
      // Caso donde se deselecciona un viaje (si fuera posible) o se queda sin viajes
      gastos.value = [];
      viajeSeleccionadoInfo.value = null;
      selectedGastos.value.clear();
      if (route.query.viajeId) {
           router.replace({ query: { ...route.query, viajeId: undefined } }).catch(()=>{});
      }
  }
});

watch([filtroTipoGastoIds, filtroDescripcion], fetchGastos);

const goToNuevoGasto = () => {
  if (!filtroViajeId.value) {
     feedbackMessage.value = "Selecciona una rendición activa para agregar gastos.";
     setTimeout(() => feedbackMessage.value = '', 4000);
     return;
  }
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
    fetchGastos(); // Volver a cargar los gastos después de eliminar
  } catch (error) {
    errorMessage.value = 'Error al eliminar el gasto: ' + error.message;
  }
};

async function cerrarRendicion() {
  if (!viajeSeleccionadoInfo.value || isViajeActualCerrado.value) return;
   if (gastos.value.length === 0) {
     feedbackMessage.value = "No puedes cerrar una rendición sin gastos.";
     setTimeout(() => feedbackMessage.value = '', 4000);
     return;
   }
  const confirmacion = confirm(`¿Estás seguro de que quieres cerrar la rendición "${viajeSeleccionadoInfo.value.nombre_viaje}"?\n\nUna vez cerrada, no podrás añadir, editar o eliminar más gastos y se enviará para su aprobación.`);
  if (!confirmacion) return;
  isClosingRendicion.value = true;
  errorMessage.value = '';
  try {
    // La base de datos se encarga de la notificación a los admins via trigger
    const { error } = await supabase.from('viajes').update({ cerrado_en: new Date().toISOString(), estado_aprobacion: 'pendiente_aprobacion' }).eq('id', viajeSeleccionadoInfo.value.id);
    if (error) throw error;
    feedbackMessage.value = "Rendición cerrada y enviada para aprobación con éxito.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    // Refrescar la info del viaje seleccionado para actualizar el estado
    await fetchInitialData(); // Esto recargará la lista de viajes y seleccionará el mismo si existe
    // Si el viaje seleccionado ya no está en la lista (ej. si el fetchInitialData lo filtra por estado),
    // el watch de filtroViajeId se encargará de limpiar los gastos.
    // Si sigue seleccionado, fetchGastos se llamará automáticamente via watch.

  } catch (error) {
    errorMessage.value = `No se pudo cerrar la rendición: ${error.message}`;
  } finally {
    isClosingRendicion.value = false;
  }
}

// MODIFICACIÓN: Esta función ahora llamará al nuevo generador
const generarRendicionPDFWrapper = () => {
  if (!viajeSeleccionadoInfo.value || !viajeSeleccionadoInfo.value.id) {
    feedbackMessage.value = 'Selecciona una rendición con gastos para generar el PDF.';
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  
  // Llamamos a la nueva función, que es mucho más simple. Solo necesita el ID del viaje.
  generateCanvaStylePDF(viajeSeleccionadoInfo.value.id);

  isExportMenuOpen.value = false;
};
</script>
<template>
  <div class="bg-gray-50 min-h-screen font-sans">
    <!-- Mensaje de Feedback -->
    <div v-if="feedbackMessage" class="fixed top-24 right-6 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300" role="alert">
      {{ feedbackMessage }}
    </div>
    <!-- Mensaje de Error -->
     <div v-if="errorMessage && !feedbackMessage" class="fixed top-24 right-6 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300" role="alert">
      {{ errorMessage }}
    </div>


    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Encabezado Fijo con Título, Botones y Resumen -->
      <div class="sticky top-0 z-20 bg-gray-50/80 backdrop-blur-sm -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-8 pb-4 mb-6 border-b border-gray-200">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div class="flex-grow min-w-0">
            <h1 class="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight truncate">{{ viajeSeleccionadoInfo?.nombre_viaje || 'Mis Gastos' }}</h1>
            <p v-if="!viajeSeleccionadoInfo" class="mt-1 text-gray-600">Selecciona una rendición para ver sus gastos.</p>
             <p v-else class="mt-1 text-sm text-gray-500">
                {{ formatDate(viajeSeleccionadoInfo.fecha_inicio) }} - {{ viajeSeleccionadoInfo.fecha_fin ? formatDate(viajeSeleccionadoInfo.fecha_fin) : 'Actualidad' }}
                <span v-if="viajeSeleccionadoInfo.codigo_rendicion"> | Código: {{ viajeSeleccionadoInfo.codigo_rendicion }}</span>
            </p>
          </div>
          <div class="relative flex-shrink-0 flex items-center gap-2">
            <!-- Botón Exportar -->
            <div class="relative" v-if="gastos.length > 0">
              <button @click="isExportMenuOpen = !isExportMenuOpen" class="btn-secondary flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                Exportar
              </button>
              <transition name="fade">
                <div v-if="isExportMenuOpen" @click.away="isExportMenuOpen = false" class="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-30">
                  <div class="py-1">
                    <button @click="generarRendicionPDFWrapper" class="export-btn">Exportar a PDF</button>
                  </div>
                </div>
              </transition>
            </div>
            <!-- Botón Cerrar Rendición -->
            <button v-if="viajeSeleccionadoInfo && !isViajeActualCerrado" @click="cerrarRendicion" :disabled="isClosingRendicion || gastos.length === 0" class="btn-danger flex items-center">
              <svg v-if="!isClosingRendicion" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" /></svg>
              <svg v-if="isClosingRendicion" class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {{ isClosingRendicion ? 'Cerrando...' : 'Cerrar y Enviar' }}
            </button>
          </div>
        </div>
        <!-- Resumen de Totales (Escritorio) -->
        <div class="hidden sm:grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard title="Adelanto Total" :value="adelantoTotal" :total="adelantoTotal > 0 ? adelantoTotal : 1" color="#3B82F6" />
          <SummaryCard title="Total Gastado" :value="totalGastado" :total="adelantoTotal" :color="totalGastado > adelantoTotal ? '#EF4444' : '#22C55E'" />
          <SummaryCard title="Saldo Actual" :value="saldoActualRendicion" :format-as-currency="true" :color="saldoActualRendicion >= 0 ? '#6B7280' : '#EF4444'" :show-chart="false" />
        </div>
        <!-- Resumen de Totales (Móvil) -->
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
              <option value="" disabled>Selecciona una rendición</option>
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

      <!-- Acciones de Selección (Agrupar/Desagrupar) -->
      <div v-if="selectedGastos.size > 0" class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between flex-wrap gap-2">
        <span class="font-semibold text-indigo-800">{{ selectedGastos.size }} gasto(s) seleccionado(s)</span>
        <div class="flex gap-2">
          <!-- Botón Desagrupar: Visible si hay seleccionados, habilitado si canUngroup es true -->
          <button @click="handleUngroup" :disabled="!canUngroup || isGrouping" class="btn-secondary text-sm">
             {{ isGrouping ? '...' : 'Desagrupar' }}
          </button>
          <!-- Botón Agrupar: Visible si hay seleccionados, habilitado si no se está agrupando -->
          <button @click="openGroupModal" :disabled="isGrouping" class="btn-primary text-sm">Agrupar</button>
        </div>
      </div>

      <!-- Mensajes de Estado de Rendición -->
      <div v-if="viajeSeleccionadoInfo?.estado_aprobacion === 'pendiente_aprobacion'" class="mb-4 p-3 text-center text-sm bg-blue-100 text-blue-800 border border-blue-200 rounded-lg">Esta rendición está cerrada y pendiente de aprobación por un administrador.</div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'aprobado'" class="mb-4 p-3 text-center text-sm bg-green-100 text-green-800 border border-green-200 rounded-lg">¡Felicidades! Esta rendición ha sido aprobada.</div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'rechazado'" class="mb-4 p-3 text-sm bg-red-100 text-red-800 border border-red-200 rounded-lg">
        <p class="font-bold">Esta rendición fue rechazada.</p>
        <p v-if="viajeSeleccionadoInfo.comentarios_aprobacion" class="mt-1">Motivo: "{{ viajeSeleccionadoInfo.comentarios_aprobacion }}"</p>
      </div>

      <!-- Estados de Carga, Error o Vacío -->
      <div v-if="loading" class="text-center py-20 text-gray-500">Cargando gastos...</div>
      <div v-else-if="errorMessage && !feedbackMessage" class="p-4 bg-red-100 text-red-700 rounded-lg">{{ errorMessage }}</div>
      <div v-else-if="gastos.length === 0 && !loading" class="text-center py-20 text-gray-500"><p class="font-semibold">No se encontraron gastos.</p><p class="text-sm mt-1">Intenta ajustar los filtros o registra un nuevo gasto.</p></div>

      <!-- Lista de Gastos -->
      <div v-else>
        <!-- Vista de Escritorio -->
        <div class="hidden lg:block space-y-6">
          <div v-for="grupo in [...gastosRenderList.userGroups, ...gastosRenderList.dateGroups]" :key="grupo.id">
            <h2 class="text-base font-bold text-gray-600 mb-2 px-1">{{ grupo.name }}</h2>
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-100">
                  <tr>
                    <th class="table-header w-12"></th>
                    <th class="table-header w-12"></th>
                    <th class="table-header sortable" @click="sortBy('fecha_gasto')">Fecha <span v-if="sortKey === 'fecha_gasto'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
                    <th class="table-header">Tipo de Gasto</th>
                    <th class="table-header">Descripción</th>
                    <!-- Nuevas columnas para Provincia y N° Factura -->
                    <th class="table-header">Provincia</th>
                    <th class="table-header">N° Factura</th>
                    <th class="table-header text-right sortable" @click="sortBy('monto_total')">Monto <span v-if="sortKey === 'monto_total'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
                    <th class="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <template v-for="gasto in grupo.gastos" :key="gasto.id">
                    <!-- Fila principal del gasto -->
                    <tr class="hover:bg-blue-50/50 transition-colors cursor-pointer" :class="{'bg-indigo-50': selectedGastos.has(gasto.id)}" @click="toggleRowExpansion(gasto.id)">
                      <!-- CORRECCIÓN: Checkbox solo deshabilitado si la rendición está cerrada -->
                      <td class="table-cell text-center" @click.stop><input type="checkbox" :checked="selectedGastos.has(gasto.id)" @change="toggleGastoSelection(gasto.id)" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" :disabled="isViajeActualCerrado"></td>
                      <td class="table-cell text-center"><IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" /></td>
                      <td class="table-cell font-semibold text-gray-700 w-28">{{ formatDate(gasto.fecha_gasto) }}</td>
                      <td class="table-cell w-48">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto }}</td>
                      <td class="table-cell font-medium text-gray-900 max-w-xs truncate">{{ gasto.descripcion_general }}</td>
                       <!-- Celdas para Provincia y N° Factura -->
                      <td class="table-cell w-28">{{ gasto.provincia || '-' }}</td>
                      <td class="table-cell w-28">{{ gasto.numero_factura || '-' }}</td>
                      <td class="table-cell text-right font-bold text-gray-800 w-36">{{ formatCurrency(gasto.monto_total) }}</td>
                      <td class="table-cell text-center w-28" @click.stop>
                        <div class="flex justify-center items-center gap-2">
                          <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-icon-action btn-icon-link" aria-label="Ver factura"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h7.5A2.25 2.25 0 0 0 14 11.75V7.5a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /><path d="M10 .75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.56L6.03 6.28a.75.75 0 0 1-1.06-1.06L8.69 1.5H7.25a.75.75 0 0 1 0-1.5h3.5Z" /></svg></a>
                          <!-- Pasamos el objeto gasto completo -->
                          <button @click="editarGasto(gasto)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-edit" aria-label="Editar Gasto Completo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg></button>
                          <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-delete" aria-label="Eliminar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button>
                        </div>
                      </td>
                    </tr>
                    <!-- Fila expandida para detalles adicionales -->
                    <!-- Colspan ajustado para cubrir las nuevas columnas -->
                    <tr v-if="expandedRows.has(gasto.id)"><td colspan="9" class="p-0"><div class="px-6 py-4"><DetallesJson :datos="gasto.datos_adicionales" /></div></td></tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Vista de Móvil -->
        <div class="lg:hidden space-y-4">
          <div v-for="grupo in [...gastosRenderList.userGroups, ...gastosRenderList.dateGroups]" :key="grupo.id + '-mobile'">
            <h2 class="px-1 mb-2 text-base font-bold text-gray-600">{{ grupo.name }}</h2>
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
              <div v-for="gasto in grupo.gastos" :key="gasto.id" class="p-4" @click="toggleRowExpansion(gasto.id)">
                <div class="flex justify-between items-start gap-4">
                  <!-- CORRECCIÓN: Checkbox de selección en móvil solo deshabilitado si la rendición está cerrada -->
                  <div class="flex-shrink-0 mt-1" @click.stop>
                     <input type="checkbox" :checked="selectedGastos.has(gasto.id)" @change="toggleGastoSelection(gasto.id)" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" :disabled="isViajeActualCerrado">
                  </div>
                  <div class="flex-shrink-0"><IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" /></div>
                  <div class="flex-grow min-w-0">
                    <p class="font-semibold text-gray-800">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto' }}</p>
                    <p class="text-sm text-gray-600 truncate">{{ gasto.descripcion_general }}</p>
                    <!-- Provincia y N° Factura en móvil (debajo de descripción) -->
                    <p class="text-xs text-gray-500 mt-1">
                        <span v-if="gasto.provincia">Prov: {{ gasto.provincia }}</span>
                        <span v-if="gasto.provincia && gasto.numero_factura"> • </span>
                        <span v-if="gasto.numero_factura">Fact: #{{ gasto.numero_factura }}</span>
                    </p>
                  </div>
                  <p class="font-bold text-lg text-gray-800 flex-shrink-0 ml-2">{{ formatCurrency(gasto.monto_total) }}</p>
                </div>
                <!-- Detalles adicionales expandidos -->
                <div v-if="expandedRows.has(gasto.id)" class="mt-3 pt-3 border-t border-gray-100"><DetallesJson :datos="gasto.datos_adicionales" /></div>
                <!-- Acciones y Fecha en móvil -->
                <div class="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                  <p class="text-xs text-gray-400">{{ formatDate(gasto.fecha_gasto) }}</p>
                  <div class="flex items-center gap-2" @click.stop>
                    <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-icon-action btn-icon-link" aria-label="Ver factura"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h7.5A2.25 2.25 0 0 0 14 11.75V7.5a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /><path d="M10 .75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.56L6.03 6.28a.75.75 0 0 1-1.06-1.06L8.69 1.5H7.25a.75.75 0 0 1 0-1.5h3.5Z" /></svg></a>
                    <!-- Pasamos el objeto gasto completo -->
                    <button @click="editarGasto(gasto)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-edit" aria-label="Editar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg></button>
                    <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-delete" aria-label="Eliminar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Botón FAB para Nuevo Gasto -->
    <div class="fixed bottom-6 right-6 z-10">
      <button @click="goToNuevoGasto" :disabled="isViajeActualCerrado || !filtroViajeId" class="fab-button" aria-label="Añadir nuevo gasto">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7"><path fill-rule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clip-rule="evenodd" /></svg>
      </button>
    </div>
    <!-- En GastosListView.vue, cerca del otro botón de exportar -->
    <div class="relative flex-shrink-0 flex items-center gap-2">
    
    <!-- BOTÓN DE PRUEBA TEMPORAL -->
      <button @click="useReportGenerator().testSimplePDF()" class="bg-orange-500 text-white px-4 py-2 rounded-md">
        Test PDF Simple
      </button>
    </div>
<!-- Mensaje de Selección de Rendición -->

    <!-- Modal para Crear Grupo -->
    <div v-if="showGroupModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex justify-center items-center" @click.self="showGroupModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-medium text-gray-900">Crear Nuevo Grupo de Gastos</h3>
        <p class="text-sm text-gray-500 mt-1">Dale un nombre a este concepto para agrupar los {{ selectedGastos.size }} gastos seleccionados.</p>
        <div class="mt-4">
          <label for="group_name" class="form-label-filter">Nombre del Grupo</label>
          <input type="text" id="group_name" v-model="newGroupName" class="form-input mt-1" placeholder="Ej: Cirugía Paciente X - Chaco">
        </div>
        <div v-if="groupError" class="text-red-600 text-sm mt-2">{{ groupError }}</div>
        <div class="mt-6 flex justify-end gap-3">
          <button @click="showGroupModal = false" class="btn-secondary">Cancelar</button>
          <button @click="handleGroupCreation" :disabled="isGrouping" class="btn-primary">
            {{ isGrouping ? 'Creando...' : 'Crear Grupo' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<style>
/* Estilos existentes y algunos ajustes */
.summary-card-mobile { @apply bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center; }
.summary-value-mobile { @apply text-2xl font-bold text-gray-800 mt-1; }
.fab-button { @apply h-14 w-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform duration-150 hover:scale-110 disabled:bg-gray-400 disabled:cursor-not-allowed; }
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
.btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed; }
.btn-secondary { @apply bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed; }
.btn-danger { @apply bg-red-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed; }
.table-header.sortable { @apply cursor-pointer hover:bg-gray-200; }

/* Ajustes específicos para las nuevas columnas en escritorio */
@screen lg {
    .table-cell.w-28 { 
        width: 7rem;
    }
    .table-cell.max-w-xs {
         max-width: 10rem;
         white-space: normal;
    }
}
</style>