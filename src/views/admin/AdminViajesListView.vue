<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js'; 
import { useRouter } from 'vue-router'; 
import { formatDate, formatCurrency } from '../../utils/formatters.js'; 
import { useReportGenerator } from '../../composables/useReportGenerator.js'; 

const router = useRouter();

// MODIFICACIÓN: Se incluyen TODAS las funciones de reporte necesarias
const {
  generateAdminReporteConsolidadoPDF,
  generateAdminReporteConsolidadoExcel,
  generateRendicionesListPDF,
} = useReportGenerator();

// --- ESTADOS ---
const todosLosViajes = ref([]);
const loadingViajes = ref(true); 
const errorViajes = ref('');   

// ESTADO RESTAURADO: Para el reporte consolidado de GASTOS
const gastosParaReporteAdmin = ref([]);
const loadingGastosParaReporte = ref(true);
const errorGastosParaReporte = ref(''); 

const historialAprobaciones = ref([]);
const loadingHistorial = ref(true);

const filtroResponsableIdAdmin = ref('');
const filtroEstadoViajeAdmin = ref('');
const filtroFechaDesdeViajes = ref(''); 
const filtroFechaHastaViajes = ref(''); 
const filtroNombreViajeAdmin = ref('');
const listaUsuariosParaFiltroAdmin = ref([]);
const opcionesEstadoViajeAdmin = ref([
  { valor: '', etiqueta: 'Todos los Estados' },
  { valor: 'en_curso', etiqueta: 'En Curso (Abiertos)' },
  { valor: 'cerrado', etiqueta: 'Cerrados' },
  { valor: 'pendiente_aprobacion', etiqueta: 'Pendiente Aprobación' },
  { valor: 'aprobado', etiqueta: 'Aprobado' },
  { valor: 'rechazado', etiqueta: 'Rechazado' },
]);

// ESTADO RESTAURADO: Filtros para el reporte consolidado de GASTOS
const filtroFechaDesdeReporteGastos = ref('');
const filtroFechaHastaReporteGastos = ref('');

const mostrarModalRevision = ref(false);
const viajeARevisar = ref(null);
const comentariosAdminInput = ref('');
const loadingRevision = ref(false);
const errorRevision = ref('');

const vistaActualAdmin = ref('tarjetas');

// --- FUNCIONES ---
const getEstadoViajeTextoAdmin = (viaje) => viaje ? (viaje.cerrado_en ? `CERRADO EL ${formatDate(viaje.cerrado_en, {day: '2-digit', month: 'short', year: 'numeric', hour:'2-digit', minute:'2-digit' })}` : 'EN CURSO') : 'N/A';
const esViajeAbierto = (viaje) => viaje && !viaje.cerrado_en;

async function fetchAdminDropdownData() {
  try {
    const { data, error } = await supabase.from('perfiles').select('id, nombre_completo, email').order('nombre_completo');
    if (error) throw error;
    if (data) {
      listaUsuariosParaFiltroAdmin.value = data.map(u => ({ id: u.id, display_name: u.nombre_completo || u.email })).sort((a, b) => a.display_name.localeCompare(b.display_name));
    }
  } catch (error) { console.error("Error en fetchAdminDropdownData:", error.message); }
}

// FUNCIÓN RESTAURADA: Para cargar los datos de los GASTOS para el reporte consolidado
async function fetchGastosParaReporteAdmin() {
  loadingGastosParaReporte.value = true;
  errorGastosParaReporte.value = '';
  try {
    let query = supabase.from('admin_gastos_completos').select('*');
    if (filtroFechaDesdeReporteGastos.value) query = query.gte('fecha_gasto', filtroFechaDesdeReporteGastos.value);
    if (filtroFechaHastaReporteGastos.value) {
        const d = new Date(filtroFechaHastaReporteGastos.value);
        d.setUTCDate(d.getUTCDate() + 1);
        query = query.lt('fecha_gasto', d.toISOString().split('T')[0]);
    }
    const { data, error } = await query.order('fecha_gasto', { ascending: false });
    if (error) throw error;
    gastosParaReporteAdmin.value = data || [];
  } catch (error) { errorGastosParaReporte.value = `Error al cargar datos para reportes: ${error.message}`; }
  finally { loadingGastosParaReporte.value = false; }
}

