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
import AgregarFondosModal from '../components/AgregarFondosModal.vue';

const router = useRouter();
const route = useRoute();
const userProfile = inject('userProfile', ref(null));
const { generateCanvaStylePDF } = useReportGenerator();

const showFondosModal = ref(false);

const handleFondosAgregados = async () => {
  await fetchInitialData();
  await fetchGastos();
  feedbackMessage.value = 'Fondos agregados correctamente a la rendición.';
  setTimeout(() => { feedbackMessage.value = ''; }, 4000);
};

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

const isIngresoGasto = (g) => {
  if (g.es_ingreso_fondos === true) return true;
  if (g.datos_adicionales && typeof g.datos_adicionales === 'object') {
    if (g.datos_adicionales.es_ingreso_fondos === true || g.datos_adicionales.tipo_registro === 'ingreso_fondos') return true;
  }
  const desc = (g.descripcion_general || '').toLowerCase();
  return desc.includes('ingreso de fondos');
};

const totalGastado = computed(() => {
  return gastos.value.reduce((sum, g) => sum + (parseFloat(g.monto_total) || 0), 0);
});
const adelantoTotal = computed(() => viajeSeleccionadoInfo.value?.monto_adelanto || 0);
const saldoActualRendicion = computed(() => adelantoTotal.value - totalGastado.value);
const isViajeActualCerrado = computed(() => !!viajeSeleccionadoInfo.value?.cerrado_en);

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

const toggleRowExpansion = (gastoId) => {
  if (expandedRows.value.has(gastoId)) {
    expandedRows.value.delete(gastoId);
  } else {
    expandedRows.value.add(gastoId);
  }
};

