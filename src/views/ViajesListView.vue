<script setup>

import { ref, onMounted, computed, watch, inject } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter } from 'vue-router';
// MODIFICACIÓN: Importamos getReportData para la vista previa
import { useReportGenerator } from '../composables/useReportGenerator.js';
import ReporteRendicion from '../components/ReporteRendicion.vue'; // NUEVO: Importamos el componente de reporte

const router = useRouter();
const userProfile = inject('userProfile', ref(null)); 

const viajes = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

// --- NUEVA FUNCIONALIDAD: Estado para filtros ---
const filterEnCurso = ref(true);
const filterCerradas = ref(false);
const filterSaldoNegativo = ref(false);
const filterSinGastos = ref(false);

// --- NUEVA FUNCIONALIDAD: Estado para acciones masivas ---
const selectedViajes = ref(new Set());
const showBulkActionsMenu = ref(false);
const loadingBulkAction = ref(false);

// --- NUEVA FUNCIONALIDAD: Estado para el Modal de Vista Previa ---
const showPreviewModal = ref(false);
const previewData = ref(null);
const loadingPreview = ref(false);
const previewError = ref('');

// --- Estado y Lógica para el Modal de Cierre ---
const mostrarModalCierre = ref(false);
const viajeACerrar = ref(null);
const observacionCierreInput = ref('');
const loadingCierre = ref(false);

// --- MODIFICACIÓN: Nuevo estado y hook para reporte PDF ---
const loadingReporteId = ref(null); 
// MODIFICACIÓN: Obtenemos ambas funciones del composable
const { generateCanvaStylePDF, getReportData } = useReportGenerator();

// --- Funciones de Formato ---
const formatCurrency = (amount, currency = 'ARS') => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 2 }).format(amount);
};

const formatDate = (dateString, options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) => {
  if (!dateString) return 'N/A';
  let date;
  if (String(dateString).includes('T') || String(dateString).includes(' ')) {
    date = new Date(dateString);
  } else {
    const dateParts = String(dateString).split('-');
    if (dateParts.length === 3) {
      date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
    } else {
      date = new Date(dateString);
    }
  }
  if (isNaN(date.getTime())) return 'Fecha Inválida';
  return date.toLocaleDateString('es-AR', options);
};

// --- Funciones de Estado y UI ---
const getEstadoViajeTexto = (viaje) => {
  if (viaje.cerrado_en) {
    return `CERRADO EL ${formatDate(viaje.cerrado_en, {day: '2-digit', month: 'long', year: 'numeric', hour:'2-digit', minute:'2-digit' })}`;
  }
  return 'EN CURSO';
};

const puedeModificarViaje = (viaje) => {
  return !viaje.cerrado_en; 
};

// --- NUEVA FUNCIONALIDAD: Lógica de filtros mejorada ---
const filteredViajes = computed(() => {
  let filtered = viajes.value;

  const showEnCurso = filterEnCurso.value;
  const showCerradas = filterCerradas.value;

  if (showEnCurso && showCerradas) {
    // No hacer nada, mostrar ambos
  } else if (showEnCurso) {
    filtered = filtered.filter(v => !v.cerrado_en);
  } else if (showCerradas) {
    filtered = filtered.filter(v => !!v.cerrado_en);
  } else {
    // Si ninguno está seleccionado, no mostrar rendiciones de estado.
    filtered = [];
  }

  if (filterSaldoNegativo.value) {
    filtered = filtered.filter(v => v.saldo_adelanto_viaje < 0);
  }
  if (filterSinGastos.value) {
    filtered = filtered.filter(v => v.total_gastado_bruto === 0);
  }

  return filtered;
});