async function fetchTodosLosViajesConInfo() {
  loadingViajes.value = true;
  errorViajes.value = '';
  try {
    const { data: viajesData, error: vistaError } = await supabase.rpc('get_viajes_protegidos');
    if (vistaError) throw vistaError;
    
    let filteredData = viajesData || [];
    if (filtroResponsableIdAdmin.value) filteredData = filteredData.filter(v => v.user_id === filtroResponsableIdAdmin.value);
    if (filtroEstadoViajeAdmin.value) {
        if (filtroEstadoViajeAdmin.value === 'en_curso') filteredData = filteredData.filter(v => !v.cerrado_en);
        else if (filtroEstadoViajeAdmin.value === 'cerrado') filteredData = filteredData.filter(v => !!v.cerrado_en);
        else filteredData = filteredData.filter(v => v.estado_aprobacion === filtroEstadoViajeAdmin.value);
    }
    if (filtroNombreViajeAdmin.value?.trim()) filteredData = filteredData.filter(v => v.nombre_viaje.toLowerCase().includes(filtroNombreViajeAdmin.value.trim().toLowerCase()));
    
    todosLosViajes.value = filteredData;
  } catch (error) { 
    errorViajes.value = `No se pudieron cargar los viajes: ${error.message}`; 
    todosLosViajes.value = [];
  }
  finally { loadingViajes.value = false; }
}

async function fetchHistorialAprobaciones() {
  loadingHistorial.value = true;
  try {
    const { data, error } = await supabase.from('historial_aprobaciones_rendicion_view').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    historialAprobaciones.value = data || [];
  } catch (error) {
    errorViajes.value = `Error al cargar el historial: ${error.message}`;
    historialAprobaciones.value = [];
  } finally {
    loadingHistorial.value = false;
  }
}

const aplicarFiltrosAdmin = () => fetchTodosLosViajesConInfo();

const limpiarFiltrosAdmin = () => {
  filtroResponsableIdAdmin.value = '';
  filtroEstadoViajeAdmin.value = '';
  filtroNombreViajeAdmin.value = '';
  fetchTodosLosViajesConInfo();
  filtroFechaDesdeReporteGastos.value = '';
  filtroFechaHastaReporteGastos.value = '';
  fetchGastosParaReporteAdmin();
};

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
    errorRevision.value = 'Es obligatorio añadir un comentario para rechazar.';
    return;
  }
  loadingRevision.value = true;
  errorRevision.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Administrador no autenticado.');
    const { error } = await supabase.rpc('aprobar_rechazar_rendicion', {
      p_viaje_id: viajeARevisar.value.id, p_nuevo_estado: nuevoEstado,
      p_comentarios: comentariosAdminInput.value, p_admin_id: user.id
    });
    if (error) throw error;
    cerrarModalRevision();
    await Promise.all([fetchTodosLosViajesConInfo(), fetchHistorialAprobaciones()]);
  } catch (e) {
    errorRevision.value = `Error: ${e.message}`;
  } finally {
    loadingRevision.value = false;
  }
};

const adminEditarViaje = (viaje) => {
  if (!viaje?.id) return;
  router.push({ name: 'ViajeEdit', params: { id: viaje.id } });
};

// NUEVO: Manejador para el reporte de LISTA DE RENDICIONES
const handleExportRendiciones = () => {
  generateRendicionesListPDF(todosLosViajes.value);
};

// FUNCIÓN RESTAURADA: Manejador para el reporte CONSOLIDADO DE GASTOS PDF
const handleGenerateReporteConsolidadoPDF = () => {
  if (!gastosParaReporteAdmin.value?.length) { alert('No hay datos de gastos para generar el PDF.'); return; }
  generateAdminReporteConsolidadoPDF(gastosParaReporteAdmin.value, { fechaDesde: filtroFechaDesdeReporteGastos.value, fechaHasta: filtroFechaHastaReporteGastos.value }, 'Admin_Reporte_Consolidado_Gastos');
};

