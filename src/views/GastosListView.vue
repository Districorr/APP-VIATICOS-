<script setup>
import { ref, onMounted, computed, watch, inject } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
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
const { generateCanvaStylePDF } = useReportGenerator();

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
const isGrouping = ref(false);
const groupError = ref('');
const isGroupingByType = ref(false);

const showGroupModal = ref(false);
const groupAction = ref('create');
const newGroupName = ref('');
const selectedGroupId = ref(null);
const existingGroups = computed(() => {
  if (!gastos.value) return [];
  const groups = gastos.value
    .filter(g => g.grupos_gastos && g.grupos_gastos.id)
    .map(g => g.grupos_gastos);
  return [...new Map(groups.map(item => [item['id'], item])).values()];
});

const isConciliacionMode = ref(false);
const filtroRevisado = ref('todos');
const totalFacturasManual = ref(0);
const diferenciaConciliacion = computed(() => totalFacturasManual.value - totalGastado.value);

async function toggleRevisado(gasto) {
  const nuevoEstado = !gasto.es_revisado;
  gasto.es_revisado = nuevoEstado;
  const { error } = await supabase
    .from('gastos')
    .update({ es_revisado: nuevoEstado })
    .eq('id', gasto.id);
  if (error) {
    gasto.es_revisado = !nuevoEstado;
    errorMessage.value = 'Error al actualizar el estado de revisión.';
    setTimeout(() => errorMessage.value = '', 4000);
  }
}

const canUngroup = computed(() => {
  if (selectedGastos.value.size === 0) return false;
  for (const gastoId of selectedGastos.value) {
    const gasto = gastos.value.find(g => g.id === gastoId);
    if (!gasto || !gasto.grupo_id) return false;
  }
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

function sortBy(key) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'desc';
  }
}

const gastosFiltrados = computed(() => {
  if (!isConciliacionMode.value || filtroRevisado.value === 'todos') return gastos.value;
  if (filtroRevisado.value === 'revisados') return gastos.value.filter(g => g.es_revisado);
  if (filtroRevisado.value === 'no_revisados') return gastos.value.filter(g => !g.es_revisado);
  return gastos.value;
});

const gastosRenderList = computed(() => {
  const sortedGastos = [...gastosFiltrados.value].sort((a, b) => {
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
    if (gasto.grupos_gastos && gasto.grupos_gastos.id) {
      const grupoKey = `group-${gasto.grupos_gastos.id}`;
      if (!userGroups[grupoKey]) {
        userGroups[grupoKey] = { isGroup: true, id: gasto.grupos_gastos.id, name: gasto.grupos_gastos.nombre_grupo, gastos: [] };
      }
      userGroups[grupoKey].gastos.push(gasto);
    } else {
      const fechaClave = gasto.fecha_gasto; 
      if (!dateGroups[fechaClave]) {
        dateGroups[fechaClave] = { isGroup: false, id: fechaClave, name: formatDate(fechaClave, { weekday: 'long', day: 'numeric', month: 'long' }), gastos: [] };
      }
      dateGroups[fechaClave].gastos.push(gasto);
    }
  });

  const finalUserGroups = Object.values(userGroups).sort((a, b) => a.name.localeCompare(b.name));
  const finalDateGroups = Object.values(dateGroups).sort((a, b) => new Date(b.id) - new Date(a.id));

  return { userGroups: finalUserGroups, dateGroups: finalDateGroups };
});

function toggleGastoSelection(gastoId) {
  if (selectedGastos.value.has(gastoId)) selectedGastos.value.delete(gastoId);
  else selectedGastos.value.add(gastoId);
}

function openGroupModal() {
  if (selectedGastos.value.size === 0) return;
  const allSelectedUngrouped = Array.from(selectedGastos.value).every(gastoId => {
    const gasto = gastos.value.find(g => g.id === gastoId);
    return gasto && !gasto.grupo_id;
  });
  if (!allSelectedUngrouped) {
      groupError.value = "Solo puedes agrupar gastos que no pertenecen a un grupo existente.";
      setTimeout(() => groupError.value = '', 5000);
      return;
  }
  newGroupName.value = '';
  selectedGroupId.value = null;
  groupAction.value = 'create';
  groupError.value = '';
  showGroupModal.value = true;
}