// --- NUEVA FUNCIONALIDAD: Chequeos de estado visual ---
const getEstadoAdicional = (viaje) => {
  const alerts = [];
  if (viaje.total_gastado_bruto === 0 && !viaje.cerrado_en) {
    alerts.push({ text: 'Sin gastos cargados', class: 'badge-warning' });
  }
  if (viaje.saldo_adelanto_viaje < 0) {
    alerts.push({ text: `Saldo Negativo: ${formatCurrency(Math.abs(viaje.saldo_adelanto_viaje))}`, class: 'badge-danger' });
  }
  
  const today = new Date();
  const endDate = viaje.fecha_fin ? new Date(viaje.fecha_fin) : null; 

  if (endDate && !isNaN(endDate.getTime())) {
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (!viaje.cerrado_en && diffDays >= 0 && diffDays <= 7) { 
        alerts.push({ text: `Vence en ${diffDays} día(s)`, class: 'badge-info' });
      } else if (!viaje.cerrado_en && diffDays < 0) {
         alerts.push({ text: `Vencido`, class: 'badge-danger' });
      }
  }

  return alerts;
};


// --- Funciones de Carga de Datos ---
const fetchViajesConGastos = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Usuario no autenticado para fetchViajesConGastos.");
    }

    const { data: viajesData, error: viajesError } = await supabase
      .from('viajes')
      .select('id, user_id, nombre_viaje, destino, fecha_inicio, fecha_fin, monto_adelanto, codigo_rendicion, cerrado_en, observacion_cierre, estado_aprobacion, comentarios_aprobacion') 
      .eq('user_id', user.id)
      .order('cerrado_en', { ascending: true, nullsFirst: true })
      .order('fecha_inicio', { ascending: false });

    if (viajesError) throw viajesError;

    if (!viajesData || viajesData.length === 0) {
      viajes.value = [];
    } else {
      const viajesConInfoDeGastos = await Promise.all(
        viajesData.map(async (viaje) => {
          const { data: gastosRelacionados, error: gastosError } = await supabase
            .from('gastos')
            .select('monto_total, adelanto_especifico_aplicado')
            .eq('viaje_id', viaje.id)
            .eq('user_id', user.id);

          if (gastosError) {
            console.error(`Error obteniendo gastos para el viaje ID ${viaje.id}:`, gastosError.message);
            return { ...viaje, total_gastado_bruto: 0, saldo_adelanto_viaje: viaje.monto_adelanto || 0 };
          }

          let totalGastadoBruto = 0;
          let totalImpactoEnAdelanto = 0;

          if (gastosRelacionados) {
            gastosRelacionados.forEach(gasto => {
              const costoReal = gasto.monto_total || 0;
              const adelantoAplicado = gasto.adelanto_especifico_aplicado || 0;
              totalGastadoBruto += costoReal;
              totalImpactoEnAdelanto += (costoReal - adelantoAplicado);
            });
          }
          
          const saldoAdelanto = (viaje.monto_adelanto || 0) - totalImpactoEnAdelanto;

          return { 
            ...viaje, 
            total_gastado_bruto: totalGastadoBruto, 
            saldo_adelanto_viaje: saldoAdelanto 
          };
        })
      );
      viajes.value = viajesConInfoDeGastos;
    }
  } catch (error) {
    errorMessage.value = `No se pudieron cargar los viajes/períodos: ${error.message || 'Error desconocido.'}`;
    viajes.value = [];
  } finally {
    loading.value = false;
  }
};

// --- MODIFICACIÓN: Función de reporte corregida ---
async function generarReporteParaViaje(viajeId) {
  if (loadingReporteId.value) return; 
  loadingReporteId.value = viajeId;
  errorMessage.value = ''; 

  try {
    await generateCanvaStylePDF(viajeId);
  } catch (error) {
    console.error('Error al generar el reporte PDF:', error.message);
    errorMessage.value = `No se pudo generar el reporte: ${error.message}`;
  } finally {
    loadingReporteId.value = null; 
  }
}

// --- NUEVA FUNCIONALIDAD: Lógica para la Vista Previa ---
async function openPreviewModal(viajeId) {
  showPreviewModal.value = true;
  loadingPreview.value = true;
  previewError.value = '';
  previewData.value = null;

  try {
    previewData.value = await getReportData(viajeId);
  } catch (e) {
    previewError.value = e.message;
  } finally {
    loadingPreview.value = false;
  }
}

function closePreviewModal() {
  showPreviewModal.value = false;
  previewData.value = null;
}

// --- NUEVA FUNCIONALIDAD: Acciones masivas ---
const toggleViajeSelection = (viajeId) => {
  if (selectedViajes.value.has(viajeId)) {
    selectedViajes.value.delete(viajeId);
  } else {
    selectedViajes.value.add(viajeId);
  }
};