// FUNCIÓN RESTAURADA: Manejador para el reporte CONSOLIDADO DE GASTOS Excel
const handleGenerateReporteConsolidadoExcel = () => {
  if (!gastosParaReporteAdmin.value?.length) { alert('No hay datos para generar el Excel.'); return; }
  generateAdminReporteConsolidadoExcel(gastosParaReporteAdmin.value, { fechaDesde: filtroFechaDesdeReporteGastos.value, fechaHasta: filtroFechaHastaReporteGastos.value }, 'Admin_Reporte_Consolidado_Gastos');
};

onMounted(() => {
  fetchAdminDropdownData();
  fetchTodosLosViajesConInfo();
  fetchGastosParaReporteAdmin(); // Carga de datos para reportes consolidado
  fetchHistorialAprobaciones();
});

const estadoAprobacionClass = computed(() => (estado) => {
  switch (estado) {
    case 'aprobado': return 'bg-green-100 text-green-800';
    case 'pendiente_aprobacion': return 'bg-yellow-100 text-yellow-800 animate-pulse';
    case 'rechazado': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
});
</script>
--- START OF FILE src/views/admin/AdminViajesListView.vue (template ONLY) ---
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Encabezado y Controles de Vista/Reportes -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary tracking-tight">
        Panel de Admin - Todas las Rendiciones
      </h1>
      <div class="flex items-center gap-3 flex-wrap justify-start sm:justify-end w-full sm:w-auto">
        <!-- Selector de Vista -->
        <div class="flex items-center gap-2 p-1 bg-gray-200 rounded-lg">
            <button @click="vistaActualAdmin = 'tarjetas'" :class="[vistaActualAdmin === 'tarjetas' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:bg-gray-300/50']" class="p-2 rounded-lg transition-all duration-150" title="Vista de Tarjetas">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button @click="vistaActualAdmin = 'tabla'" :class="[vistaActualAdmin === 'tabla' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:bg-gray-300/50']" class="p-2 rounded-lg transition-all duration-150" title="Vista de Tabla">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
            </button>
            <button @click="vistaActualAdmin = 'registro'" :class="[vistaActualAdmin === 'registro' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:bg-gray-300/50']" class="p-2 rounded-lg transition-all duration-150" title="Registro de Aprobaciones">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
            </button>
        </div>
        <!-- Botones de Reportes -->
        <button @click="handleExportRendiciones" class="btn-export-main" :disabled="loadingViajes || todosLosViajes.length === 0">
          Exportar Lista
        </button>
        <div class="relative group">
            <button class="btn-export-main" :disabled="loadingGastosParaReporte || gastosParaReporteAdmin.length === 0">
                Reportes de Gastos
            </button>
            <div v-if="!loadingGastosParaReporte && gastosParaReporteAdmin.length > 0" class="absolute right-0 mt-1 w-72 bg-white rounded-md shadow-xl z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
                <a @click.prevent="handleGenerateReporteConsolidadoPDF" href="#" class="dropdown-item">Consolidado de Gastos (PDF)</a>
                <a @click.prevent="handleGenerateReporteConsolidadoExcel" href="#" class="dropdown-item">Consolidado de Gastos (Excel)</a>
            </div>
        </div>
      </div>
    </div>

    <template v-if="vistaActualAdmin !== 'registro'">
      <div class="bg-white p-4 sm:p-6 rounded-xl shadow-lg mb-8 border border-gray-200">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 class="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Filtrar Lista de Rendiciones</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 items-end">
              <div><label for="filtroNombreViajeAdmin" class="form-label">Nombre/Concepto</label><input type="text" id="filtroNombreViajeAdmin" v-model="filtroNombreViajeAdmin" placeholder="Buscar..." class="input-form-style"></div>
              <div><label for="filtroResponsableIdAdmin" class="form-label">Responsable</label><select id="filtroResponsableIdAdmin" v-model="filtroResponsableIdAdmin" class="input-form-style select-form-style"><option value="">Todos</option><option v-for="user in listaUsuariosParaFiltroAdmin" :key="user.id" :value="user.id">{{ user.display_name }}</option></select></div>
              <div><label for="filtroEstadoViajeAdmin" class="form-label">Estado</label><select id="filtroEstadoViajeAdmin" v-model="filtroEstadoViajeAdmin" class="input-form-style select-form-style"><option v-for="opt in opcionesEstadoViajeAdmin" :key="opt.valor" :value="opt.valor">{{ opt.etiqueta }}</option></select></div>
            </div>
            <div class="mt-6 flex justify-end gap-3"><button @click="limpiarFiltrosAdmin" class="btn btn-secondary-outline">Limpiar</button><button @click="aplicarFiltrosAdmin" class="btn btn-primary" :disabled="loadingViajes">Filtrar</button></div>
          </div>
          <div>
            <h3 class="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Filtros para Reportes de Gastos</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-end">
              <div><label for="filtroFechaDesdeReporteGastos" class="form-label">Gastos Desde</label><input type="date" id="filtroFechaDesdeReporteGastos" v-model="filtroFechaDesdeReporteGastos" @change="fetchGastosParaReporteAdmin" class="input-form-style"></div>
              <div><label for="filtroFechaHastaReporteGastos" class="form-label">Gastos Hasta</label><input type="date" id="filtroFechaHastaReporteGastos" v-model="filtroFechaHastaReporteGastos" @change="fetchGastosParaReporteAdmin" class="input-form-style"></div>
            </div>
            <p class="text-xs text-gray-500 mt-2">Afecta solo a "Reportes de Gastos".</p>
          </div>
        </div>
      </div>
      
      <div v-if="loadingViajes" class="text-center py-16">Cargando...</div>
      <div v-else-if="errorViajes" class="text-center py-16 text-red-500">{{ errorViajes }}</div>
      <div v-else-if="todosLosViajes.length === 0" class="text-center py-16 text-gray-500">No hay rendiciones que coincidan con los filtros.</div>
      <template v-else>
        <!-- VISTA DE TARJETAS -->
        <div v-if="vistaActualAdmin === 'tarjetas'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div v-for="viaje in todosLosViajes" :key="viaje.id" class="bg-white rounded-xl shadow-lg flex flex-col hover:shadow-2xl transition-shadow border-l-4" :class="viaje.cerrado_en ? 'border-red-500' : 'border-green-500'">
            <div class="p-5 flex-grow">
              <h2 class="text-lg font-semibold text-gray-800 truncate">#{{ viaje.codigo_rendicion }} - {{ viaje.nombre_viaje }}</h2>
              <p class="text-sm text-gray-500">Resp: {{ viaje.responsable_nombre }}</p>
              <span class="text-xs font-bold uppercase" :class="viaje.cerrado_en ? 'text-red-600' : 'text-green-600'">{{ getEstadoViajeTextoAdmin(viaje) }}</span>
              <p class="text-xs font-medium mt-1">Aprobación: <span class="px-2 py-1 ml-1 text-xs font-semibold rounded-full" :class="estadoAprobacionClass(viaje.estado_aprobacion)">{{ (viaje.estado_aprobacion || 'N/A').replace(/_/g, ' ') }}</span></p>
            </div>
            <div class="bg-gray-50 px-4 py-3 border-t flex flex-wrap gap-2 justify-end">
              <button v-if="viaje.estado_aprobacion === 'pendiente_aprobacion'" @click="abrirModalParaRevisar(viaje)" class="btn btn-admin-action btn-success">Revisar</button>
              <button @click="verGastosDelViaje(viaje)" class="btn btn-admin-action btn-blue">Gastos</button>
              <button @click="adminEditarViaje(viaje)" class="btn btn-admin-action btn-yellow">Editar</button>
            </div>
          </div>
        </div>
        <!-- VISTA DE TABLA -->
        <div v-if="vistaActualAdmin === 'tabla'" class="bg-white shadow-xl rounded-lg overflow-hidden border">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-100">
              <tr><th class="table-th">ID</th><th class="table-th">Concepto</th><th class="table-th">Responsable</th><th class="table-th">Estado</th><th class="table-th">Aprobación</th><th class="table-th text-center">Acciones</th></tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="viaje in todosLosViajes" :key="viaje.id" class="hover:bg-gray-50">
                <td class="table-td">#{{ viaje.codigo_rendicion }}</td>
                <td class="table-td">{{ viaje.nombre_viaje }}</td>
                <td class="table-td">{{ viaje.responsable_nombre }}</td>
                <td class="table-td"><span class="px-2 py-1 text-xs font-semibold rounded-full" :class="viaje.cerrado_en ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'">{{ viaje.cerrado_en ? 'Cerrado' : 'En Curso' }}</span></td>
                <td class="table-td"><span class="px-2 py-1 text-xs font-semibold rounded-full" :class="estadoAprobacionClass(viaje.estado_aprobacion)">{{ (viaje.estado_aprobacion || 'N/A').replace(/_/g, ' ') }}</span></td>
                <td class="table-td text-center space-x-1">
                  <button v-if="viaje.estado_aprobacion === 'pendiente_aprobacion'" @click="abrirModalParaRevisar(viaje)" class="btn btn-admin-action-xs btn-success">Revisar</button>
                  <button @click="verGastosDelViaje(viaje)" class="btn btn-admin-action-xs btn-blue">Gastos</button>
                  <button @click="adminEditarViaje(viaje)" class="btn btn-admin-action-xs btn-yellow">Editar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>

    <div v-if="vistaActualAdmin === 'registro'">
      <div class="bg-white shadow-xl rounded-lg overflow-hidden border">
        <div class="p-6 border-b">
          <h3 class="text-xl font-bold text-gray-800">Registro de Aprobaciones</h3>
          <p class="text-sm text-gray-500 mt-1">Historial de todas las decisiones tomadas sobre las rendiciones.</p>
        </div>
        <div v-if="loadingHistorial" class="p-6 text-center text-gray-500">Cargando registro...</div>
        <div v-else-if="historialAprobaciones.length === 0" class="p-6 text-center text-gray-500">No hay registros de aprobaciones.</div>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="table-th">Fecha Decisión</th><th class="table-th">Rendición</th><th class="table-th">Responsable</th><th class="table-th">Admin</th><th class="table-th text-center">Decisión</th><th class="table-th">Comentarios</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="item in historialAprobaciones" :key="item.id" class="hover:bg-gray-50">
                <td class="table-td">{{ formatDate(item.created_at, { day: '2-digit', month: 'short', year: 'numeric', hour:'2-digit', minute:'2-digit' }) }}</td>
                <td class="table-td">#{{ item.codigo_rendicion }} - {{ item.nombre_viaje }}</td>
                <td class="table-td">{{ item.responsable_nombre || 'N/A' }}</td>
                <td class="table-td">{{ item.admin_nombre || 'N/A' }}</td>
                <td class="table-td text-center"><span class="px-2 py-1 font-semibold leading-tight text-xs rounded-full" :class="estadoAprobacionClass(item.decision)">{{ item.decision }}</span></td>
                <td class="table-td max-w-xs truncate" :title="item.comentarios">{{ item.comentarios || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div v-if="mostrarModalRevision" class="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-2xl w-full max-w-lg">
        <div class="p-6">
          <h3 class="text-xl font-bold text-gray-900">Revisar Rendición #{{ viajeARevisar.codigo_rendicion }}</h3>
          <p class="text-sm text-gray-600 mt-1">Responsable: {{ viajeARevisar.responsable_nombre }}</p>
          <a @click.prevent="verGastosDelViaje(viajeARevisar)" href="#" class="text-sm text-blue-600 hover:underline">Ver detalle de gastos</a>
          <div class="mt-4">
            <label for="comentariosAdminInput" class="block text-sm font-medium text-gray-700">Comentarios</label>
            <textarea v-model="comentariosAdminInput" id="comentariosAdminInput" rows="4" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Obligatorio si se rechaza..."></textarea>
          </div>
          <div v-if="errorRevision" class="mt-3 p-2 bg-red-100 text-red-700 text-sm rounded-md">{{ errorRevision }}</div>
        </div>
        <div class="bg-gray-50 px-6 py-4 flex justify-between items-center rounded-b-lg">
          <button @click="cerrarModalRevision" :disabled="loadingRevision" class="btn btn-secondary-outline">Cancelar</button>
          <div class="space-x-3">
            <button @click="handleDecisionRendicion('rechazado')" :disabled="loadingRevision" class="btn btn-danger"><span v-if="loadingRevision">...</span><span v-else>Rechazar</span></button>
            <button @click="handleDecisionRendicion('aprobado')" :disabled="loadingRevision" class="btn btn-success"><span v-if="loadingRevision">...</span><span v-else>Aprobar</span></button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>