async function handleGroupingAction() {
  isGrouping.value = true;
  groupError.value = '';
  try {
    const gastoIdsToUpdate = Array.from(selectedGastos.value);

    if (groupAction.value === 'create') {
      if (!newGroupName.value.trim()) throw new Error("El nombre del nuevo grupo no puede estar vacío.");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado.");

      const { data: newGroup, error: groupError } = await supabase.from('grupos_gastos').insert({ nombre_grupo: newGroupName.value, viaje_id: viajeSeleccionadoInfo.value.id, creado_por_id: user.id }).select().single();
      if (groupError) throw groupError;

      const { error: updateError } = await supabase.from('gastos').update({ grupo_id: newGroup.id }).in('id', gastoIdsToUpdate);
      if (updateError) throw updateError;
      
    } else if (groupAction.value === 'add') {
      if (!selectedGroupId.value) throw new Error("Debes seleccionar un grupo existente.");
      
      const { error } = await supabase.rpc('add_gastos_to_grupo', {
        p_gasto_ids: gastoIdsToUpdate,
        p_grupo_id: selectedGroupId.value
      });
      if (error) throw error;
    }

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

async function handleRenameGroup(groupId) {
  const grupo = existingGroups.value.find(g => g.id === groupId);
  if (!grupo) return;

  const nuevoNombre = prompt("Ingresa el nuevo nombre para el grupo:", grupo.nombre_grupo);
  if (nuevoNombre === null || nuevoNombre.trim() === "") return;

  try {
    const { error } = await supabase.rpc('rename_grupo_gasto', { p_grupo_id: groupId, p_nuevo_nombre: nuevoNombre.trim() });
    if (error) throw error;
    feedbackMessage.value = "Grupo renombrado con éxito.";
    await fetchGastos();
  } catch (e) {
    errorMessage.value = `Error al renombrar: ${e.message}`;
  } finally {
    setTimeout(() => { feedbackMessage.value = ''; errorMessage.value = ''; }, 4000);
  }
}

async function handleDeleteGroup(groupId, groupName) {
  if (!confirm(`¿Estás seguro de que quieres eliminar el grupo "${groupName}"?`)) return;

  try {
    const { error } = await supabase.rpc('delete_grupo_gasto', { p_grupo_id: groupId });
    if (error) throw error;
    feedbackMessage.value = "Grupo eliminado con éxito.";
    await fetchGastos();
  } catch (e) {
    errorMessage.value = `Error al eliminar: ${e.message}`;
  } finally {
    setTimeout(() => { feedbackMessage.value = ''; errorMessage.value = ''; }, 4000);
  }
}

async function handleGroupByType() {
  if (!viajeSeleccionadoInfo.value?.id) {
    errorMessage.value = 'Por favor, selecciona una rendición primero.';
    return;
  }
  if (!confirm('¿Estás seguro de que quieres agrupar todos los gastos sin grupo por su tipo?')) return;
  isGroupingByType.value = true;
  try {
    const { data, error } = await supabase.rpc('agrupar_gastos_por_tipo', { p_viaje_id: viajeSeleccionadoInfo.value.id });
    if (error) throw error;
    feedbackMessage.value = data;
    await fetchGastos();
  } catch(e) {
    errorMessage.value = `Error en la agrupación automática: ${e.message}`;
  } finally {
    isGroupingByType.value = false;
    setTimeout(() => { feedbackMessage.value = ''; errorMessage.value = ''; }, 5000);
  }
}

// CORRECCIÓN BUG EXPANSIÓN: Se añade un log para depurar
const toggleRowExpansion = (gastoId) => {
  console.log(`Toggling expansion for gasto ID: ${gastoId}`);
  const newSet = new Set(expandedRows.value);
  if (newSet.has(gastoId)) {
    newSet.delete(gastoId);
  } else {
    newSet.add(gastoId);
  }
  expandedRows.value = newSet;
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
      loading.value = false;
      gastos.value = [];
      viajeSeleccionadoInfo.value = null;
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
    loading.value = false;
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");
    viajeSeleccionadoInfo.value = listaViajesParaFiltro.value.find(v => v.id == filtroViajeId.value) || null;
    
    let query = supabase
      .from('vista_gastos_detallados')
      .select(`*`)
      .eq('dueno_id', user.id)
      .eq('viaje_id', filtroViajeId.value);
    
    if (filtroTipoGastoIds.value.length > 0) {
      // Este filtro necesita ajustarse si la columna tipo_gasto_id no está en la vista
    }
    if (filtroDescripcion.value) {
      query = query.ilike('descripcion_general', `%${filtroDescripcion.value}%`);
    }

    const { data, error } = await query.order('fecha_gasto', { ascending: false });
    
    if (error) throw error;
    
    // La vista devuelve 'id', no 'gasto_id', así que el mapeo ya no es necesario
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
    router.replace({ query: { ...route.query, feedback: undefined } }).catch(()=>{});
    setTimeout(() => { feedbackMessage.value = ''; }, 4000);
  }
}

function editarGasto(gasto) {
  if (!gasto || !gasto.id) {
    errorMessage.value = "Error: No se pudo identificar el gasto a editar.";
    return;
  }
  if (isViajeActualCerrado.value) {
    feedbackMessage.value = "No se pueden editar gastos de una rendición cerrada.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  router.push({ name: 'GastoFormEdit', params: { id: gasto.id } });
}

onMounted(() => {
  fetchInitialData();
  showFeedbackMessage();
});

watch(filtroViajeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    selectedGastos.value.clear();
    if (String(route.query.viajeId || '') !== String(newId)) {
        router.push({ query: { ...route.query, viajeId: newId } }).catch(()=>{});
    }
    fetchGastos();
  } else if (!newId && oldId) {
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
    fetchGastos();
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
  const confirmacion = confirm(`¿Estás seguro de que quieres cerrar la rendición "${viajeSeleccionadoInfo.value.nombre_viaje}"?`);
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

// ========= INICIO DE LA CORRECCIÓN CRÍTICA =========
const generarRendicionPDFWrapper = () => {
  // Usamos 'filtroViajeId.value' que está directamente enlazado al <select>
  // y siempre contiene el UUID correcto de la rendición seleccionada.
  // Esto es más robusto que depender de 'viajeSeleccionadoInfo.value'.
  if (!filtroViajeId.value) {
    feedbackMessage.value = 'Selecciona una rendición para generar el PDF.';
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  // Pasamos el UUID correcto a la función de generación.
  generateCanvaStylePDF(filtroViajeId.value);
  isExportMenuOpen.value = false;
};
// ========= FIN DE LA CORRECCIÓN CRÍTICA =========
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
            <button v-if="viajeSeleccionadoInfo && !isViajeActualCerrado" @click="cerrarRendicion" :disabled="isClosingRendicion || gastos.length === 0" class="btn-danger flex items-center">
              <svg v-if="!isClosingRendicion" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" /></svg>
              <svg v-if="isClosingRendicion" class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {{ isClosingRendicion ? 'Cerrando...' : 'Cerrar y Enviar' }}
            </button>
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

      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          <div class="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div class="flex items-center justify-end gap-4">
             <button @click="handleGroupByType" :disabled="isGroupingByType || isViajeActualCerrado || gastos.length === 0" class="btn-link" title="Agrupa todos los gastos sin grupo por su tipo.">Agrupar por Tipo</button>
             <button @click="isConciliacionMode = !isConciliacionMode" class="btn-secondary flex items-center gap-2" :class="{'bg-indigo-100 ring-indigo-300': isConciliacionMode}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg>
                Conciliar
             </button>
          </div>
        </div>
      </div>
      
      <transition name="fade">
        <div v-if="isConciliacionMode" class="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-2">
                    <label class="form-label-filter">Filtrar por Estado de Revisión</label>
                    <div class="mt-2 flex rounded-md shadow-sm">
                        <button @click="filtroRevisado = 'todos'" :class="filtroRevisado === 'todos' ? 'btn-filter-active' : 'btn-filter-inactive'" class="rounded-l-md">Todos</button>
                        <button @click="filtroRevisado = 'no_revisados'" :class="filtroRevisado === 'no_revisados' ? 'btn-filter-active' : 'btn-filter-inactive'" class="-ml-px">No Revisados</button>
                        <button @click="filtroRevisado = 'revisados'" :class="filtroRevisado === 'revisados' ? 'btn-filter-active' : 'btn-filter-inactive'" class="-ml-px rounded-r-md">Revisados</button>
                    </div>
                </div>
                <div class="space-y-2">
                    <div>
                        <label for="total-manual" class="form-label-filter">Total Facturas en Mano</label>
                        <div class="relative">
                            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><span class="text-gray-500 sm:text-sm">$</span></div>
                            <input type="number" id="total-manual" v-model.number="totalFacturasManual" class="form-input pl-7 text-right" placeholder="0.00">
                        </div>
                    </div>
                    <div class="flex justify-between text-sm"><span class="text-gray-600">Total en Sistema:</span><span class="font-semibold text-gray-800">{{ formatCurrency(totalGastado) }}</span></div>
                    <div class="flex justify-between text-sm pt-1 border-t"><span class="font-bold text-gray-800">Diferencia:</span><span class="font-bold" :class="diferenciaConciliacion === 0 ? 'text-green-600' : 'text-red-600'">{{ formatCurrency(diferenciaConciliacion) }}</span></div>
                </div>
            </div>
        </div>
      </transition>
      
      <div v-if="selectedGastos.size > 0" class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between flex-wrap gap-2">
        <span class="font-semibold text-indigo-800">{{ selectedGastos.size }} gasto(s) seleccionado(s)</span>
        <div class="flex gap-2">
          <button @click="handleUngroup" :disabled="!canUngroup || isGrouping" class="btn-secondary text-sm">{{ isGrouping ? '...' : 'Desagrupar' }}</button>
          <button @click="openGroupModal" :disabled="isGrouping" class="btn-primary text-sm">Agrupar</button>
        </div>
      </div>

      <div v-if="viajeSeleccionadoInfo?.estado_aprobacion === 'pendiente_aprobacion'" class="mb-4 p-3 text-center text-sm bg-blue-100 text-blue-800 border border-blue-200 rounded-lg">Esta rendición está cerrada y pendiente de aprobación por un administrador.</div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'aprobado'" class="mb-4 p-3 text-center text-sm bg-green-100 text-green-800 border border-green-200 rounded-lg">¡Felicidades! Esta rendición ha sido aprobada.</div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'rechazado'" class="mb-4 p-3 text-sm bg-red-100 text-red-800 border border-red-200 rounded-lg">
        <p class="font-bold">Esta rendición fue rechazada.</p>
        <p v-if="viajeSeleccionadoInfo.comentarios_aprobacion" class="mt-1">Motivo: "{{ viajeSeleccionadoInfo.comentarios_aprobacion }}"</p>
      </div>

      <div v-if="loading" class="text-center py-20 text-gray-500">Cargando gastos...</div>
      <div v-else-if="errorMessage && !feedbackMessage" class="p-4 bg-red-100 text-red-700 rounded-lg">{{ errorMessage }}</div>
      <div v-else-if="gastos.length === 0 && !loading" class="text-center py-20 text-gray-500"><p class="font-semibold">No se encontraron gastos.</p><p class="text-sm mt-1">Intenta ajustar los filtros o registra un nuevo gasto.</p></div>

      <div v-else>
        <div class="hidden lg:block space-y-6">
          <div v-for="grupo in gastosRenderList.userGroups.concat(gastosRenderList.dateGroups)" :key="grupo.id">
            <div class="flex items-center justify-between mb-2 px-1">
              <h2 class="text-base font-bold text-gray-600">{{ grupo.name }}</h2>
              <div v-if="grupo.isGroup && !isViajeActualCerrado" class="flex items-center gap-2">
                <button @click="handleRenameGroup(grupo.id)" class="btn-icon-action btn-icon-edit" title="Renombrar Grupo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg></button>
                <button @click="handleDeleteGroup(grupo.id, grupo.name)" class="btn-icon-action btn-icon-delete" title="Eliminar Grupo (solo si está vacío)"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button>
              </div>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-100">
                  <tr>
                    <th class="table-header w-12"></th>
                    <th v-if="isConciliacionMode" class="table-header w-12">✔</th>
                    <th class="table-header w-12"></th>
                    <th class="table-header sortable" @click="sortBy('fecha_gasto')">Fecha</th>
                    <th class="table-header">Tipo de Gasto</th>
                    <th class="table-header">Descripción</th>
                    <th class="table-header">Provincia</th>
                    <th class="table-header">N° Factura</th>
                    <th class="table-header text-right sortable" @click="sortBy('monto_total')">Monto</th>
                    <th class="table-header text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <template v-for="gasto in grupo.gastos" :key="gasto.id">
                    <tr class="transition-colors cursor-pointer" :class="{'bg-indigo-50': selectedGastos.has(gasto.id), 'bg-blue-50': gasto.es_delegado, 'hover:bg-blue-100': gasto.es_delegado, 'hover:bg-gray-50': !gasto.es_delegado}" @click="toggleRowExpansion(gasto.id)">
                      <td class="table-cell text-center" @click.stop><input type="checkbox" :checked="selectedGastos.has(gasto.id)" @change="toggleGastoSelection(gasto.id)" class="checkbox-sm" :disabled="isViajeActualCerrado"></td>
                      <td v-if="isConciliacionMode" class="table-cell text-center" @click.stop><input type="checkbox" :checked="gasto.es_revisado" @change="toggleRevisado(gasto)" class="checkbox-sm" :disabled="isViajeActualCerrado"></td>
                      <td class="table-cell text-center"><IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" /></td>
                      <td class="table-cell font-semibold text-gray-700 w-28">{{ formatDate(gasto.fecha_gasto) }}</td>
                      <td class="table-cell w-40">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto }}</td>
                      <td class="table-cell font-medium text-gray-900 max-w-sm truncate">{{ gasto.descripcion_general }}</td>
                      <td class="table-cell w-36">{{ gasto.provincia_gasto?.nombre || '-' }}</td>
                      <td class="table-cell w-28">{{ gasto.numero_factura || '-' }}</td>
                      <td class="table-cell text-right font-bold text-gray-800 w-36">{{ formatCurrency(gasto.monto_total) }}</td>
                      <td class="table-cell text-center w-28" @click.stop>
                        <div class="flex justify-center items-center gap-2">
                          <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-icon-action btn-icon-link" aria-label="Ver factura"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h7.5A2.25 2.25 0 0 0 14 11.75V7.5a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /><path d="M10 .75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.56L6.03 6.28a.75.75 0 0 1-1.06-1.06L8.69 1.5H7.25a.75.75 0 0 1 0-1.5h3.5Z" /></svg></a>
                          <button @click="editarGasto(gasto)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-edit" aria-label="Editar Gasto Completo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg></button>
                          <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="btn-icon-action btn-icon-delete" aria-label="Eliminar Gasto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="expandedRows.has(gasto.id)">
                      <td :colspan="isConciliacionMode ? 10 : 9" class="p-0">
                        <div class="bg-gray-50 px-6 py-4">
                          <h4 class="text-xs font-bold uppercase text-gray-500 mb-3">Detalles del Gasto</h4>
                          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-4 text-sm">
                            <div v-if="gasto.es_delegado">
                              <p class="font-semibold text-gray-800">Responsable Original</p>
                              <p class="text-gray-600">{{ gasto.responsable_principal_nombre }}</p>
                            </div>
                            <div v-if="gasto.es_delegado">
                              <p class="font-semibold text-gray-800">Rendido por</p>
                              <p class="text-gray-600">{{ gasto.dueno_nombre }}</p>
                            </div>
                            <div v-if="gasto.clientes?.nombre_cliente"><p class="font-semibold text-gray-800">Cliente</p><p class="text-gray-600">{{ gasto.clientes.nombre_cliente }}</p></div>
                            <div v-if="gasto.proveedores?.nombre"><p class="font-semibold text-gray-800">Proveedor</p><p class="text-gray-600">{{ gasto.proveedores.nombre }}</p></div>
                            <div v-if="gasto.transportes?.nombre"><p class="font-semibold text-gray-800">Transporte</p><p class="text-gray-600">{{ gasto.transportes.nombre }}</p></div>
                            <div v-if="gasto.paciente_referido"><p class="font-semibold text-gray-800">Paciente</p><p class="text-gray-600">{{ gasto.paciente_referido }}</p></div>
                            <div v-if="gasto.nombre_chofer"><p class="font-semibold text-gray-800">Chofer</p><p class="text-gray-600">{{ gasto.nombre_chofer }}</p></div>
                            <div v-if="gasto.vehiculos"><p class="font-semibold text-gray-800">Vehículo</p><p class="text-gray-600">{{ gasto.vehiculos.marca }} {{ gasto.vehiculos.modelo }} ({{ gasto.vehiculos.patente }})</p></div>
                            <div v-if="gasto.provincia_origen?.nombre">
                              <p class="font-semibold text-gray-800">Origen</p>
                              <p class="text-gray-600">{{ gasto.provincia_origen.nombre }}<span v-if="gasto.localidad_origen?.nombre"> - {{ gasto.localidad_origen.nombre }}</span></p>
                            </div>
                            <div v-if="gasto.provincia_destino?.nombre">
                              <p class="font-semibold text-gray-800">Destino</p>
                              <p class="text-gray-600">{{ gasto.provincia_destino.nombre }}<span v-if="gasto.localidad_destino?.nombre"> - {{ gasto.localidad_destino.nombre }}</span></p>
                            </div>
                          </div>
                          <DetallesJson v-if="gasto.datos_adicionales && Object.keys(gasto.datos_adicionales).length > 0" :datos="gasto.datos_adicionales" class="mt-4 pt-4 border-t border-gray-200" />
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Vista de Móvil -->
        <div class="lg:hidden space-y-4">
          <div v-for="grupo in gastosRenderList.userGroups.concat(gastosRenderList.dateGroups)" :key="grupo.id + '-mobile'">
            <div class="flex items-center justify-between mb-2 px-1">
              <h2 class="text-base font-bold text-gray-600">{{ grupo.name }}</h2>
              <div v-if="grupo.isGroup && !isViajeActualCerrado" class="flex items-center gap-2">
                <button @click="handleRenameGroup(grupo.id)" class="btn-icon-action btn-icon-edit" title="Renombrar Grupo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.523 11.952l-2.756.87a.75.75 0 0 1-.917-.917l.87-2.756L11.013 2.513Z" /></svg></button>
                <button @click="handleDeleteGroup(grupo.id, grupo.name)" class="btn-icon-action btn-icon-delete" title="Eliminar Grupo (solo si está vacío)"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
              <div v-for="gasto in grupo.gastos" :key="gasto.id" class="p-4" :class="{'bg-blue-50': gasto.es_delegado}" @click="toggleRowExpansion(gasto.id)">
                <div v-if="isConciliacionMode" class="flex items-center justify-end mb-2" @click.stop>
                    <label :for="`revisado-${gasto.id}`" class="text-sm font-medium text-gray-700 mr-2">Revisado</label>
                    <input :id="`revisado-${gasto.id}`" type="checkbox" :checked="gasto.es_revisado" @change="toggleRevisado(gasto)" class="checkbox-sm" :disabled="isViajeActualCerrado">
                </div>
                <div class="flex justify-between items-start gap-4">
                  <div class="flex-shrink-0 mt-1" @click.stop>
                     <input type="checkbox" :checked="selectedGastos.has(gasto.id)" @change="toggleGastoSelection(gasto.id)" class="checkbox-sm" :disabled="isViajeActualCerrado">
                  </div>
                  <div class="flex-shrink-0"><IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" /></div>
                  <div class="flex-grow min-w-0">
                    <p class="font-semibold text-gray-800">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto' }}</p>
                    <p class="text-sm text-gray-600 truncate">{{ gasto.descripcion_general }}</p>
                  </div>
                  <p class="font-bold text-lg text-gray-800 flex-shrink-0 ml-2">{{ formatCurrency(gasto.monto_total) }}</p>
                </div>
                <div v-if="expandedRows.has(gasto.id)" class="mt-3 pt-3 border-t border-gray-100">
                  <div class="space-y-2 text-sm">
                    <div v-if="gasto.es_delegado" class="flex justify-between"><span class="font-semibold text-gray-800">Responsable Original:</span><span class="text-gray-600 text-right">{{ gasto.responsable_principal_nombre }}</span></div>
                    <div v-if="gasto.es_delegado" class="flex justify-between"><span class="font-semibold text-gray-800">Rendido por:</span><span class="text-gray-600 text-right">{{ gasto.dueno_nombre }}</span></div>
                    <div v-if="gasto.clientes?.nombre_cliente" class="flex justify-between"><span class="font-semibold text-gray-800">Cliente:</span><span class="text-gray-600 text-right">{{ gasto.clientes.nombre_cliente }}</span></div>
                    <div v-if="gasto.proveedores?.nombre" class="flex justify-between"><span class="font-semibold text-gray-800">Proveedor:</span><span class="text-gray-600 text-right">{{ gasto.proveedores.nombre }}</span></div>
                    <div v-if="gasto.transportes?.nombre" class="flex justify-between"><span class="font-semibold text-gray-800">Transporte:</span><span class="text-gray-600 text-right">{{ gasto.transportes.nombre }}</span></div>
                    <div v-if="gasto.paciente_referido" class="flex justify-between"><span class="font-semibold text-gray-800">Paciente:</span><span class="text-gray-600 text-right">{{ gasto.paciente_referido }}</span></div>
                    <div v-if="gasto.nombre_chofer" class="flex justify-between"><span class="font-semibold text-gray-800">Chofer:</span><span class="text-gray-600 text-right">{{ gasto.nombre_chofer }}</span></div>
                    <div v-if="gasto.vehiculos" class="flex justify-between"><span class="font-semibold text-gray-800">Vehículo:</span><span class="text-gray-600 text-right">{{ gasto.vehiculos.patente }}</span></div>
                    <div v-if="gasto.provincia_origen?.nombre" class="flex justify-between"><span class="font-semibold text-gray-800">Origen:</span><span class="text-gray-600 text-right">{{ gasto.provincia_origen.nombre }}<span v-if="gasto.localidad_origen?.nombre"> - {{ gasto.localidad_origen.nombre }}</span></span></div>
                    <div v-if="gasto.provincia_destino?.nombre" class="flex justify-between"><span class="font-semibold text-gray-800">Destino:</span><span class="text-gray-600 text-right">{{ gasto.provincia_destino.nombre }}<span v-if="gasto.localidad_destino?.nombre"> - {{ gasto.localidad_destino.nombre }}</span></span></div>
                  </div>
                  <DetallesJson v-if="gasto.datos_adicionales && Object.keys(gasto.datos_adicionales).length > 0" :datos="gasto.datos_adicionales" class="mt-3 pt-3 border-t border-gray-200" />
                </div>
                <div class="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                  <p class="text-xs text-gray-400">{{ formatDate(gasto.fecha_gasto) }}</p>
                  <div class="flex items-center gap-2" @click.stop>
                    <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="btn-icon-action btn-icon-link" aria-label="Ver factura"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h7.5A2.25 2.25 0 0 0 14 11.75V7.5a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 0 0-1.5h-3.5Z" /><path d="M10 .75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.56L6.03 6.28a.75.75 0 0 1-1.06-1.06L8.69 1.5H7.25a.75.75 0 0 1 0-1.5h3.5Z" /></svg></a>
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
    
    <!-- Modal para Crear/Añadir a Grupo -->
    <div v-if="showGroupModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex justify-center items-center" @click.self="showGroupModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-medium text-gray-900">Agrupar Gastos</h3>
        <p class="text-sm text-gray-500 mt-1">Agrupa los {{ selectedGastos.size }} gastos seleccionados en un nuevo concepto o en uno ya existente.</p>
        <fieldset class="mt-4">
          <legend class="sr-only">Tipo de Agrupación</legend>
          <div class="flex gap-4">
            <div class="flex items-center">
              <input id="create-group" name="group-action" type="radio" value="create" v-model="groupAction" class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600">
              <label for="create-group" class="ml-2 block text-sm font-medium text-gray-900">Crear Nuevo Grupo</label>
            </div>
            <div class="flex items-center">
              <input id="add-to-group" name="group-action" type="radio" value="add" v-model="groupAction" class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600" :disabled="existingGroups.length === 0">
              <label for="add-to-group" class="ml-2 block text-sm font-medium text-gray-900" :class="{'text-gray-400': existingGroups.length === 0}">Añadir a Existente</label>
            </div>
          </div>
        </fieldset>
        <div class="mt-4">
          <div v-if="groupAction === 'create'">
            <label for="group_name" class="form-label-filter">Nombre del Nuevo Grupo</label>
            <input type="text" id="group_name" v-model="newGroupName" class="form-input mt-1" placeholder="Ej: Cirugía Paciente X - Chaco">
          </div>
          <div v-if="groupAction === 'add'">
            <label for="existing_group" class="form-label-filter">Seleccionar Grupo Existente</label>
            <select id="existing_group" v-model="selectedGroupId" class="form-input mt-1">
              <option :value="null" disabled>-- Elige un grupo --</option>
              <option v-for="group in existingGroups" :key="group.id" :value="group.id">{{ group.nombre_grupo }}</option>
            </select>
          </div>
        </div>
        <div v-if="groupError" class="text-red-600 text-sm mt-2">{{ groupError }}</div>
        <div class="mt-6 flex justify-end gap-3">
          <button @click="showGroupModal = false" class="btn-secondary">Cancelar</button>
          <button @click="handleGroupingAction" :disabled="isGrouping || (groupAction === 'create' && !newGroupName.trim()) || (groupAction === 'add' && !selectedGroupId)" class="btn-primary">
            {{ isGrouping ? 'Procesando...' : 'Confirmar Agrupación' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.summary-card-mobile { @apply bg-white p-4 rounded-xl shadow-sm border border-gray-200 text-center; }
.summary-value-mobile { @apply text-2xl font-bold text-gray-800 mt-1; }
.fab-button { @apply h-14 w-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform duration-150 hover:scale-110 disabled:bg-gray-400 disabled:cursor-not-allowed; }
.export-btn { @apply flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease-in-out; }
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
.btn-secondary { @apply bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.btn-danger { @apply bg-red-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed; }
.table-header.sortable { @apply cursor-pointer hover:bg-gray-200; }
.btn-link { @apply text-sm font-semibold text-indigo-600 hover:text-indigo-500 disabled:text-gray-400 disabled:cursor-not-allowed; }
.btn-filter-inactive { @apply relative inline-flex items-center bg-white px-3 py-2 text-sm font-medium text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-10; }
.btn-filter-active { @apply relative z-10 inline-flex items-center bg-indigo-600 px-3 py-2 text-sm font-medium text-white focus:z-10; }
.checkbox-sm { @apply h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500; }
</style>