const allViajesSelected = computed(() => {
  if (filteredViajes.value.length === 0) return false;
  return filteredViajes.value.every(viaje => selectedViajes.value.has(viaje.id));
});

const toggleSelectAll = () => {
  if (allViajesSelected.value) {
    selectedViajes.value.clear();
  } else {
    filteredViajes.value.forEach(viaje => selectedViajes.value.add(viaje.id));
  }
};

const handleBulkAction = async (actionType) => {
  if (selectedViajes.value.size === 0) {
    alert("No hay rendiciones seleccionadas.");
    return;
  }
  
  loadingBulkAction.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  const idsToProcess = Array.from(selectedViajes.value);
  let successCount = 0;
  let failCount = 0;
  let operationMessage = '';

  try {
    switch (actionType) {
      case 'delete':
        operationMessage = 'eliminadas';
        if (!confirm(`¿Estás seguro de que quieres eliminar ${idsToProcess.length} rendiciones seleccionadas? Esta acción eliminará también los gastos asociados.`)) {
          loadingBulkAction.value = false;
          return;
        }
        for (const id of idsToProcess) {
          try {
            const viaje = viajes.value.find(v => v.id === id);
            if (!viaje || !puedeModificarViaje(viaje)) {
              failCount++;
              continue;
            }
            const { error } = await supabase.from('viajes').delete().eq('id', id);
            if (error) throw error;
            successCount++;
          } catch (e) { failCount++; }
        }
        break;
      case 'export_pdf':
        operationMessage = 'exportadas a PDF';
        for (const id of idsToProcess) {
          try {
            await generateCanvaStylePDF(id); 
            successCount++;
          } catch (e) { failCount++; }
        }
        break;
      case 'close':
        operationMessage = 'cerradas';
        if (!confirm(`¿Estás seguro de que quieres cerrar ${idsToProcess.length} rendiciones seleccionadas?`)) {
          loadingBulkAction.value = false;
          return;
        }
        for (const id of idsToProcess) {
          try {
             const viaje = viajes.value.find(v => v.id === id);
             if (!viaje || !puedeModificarViaje(viaje)) {
                failCount++;
                continue;
            }
            const fechaActualISO = new Date().toISOString();
            const { error } = await supabase.from('viajes').update({ cerrado_en: fechaActualISO, fecha_fin: fechaActualISO.split('T')[0], estado_aprobacion: 'pendiente_aprobacion' }).eq('id', id);
            if (error) throw error;
            successCount++;
          } catch (e) { failCount++; }
        }
        break;
      case 'reopen':
        if (userProfile.value?.rol !== 'admin') {
            errorMessage.value = "Permiso denegado.";
            loadingBulkAction.value = false;
            return;
        }
        operationMessage = 'reabiertas';
        if (!confirm(`¿Estás seguro de que quieres reabrir ${idsToProcess.length} rendiciones?`)) {
          loadingBulkAction.value = false;
          return;
        }
        for (const id of idsToProcess) {
          try {
            const viaje = viajes.value.find(v => v.id === id);
            if (!viaje || !viaje.cerrado_en) { 
                failCount++;
                continue;
            }
            const { error } = await supabase.from('viajes').update({ cerrado_en: null, estado_aprobacion: null, comentarios_aprobacion: null }).eq('id', id);
            if (error) throw error;
            successCount++;
          } catch (e) { failCount++; }
        }
        break;
    }

    if (successCount > 0) successMessage.value = `${successCount} rendiciones ${operationMessage} con éxito.`;
    if (failCount > 0) errorMessage.value = `${failCount} rendiciones no pudieron ser procesadas.`;
    
    selectedViajes.value.clear(); 
    await fetchViajesConGastos(); 
  } catch (e) {
    errorMessage.value = `Error en la acción masiva: ${e.message}`;
  } finally {
    loadingBulkAction.value = false;
    showBulkActionsMenu.value = false; 
    setTimeout(() => { successMessage.value = ''; errorMessage.value = ''; }, 6000);
  }
};


// --- Hooks de Ciclo de Vida ---
onMounted(() => {
  fetchViajesConGastos();
});

