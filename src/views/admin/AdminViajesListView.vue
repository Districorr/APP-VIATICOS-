<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js'; 
import { useRouter } from 'vue-router'; 
import { formatDate, formatCurrency } from '../../utils/formatters.js'; 
import { useReportGenerator } from '../../composables/useReportGenerator.js'; 

console.log("AdminViajesListView.vue: Script setup INICIADO");

const router = useRouter();

const {
  generateAdminReporteConsolidadoPDF,
  generateAdminReporteConsolidadoExcel,
} = useReportGenerator();
console.log("AdminViajesListView: Funciones de useReportGenerator desestructuradas.");

// --- Refs para la lista de Viajes y su estado de carga ---
const todosLosViajes = ref([]);
const loadingViajes = ref(true); 
const errorViajes = ref('');   

// --- Refs para los Gastos destinados a los reportes globales y su estado de carga ---
const gastosParaReporteAdmin = ref([]);
const loadingGastosParaReporte = ref(true);
const errorGastosParaReporte = ref(''); 

// --- Modelos para Filtros de la lista de Viajes ---
const filtroResponsableIdAdmin = ref('');
const filtroEstadoViajeAdmin = ref('');
const filtroFechaDesdeViajes = ref(''); 
const filtroFechaHastaViajes = ref(''); 
const filtroNombreViajeAdmin = ref('');

// --- Opciones para Selectores de Filtro de Viajes ---
const listaUsuariosParaFiltroAdmin = ref([]);
const opcionesEstadoViajeAdmin = ref([
  { valor: '', etiqueta: 'Todos los Estados' },
  { valor: 'en_curso', etiqueta: 'En Curso (Abiertos)' },
  { valor: 'cerrado', etiqueta: 'Cerrados' },
]);

// --- Refs para el Modal de Revisión ---
const mostrarModalRevision = ref(false);
const viajeARevisar = ref(null);
const comentariosAdminInput = ref('');
const loadingRevision = ref(false);
const errorRevision = ref('');

// --- Control de Vista (Tarjetas o Tabla para la lista de Viajes) ---
const vistaActualAdmin = ref('tarjetas'); 

// --- Filtros específicos para los DATOS DE GASTOS para el reporte consolidado ---
const filtroFechaDesdeReporteGastos = ref('');
const filtroFechaHastaReporteGastos = ref('');

// --- Funciones de UI para Viajes ---
const getEstadoViajeTextoAdmin = (viaje) => {
  if (!viaje) return 'ESTADO DESCONOCIDO';
  if (viaje.cerrado_en) {
    return `CERRADO EL ${formatDate(viaje.cerrado_en, {day: '2-digit', month: 'short', year: 'numeric', hour:'2-digit', minute:'2-digit' })}`;
  }
  return 'EN CURSO';
};

const esViajeAbierto = (viaje) => {
  return viaje && !viaje.cerrado_en;
};

// --- Carga de Datos para Selectores de Filtro de Viajes ---
async function fetchAdminDropdownData() {
  console.log("%cAdminViajesListView: fetchAdminDropdownData INICIO", "color: teal;");
  try {
    const { data: usuariosData, error: usuariosError } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, email')
      .order('nombre_completo');

    if (usuariosError) throw usuariosError;

    if (usuariosData) {
      listaUsuariosParaFiltroAdmin.value = usuariosData.map(u => ({
        id: u.id,
        display_name: u.nombre_completo || u.email || `ID: ${u.id.substring(0,8)}`
      })).sort((a, b) => a.display_name.localeCompare(b.display_name));
       console.log("AdminViajesListView: Lista de usuarios para filtro cargada:", listaUsuariosParaFiltroAdmin.value.length, "usuarios.");
    } else {
      listaUsuariosParaFiltroAdmin.value = [];
      console.log("AdminViajesListView: No se encontraron usuarios para el filtro.");
    }
  } catch (error) {
    console.error("AdminViajesListView: Error en fetchAdminDropdownData (usuarios):", error.message, error);
  } finally {
    console.log("%cAdminViajesListView: fetchAdminDropdownData FIN", "color: teal;");
  }
}