const editarGasto = (gasto) => {
  if (isViajeActualCerrado.value) {
    feedbackMessage.value = "No se pueden editar gastos de una rendición cerrada.";
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  router.push({ name: 'GastoFormEdit', params: { id: gasto.id } });
};

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

    if (filtroDescripcion.value) {
      query = query.ilike('descripcion_general', `%${filtroDescripcion.value}%`);
    }

    const { data, error } = await query.order('fecha_gasto', { ascending: false });
    
    if (error) throw error;
    
    gastos.value = (data || []).filter(g => !isIngresoGasto(g));

  } catch (error) {
    errorMessage.value = 'No se pudieron cargar los gastos: ' + error.message;
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  if (route.query.feedback) {
    feedbackMessage.value = route.query.feedback;
    setTimeout(() => { feedbackMessage.value = ''; }, 7000);
  }
  await fetchInitialData();
  if (filtroViajeId.value) await fetchGastos();
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

const generarRendicionPDFWrapper = () => {
  if (!filtroViajeId.value) {
    feedbackMessage.value = 'Selecciona una rendición para generar el PDF.';
    setTimeout(() => feedbackMessage.value = '', 4000);
    return;
  }
  generateCanvaStylePDF(filtroViajeId.value);
  isExportMenuOpen.value = false;
};
</script>

<template>
  <div class="bg-slate-50 min-h-screen font-sans pb-24 text-slate-800">

    <!-- Notificación Flotante / Banner de Feedback estilo Emil Kowalski -->
    <transition enter-active-class="transform ease-out duration-300 transition" enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2" enter-to-class="translate-y-0 opacity-100 sm:translate-x-0" leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="feedbackMessage" class="fixed top-5 right-5 z-50 max-w-md w-full bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl border border-slate-800 flex items-start gap-3.5">
        <div class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✓</div>
        <div class="flex-grow text-xs font-semibold leading-relaxed">{{ feedbackMessage }}</div>
        <button @click="feedbackMessage = ''" class="text-slate-400 hover:text-white transition-colors cursor-pointer text-xs font-bold px-1">✕</button>
      </div>
    </transition>

    <!-- Error Banner -->
    <div v-if="errorMessage && !feedbackMessage" class="fixed top-5 right-5 z-50 max-w-md w-full bg-red-600 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-xs font-semibold">
      <span>{{ errorMessage }}</span>
      <button @click="errorMessage = ''" class="text-white/80 hover:text-white font-bold">✕</button>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

      <!-- Encabezado Sticky con Glassmorphism -->
      <div class="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200/80 transition-all">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2.5">
              <h1 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                {{ viajeSeleccionadoInfo?.nombre_viaje || 'Mis Gastos' }}
              </h1>
              <span v-if="viajeSeleccionadoInfo?.codigo_rendicion" class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200/70 text-slate-700 font-mono">
                {{ viajeSeleccionadoInfo.codigo_rendicion }}
              </span>
            </div>
            <p v-if="!viajeSeleccionadoInfo" class="text-xs text-slate-500 mt-0.5">Selecciona una rendición para ver sus gastos.</p>
            <p v-else class="text-xs font-medium text-slate-500 mt-0.5">
              {{ formatDate(viajeSeleccionadoInfo.fecha_inicio) }} - {{ viajeSeleccionadoInfo.fecha_fin ? formatDate(viajeSeleccionadoInfo.fecha_fin) : 'En curso' }}
            </p>
          </div>

          <!-- Acciones de Encabezado -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative" v-if="gastos.length > 0">
              <button @click="isExportMenuOpen = !isExportMenuOpen" class="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 font-bold text-xs text-slate-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer">
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Exportar
              </button>
              <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
                <div v-if="isExportMenuOpen" @click.away="isExportMenuOpen = false" class="absolute right-0 mt-2 w-48 rounded-xl bg-white shadow-xl ring-1 ring-slate-900/5 focus:outline-none z-30 overflow-hidden p-1">
                  <button @click="generarRendicionPDFWrapper" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2">
                    <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                    Exportar PDF Canva
                  </button>
                </div>
              </transition>
            </div>

            <button v-if="viajeSeleccionadoInfo && !isViajeActualCerrado" @click="showFondosModal = true" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              Agregar Fondos
            </button>

            <button v-if="viajeSeleccionadoInfo && !isViajeActualCerrado" @click="cerrarRendicion" :disabled="isClosingRendicion || gastos.length === 0" class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <svg v-if="!isClosingRendicion" class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <svg v-else class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {{ isClosingRendicion ? 'Cerrando...' : 'Cerrar y Enviar' }}
            </button>
          </div>
        </div>

        <!-- Tarjetas de Resumen KPI (PC / Desktop) -->
        <div class="hidden sm:grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3">
          <SummaryCard title="Adelanto Total" :value="adelantoTotal" :total="adelantoTotal > 0 ? adelantoTotal : 1" color="#3B82F6" />
          <SummaryCard title="Total Gastado" :value="totalGastado" :total="adelantoTotal" :color="totalGastado > adelantoTotal ? '#EF4444' : '#10B981'" />
          <SummaryCard title="Saldo Actual" :value="saldoActualRendicion" :format-as-currency="true" :color="saldoActualRendicion >= 0 ? '#475569' : '#EF4444'" :show-chart="false" />
        </div>

        <!-- Tarjetas KPI Estilo Mobile (Inspiradas en Referencia) -->
        <div class="grid grid-cols-2 gap-3 sm:hidden pt-2">
          <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Gastado</span>
            <span class="text-lg font-black text-slate-900 mt-1">{{ formatCurrency(totalGastado) }}</span>
          </div>
          <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Saldo Actual</span>
            <span class="text-lg font-black mt-1" :class="saldoActualRendicion >= 0 ? 'text-slate-900' : 'text-red-600'">{{ formatCurrency(saldoActualRendicion) }}</span>
          </div>
        </div>
      </div>

      <!-- Barra de Filtros y Herramientas -->
      <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">

          <!-- Selector de Rendición Activa -->
          <div class="md:col-span-5">
            <label for="filtro-viaje" class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Rendición Activa</label>
            <select id="filtro-viaje" v-model="filtroViajeId" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all">
              <option value="" disabled>Selecciona una rendición</option>
              <option v-if="listaViajesParaFiltro.length === 0" value="" disabled>No tienes rendiciones</option>
              <option v-for="viaje in listaViajesParaFiltro" :key="viaje.id" :value="viaje.id">{{ viaje.nombre_viaje }}</option>
            </select>
          </div>

          <!-- Búsqueda en Descripción -->
          <div class="md:col-span-4">
            <label for="filtro-descripcion" class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Buscar Gasto</label>
            <div class="relative">
              <input id="filtro-descripcion" type="text" v-model="filtroDescripcion" placeholder="Ej: Peaje, Nafta..." class="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"/>
              <svg class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          </div>

          <!-- Botones de Acción de Filtros -->
          <div class="md:col-span-3 flex items-center justify-end gap-2 pt-2 md:pt-4">
            <button @click="handleGroupByType" :disabled="isGroupingByType || isViajeActualCerrado || gastos.length === 0" class="px-3 py-2 text-xs font-bold text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer disabled:opacity-40" title="Agrupar por tipo de gasto">
              Agrupar por Tipo
            </button>
            <button @click="isConciliacionMode = !isConciliacionMode" class="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-1.5" :class="isConciliacionMode ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-700'">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Conciliar
            </button>
          </div>

        </div>
      </div>

      <!-- Modo Conciliación -->
      <transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 translate-y-[-4px]" enter-to-class="opacity-100 translate-y-0" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="isConciliacionMode" class="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div class="md:col-span-2">
              <label class="block text-[11px] font-bold uppercase tracking-wider text-indigo-900 mb-1">Estado de Revisión</label>
              <div class="inline-flex rounded-xl p-1 bg-white border border-indigo-100 shadow-xs">
                <button @click="filtroRevisado = 'todos'" :class="filtroRevisado === 'todos' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 font-semibold'" class="px-3 py-1 text-xs rounded-lg transition-all cursor-pointer">Todos</button>
                <button @click="filtroRevisado = 'no_revisados'" :class="filtroRevisado === 'no_revisados' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 font-semibold'" class="px-3 py-1 text-xs rounded-lg transition-all cursor-pointer">Pendientes</button>
                <button @click="filtroRevisado = 'revisados'" :class="filtroRevisado === 'revisados' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 font-semibold'" class="px-3 py-1 text-xs rounded-lg transition-all cursor-pointer">Revisados</button>
              </div>
            </div>
            <div class="space-y-1 text-xs">
              <div class="flex justify-between text-slate-600"><span class="font-semibold">Total Sistema:</span><span class="font-bold text-slate-900">{{ formatCurrency(totalGastado) }}</span></div>
            </div>
          </div>
        </div>
      </transition>

      <!-- Estado de Rendición (Aprobada / Rechazada / Pendiente) -->
      <div v-if="viajeSeleccionadoInfo?.estado_aprobacion === 'pendiente_aprobacion'" class="p-3.5 text-center text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl">
        Esta rendición está cerrada y pendiente de revisión por un administrador.
      </div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'aprobado'" class="p-3.5 text-center text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl">
        ¡Rendición aprobada exitosamente!
      </div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'rechazado'" class="p-4 text-xs bg-red-50 text-red-800 border border-red-200 rounded-2xl space-y-1">
        <p class="font-bold">Esta rendición fue rechazada.</p>
        <p v-if="viajeSeleccionadoInfo.comentarios_aprobacion" class="text-red-700">Motivo: "{{ viajeSeleccionadoInfo.comentarios_aprobacion }}"</p>
      </div>

      <!-- Estado de Carga o Lista Vacía -->
      <div v-if="loading" class="py-20 text-center space-y-3">
        <svg class="animate-spin h-8 w-8 text-emerald-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="text-xs font-bold text-slate-500">Cargando comprobantes de la rendición...</p>
      </div>

      <div v-else-if="gastos.length === 0 && !loading" class="bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-xs space-y-3 max-w-lg mx-auto">
        <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
        <h3 class="text-sm font-bold text-slate-800">No se encontraron gastos cargados</h3>
        <p class="text-xs text-slate-500">Comenzá haciendo clic en el botón flotante "+" o agregá fondos a la rendición.</p>
      </div>

      <!-- Contenedor Principal de Gastos -->
      <div v-else class="space-y-6">

        <!-- VISTA DE ESCRITORIO (Tabla elegante y minimalista) -->
        <div class="hidden lg:block space-y-6">
          <div v-for="grupo in gastosRenderList.userGroups.concat(gastosRenderList.dateGroups)" :key="grupo.id">
            <div class="flex items-center justify-between mb-2.5 px-1">
              <h2 class="text-xs font-bold uppercase tracking-wider text-slate-500">{{ grupo.name }}</h2>
              <div v-if="grupo.isGroup && !isViajeActualCerrado" class="flex items-center gap-2">
                <button @click="handleRenameGroup(grupo.id)" class="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">Renombrar</button>
                <button @click="handleDeleteGroup(grupo.id, grupo.name)" class="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors cursor-pointer">Eliminar</button>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th class="py-3 px-4 w-10"></th>
                    <th class="py-3 px-4 w-12">Ícono</th>
                    <th class="py-3 px-4 sortable cursor-pointer" @click="sortBy('fecha_gasto')">Fecha</th>
                    <th class="py-3 px-4">Categoría</th>
                    <th class="py-3 px-4">Descripción</th>
                    <th class="py-3 px-4">Factura</th>
                    <th class="py-3 px-4 text-right sortable cursor-pointer" @click="sortBy('monto_total')">Monto Total</th>
                    <th class="py-3 px-4 text-center w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <template v-for="gasto in grupo.gastos" :key="gasto.id">
                    <tr 
                      @click="toggleRowExpansion(gasto.id)"
                      class="hover:bg-slate-50/80 transition-colors cursor-pointer font-medium"
                      :class="{'bg-indigo-50/50': selectedGastos.has(gasto.id)}"
                    >
                      <td class="py-3 px-4" @click.stop>
                        <input type="checkbox" :checked="selectedGastos.has(gasto.id)" @change="toggleGastoSelection(gasto.id)" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" :disabled="isViajeActualCerrado">
                      </td>
                      <td class="py-3 px-4">
                        <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                          <IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" />
                        </div>
                      </td>
                      <td class="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">{{ formatDate(gasto.fecha_gasto) }}</td>
                      <td class="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || '-' }}</td>
                      <td class="py-3 px-4 text-slate-600 max-w-xs truncate">{{ gasto.descripcion_general || 'Sin detalle' }}</td>
                      <td class="py-3 px-4 text-slate-500 font-mono">{{ gasto.numero_factura || '-' }}</td>
                      <td class="py-3 px-4 text-right font-black text-slate-900 text-sm whitespace-nowrap">{{ formatCurrency(gasto.monto_total) }}</td>
                      <td class="py-3 px-4 text-center" @click.stop>
                        <div class="flex items-center justify-center gap-1.5">
                          <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="p-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Ver Comprobante">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </a>
                          <button @click="editarGasto(gasto)" :disabled="isViajeActualCerrado" class="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer" title="Editar Gasto">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer" title="Eliminar Gasto">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    <!-- Fila Expandible de Detalles (Desktop) -->
                    <tr v-if="expandedRows.has(gasto.id)" class="bg-slate-50/90 border-b border-slate-200">
                      <td colspan="8" class="p-5">
                        <div class="space-y-3 text-xs">
                          <h4 class="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Información Detallada del Comprobante</h4>
                          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-slate-600">
                            <div v-if="gasto.clientes?.nombre_cliente"><span class="block font-bold text-slate-800">Cliente:</span>{{ gasto.clientes.nombre_cliente }}</div>
                            <div v-if="gasto.proveedores?.nombre"><span class="block font-bold text-slate-800">Proveedor:</span>{{ gasto.proveedores.nombre }}</div>
                            <div v-if="gasto.transportes?.nombre"><span class="block font-bold text-slate-800">Transporte:</span>{{ gasto.transportes.nombre }}</div>
                            <div v-if="gasto.nombre_chofer"><span class="block font-bold text-slate-800">Chofer:</span>{{ gasto.nombre_chofer }}</div>
                            <div v-if="gasto.vehiculos"><span class="block font-bold text-slate-800">Vehículo:</span>{{ gasto.vehiculos.patente }}</div>
                          </div>
                          <DetallesJson v-if="gasto.datos_adicionales && Object.keys(gasto.datos_adicionales).length > 0" :datos="gasto.datos_adicionales" class="pt-3 border-t border-slate-200"/>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- VISTA MÓVIL (Inspirada en el diseño de referencia adjunto) -->
        <div class="lg:hidden space-y-6">
          <div v-for="grupo in gastosRenderList.userGroups.concat(gastosRenderList.dateGroups)" :key="grupo.id + '-mobile'" class="space-y-2.5">
            <!-- Encabezado de Agrupación Fecha / Concepto -->
            <div class="flex items-center justify-between px-1">
              <span class="text-xs font-black text-slate-500 uppercase tracking-wider">{{ grupo.name }}</span>
              <span class="text-[11px] font-bold text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-full">{{ grupo.gastos.length }} operaciones</span>
            </div>

            <!-- Lista de Tarjetas de Transacción -->
            <div class="space-y-2">
              <div 
                v-for="gasto in grupo.gastos" 
                :key="gasto.id" 
                @click="toggleRowExpansion(gasto.id)"
                class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:shadow-sm transition-all cursor-pointer space-y-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <!-- Ícono de Categoría Circundante estilo Referencia -->
                    <div class="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-800 shrink-0 shadow-xs">
                      <IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" />
                    </div>

                    <div class="min-w-0">
                      <h4 class="text-sm font-bold text-slate-900 truncate">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto' }}</h4>
                      <p class="text-xs text-slate-500 truncate mt-0.5">{{ gasto.descripcion_general || 'Sin descripción' }}</p>
                    </div>
                  </div>

                  <!-- Monto en Estilo Financiero Prominente -->
                  <div class="text-right shrink-0">
                    <span class="text-base font-black text-slate-900 block">{{ formatCurrency(gasto.monto_total) }}</span>
                    <span class="text-[10px] font-semibold text-slate-400">{{ formatDate(gasto.fecha_gasto) }}</span>
                  </div>
                </div>

                <!-- Detalle Expandido en Móvil -->
                <transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 translate-y-[-4px]" enter-to-class="opacity-100 translate-y-0">
                  <div v-if="expandedRows.has(gasto.id)" class="pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                    <div v-if="gasto.proveedores?.nombre" class="flex justify-between"><span class="font-bold text-slate-800">Proveedor:</span><span>{{ gasto.proveedores.nombre }}</span></div>
                    <div v-if="gasto.clientes?.nombre_cliente" class="flex justify-between"><span class="font-bold text-slate-800">Cliente:</span><span>{{ gasto.clientes.nombre_cliente }}</span></div>
                    <div v-if="gasto.numero_factura" class="flex justify-between"><span class="font-bold text-slate-800">Nº Factura:</span><span class="font-mono">{{ gasto.numero_factura }}</span></div>
                    
                    <div class="pt-2 flex items-center justify-end gap-3" @click.stop>
                      <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors">
                        Ver Comprobante
                      </a>
                      <button @click="editarGasto(gasto)" :disabled="isViajeActualCerrado" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs hover:bg-emerald-100 transition-colors cursor-pointer">
                        Editar
                      </button>
                      <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="px-3 py-1.5 bg-red-50 text-red-700 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors cursor-pointer">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </transition>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>

    <!-- Botón Flotante (FAB) para Nuevo Gasto -->
    <div class="fixed bottom-6 right-6 z-30">
      <button 
        @click="goToNuevoGasto" 
        :disabled="isViajeActualCerrado || !filtroViajeId" 
        class="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        title="Registrar Nuevo Gasto"
      >
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
      </button>
    </div>

    <!-- Modal de Fondos -->
    <AgregarFondosModal
      v-if="showFondosModal"
      :viaje-id="filtroViajeId"
      @close="showFondosModal = false"
      @fondos-agregados="handleFondosAgregados"
    />

  </div>
</template>