// --- NUEVA FUNCIONALIDAD: Watchers para filtros ---
watch([filterEnCurso, filterCerradas, filterSaldoNegativo, filterSinGastos], () => {
  selectedViajes.value.clear(); 
});


// --- Funciones de Interacción y Navegación ---
const goToNuevoViaje = () => {
  router.push({ name: 'ViajeCreate' });
};

const verGastosDelViaje = (viaje) => {
  router.push({ name: 'GastosListUser', query: { viajeId: viaje.id, viajeNombre: viaje.nombre_viaje } });
};

const editarViaje = (viaje) => {
  if (!puedeModificarViaje(viaje)) return;
  router.push({ name: 'ViajeEdit', params: { id: viaje.id } });
};

const eliminarViaje = async (viaje) => {
  if (!puedeModificarViaje(viaje)) return;

  const { count } = await supabase.from('gastos').select('*', { count: 'exact', head: true }).eq('viaje_id', viaje.id);
  const msg = count > 0
    ? `¿Estás seguro de eliminar la rendición #${viaje.codigo_rendicion}? Se eliminarán también los ${count} gastos asociados.`
    : `¿Estás seguro de eliminar la rendición #${viaje.codigo_rendicion}?`;

  if (!confirm(msg)) return;

  loading.value = true;
  try {
    const { error } = await supabase.from('viajes').delete().eq('id', viaje.id);
    if (error) throw error;
    
    viajes.value = viajes.value.filter(v => v.id !== viaje.id); 
    successMessage.value = `Rendición #${viaje.codigo_rendicion} eliminada.`;
    setTimeout(() => { successMessage.value = ''; }, 4000);
  } catch (error) {
    errorMessage.value = 'Error al eliminar: ' + error.message;
  } finally {
    loading.value = false;
  }
};

// --- Lógica para Cierre de Rendición ---
const abrirModalCierreRendicion = (viaje) => {
  if (!puedeModificarViaje(viaje)) return;
  viajeACerrar.value = { ...viaje };
  observacionCierreInput.value = '';
  errorMessage.value = '';
  successMessage.value = '';
  mostrarModalCierre.value = true;
};

const cancelarCierre = () => {
  mostrarModalCierre.value = false;
  viajeACerrar.value = null;
};