// --- Carga de Datos para Reportes Globales de Gastos ---
async function fetchGastosParaReporteAdmin() {
  console.log("%cAdminViajesListView: Iniciando fetchGastosParaReporteAdmin con filtros de fecha:", "color: dodgerblue;", 
              filtroFechaDesdeReporteGastos.value || 'N/A', "a", filtroFechaHastaReporteGastos.value || 'N/A');
  loadingGastosParaReporte.value = true;
  errorGastosParaReporte.value = '';
  try {
    let query = supabase.from('admin_gastos_completos').select('*'); 

    if (filtroFechaDesdeReporteGastos.value) {
        query = query.gte('fecha_gasto', filtroFechaDesdeReporteGastos.value);
    }
    if (filtroFechaHastaReporteGastos.value) {
        const fechaHastaObj = new Date(filtroFechaHastaReporteGastos.value);
        fechaHastaObj.setUTCDate(fechaHastaObj.getUTCDate() + 1); 
        query = query.lt('fecha_gasto', fechaHastaObj.toISOString().split('T')[0]);
    }
    query = query.order('fecha_gasto', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    gastosParaReporteAdmin.value = data || [];
    console.log("AdminViajesListView: Gastos para reporte cargados:", gastosParaReporteAdmin.value.length, "gastos.");
    if (data) errorGastosParaReporte.value = ''; 

  } catch (error) {
    console.error('AdminViajesListView: Error en fetchGastosParaReporteAdmin:', error.message, error);
    errorGastosParaReporte.value = `Error al cargar datos para reportes: ${error.message}`;
    gastosParaReporteAdmin.value = [];
  } finally {
    loadingGastosParaReporte.value = false;
    console.log("%cAdminViajesListView: fetchGastosParaReporteAdmin FIN", "color: dodgerblue;");
  }
}

// --- Carga Principal de Datos para la Lista de Viajes ---
async function fetchTodosLosViajesConInfo() {
  const filtrosActuales = {
    responsable: filtroResponsableIdAdmin.value,
    estado: filtroEstadoViajeAdmin.value,
    fechaDesde: filtroFechaDesdeViajes.value,
    fechaHasta: filtroFechaHastaViajes.value,
    nombre: filtroNombreViajeAdmin.value
  };
  console.log("%cAdminViajesListView: Iniciando fetchTodosLosViajesConInfo con filtros:", "color: green;", JSON.parse(JSON.stringify(filtrosActuales)));
  
  loadingViajes.value = true;
  errorViajes.value = '';

  try {
    // CORRECCIÓN: Llamamos a la nueva función RPC segura.
    const { data: viajesData, error: vistaError } = await supabase
      .rpc('get_viajes_protegidos');

    if (vistaError) {
        console.error('AdminViajesListView: Error en la llamada RPC a get_viajes_protegidos:', vistaError);
        throw vistaError;
    }
    
    console.log("AdminViajesListView: Datos de viajes CRUDOS obtenidos de la función RPC:", viajesData ? viajesData.length : 0, "viajes.");
    
    // El resto de la lógica (filtrado en cliente y procesamiento) se mantiene,
    // pero ahora opera sobre los datos devueltos por la función RPC.
    let viajesFiltrados = viajesData || [];

    if (filtroResponsableIdAdmin.value) {
      viajesFiltrados = viajesFiltrados.filter(v => v.user_id === filtroResponsableIdAdmin.value);
    }
    if (filtroEstadoViajeAdmin.value === 'en_curso') {
      viajesFiltrados = viajesFiltrados.filter(v => !v.cerrado_en);
    } else if (filtroEstadoViajeAdmin.value === 'cerrado') {
      viajesFiltrados = viajesFiltrados.filter(v => !!v.cerrado_en);
    }
    if (filtroFechaDesdeViajes.value) {
      viajesFiltrados = viajesFiltrados.filter(v => new Date(v.fecha_inicio) >= new Date(filtroFechaDesdeViajes.value));
    }
    if (filtroFechaHastaViajes.value) {
      const fechaHastaObj = new Date(filtroFechaHastaViajes.value);
      fechaHastaObj.setUTCDate(fechaHastaObj.getUTCDate() + 1);
      viajesFiltrados = viajesFiltrados.filter(v => new Date(v.fecha_inicio) < fechaHastaObj);
    }
    if (filtroNombreViajeAdmin.value && filtroNombreViajeAdmin.value.trim() !== '') {
      const searchTerm = filtroNombreViajeAdmin.value.trim().toLowerCase();
      viajesFiltrados = viajesFiltrados.filter(v => v.nombre_viaje.toLowerCase().includes(searchTerm));
    }

    viajesFiltrados.sort((a, b) => {
      if (a.cerrado_en === null && b.cerrado_en !== null) return -1;
      if (a.cerrado_en !== null && b.cerrado_en === null) return 1;
      return new Date(b.fecha_inicio) - new Date(a.fecha_inicio);
    });

    if (viajesFiltrados.length === 0) {
      todosLosViajes.value = [];
    } else {
      // El resto del procesamiento para calcular totales sigue igual...
      todosLosViajes.value = await Promise.all(viajesFiltrados.map(async (viaje) => {
        const { data: gastosDelViaje, error: gastosError } = await supabase
          .from('gastos') 
          .select('monto_total, adelanto_especifico_aplicado')
          .eq('viaje_id', viaje.id);

        let totalGastadoBrutoViaje = 0;
        let impactoNetoEnAdelantoPrincipal = 0;

        if (gastosDelViaje && !gastosError) {
          gastosDelViaje.forEach(g => {
            const montoGasto = parseFloat(g.monto_total) || 0;
            const adelantoGasto = parseFloat(g.adelanto_especifico_aplicado) || 0;
            totalGastadoBrutoViaje += montoGasto;
            impactoNetoEnAdelantoPrincipal += (montoGasto - adelantoGasto);
          });
        }
        
        const adelantoPrincipalViaje = parseFloat(viaje.monto_adelanto) || 0;
        const saldoCalculado = adelantoPrincipalViaje - impactoNetoEnAdelantoPrincipal;
        
        return {
          ...viaje,
          moneda: 'ARS',
          total_gastado_bruto_viaje: totalGastadoBrutoViaje,
          saldo_adelanto_viaje: saldoCalculado
        };
      }));
    }
    
    if (todosLosViajes.value.length > 0 || !errorViajes.value) errorViajes.value = ''; 
  } catch (error) {
    console.error('AdminViajesListView: Error en fetchTodosLosViajesConInfo:', error.message, error);
    errorViajes.value = `No se pudieron cargar los datos de viajes: ${error.message || 'Error desconocido.'}`;
    todosLosViajes.value = [];
  } finally {
    loadingViajes.value = false;
    console.log("%cAdminViajesListView: fetchTodosLosViajesConInfo FIN", "color: green;");
  }
}
// --- Funciones de UI para Filtros de Viajes ---
const aplicarFiltrosAdmin = () => {
  console.log("AdminViajesListView: Aplicando filtros de viaje y recargando lista de viajes.");
  fetchTodosLosViajesConInfo();
};

const limpiarFiltrosAdmin = () => {
  console.log("AdminViajesListView: Limpiando filtros de viaje y recargando lista de viajes.");
  filtroResponsableIdAdmin.value = '';
  filtroEstadoViajeAdmin.value = '';
  filtroFechaDesdeViajes.value = '';
  filtroFechaHastaViajes.value = '';
  filtroNombreViajeAdmin.value = '';
  fetchTodosLosViajesConInfo();

  console.log("AdminViajesListView: Limpiando también filtros para reportes de gastos.");
  filtroFechaDesdeReporteGastos.value = '';
  filtroFechaHastaReporteGastos.value = '';
  fetchGastosParaReporteAdmin();
};

// --- Lógica para el Flujo de Aprobación ---
const abrirModalParaRevisar = (viaje) => {
  viajeARevisar.value = { ...viaje };
  comentariosAdminInput.value = viaje.comentarios_aprobacion || '';
  errorRevision.value = '';
  mostrarModalRevision.value = true;
};

const cerrarModalRevision = () => {
  mostrarModalRevision.value = false;
  viajeARevisar.value = null;
};

const handleDecisionRendicion = async (nuevoEstado) => {
  if (!viajeARevisar.value) return;
  if (nuevoEstado === 'rechazado' && !comentariosAdminInput.value.trim()) {
    errorRevision.value = 'Es obligatorio añadir un comentario para rechazar la rendición.';
    return;
  }

  loadingRevision.value = true;
  errorRevision.value = '';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Administrador no autenticado.');

    const { error } = await supabase.rpc('aprobar_rechazar_rendicion', {
      p_viaje_id: viajeARevisar.value.id,
      p_nuevo_estado: nuevoEstado,
      p_comentarios: comentariosAdminInput.value,
      p_admin_id: user.id
    });

    if (error) throw error;

    alert(`La rendición #${viajeARevisar.value.codigo_rendicion} ha sido marcada como: ${nuevoEstado}.`);
    cerrarModalRevision();
    fetchTodosLosViajesConInfo(); // Recargar la lista para ver el cambio

  } catch (e) {
    console.error('Error al procesar la decisión de la rendición:', e);
    errorRevision.value = `Error: ${e.message}`;
  } finally {
    loadingRevision.value = false;
  }
};

