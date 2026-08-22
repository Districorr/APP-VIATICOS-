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
  newGroupName.value = '';
  selectedGroupId.value = existingGroups.value.length > 0 ? existingGroups.value[0].id : null;
  groupAction.value = 'create';
  groupError.value = '';
  showGroupModal.value = true;
}

async function handleGroupingAction() {
  if (selectedGastos.value.size === 0) return;
  isGrouping.value = true;
  groupError.value = '';
  try {
    const gastoIdsToUpdate = Array.from(selectedGastos.value);

    if (groupAction.value === 'create') {
      if (!newGroupName.value.trim()) throw new Error("Ingresá un nombre para el nuevo grupo.");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado.");

      const { data: newGroup, error: groupInsertError } = await supabase
        .from('grupos_gastos')
        .insert({ 
          nombre_grupo: newGroupName.value.trim(), 
          viaje_id: viajeSeleccionadoInfo.value.id, 
          creado_por_id: user.id 
        })
        .select()
        .single();

      if (groupInsertError) throw groupInsertError;

      const { error: updateError } = await supabase
        .from('gastos')
        .update({ grupo_id: newGroup.id })
        .in('id', gastoIdsToUpdate);

      if (updateError) throw updateError;
      
    } else if (groupAction.value === 'add') {
      if (!selectedGroupId.value) throw new Error("Debes seleccionar un grupo existente.");
      
      const { error: updateError } = await supabase
        .from('gastos')
        .update({ grupo_id: selectedGroupId.value })
        .in('id', gastoIdsToUpdate);

      if (updateError) throw updateError;
    }

    selectedGastos.value.clear();
    showGroupModal.value = false;
    await fetchGastos();
    feedbackMessage.value = "Gastos agrupados con éxito.";
    setTimeout(() => { feedbackMessage.value = ''; }, 4000);

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

const hasDetailedInfo = (gasto) => {
  if (gasto.clientes?.nombre_cliente) return true;
  if (gasto.proveedores?.nombre) return true;
  if (gasto.transportes?.nombre) return true;
  if (gasto.nombre_chofer) return true;
  if (gasto.vehiculos) return true;
  if (gasto.datos_adicionales && Object.keys(gasto.datos_adicionales).length > 0) return true;
  return false;
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
};
</script>

<template>
  <div class="bg-slate-50 min-h-screen font-sans pb-24 text-slate-900">

    <!-- Banner Flotante de Feedback / Notificación -->
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

    <!-- Contenedor Principal -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

      <!-- Encabezado de Rendición (Alto Contraste y Acciones Adaptadas) -->
      <div class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
              {{ viajeSeleccionadoInfo?.nombre_viaje || 'Mis Gastos' }}
            </h1>
            <span v-if="viajeSeleccionadoInfo?.codigo_rendicion" class="px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-emerald-400 border border-slate-700 font-mono shadow-xs">
              {{ viajeSeleccionadoInfo.codigo_rendicion }}
            </span>
          </div>
          <p v-if="!viajeSeleccionadoInfo" class="text-xs text-slate-600 mt-1 font-medium">Seleccioná una rendición activa para gestionar sus comprobantes.</p>
          <p v-else class="text-xs font-semibold text-slate-600 mt-1">
            Periodo: {{ formatDate(viajeSeleccionadoInfo.fecha_inicio) }} - {{ viajeSeleccionadoInfo.fecha_fin ? formatDate(viajeSeleccionadoInfo.fecha_fin) : 'En curso' }}
          </p>
        </div>

        <!-- Acciones Principales Adaptadas Móvil y Desktop -->
        <div class="flex items-center gap-2 shrink-0">

          <!-- Botón Exportar PDF Adaptado Responsive -->
          <button 
            v-if="gastos.length > 0"
            @click="generarRendicionPDFWrapper" 
            class="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            title="Exportar Reporte Rendición PDF"
          >
            <svg class="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span class="hidden sm:inline">Exportar PDF</span>
            <span class="sm:hidden">PDF</span>
          </button>

          <!-- Botón "Agregar Fondos" como ÍCONO de Dinero -->
          <button 
            v-if="viajeSeleccionadoInfo && !isViajeActualCerrado" 
            @click="showFondosModal = true" 
            class="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs transition-all flex items-center justify-center cursor-pointer shrink-0"
            title="Agregar Fondos a esta Rendición"
          >
            <!-- Ícono de Dinero / Billete -->
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </button>

          <!-- Botón Cerrar Rendición en Color ROJO -->
          <button 
            v-if="viajeSeleccionadoInfo && !isViajeActualCerrado" 
            @click="cerrarRendicion" 
            :disabled="isClosingRendicion || gastos.length === 0" 
            class="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <svg v-if="!isClosingRendicion" class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            <svg v-else class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            <span class="hidden sm:inline">{{ isClosingRendicion ? 'Cerrando...' : 'Cerrar Rendición' }}</span>
            <span class="sm:hidden">{{ isClosingRendicion ? '...' : 'Cerrar' }}</span>
          </button>
        </div>
      </div>

      <!-- Tarjetas de Resumen Financiero (KPI) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard title="Adelanto Total" :value="adelantoTotal" :total="adelantoTotal > 0 ? adelantoTotal : 1" color="#3B82F6" />
        <SummaryCard title="Total Gastado" :value="totalGastado" :total="adelantoTotal" :color="totalGastado > adelantoTotal ? '#EF4444' : '#10B981'" />
        <SummaryCard title="Saldo Actual" :value="saldoActualRendicion" :format-as-currency="true" :color="saldoActualRendicion >= 0 ? '#475569' : '#EF4444'" :show-chart="false" />
      </div>

      <!-- Tarjeta de Filtros -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">

          <!-- Selector Rendición Activa -->
          <div class="md:col-span-5 space-y-1">
            <label for="filtro-viaje" class="block text-xs font-bold uppercase tracking-wider text-slate-800">Rendición Activa</label>
            <select id="filtro-viaje" v-model="filtroViajeId" class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all cursor-pointer">
              <option value="" disabled>Selecciona una rendición</option>
              <option v-if="listaViajesParaFiltro.length === 0" value="" disabled>No tienes rendiciones</option>
              <option v-for="viaje in listaViajesParaFiltro" :key="viaje.id" :value="viaje.id">{{ viaje.nombre_viaje }}</option>
            </select>
          </div>

          <!-- Búsqueda General -->
          <div class="md:col-span-4 space-y-1">
            <label for="filtro-descripcion" class="block text-xs font-bold uppercase tracking-wider text-slate-800">Buscar en la Rendición</label>
            <div class="relative">
              <input id="filtro-descripcion" type="text" v-model="filtroDescripcion" placeholder="Ej: Peaje, Nafta, Hotel..." class="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"/>
              <svg class="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          </div>

          <!-- Acciones de Filtro -->
          <div class="md:col-span-3 flex items-center justify-end gap-2">
            <button @click="handleGroupByType" :disabled="isGroupingByType || isViajeActualCerrado || gastos.length === 0" class="px-3 py-2 text-xs font-bold text-slate-700 hover:text-emerald-700 transition-colors cursor-pointer disabled:opacity-40" title="Agrupar por tipo de gasto">
              Agrupar por Tipo
            </button>
            <button @click="isConciliacionMode = !isConciliacionMode" class="px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5" :class="isConciliacionMode ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Conciliar
            </button>
          </div>

        </div>
      </div>

      <!-- Modo Conciliación -->
      <transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 translate-y-[-4px]" enter-to-class="opacity-100 translate-y-0">
        <div v-if="isConciliacionMode" class="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="space-y-1">
              <label class="block text-xs font-bold uppercase tracking-wider text-indigo-950">Estado de Revisión de Comprobantes</label>
              <div class="inline-flex rounded-xl p-1 bg-white border border-indigo-200 shadow-xs">
                <button @click="filtroRevisado = 'todos'" :class="filtroRevisado === 'todos' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 font-semibold'" class="px-3 py-1 text-xs rounded-lg transition-all cursor-pointer">Todos</button>
                <button @click="filtroRevisado = 'no_revisados'" :class="filtroRevisado === 'no_revisados' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 font-semibold'" class="px-3 py-1 text-xs rounded-lg transition-all cursor-pointer">Pendientes</button>
                <button @click="filtroRevisado = 'revisados'" :class="filtroRevisado === 'revisados' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 font-semibold'" class="px-3 py-1 text-xs rounded-lg transition-all cursor-pointer">Revisados</button>
              </div>
            </div>
            <div class="text-right text-xs">
              <span class="block text-slate-600 font-semibold">Total Registrado en Sistema</span>
              <span class="text-base font-black text-slate-900">{{ formatCurrency(totalGastado) }}</span>
            </div>
          </div>
        </div>
      </transition>

      <!-- Estado de Rendición -->
      <div v-if="viajeSeleccionadoInfo?.estado_aprobacion === 'pendiente_aprobacion'" class="p-4 text-center text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 rounded-2xl shadow-xs">
        Esta rendición está cerrada y en proceso de auditoría/aprobación por administración.
      </div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'aprobado'" class="p-4 text-center text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-2xl shadow-xs">
        ¡Rendición auditada y aprobada exitosamente!
      </div>
      <div v-else-if="viajeSeleccionadoInfo?.estado_aprobacion === 'rechazado'" class="p-4 text-xs bg-red-50 text-red-900 border border-red-300 rounded-2xl space-y-1 shadow-xs">
        <p class="font-bold">Esta rendición fue rechazada por administración.</p>
        <p v-if="viajeSeleccionadoInfo.comentarios_aprobacion" class="text-red-800">Observación: "{{ viajeSeleccionadoInfo.comentarios_aprobacion }}"</p>
      </div>

      <!-- Estado de Carga -->
      <div v-if="loading" class="py-20 text-center space-y-3">
        <svg class="animate-spin h-8 w-8 text-emerald-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="text-xs font-bold text-slate-600">Cargando comprobantes...</p>
      </div>

      <!-- Estado Vacío -->
      <div v-else-if="gastos.length === 0 && !loading" class="bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-xs space-y-3 max-w-lg mx-auto">
        <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
        <h3 class="text-sm font-bold text-slate-800">Sin gastos cargados</h3>
        <p class="text-xs text-slate-600">Hacé clic en el botón verde flotante "+" o en el ícono de recarga para agregar fondos.</p>
      </div>

      <!-- LISTA DE GASTOS CON ALTO CONTRASATE Y ENCABEZADOS OSCUROS -->
      <div v-else class="space-y-6">

        <!-- VISTA DE ESCRITORIO CON ENCABEZADOS DE ALTO CONTRASATE -->
        <div class="hidden lg:block space-y-6">
          <div v-for="grupo in gastosRenderList.userGroups.concat(gastosRenderList.dateGroups)" :key="grupo.id" class="space-y-3">
            
            <!-- Encabezado Suave de Grupo / Sección -->
            <div class="bg-slate-100/90 border border-slate-300/80 rounded-2xl p-3 px-4 shadow-xs flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="w-3 h-3 rounded-full bg-emerald-600 shadow-xs"></span>
                <h2 class="text-xs font-black uppercase tracking-wider text-slate-800 font-mono">{{ grupo.name }}</h2>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white text-slate-800 border border-slate-300 font-mono">
                  {{ grupo.gastos.length }} {{ grupo.gastos.length === 1 ? 'comprobante' : 'comprobantes' }}
                </span>
              </div>

              <div v-if="grupo.isGroup && !isViajeActualCerrado" class="flex items-center gap-2">
                <button @click="handleRenameGroup(grupo.id)" class="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">Renombrar</button>
                <button @click="handleDeleteGroup(grupo.id, grupo.name)" class="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">Eliminar</button>
              </div>
            </div>

            <!-- Tabla Card con Encabezados de Alto Contraste -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="bg-slate-200/80 border-b border-slate-300 text-slate-900 font-black uppercase tracking-wider text-[11px]">
                    <th class="py-3.5 px-4 w-10 text-center"></th>
                    <th class="py-3.5 px-4 w-12 text-center">Ícono</th>
                    <th class="py-3.5 px-4 sortable cursor-pointer" @click="sortBy('fecha_gasto')">Fecha</th>
                    <th class="py-3.5 px-4">Categoría</th>
                    <th class="py-3.5 px-4">Descripción</th>
                    <th class="py-3.5 px-4">N° Factura</th>
                    <th class="py-3.5 px-4 text-right sortable cursor-pointer" @click="sortBy('monto_total')">Monto Total</th>
                    <th class="py-3.5 px-4 text-center w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <template v-for="gasto in grupo.gastos" :key="gasto.id">
                    <tr 
                      @click="toggleRowExpansion(gasto.id)"
                      class="hover:bg-slate-50 transition-colors cursor-pointer"
                      :class="{'bg-indigo-50/70': selectedGastos.has(gasto.id)}"
                    >
                      <td class="py-3.5 px-4 text-center" @click.stop>
                        <input type="checkbox" :checked="selectedGastos.has(gasto.id)" @change="toggleGastoSelection(gasto.id)" class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" :disabled="isViajeActualCerrado">
                      </td>
                      <td class="py-3 px-4 text-center">
                        <div class="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 mx-auto p-1">
                          <IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" />
                        </div>
                      </td>
                      <td class="py-3 px-4 text-slate-600 whitespace-nowrap font-normal">{{ formatDate(gasto.fecha_gasto) }}</td>
                      <td class="py-3 px-4 text-slate-600 whitespace-nowrap font-normal">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto General' }}</td>
                      <td class="py-3 px-4 text-slate-900 max-w-sm truncate font-bold text-xs">{{ gasto.descripcion_general || 'Sin detalle' }}</td>
                      <td class="py-3 px-4 text-slate-500 font-mono text-xs">{{ gasto.numero_factura || '-' }}</td>
                      <td class="py-3 px-4 text-right font-bold text-slate-900 text-xs whitespace-nowrap">{{ formatCurrency(gasto.monto_total) }}</td>
                      <td class="py-3.5 px-4 text-center" @click.stop>
                        <div class="flex items-center justify-center gap-1.5">
                          <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors" title="Ver Comprobante">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </a>
                          <button @click="editarGasto(gasto)" :disabled="isViajeActualCerrado" class="w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 flex items-center justify-center transition-colors cursor-pointer" title="Editar Gasto">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-red-50 hover:text-red-600 text-slate-700 flex items-center justify-center transition-colors cursor-pointer" title="Eliminar Gasto">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>

                    <!-- Detalle Expandido -->
                    <tr v-if="expandedRows.has(gasto.id)" class="bg-slate-50 border-b border-slate-200">
                      <td colspan="8" class="p-5">
                        <div class="space-y-3 text-xs">
                          <h4 class="font-black text-slate-900 uppercase tracking-wider text-[11px]">Detalles del Comprobante</h4>
                          
                          <div v-if="hasDetailedInfo(gasto)" class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-slate-700">
                            <div v-if="gasto.clientes?.nombre_cliente"><span class="block font-bold text-slate-900">Cliente:</span>{{ gasto.clientes.nombre_cliente }}</div>
                            <div v-if="gasto.proveedores?.nombre"><span class="block font-bold text-slate-900">Proveedor:</span>{{ gasto.proveedores.nombre }}</div>
                            <div v-if="gasto.transportes?.nombre"><span class="block font-bold text-slate-900">Transporte:</span>{{ gasto.transportes.nombre }}</div>
                            <div v-if="gasto.nombre_chofer"><span class="block font-bold text-slate-900">Chofer:</span>{{ gasto.nombre_chofer }}</div>
                            <div v-if="gasto.vehiculos"><span class="block font-bold text-slate-900">Vehículo:</span>{{ gasto.vehiculos.marca }} {{ gasto.vehiculos.modelo }} ({{ gasto.vehiculos.patente }})</div>
                          </div>
                          <p v-else class="text-slate-500 font-semibold italic">No existen datos adicionales registrados para este comprobante.</p>

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

        <!-- VISTA MÓVIL REFINADA DE ALTO CONTRASATE -->
        <div class="lg:hidden space-y-5">
          <div v-for="grupo in gastosRenderList.userGroups.concat(gastosRenderList.dateGroups)" :key="grupo.id + '-mobile'" class="space-y-2.5">
            
            <div class="bg-slate-100/90 border border-slate-300/80 rounded-2xl p-3 px-4 shadow-xs flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                <span class="text-xs font-black text-slate-800 uppercase tracking-wider font-mono">{{ grupo.name }}</span>
              </div>
              <span class="text-[11px] font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded-full border border-slate-300 font-mono">{{ grupo.gastos.length }} ítems</span>
            </div>

            <div class="space-y-2">
              <div 
                v-for="gasto in grupo.gastos" 
                :key="gasto.id" 
                @click="toggleRowExpansion(gasto.id)"
                class="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3 cursor-pointer"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 p-1">
                      <IconRenderer :icon-data="gasto.tipos_gasto_config?.icono_svg" :color="gasto.tipos_gasto_config?.color_accent" />
                    </div>

                    <div class="min-w-0">
                      <h4 class="text-xs font-bold text-slate-900 truncate">{{ gasto.descripcion_general || 'Sin descripción' }}</h4>
                      <p class="text-[11px] text-slate-500 truncate mt-0.5 font-normal">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Gasto General' }}</p>
                    </div>
                  </div>

                  <div class="text-right shrink-0">
                    <span class="text-base font-black text-slate-900 block">{{ formatCurrency(gasto.monto_total) }}</span>
                    <span class="text-[10px] font-bold text-slate-500">{{ formatDate(gasto.fecha_gasto) }}</span>
                  </div>
                </div>

                <!-- Detalle Expandido en Móvil -->
                <transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 translate-y-[-4px]" enter-to-class="opacity-100 translate-y-0">
                  <div v-if="expandedRows.has(gasto.id)" class="pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-700">
                    <div v-if="gasto.proveedores?.nombre" class="flex justify-between"><span class="font-bold text-slate-900">Proveedor:</span><span>{{ gasto.proveedores.nombre }}</span></div>
                    <div v-if="gasto.clientes?.nombre_cliente" class="flex justify-between"><span class="font-bold text-slate-900">Cliente:</span><span>{{ gasto.clientes.nombre_cliente }}</span></div>
                    <div v-if="gasto.numero_factura" class="flex justify-between"><span class="font-bold text-slate-900">Nº Factura:</span><span class="font-mono font-bold">{{ gasto.numero_factura }}</span></div>
                    
                    <div class="pt-2 flex items-center justify-end gap-2" @click.stop>
                      <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="px-3 py-1.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-xl font-bold text-xs">
                        Comprobante
                      </a>
                      <button @click="editarGasto(gasto)" :disabled="isViajeActualCerrado" class="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs cursor-pointer">
                        Editar
                      </button>
                      <button @click="eliminarGasto(gasto.id)" :disabled="isViajeActualCerrado" class="px-3 py-1.5 bg-red-50 text-red-800 border border-red-200 rounded-xl font-bold text-xs cursor-pointer">
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
      :rendicion="viajeSeleccionadoInfo"
      @close="showFondosModal = false"
      @fondos-agregados="handleFondosAgregados"
    />

    <!-- Barra Flotante de Acciones en Lote (Agrupar / Desagrupar) -->
    <transition enter-active-class="transform ease-out duration-300 transition" enter-from-class="translate-y-10 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transform ease-in duration-200 transition" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-10 opacity-0">
      <div v-if="selectedGastos.size > 0" class="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-4 max-w-xl w-11/12 sm:w-auto">
        <div class="flex items-center gap-2.5">
          <span class="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center font-mono shrink-0">{{ selectedGastos.size }}</span>
          <span class="text-xs font-bold text-slate-200 whitespace-nowrap">{{ selectedGastos.size === 1 ? '1 seleccionado' : selectedGastos.size + ' seleccionados' }}</span>
        </div>

        <div class="h-4 w-px bg-slate-700 shrink-0"></div>

        <div class="flex items-center gap-2 shrink-0">
          <button @click="openGroupModal" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            Agrupar
          </button>

          <button v-if="canUngroup" @click="handleUngroup" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer">
            Desagrupar
          </button>

          <button @click="selectedGastos.clear()" class="px-2.5 py-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs transition-all cursor-pointer">
            Cancelar
          </button>
        </div>
      </div>
    </transition>

    <!-- Modal de Agrupación de Gastos -->
    <transition enter-active-class="ease-out duration-300" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="ease-in duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showGroupModal" class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
          
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 class="text-base font-black text-slate-900">Agrupar Comprobantes</h3>
              <p class="text-xs text-slate-500 font-medium">Vas a agrupar {{ selectedGastos.size }} {{ selectedGastos.size === 1 ? 'comprobante' : 'comprobantes' }}.</p>
            </div>
            <button @click="showGroupModal = false" class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold">✕</button>
          </div>

          <div v-if="groupError" class="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold border border-red-200">
            {{ groupError }}
          </div>

          <div class="space-y-4 text-xs">
            <!-- Opción 1: Crear Nuevo Grupo -->
            <label class="flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer" :class="groupAction === 'create' ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'">
              <input type="radio" v-model="groupAction" value="create" class="mt-1 text-emerald-600 focus:ring-emerald-500" />
              <div class="space-y-2 flex-grow">
                <span class="font-bold text-slate-900 block">Crear un Nuevo Grupo</span>
                <input 
                  v-if="groupAction === 'create'" 
                  type="text" 
                  v-model="newGroupName" 
                  placeholder="Ej: Peajes y Combustible, Viáticos Córdoba..." 
                  class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  @keyup.enter="handleGroupingAction"
                />
              </div>
            </label>

            <!-- Opción 2: Añadir a Grupo Existente -->
            <label v-if="existingGroups.length > 0" class="flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer" :class="groupAction === 'add' ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'">
              <input type="radio" v-model="groupAction" value="add" class="mt-1 text-emerald-600 focus:ring-emerald-500" />
              <div class="space-y-2 flex-grow">
                <span class="font-bold text-slate-900 block">Añadir a un Grupo Existente</span>
                <select 
                  v-if="groupAction === 'add'" 
                  v-model="selectedGroupId" 
                  class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                >
                  <option v-for="grupo in existingGroups" :key="grupo.id" :value="grupo.id">{{ grupo.nombre_grupo }}</option>
                </select>
              </div>
            </label>
          </div>

          <!-- Botones de Acción -->
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button @click="showGroupModal = false" class="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer">
              Cancelar
            </button>
            <button 
              @click="handleGroupingAction" 
              :disabled="isGrouping || (groupAction === 'create' && !newGroupName.trim())" 
              class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <svg v-if="isGrouping" class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              <span>{{ isGrouping ? 'Guardando...' : 'Confirmar Agrupación' }}</span>
            </button>
          </div>

        </div>
      </div>
    </transition>

  </div>
</template>