const confirmarCierreRendicion = async () => {
  if (!viajeACerrar.value) return;

  loadingCierre.value = true;
  errorMessage.value = '';
  try {
    const fechaActualISO = new Date().toISOString();
    const updates = {
      cerrado_en: fechaActualISO,
      fecha_fin: fechaActualISO.split('T')[0],
      observacion_cierre: observacionCierreInput.value.trim() || null,
      estado_aprobacion: 'pendiente_aprobacion', 
      comentarios_aprobacion: null 
    };

    const { data: updatedViaje, error } = await supabase
      .from('viajes')
      .update(updates)
      .eq('id', viajeACerrar.value.id)
      .select()
      .single();

    if (error) throw error;

    await fetchViajesConGastos();
    
    successMessage.value = `¡Rendición #${updatedViaje.codigo_rendicion} cerrada exitosamente!`;
    mostrarModalCierre.value = false;
  } catch (error) {
    errorMessage.value = "Error al cerrar: " + error.message;
  } finally {
    loadingCierre.value = false;
  }
};
</script>
--- START OF FILE src/views/ViajesListView.vue (template ONLY) ---
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-text-primary tracking-tight">Mis Rendiciones</h1>
      <button
        @click="goToNuevoViaje"
        class="w-full sm:w-auto bg-districorr-accent text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-opacity-85 transition duration-150 ease-in-out shadow-md hover:shadow-lg flex items-center justify-center transform hover:scale-103"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Nueva Rendición
      </button>
    </div>

    <!-- Mensajes de feedback Globales -->
    <div v-if="successMessage" class="mb-6 p-3.5 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-md text-sm shadow-md">
      <p class="font-medium">¡Éxito!</p>
      <p>{{ successMessage }}</p>
    </div>
    <div v-if="errorMessage && !loadingCierre && !loadingBulkAction" class="mb-6 p-3.5 bg-red-100 border-l-4 border-red-600 text-red-700 rounded-md text-sm shadow-md">
       <p class="font-medium">Error:</p>
      <p class="whitespace-pre-line">{{ errorMessage }}</p>
    </div>

    <!-- Controles de filtro -->
    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
      <span class="text-sm font-medium text-gray-700 mr-2">Filtrar por estado:</span>
      <div class="flex items-center">
        <input id="filter-en-curso" type="checkbox" v-model="filterEnCurso" class="checkbox-custom">
        <label for="filter-en-curso" class="ml-2 text-sm text-gray-900 cursor-pointer">En curso</label>
      </div>
      <div class="flex items-center">
        <input id="filter-cerradas" type="checkbox" v-model="filterCerradas" class="checkbox-custom">
        <label for="filter-cerradas" class="ml-2 text-sm text-gray-900 cursor-pointer">Cerradas</label>
      </div>
      <div class="flex items-center">
        <input id="filter-saldo-negativo" type="checkbox" v-model="filterSaldoNegativo" class="checkbox-custom">
        <label for="filter-saldo-negativo" class="ml-2 text-sm text-gray-900 cursor-pointer">Con saldo negativo</label>
      </div>
      <div class="flex items-center">
        <input id="filter-sin-gastos" type="checkbox" v-model="filterSinGastos" class="checkbox-custom">
        <label for="filter-sin-gastos" class="ml-2 text-sm text-gray-900 cursor-pointer">Sin gastos cargados</label>
      </div>
    </div>


    <!-- Indicador de Carga Principal -->
    <div v-if="loading && viajes.length === 0" class="text-center py-16">
      <svg class="animate-spin h-12 w-12 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
         <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
         <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
       </svg>
      <p class="text-lg text-gray-600 mt-4">Cargando rendiciones...</p>
    </div>
    
    <!-- Mensaje si no hay viajes filtrados -->
    <div v-else-if="!loading && filteredViajes.length === 0 && !errorMessage" class="bg-white p-10 rounded-xl shadow-lg text-center border border-gray-200">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-20 h-20 mx-auto text-gray-300 mb-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.375 3.083a2.5 2.5 0 013.25 0l7.167 6.45a2.5 2.5 0 010 3.934l-7.167 6.45a2.5 2.5 0 01-3.25 0V3.083zM4.5 3.083v17.834m0-17.834h1.917m-1.917 17.834h1.917M8.25 8.25h7.5M8.25 12h5.25M8.25 15.75h3" />
      </svg>
      <p class="text-gray-700 text-xl font-semibold">No hay Rendiciones Registradas o no coinciden con los filtros</p>
      <p class="mt-2 text-sm text-gray-500">Comienza creando una nueva rendición para organizar tus gastos o ajusta los filtros.</p>
      <button v-if="viajes.length === 0" @click="goToNuevoViaje" class="mt-6 bg-districorr-accent text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-opacity-85 shadow-md hover:shadow-lg transition-all">
         Crear Primera Rendición
       </button>
    </div>

    <div v-else>
      <!-- Acciones masivas -->
      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <input type="checkbox" id="select-all-viajes" :checked="allViajesSelected && filteredViajes.length > 0" @change="toggleSelectAll" class="checkbox-custom">
          <label for="select-all-viajes" class="text-sm font-medium text-gray-700">Seleccionar todas ({{ selectedViajes.size }})</label>
        </div>

        <div class="relative" v-if="selectedViajes.size > 0">
          <button @click="showBulkActionsMenu = !showBulkActionsMenu" class="btn-secondary flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3V15a1.5 1.5 0 01-1.5 1.5H3.75A1.5 1.5 0 012.25 15V3.75m18 9.75V3.75m0 9.75a1.5 1.5 0 010 3m0-3V15a1.5 1.5 0 01-1.5 1.5H19.5a1.5 1.5 0 01-1.5-1.5V3.75m-6 9.75V3.75m0 9.75a1.5 1.5 0 010 3m0-3V15a1.5 1.5 0 01-1.5 1.5H13.5a1.5 1.5 0 01-1.5-1.5V3.75" /></svg>
            Acciones Masivas
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 ml-1"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.23 8.29a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
          </button>
          <transition name="fade">
            <div v-if="showBulkActionsMenu" @click.away="showBulkActionsMenu = false" class="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-30">
              <div class="py-1">
                <button @click="handleBulkAction('close')" :disabled="loadingBulkAction" class="bulk-action-item">Cerrar seleccionadas</button>
                <button @click="handleBulkAction('export_pdf')" :disabled="loadingBulkAction" class="bulk-action-item">Exportar a PDF</button>
                <button v-if="userProfile?.rol === 'admin'" @click="handleBulkAction('reopen')" :disabled="loadingBulkAction" class="bulk-action-item text-indigo-600">Reabrir seleccionadas</button>
                <hr class="my-1 border-gray-100">
                <button @click="handleBulkAction('delete')" :disabled="loadingBulkAction" class="bulk-action-item text-red-600">Eliminar seleccionadas</button>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <!-- Lista de Viajes -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <div v-for="viaje in filteredViajes" :key="viaje.id" 
             class="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col justify-between hover:shadow-2xl transition-all duration-300 ease-in-out border-t-4"
             :class="viaje.cerrado_en ? 'border-red-400' : 'border-green-400'">
          <div class="p-5 flex-grow">
            <div class="flex justify-between items-start mb-2">
              <div class="flex items-center h-5 mr-3 mt-1">
                  <input type="checkbox" :id="`select-viaje-${viaje.id}`" :checked="selectedViajes.has(viaje.id)" @change="toggleViajeSelection(viaje.id)" class="checkbox-custom">
              </div>
              <h2 class="text-base sm:text-lg font-semibold text-districorr-text-primary truncate flex-1 mr-2 leading-tight" :title="viaje.nombre_viaje">{{ viaje.nombre_viaje }}</h2>
              <span v-if="viaje.codigo_rendicion" class="text-xs font-mono bg-gray-200 text-gray-800 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap shadow-sm">ID: #{{ viaje.codigo_rendicion }}</span>
            </div>
            <p class="text-xs font-bold mb-3 uppercase tracking-wider flex items-center" :class="viaje.cerrado_en ? 'text-red-600' : 'text-green-600'">
              <svg v-if="viaje.cerrado_en" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" /></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v3H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2.5a2.5 2.5 0 00-2.5 2.5V9h5V7a2.5 2.5 0 00-2.5-2.5z" /></svg>
              {{ getEstadoViajeTexto(viaje) }}
              <span v-if="viaje.estado_aprobacion === 'pendiente_aprobacion'" class="ml-2 status-badge badge-blue">Pendiente Aprob.</span>
              <span v-else-if="viaje.estado_aprobacion === 'aprobado'" class="ml-2 status-badge badge-green">Aprobado</span>
              <span v-else-if="viaje.estado_aprobacion === 'rechazado'" class="ml-2 status-badge badge-red">Rechazado</span>
            </p>
            <div class="text-sm text-gray-700 space-y-1">
              <p><span class="font-medium text-gray-500">Destino/Área:</span> {{ viaje.destino || 'No especificado' }}</p>
              <p><span class="font-medium text-gray-500">Inicio:</span> {{ formatDate(viaje.fecha_inicio) }}</p>
              <p><span class="font-medium text-gray-500">Fin:</span> {{ formatDate(viaje.fecha_fin) }}</p>
            </div>
            <div class="mt-4 pt-4 border-t border-gray-200">
              <p class="text-sm text-gray-700"><span class="font-medium text-gray-500">Adelanto:</span> <span class="font-semibold">{{ formatCurrency(viaje.monto_adelanto) }}</span></p>
              <p class="text-xs text-gray-500 mt-1">Gastos (Bruto): {{ formatCurrency(viaje.total_gastado_bruto) }}</p>
              <p class="text-base mt-2 font-semibold" :class="viaje.saldo_adelanto_viaje >= 0 ? 'text-green-600' : 'text-red-600'">
                <span class="font-medium">Saldo del Viaje:</span> {{ formatCurrency(viaje.saldo_adelanto_viaje) }}
              </p>
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              <span v-for="(alert, index) in getEstadoAdicional(viaje)" :key="index" :class="['status-badge', alert.class]">
                {{ alert.text }}
              </span>
            </div>
          </div>
          <div class="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-wrap gap-2 justify-end items-center" :class="{'bg-gray-200/70': viaje.cerrado_en}">
            
            <button @click="openPreviewModal(viaje.id)" :disabled="loadingReporteId === viaje.id || viaje.total_gastado_bruto === 0" class="btn-admin-action-xs bg-indigo-500 hover:bg-indigo-600 text-white" title="Vista Previa del Reporte">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.18l.877-.571a1.651 1.651 0 012.305-.223l.547.547a1.651 1.651 0 010 2.332l-.547.547a1.651 1.651 0 01-2.305-.223l-.877-.571zM10 17a1.651 1.651 0 01-1.651-1.651v-.877a1.651 1.651 0 01.223-2.305l.547-.547a1.651 1.651 0 012.332 0l.547.547a1.651 1.651 0 01.223 2.305v.877A1.651 1.651 0 0110 17zM15.349 10.59a1.651 1.651 0 010-1.18l-.877-.571a1.651 1.651 0 00-2.305-.223l-.547.547a1.651 1.651 0 000 2.332l.547.547a1.651 1.651 0 002.305-.223l.877-.571zM10 3a1.651 1.651 0 011.651 1.651v.877a1.651 1.651 0 01-.223 2.305l-.547.547a1.651 1.651 0 01-2.332 0l-.547-.547a1.651 1.651 0 01-.223-2.305V4.651A1.651 1.651 0 0110 3z" clip-rule="evenodd" /></svg>
            </button>

            <button @click="generarReporteParaViaje(viaje.id)" :disabled="loadingReporteId === viaje.id || viaje.total_gastado_bruto === 0" class="btn-admin-action-xs bg-gray-600 hover:bg-gray-700 text-white" title="Imprimir Rendición en PDF">
              <svg v-if="loadingReporteId === viaje.id" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" /></svg>
            </button>
            
            <button @click="verGastosDelViaje(viaje)" class="btn-admin-action-xs btn-blue">Gastos</button>
            
            <button v-if="puedeModificarViaje(viaje)" @click="editarViaje(viaje)" class="btn-admin-action-xs btn-yellow">Editar</button>
            <button v-if="puedeModificarViaje(viaje)" @click="abrirModalCierreRendicion(viaje)" class="btn-admin-action-xs btn-orange">Cerrar</button>
            <button v-if="puedeModificarViaje(viaje)" @click="eliminarViaje(viaje)" class="btn-admin-action-xs btn-danger">Eliminar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal para Vista Previa del Reporte -->
    <div v-if="showPreviewModal" class="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex justify-center items-start p-4 overflow-y-auto">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl my-8 transform transition-all">
        <div class="sticky top-0 bg-gray-100 px-6 py-4 border-b border-gray-200 flex justify-between items-center z-10">
          <h3 class="text-xl font-semibold text-gray-800">Vista Previa del Reporte</h3>
          <button @click="closePreviewModal" class="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="p-6">
          <div v-if="loadingPreview" class="text-center py-20">
            <p>Cargando datos de la vista previa...</p>
          </div>
          <div v-else-if="previewError" class="text-center py-20 text-red-600">
            <p>Error al cargar la vista previa: {{ previewError }}</p>
          </div>
          <div v-else-if="previewData">
            <!-- Asumiendo que `previewData` tiene la estructura { grupos: [], estadisticas: { por_tipo: [] }, resumen_financiero: {} } -->
            <h4 class="text-lg font-bold mb-4">Tabla de Gastos</h4>
            <ReporteRendicion :tabla_gastos="previewData.grupos.flatMap(g => g.gastos.map(gasto => ({...gasto, grupo: g.group_name, descripcion: gasto.descripcion || 'Sin descripción'})))" />
            <h4 class="text-lg font-bold mt-8 mb-4">Resumen por Tipo de Gasto</h4>
            <ReporteRendicion :tabla_tipos="previewData.estadisticas.por_tipo" />
            <h4 class="text-lg font-bold mt-8 mb-4">Resumen por Provincia</h4>
            <ReporteRendicion :tabla_provincias="previewData.estadisticas.por_provincia" />
            <h4 class="text-lg font-bold mt-8 mb-4">Resumen Financiero</h4>
            <ReporteRendicion :resumen_financiero="previewData.resumen_financiero" />
          </div>
        </div>
      </div>
    </div>

    <!-- Modal para Cierre de Rendición (sin cambios) -->
    <div v-if="mostrarModalCierre" class="fixed inset-0 bg-gray-800 bg-opacity-75 backdrop-blur-sm overflow-y-auto h-full w-full flex items-center justify-center z-[100] p-4" @click.self="cancelarCierre">
      <div class="relative w-full max-w-lg bg-white rounded-xl shadow-2xl transform transition-all sm:my-8">
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 rounded-t-xl">
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">Cerrar Rendición #{{ viajeACerrar?.codigo_rendicion }}</h3>
              <div class="mt-2"><p class="text-sm text-gray-500">Vas a cerrar el período de rendición para: <strong>{{ viajeACerrar?.nombre_viaje }}</strong>. La fecha de cierre se establecerá al día de hoy. <strong class="text-red-600">Esta acción no se puede deshacer.</strong></p></div>
            </div>
          </div>
        </div>
        <form @submit.prevent="confirmarCierreRendicion" class="px-4 py-3 sm:px-6 space-y-3">
          <div>
            <label for="observacionCierreModal" class="block text-sm font-medium text-gray-700">Observación de Cierre <span class="text-gray-400 text-xs">(Opcional)</span></label>
            <textarea id="observacionCierreModal" v-model="observacionCierreInput" rows="3" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-districorr-accent focus:ring focus:ring-districorr-accent focus:ring-opacity-50 sm:text-sm p-2" placeholder="Notas adicionales sobre el cierre..."></textarea>
          </div>
          <div v-if="errorMessage && mostrarModalCierre" class="my-2 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs">{{ errorMessage }}</div>
          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-xl -mx-4 -mb-4 sm:-mx-6 sm:-mb-4">
            <button type="submit" :disabled="loadingCierre" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50">
              <svg v-if="loadingCierre" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span v-if="loadingCierre">Cerrando...</span>
              <span v-else>Confirmar y Cerrar</span>
            </button>
            <button type="button" @click="cancelarCierre" :disabled="loadingCierre" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Colores de la marca Districorr */