const estadoAprobacionClass = computed(() => (estado) => {
  switch (estado) {
    case 'aprobado': return 'bg-green-100 text-green-800';
    case 'pendiente_aprobacion': return 'bg-yellow-100 text-yellow-800 animate-pulse';
    case 'rechazado': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
});

// --- Hooks de Ciclo de Vida ---
onMounted(() => {
  console.log("%cAdminViajesListView.vue: Componente MONTADO (onMounted).", "color: red; font-weight: bold;");
  fetchAdminDropdownData();
  fetchTodosLosViajesConInfo(); 
  fetchGastosParaReporteAdmin(); 
});

// --- Funciones de Navegación y Acción para Viajes ---
const verGastosDelViaje = (viaje) => {
  if (!viaje || !viaje.id) {
    console.error("AdminViajesListView: verGastosDelViaje - ID de viaje inválido.");
    return;
  }
  console.log(`AdminViajesListView: Navegando a ver gastos del viaje ID: ${viaje.id}`);
  router.push({ name: 'AdminGastosList', query: { viajeId: viaje.id } });
};

const adminCerrarRendicion = async (viaje) => {
  if (!viaje || !viaje.id) {
    console.error("AdminViajesListView: adminCerrarRendicion - ID de viaje inválido.");
    return;
  }
  if (confirm(`¿Está seguro de cerrar la rendición para el viaje "${viaje.nombre_viaje || viaje.id}"? Esta acción no se puede deshacer.`)) {
    console.log(`AdminViajesListView: Intentando cerrar rendición para viaje ID: ${viaje.id}`);
    try {
      const { error } = await supabase
        .from('viajes') 
        .update({ 
            cerrado_en: new Date().toISOString(), 
            observacion_cierre: viaje.observacion_cierre || `Cerrado por admin el ${new Date().toLocaleString('es-AR')}` 
        })
        .eq('id', viaje.id);
      if (error) throw error;
      alert('Rendición cerrada exitosamente.');
      console.log(`AdminViajesListView: Rendición para viaje ID: ${viaje.id} cerrada.`);
      fetchTodosLosViajesConInfo(); 
    } catch (error) {
      console.error('AdminViajesListView: Error al cerrar la rendición:', error.message, error);
      alert(`Error al cerrar la rendición: ${error.message}`);
    }
  } else {
    console.log("AdminViajesListView: Cierre de rendición cancelado por el usuario.");
  }
};

const adminEditarViaje = (viaje) => {
  console.warn(`AdminViajesListView: FUNCIONALIDAD ADMIN PENDIENTE: Editar viaje #${viaje.codigo_rendicion || viaje.id}.`);
  alert(`FUNCIONALIDAD ADMIN PENDIENTE: Editar viaje #${viaje.codigo_rendicion || viaje.id}.`);
};

// --- MANEJADORES para los reportes CONSOLIDADOS ---
const handleGenerateReporteConsolidadoPDF = () => {
  console.log("AdminViajesListView: Solicitando PDF consolidado. Gastos disponibles:", gastosParaReporteAdmin.value?.length);
  if (!gastosParaReporteAdmin.value || gastosParaReporteAdmin.value.length === 0) {
    alert('No hay datos de gastos cargados (según los filtros de reporte) para generar el PDF consolidado.'); 
    return;
  }
  const filtrosUsadosParaReporte = {
    fechaDesde: filtroFechaDesdeReporteGastos.value || null,
    fechaHasta: filtroFechaHastaReporteGastos.value || null,
  };
  console.log("AdminViajesListView: Filtros para PDF consolidado:", filtrosUsadosParaReporte);
  generateAdminReporteConsolidadoPDF(gastosParaReporteAdmin.value, filtrosUsadosParaReporte, 'Admin_Reporte_Consolidado_Gastos');
};

const handleGenerateReporteConsolidadoExcel = () => {
  console.log("AdminViajesListView: Solicitando Excel consolidado. Gastos disponibles:", gastosParaReporteAdmin.value?.length);
  if (!gastosParaReporteAdmin.value || gastosParaReporteAdmin.value.length === 0) {
    alert('No hay datos de gastos cargados (según los filtros de reporte) para generar el Excel consolidado.'); 
    return;
  }
  const filtrosUsadosParaReporte = {
    fechaDesde: filtroFechaDesdeReporteGastos.value || null,
    fechaHasta: filtroFechaHastaReporteGastos.value || null,
  };
  console.log("AdminViajesListView: Filtros para Excel consolidado:", filtrosUsadosParaReporte);
  generateAdminReporteConsolidadoExcel(gastosParaReporteAdmin.value, filtrosUsadosParaReporte, 'Admin_Reporte_Consolidado_Gastos');
};

console.log("AdminViajesListView.vue: Script setup FINALIZADO");
</script>
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Encabezado y Controles de Vista/Reportes -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary tracking-tight">
        Panel de Admin - Todas las Rendiciones
      </h1>
      <div class="flex items-center gap-3 flex-wrap justify-start sm:justify-end w-full sm:w-auto">
        <!-- Selector de Vista -->
        <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 hidden sm:inline">Ver como:</span>
            <button @click="vistaActualAdmin = 'tarjetas'"
                    :class="[vistaActualAdmin === 'tarjetas' ? 'btn-view-active' : 'btn-view-inactive']"
                    class="p-2 rounded-lg transition-all duration-150" title="Vista de Tarjetas">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button @click="vistaActualAdmin = 'tabla'"
                    :class="[vistaActualAdmin === 'tabla' ? 'btn-view-active' : 'btn-view-inactive']"
                    class="p-2 rounded-lg transition-all duration-150" title="Vista de Tabla">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
            </button>
        </div>

        <!-- Botones de Reportes de Gastos Globales -->
        <div class="relative group">
            <button 
                class="btn-export-main"
                :disabled="loadingGastosParaReporte || gastosParaReporteAdmin.length === 0 || !!errorGastosParaReporte"
                :class="{'opacity-50 cursor-not-allowed': loadingGastosParaReporte || gastosParaReporteAdmin.length === 0 || !!errorGastosParaReporte}"
                aria-haspopup="true"
                aria-expanded="false" 
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                Exportar Reportes Consolidados
            </button>
            <div 
                v-if="!loadingGastosParaReporte && gastosParaReporteAdmin.length > 0 && !errorGastosParaReporte"
                class="absolute right-0 mt-1 w-72 bg-white rounded-md shadow-xl z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto py-1"
                role="menu"
            >
                <p class="px-4 pt-2 pb-1 text-xs text-gray-500 font-semibold">Reporte Unificado Admin:</p>
                <a @click.prevent="handleGenerateReporteConsolidadoPDF" href="#" class="dropdown-item" role="menuitem">Reporte Consolidado (PDF)</a>
                <a @click.prevent="handleGenerateReporteConsolidadoExcel" href="#" class="dropdown-item" role="menuitem">Reporte Consolidado (Excel)</a>
            </div>
        </div>
        <div v-if="loadingGastosParaReporte" class="text-xs text-gray-500 px-3 py-2 animate-pulse">
            Cargando datos para reportes...
        </div>
         <div v-else-if="errorGastosParaReporte" class="text-xs text-red-500 px-3 py-2" :title="errorGastosParaReporte">
            Error al cargar datos para reportes.
        </div>
        <div v-else-if="gastosParaReporteAdmin.length === 0 && !loadingGastosParaReporte" class="text-xs text-gray-400 px-3 py-2">
            No hay gastos para generar reportes (según filtros).
        </div>
      </div>
    </div>

    <!-- Sección de Filtros -->
    <div class="bg-white p-4 sm:p-6 rounded-xl shadow-lg mb-8 border border-gray-200">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Columna para Filtros de Viaje -->
        <div>
          <h3 class="text-xl font-semibold text-districorr-text-dark mb-4 border-b pb-2">Filtrar Lista de Viajes</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-end">
            <div>
              <label for="filtroNombreViajeAdmin" class="form-label">Nombre/Concepto Viaje</label>
              <input type="text" id="filtroNombreViajeAdmin" v-model="filtroNombreViajeAdmin" placeholder="Buscar por nombre..." class="input-form-style">
            </div>
            <div>
              <label for="filtroResponsableIdAdmin" class="form-label">Responsable Viaje</label>
              <select id="filtroResponsableIdAdmin" v-model="filtroResponsableIdAdmin" class="input-form-style select-form-style" :disabled="listaUsuariosParaFiltroAdmin.length === 0 && loadingViajes">
                <option value="">Todos los Responsables</option>
                <option v-if="listaUsuariosParaFiltroAdmin.length === 0 && !loadingViajes" value="" disabled>(No hay usuarios)</option>
                <option v-for="user in listaUsuariosParaFiltroAdmin" :key="user.id" :value="user.id">{{ user.display_name }}</option>
              </select>
            </div>
            <div>
              <label for="filtroEstadoViajeAdmin" class="form-label">Estado Viaje</label>
              <select id="filtroEstadoViajeAdmin" v-model="filtroEstadoViajeAdmin" class="input-form-style select-form-style">
                <option v-for="opt in opcionesEstadoViajeAdmin" :key="opt.valor" :value="opt.valor">{{ opt.etiqueta }}</option>
              </select>
            </div>
            <div>
              <label for="filtroFechaDesdeViajes" class="form-label">Viaje Inicia Desde</label>
              <input type="date" id="filtroFechaDesdeViajes" v-model="filtroFechaDesdeViajes" class="input-form-style">
            </div>
            <div>
              <label for="filtroFechaHastaViajes" class="form-label">Viaje Inicia Hasta</label>
              <input type="date" id="filtroFechaHastaViajes" v-model="filtroFechaHastaViajes" class="input-form-style">
            </div>
          </div>
          <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
            <button @click="limpiarFiltrosAdmin" class="btn btn-secondary-outline w-full sm:w-auto">Limpiar Filtros Viaje</button>
            <button @click="aplicarFiltrosAdmin" class="btn btn-primary w-full sm:w-auto" :disabled="loadingViajes">
                <span v-if="loadingViajes" class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" role="status" aria-label="cargando"></span>
                {{ loadingViajes ? 'Filtrando...' : 'Aplicar Filtros Viaje' }}
            </button>
          </div>
        </div>

        <!-- Columna para Filtros de Reportes de Gastos -->
        <div>
          <h3 class="text-xl font-semibold text-districorr-text-dark mb-4 border-b pb-2">Filtros para Reportes de Gastos</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-end">
            <div>
              <label for="filtroFechaDesdeReporteGastos" class="form-label">Gastos Desde (para Reporte)</label>
              <input type="date" id="filtroFechaDesdeReporteGastos" v-model="filtroFechaDesdeReporteGastos" @change="fetchGastosParaReporteAdmin" class="input-form-style">
            </div>
            <div>
              <label for="filtroFechaHastaReporteGastos" class="form-label">Gastos Hasta (para Reporte)</label>
              <input type="date" id="filtroFechaHastaReporteGastos" v-model="filtroFechaHastaReporteGastos" @change="fetchGastosParaReporteAdmin" class="input-form-style">
            </div>
          </div>
           <p class="text-xs text-gray-500 mt-2">Estos filtros de fecha se aplican a los datos usados para generar los "Reportes Consolidados". Si se dejan vacíos, se usarán todos los gastos.</p>
            <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
                 <button @click="()=>{ filtroFechaDesdeReporteGastos=''; filtroFechaHastaReporteGastos=''; fetchGastosParaReporteAdmin(); }" 
                         class="btn btn-secondary-outline w-full sm:w-auto"
                         :disabled="loadingGastosParaReporte">
                    Limpiar Fechas Reporte
                 </button>
            </div>
        </div>
      </div>
    </div>

    <!-- Mensaje de Error Global para VIAJES -->
    <div v-if="errorViajes && !loadingViajes" class="mb-6 p-3.5 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-md text-sm shadow-md">
      <p class="font-bold">Error al cargar viajes:</p> <p>{{ errorViajes }}</p>
    </div>

    <!-- Indicador de Carga Principal para VIAJES -->
    <div v-if="loadingViajes && todosLosViajes.length === 0" class="text-center py-16">
      <svg class="animate-spin h-10 w-10 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p class="text-lg text-gray-600 mt-3">Cargando listado de viajes...</p>
    </div>
    <div v-else-if="!loadingViajes && todosLosViajes.length === 0 && !errorViajes" class="bg-white p-10 rounded-xl shadow-lg text-center border">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-16 h-16 mx-auto text-gray-300 mb-4"> <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-1.621-.87a3 3 0 01-.879-2.122v-1.007M12 15.75a3 3 0 100-6 3 3 0 000 6zm0 0h0m-6.75 0H12m0 0h6.75M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.454-.034-.902-.1-1.343M12 3c-.302 0-.591.02-.877.06M12 3c.282 0 .56.017.834.05M4.547 4.768A8.96 8.96 0 003 9c0 4.97 4.03 9 9 9s9-4.03 9-9c0-1.266-.264-2.466-.736-3.55M19.453 4.768A8.96 8.96 0 0021 9c0 .828-.111 1.627-.323 2.377M12 8.25c-1.362 0-2.56.398-3.538 1.073L12 12.75l3.538-3.427A6.008 6.008 0 0012 8.25z"/> </svg>
      <p class="text-gray-700 text-xl font-semibold">No se encontraron viajes con los filtros aplicados.</p>
      <p class="text-gray-500 text-sm mt-1">Intenta ajustar los filtros o crea un nuevo viaje.</p>
    </div>

    <!-- VISTA DE TARJETAS para VIAJES -->
    <div v-if="!loadingViajes && todosLosViajes.length > 0 && vistaActualAdmin === 'tarjetas'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <div v-for="viaje in todosLosViajes" :key="viaje.id" 
           class="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col justify-between hover:shadow-2xl transition-shadow duration-300 ease-in-out border-l-4"
           :class="viaje.cerrado_en ? 'border-red-500' : 'border-green-500'" >
        <div class="p-5 flex-grow">
          <div class="sm:flex sm:justify-between sm:items-start mb-2">
            <div>
              <h2 class="text-lg font-semibold text-districorr-primary truncate flex-1 mr-2 leading-tight" :title="viaje.nombre_viaje"> {{ viaje.nombre_viaje }} </h2>
              <p class="text-xs text-gray-600 mb-1"><span class="font-medium">Resp:</span> <span class="text-gray-700 font-semibold">{{ viaje.responsable_nombre || 'N/A' }}</span></p>
            </div>
            <span v-if="viaje.codigo_rendicion" class="text-sm font-mono bg-gray-200 text-gray-800 px-3 py-1 rounded-full font-semibold shadow-sm whitespace-nowrap">ID: #{{ viaje.codigo_rendicion }}</span>
          </div>
          <p class="text-xs font-bold mb-1 uppercase tracking-wider flex items-center" :class="viaje.cerrado_en ? 'text-red-600' : 'text-green-600'">
            <svg v-if="viaje.cerrado_en" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v3H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2.5a2.5 2.5 0 00-2.5 2.5V9h5V7a2.5 2.5 0 00-2.5-2.5z" /></svg>
            {{ getEstadoViajeTextoAdmin(viaje) }}
          </p>
          <p class="text-xs font-medium mt-1">
            <span class="font-semibold">Aprobación:</span>
            <span class="px-2 py-0.5 ml-1 inline-flex text-xs leading-5 font-semibold rounded-full" :class="estadoAprobacionClass(viaje.estado_aprobacion)">
              {{ (viaje.estado_aprobacion || 'N/A').replace('_', ' ') }}
            </span>
          </p>
          <div class="text-xs space-y-1 text-gray-600 mt-3">
            <p><span class="font-medium">Inicio:</span> {{ formatDate(viaje.fecha_inicio) }} <span class="font-medium ml-2">Fin:</span> {{ formatDate(viaje.fecha_fin) || 'N/A' }}</p>
            <p><span class="font-medium">Adelanto Viaje:</span> <span class="font-semibold">{{ formatCurrency(viaje.monto_adelanto, viaje.moneda) }}</span></p>
            <p><span class="font-medium">Gastos Brutos (del viaje):</span> <span class="font-semibold">{{ formatCurrency(viaje.total_gastado_bruto_viaje, viaje.moneda) }}</span></p>
            <p class="text-sm"><span class="font-bold">SALDO VIAJE:</span> <span class="font-bold text-lg" :class="viaje.saldo_adelanto_viaje >=0 ? 'text-green-700':'text-red-700'">{{ formatCurrency(viaje.saldo_adelanto_viaje, viaje.moneda) }}</span></p>
            <p v-if="viaje.observacion_cierre"><span class="font-medium">Obs. Cierre:</span> {{ viaje.observacion_cierre }}</p>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-wrap gap-2 justify-end items-center">
          <button v-if="viaje.estado_aprobacion === 'pendiente_aprobacion'" @click="abrirModalParaRevisar(viaje)" class="btn btn-admin-action btn-success">Revisar</button>
          <button @click="verGastosDelViaje(viaje)" class="btn btn-admin-action btn-blue">Ver Gastos</button>
          <button v-if="esViajeAbierto(viaje)" @click="adminCerrarRendicion(viaje)" class="btn btn-admin-action btn-orange">Cerrar (Admin)</button>
          <button @click="adminEditarViaje(viaje)" class="btn btn-admin-action btn-yellow">Editar (Admin)</button>
        </div>
      </div>
    </div>

    <!-- VISTA DE TABLA para VIAJES -->
    <div v-else-if="!loadingViajes && todosLosViajes.length > 0 && vistaActualAdmin === 'tabla'" class="bg-white shadow-xl rounded-lg overflow-hidden border">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-100">
            <tr>
              <th class="table-th">ID Rend.</th>
              <th class="table-th">Concepto</th>
              <th class="table-th">Responsable</th>
              <th class="table-th">Inicio</th>
              <th class="table-th">Estado</th>
              <th class="table-th">Estado Aprobación</th>
              <th class="table-th text-right">Saldo Viaje</th>
              <th class="table-th text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="viaje in todosLosViajes" :key="viaje.id" class="hover:bg-gray-50 transition-colors" :class="{'opacity-70': viaje.cerrado_en}">
              <td class="table-td font-mono text-xs">{{ viaje.codigo_rendicion ? '#' + viaje.codigo_rendicion : '-' }}</td>
              <td class="table-td text-sm max-w-xs truncate" :title="viaje.nombre_viaje">{{ viaje.nombre_viaje }}</td>
              <td class="table-td text-sm text-gray-500 truncate max-w-[150px]" :title="viaje.responsable_email">{{ viaje.responsable_nombre }}</td>
              <td class="table-td whitespace-nowrap text-sm">{{ formatDate(viaje.fecha_inicio) }}</td>
              <td class="table-td whitespace-nowrap text-xs">
                <span class="px-2 py-0.5 inline-flex leading-5 font-semibold rounded-full" :class="viaje.cerrado_en ? 'bg-red-100 text-red-800':'bg-green-100 text-green-800'">
                  {{ getEstadoViajeTextoAdmin(viaje).replace(/CERRADO EL.*|EN CURSO/g, (match) => match === 'EN CURSO' ? 'En Curso' : 'Cerrado') }}
                </span>
              </td>
              <td class="table-td whitespace-nowrap text-center">
                <span class="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full" :class="estadoAprobacionClass(viaje.estado_aprobacion)">
                  {{ (viaje.estado_aprobacion || 'N/A').replace('_', ' ') }}
                </span>
              </td>
              <td class="table-td whitespace-nowrap text-sm font-semibold text-right" :class="viaje.saldo_adelanto_viaje >=0 ? 'text-green-600':'text-red-600'">{{ formatCurrency(viaje.saldo_adelanto_viaje, viaje.moneda) }}</td>
              <td class="table-td whitespace-nowrap text-center text-xs space-x-1">
                 <button v-if="viaje.estado_aprobacion === 'pendiente_aprobacion'" @click="abrirModalParaRevisar(viaje)" class="btn btn-admin-action-xs btn-success">Revisar</button>
                 <button @click="verGastosDelViaje(viaje)" class="btn btn-admin-action-xs btn-blue">Ver Gastos</button>
                 <button v-if="esViajeAbierto(viaje)" @click="adminCerrarRendicion(viaje)" class="btn btn-admin-action-xs btn-orange">Cerrar</button>
                 <button @click="adminEditarViaje(viaje)" class="btn btn-admin-action-xs btn-yellow">Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal para Revisión de Rendición -->
    <div v-if="mostrarModalRevision" class="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-2xl w-full max-w-lg">
        <div class="p-6">
          <h3 class="text-xl font-bold text-gray-900">Revisar Rendición #{{ viajeARevisar.codigo_rendicion }}</h3>
          <p class="text-sm text-gray-600 mt-1">Responsable: {{ viajeARevisar.responsable_nombre }}</p>
          <a @click.prevent="verGastosDelViaje(viajeARevisar)" href="#" class="text-sm text-blue-600 hover:underline">Ver detalle de gastos</a>
          
          <div class="mt-4">
            <label for="comentariosAdminInput" class="block text-sm font-medium text-gray-700">Comentarios de la Revisión</label>
            <textarea 
              v-model="comentariosAdminInput" 
              id="comentariosAdminInput" 
              rows="4" 
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Añade un comentario (obligatorio si se rechaza)..."
            ></textarea>
          </div>
          
          <div v-if="errorRevision" class="mt-3 p-2 bg-red-100 text-red-700 text-sm rounded-md">
            {{ errorRevision }}
          </div>
        </div>
        
        <div class="bg-gray-50 px-6 py-4 flex justify-between items-center rounded-b-lg">
          <button @click="cerrarModalRevision" :disabled="loadingRevision" class="btn btn-secondary-outline">Cancelar</button>
          <div class="space-x-3">
            <button @click="handleDecisionRendicion('rechazado')" :disabled="loadingRevision" class="btn btn-danger">
              <span v-if="loadingRevision">...</span>
              <span v-else>Rechazar</span>
            </button>
            <button @click="handleDecisionRendicion('aprobado')" :disabled="loadingRevision" class="btn btn-success">
              <span v-if="loadingRevision">...</span>
              <span v-else>Aprobar</span>
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>