.text-districorr-text-primary { color: #34495e; /* Un gris oscuro */ }
.bg-districorr-accent { background-color: #3b82f6; /* Un azul vibrante */ }
.hover\:bg-opacity-85:hover { background-color: rgba(59, 130, 246, 0.85); }
.focus\:ring-districorr-accent:focus { ring-color: #3b82f6; }

/* Estilos comunes para botones de acción en tarjetas */
.btn-admin-action-xs {
  @apply px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ease-in-out whitespace-nowrap;
  flex-shrink: 0; /* Evita que los botones se encojan */
}

.btn-admin-action-xs.btn-blue { @apply bg-blue-500 text-white hover:bg-blue-600; }
.btn-admin-action-xs.btn-yellow { @apply bg-yellow-500 text-gray-900 hover:bg-yellow-600; }
.btn-admin-action-xs.btn-orange { @apply bg-orange-500 text-white hover:bg-orange-600; }
.btn-admin-action-xs.btn-danger { @apply bg-red-500 text-white hover:bg-red-600; }

/* Transiciones para elementos que aparecen/desaparecen */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* NUEVA FUNCIONALIDAD: Estilos para checkboxes personalizados */
.checkbox-custom {
  @apply h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500;
}

/* NUEVA FUNCIONALIDAD: Estilos para badges de estado visual */
.status-badge {
  @apply px-2.5 py-0.5 rounded-full text-xs font-semibold;
  white-space: nowrap; /* Evita que el texto se rompa */
}
.badge-blue { @apply bg-blue-100 text-blue-800; }
.badge-green { @apply bg-green-100 text-green-800; }
.badge-red { @apply bg-red-100 text-red-800; }
.badge-warning { @apply bg-yellow-100 text-yellow-800; }
.badge-info { @apply bg-purple-100 text-purple-800; } /* Nuevo color para 'Próximo a vencer' */

/* Estilos para acciones masivas (Botones genéricos) */
.btn-secondary {
  @apply inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50;
}

.bulk-action-item {
  @apply block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed;
}

</style>