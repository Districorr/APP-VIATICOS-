<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
import { formatDate, formatCurrency } from '../../utils/formatters.js';
// Asegúrate que la ruta al composable es correcta
import { useReportGenerator } from '../../composables/useReportGenerator.js';

const router = useRouter();
const route = useRoute();

// 1. Desestructuración de useReportGenerator (solo funciones consolidadas)
const {
  generateAdminReporteConsolidadoPDF,
  generateAdminReporteConsolidadoExcel,
} = useReportGenerator();

// --- Refs para la lista de Viajes y su estado de carga ---
const todosLosViajes = ref([]);
const loading = ref(true); // Loading para la lista de viajes
const errorMessage = ref(''); // Error para la lista de viajes

// --- Refs para los Gastos destinados a los reportes globales y su estado de carga ---
const gastosParaReporteAdmin = ref([]);
const loadingGastosParaReporte = ref(true);
const errorMessageGastosParaReporte = ref('');

// --- Modelos para Filtros de la lista de Viajes ---
const filtroResponsableIdAdmin = ref('');
const filtroEstadoViajeAdmin = ref('');
const filtroFechaDesdeAdmin = ref(''); // Filtro para fecha_inicio de VIAJES
const filtroFechaHastaAdmin = ref(''); // Filtro para fecha_inicio de VIAJES
const filtroNombreViajeAdmin = ref('');

// --- Opciones para Selectores de Filtro de Viajes ---
const listaUsuariosParaFiltroAdmin = ref([]);
const opcionesEstadoViajeAdmin = ref([
  { valor: '', etiqueta: 'Todos los Estados' },
  { valor: 'en_curso', etiqueta: 'En Curso (Abiertos)' },
  { valor: 'cerrado', etiqueta: 'Cerrados' },
]);

// --- Control de Vista (Tarjetas o Tabla para la lista de Viajes) ---
const vistaActualAdmin = ref('tarjetas');

// --- Filtros específicos para los DATOS DE GASTOS para el reporte consolidado ---
const filtroFechaDesdeReporteGastos = ref('');
const filtroFechaHastaReporteGastos = ref('');


// --- Funciones de UI para Viajes ---
const getEstadoViajeTextoAdmin = (viaje) => {
  if (viaje.cerrado_en) {
    return `CERRADO EL ${formatDate(viaje.cerrado_en, {day: '2-digit', month: 'short', year: 'numeric', hour:'2-digit', minute:'2-digit' })}`;
  }
  return 'EN CURSO';
};

const esViajeAbierto = (viaje) => {
  return !viaje.cerrado_en;
};

// --- Carga de Datos para Selectores de Filtro de Viajes ---
async function fetchAdminDropdownData() {
  console.log("AdminViajesListView: fetchAdminDropdownData INICIO");
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
       console.log("AdminViajesListView: Lista de usuarios para filtro cargada:", listaUsuariosParaFiltroAdmin.value.length);
    } else {
      listaUsuariosParaFiltroAdmin.value = [];
      console.log("AdminViajesListView: No se encontraron usuarios para el filtro.");
    }
  } catch (error) {
    console.error("AdminViajesListView: Error en fetchAdminDropdownData (usuarios):", error.message);
  }
}

// --- Carga de Datos para Reportes Globales de Gastos ---
async function fetchGastosParaReporteAdmin() {
  console.log("AdminViajesListView: Iniciando fetchGastosParaReporteAdmin con filtros de fecha:", filtroFechaDesdeReporteGastos.value, "a", filtroFechaHastaReporteGastos.value);
  loadingGastosParaReporte.value = true;
  errorMessageGastosParaReporte.value = '';
  try {
    let query = supabase.from('admin_gastos_completos').select('*');

    if (filtroFechaDesdeReporteGastos.value) {
        query = query.gte('fecha_gasto', filtroFechaDesdeReporteGastos.value);
    }
    if (filtroFechaHastaReporteGastos.value) {
        const fechaHasta = new Date(filtroFechaHastaReporteGastos.value);
        fechaHasta.setUTCDate(fechaHasta.getUTCDate() + 1);
        query = query.lt('fecha_gasto', fechaHasta.toISOString().split('T')[0]);
    }
    query = query.order('fecha_gasto', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    gastosParaReporteAdmin.value = data || [];
    console.log("AdminViajesListView: Gastos para reporte cargados:", gastosParaReporteAdmin.value.length);
    if (data) errorMessageGastosParaReporte.value = '';

  } catch (error) {
    console.error('AdminViajesListView: Error en fetchGastosParaReporteAdmin:', error.message);
    errorMessageGastosParaReporte.value = `Error al cargar datos para reportes: ${error.message}`;
    gastosParaReporteAdmin.value = [];
  } finally {
    loadingGastosParaReporte.value = false;
  }
}

// --- Carga Principal de Datos para la Lista de Viajes ---
async function fetchTodosLosViajesConInfo() {
  console.log("AdminViajesListView: Iniciando fetchTodosLosViajesConInfo con filtros de viaje:", { /* tus filtros */ });
  loading.value = true;
  errorMessage.value = '';

  try {
    let query = supabase
      .from('admin_viajes_con_responsable')
      .select(`
        id,
        nombre_viaje,
        codigo_rendicion,
        fecha_inicio,
        fecha_fin,
        monto_adelanto,
        cerrado_en,
        observacion_cierre,
        user_id,
        responsable_nombre,
        responsable_email 
      `); // Los comentarios fueron eliminados de aquí

    // ... (tu lógica de filtros para la lista de VIAJES sigue igual aquí) ...
    if (filtroResponsableIdAdmin.value) query = query.eq('user_id', filtroResponsableIdAdmin.value);
    if (filtroEstadoViajeAdmin.value === 'en_curso') query = query.is('cerrado_en', null);
    else if (filtroEstadoViajeAdmin.value === 'cerrado') query = query.not('cerrado_en', 'is', null);
    if (filtroFechaDesdeAdmin.value) query = query.gte('fecha_inicio', filtroFechaDesdeAdmin.value);
    if (filtroFechaHastaAdmin.value) {
      const fechaHasta = new Date(filtroFechaHastaAdmin.value);
      fechaHasta.setUTCDate(fechaHasta.getUTCDate() + 1);
      query = query.lt('fecha_inicio', fechaHasta.toISOString().split('T')[0]);
    }
    if (filtroNombreViajeAdmin.value && filtroNombreViajeAdmin.value.trim() !== '') {
      query = query.ilike('nombre_viaje', `%${filtroNombreViajeAdmin.value.trim()}%`);
    }
    query = query.order('cerrado_en', { ascending: true, nullsFirst: true }).order('fecha_inicio', { ascending: false });


    const { data: viajesData, error: vistaError } = await query;

    if (vistaError) {
        // Si el error es específicamente sobre la columna 'moneda', este cambio debería solucionarlo.
        // Si es otro error, se mostrará.
        console.error('Error en la consulta a admin_viajes_con_responsable:', vistaError);
        throw vistaError;
    }
    
    console.log("AdminViajesListView: Datos de viajes obtenidos de la vista:", viajesData ? viajesData.length : 0);

    if (!viajesData || viajesData.length === 0) {
      todosLosViajes.value = [];
    } else {
      todosLosViajes.value = await Promise.all(viajesData.map(async (viaje) => {
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
        } else if (gastosError) {
          console.error(`AdminViajesListView: Error obteniendo gastos para el viaje ${viaje.id}: ${gastosError.message}`);
        }

        const adelantoPrincipalViaje = parseFloat(viaje.monto_adelanto) || 0;
        const saldoCalculado = adelantoPrincipalViaje - impactoNetoEnAdelantoPrincipal;
        
        return {
          ...viaje,
          moneda: viaje.moneda || 'ARS', // <<< ASIGNAR 'ARS' POR DEFECTO SI viaje.moneda NO ESTÁ DEFINIDO
          total_gastado_bruto_viaje: totalGastadoBrutoViaje,
          saldo_adelanto_viaje: saldoCalculado
        };
      }));
    }
    if (todosLosViajes.value.length > 0 || !errorMessage.value) errorMessage.value = '';
  } catch (error) {
    // El error ya se loguea arriba si es de la consulta de Supabase
    errorMessage.value = `No se pudieron cargar los datos de viajes: ${error.message || 'Error desconocido.'}`;
    todosLosViajes.value = [];
  } finally {
    loading.value = false;
  }
}

// --- Funciones de UI para Filtros de Viajes ---
const aplicarFiltrosAdmin = () => {
  console.log("AdminViajesListView: Aplicando filtros de viaje.");
  fetchTodosLosViajesConInfo();
  // Decidir si los filtros de viaje deben afectar los filtros de reporte de gastos:
  // Ejemplo: si quieres que las fechas de viaje también filtren los gastos para el reporte
  // filtroFechaDesdeReporteGastos.value = filtroFechaDesdeAdmin.value;
  // filtroFechaHastaReporteGastos.value = filtroFechaHastaAdmin.value;
  // fetchGastosParaReporteAdmin(); // Y luego recargar los gastos para reporte
};

const limpiarFiltrosAdmin = () => {
  console.log("AdminViajesListView: Limpiando filtros de viaje.");
  filtroResponsableIdAdmin.value = '';
  filtroEstadoViajeAdmin.value = '';
  filtroFechaDesdeAdmin.value = '';
  filtroFechaHastaAdmin.value = '';
  filtroNombreViajeAdmin.value = '';
  fetchTodosLosViajesConInfo();

  // También limpiar filtros de fecha para reportes de gastos y recargar
  filtroFechaDesdeReporteGastos.value = '';
  filtroFechaHastaReporteGastos.value = '';
  fetchGastosParaReporteAdmin();
};

// --- Hooks de Ciclo de Vida ---
onMounted(() => {
  console.log("AdminViajesListView: Componente MONTADO.");
  fetchAdminDropdownData();
  fetchTodosLosViajesConInfo();
  fetchGastosParaReporteAdmin();
});

// Watcher para recargar los datos de gastos para reporte si cambian sus filtros de fecha
watch([filtroFechaDesdeReporteGastos, filtroFechaHastaReporteGastos], () => {
  // No es necesario llamar explícitamente a fetchGastosParaReporteAdmin aquí
  // si los inputs de fecha en el template ya tienen @change="fetchGastosParaReporteAdmin"
  // Si no tienen @change, entonces sí necesitarías este watcher o un botón de "Aplicar Filtros Reporte".
  // Como los inputs ya tienen @change, este watcher podría ser redundante o causar doble llamada.
  // Lo mantendré comentado por ahora.
  // console.log("Watcher: Cambiaron las fechas de filtro para reportes de gastos. Recargando...");
  // fetchGastosParaReporteAdmin();
});

// --- Funciones de Navegación y Acción para Viajes ---
const verGastosDelViaje = (viaje) => {
  router.push({ name: 'AdminGastosList', query: { viajeId: viaje.id } });
};

const adminCerrarRendicion = async (viaje) => {
  if (confirm(`¿Está seguro de cerrar la rendición para el viaje "${viaje.nombre_viaje || viaje.id}"?`)) {
    try {
      const { error } = await supabase
        .from('viajes')
        .update({ cerrado_en: new Date().toISOString(), observacion_cierre: viaje.observacion_cierre || `Cerrado por admin el ${new Date().toLocaleString()}` })
        .eq('id', viaje.id);
      if (error) throw error;
      alert('Rendición cerrada exitosamente.');
      fetchTodosLosViajesConInfo();
    } catch (error) {
      console.error('Error al cerrar la rendición:', error.message);
      alert(`Error al cerrar la rendición: ${error.message}`);
    }
  }
};

const adminEditarViaje = (viaje) => {
  alert(`FUNCIONALIDAD ADMIN PENDIENTE: Editar viaje #${viaje.codigo_rendicion || viaje.id}.`);
};

// --- MANEJADORES para los reportes CONSOLIDADOS ---
const handleGenerateReporteConsolidadoPDF = () => {
  if (!gastosParaReporteAdmin.value || gastosParaReporteAdmin.value.length === 0) {
    alert('No hay datos de gastos cargados para generar el reporte consolidado.'); return;
  }
  const filtrosUsadosParaReporte = {
    // Usar los filtros de fecha específicos para el reporte de gastos
    fechaDesde: filtroFechaDesdeReporteGastos.value || null,
    fechaHasta: filtroFechaHastaReporteGastos.value || null,
  };
  generateAdminReporteConsolidadoPDF(gastosParaReporteAdmin.value, filtrosUsadosParaReporte, 'Admin_Reporte_Consolidado_Gastos');
};

const handleGenerateReporteConsolidadoExcel = () => {
  if (!gastosParaReporteAdmin.value || gastosParaReporteAdmin.value.length === 0) {
    alert('No hay datos de gastos cargados para generar el reporte consolidado.'); return;
  }
  const filtrosUsadosParaReporte = {
    fechaDesde: filtroFechaDesdeReporteGastos.value || null,
    fechaHasta: filtroFechaHastaReporteGastos.value || null,
  };
  generateAdminReporteConsolidadoExcel(gastosParaReporteAdmin.value, filtrosUsadosParaReporte, 'Admin_Reporte_Consolidado_Gastos');
};

</script>

<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Encabezado y Controles de Vista/Reportes -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary tracking-tight">
        Panel de Admin - Todos los Viajes / Períodos
      </h1>
      <div class="flex items-center gap-3 flex-wrap justify-start sm:justify-end w-full sm:w-auto">
        <!-- Selector de Vista -->
        <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 hidden sm:inline">Ver como:</span>
            <button @click="vistaActualAdmin = 'tarjetas'"
                    :class="[vistaActualAdmin === 'tarjetas' ? 'bg-districorr-primary text-white shadow-md' : 'bg-gray-200 hover:bg-gray-300 text-gray-700']"
                    class="p-2 rounded-lg transition-colors duration-150" title="Vista de Tarjetas">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button @click="vistaActualAdmin = 'tabla'"
                    :class="[vistaActualAdmin === 'tabla' ? 'bg-districorr-primary text-white shadow-md' : 'bg-gray-200 hover:bg-gray-300 text-gray-700']"
                    class="p-2 rounded-lg transition-colors duration-150" title="Vista de Tabla">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
            </button>
        </div>

        <!-- Botones de Reportes de Gastos Globales -->
        <div v-if="!loadingGastosParaReporte && gastosParaReporteAdmin.length > 0 && !errorMessageGastosParaReporte" class="relative group">
            <button class="px-4 py-2 text-sm font-medium text-white bg-districorr-accent rounded-lg shadow-sm hover:bg-opacity-85 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                Exportar Reportes Consolidados
            </button>
            <div class="absolute right-0 mt-1 w-72 bg-white rounded-md shadow-xl z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto py-1">
                <p class="px-4 pt-2 pb-1 text-xs text-gray-500 font-semibold">Reporte Unificado Admin:</p>
                <a @click.prevent="handleGenerateReporteConsolidadoPDF" href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900">Reporte Consolidado (PDF)</a>
                <a @click.prevent="handleGenerateReporteConsolidadoExcel" href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900">Reporte Consolidado (Excel)</a>
            </div>
        </div>
        <div v-else-if="loadingGastosParaReporte" class="text-xs text-gray-500 px-3 py-2">
            Cargando datos para reportes...
        </div>
         <div v-else-if="errorMessageGastosParaReporte" class="text-xs text-red-500 px-3 py-2" :title="errorMessageGastosParaReporte">
            Error al cargar datos para reportes.
        </div>
        <div v-else class="text-xs text-gray-400 px-3 py-2">
            No hay gastos para generar reportes.
        </div>
      </div>
    </div>

    <!-- Sección de Filtros para VIAJES y para REPORTES DE GASTOS -->
    <div class="bg-white p-4 sm:p-6 rounded-xl shadow-lg mb-8 border border-gray-200">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Columna para Filtros de Viaje -->
        <div>
          <h3 class="text-xl font-semibold text-districorr-text-dark mb-4 border-b pb-2">Filtrar Lista de Viajes</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-end">
            <div>
              <label for="filtroNombreViajeAdmin" class="block text-sm font-medium text-gray-700 mb-1">Nombre/Concepto Viaje</label>
              <input type="text" id="filtroNombreViajeAdmin" v-model="filtroNombreViajeAdmin" placeholder="Buscar por nombre..." class="input-form-style">
            </div>
            <div>
              <label for="filtroResponsableIdAdmin" class="block text-sm font-medium text-gray-700 mb-1">Responsable Viaje</label>
              <select id="filtroResponsableIdAdmin" v-model="filtroResponsableIdAdmin" class="input-form-style select-form-style" :disabled="listaUsuariosParaFiltroAdmin.length === 0 && loading">
                <option value="">Todos</option>
                <option v-if="listaUsuariosParaFiltroAdmin.length === 0 && !loading" value="" disabled>(No hay usuarios)</option>
                <option v-for="user in listaUsuariosParaFiltroAdmin" :key="user.id" :value="user.id">{{ user.display_name }}</option>
              </select>
            </div>
            <div>
              <label for="filtroEstadoViajeAdmin" class="block text-sm font-medium text-gray-700 mb-1">Estado Viaje</label>
              <select id="filtroEstadoViajeAdmin" v-model="filtroEstadoViajeAdmin" class="input-form-style select-form-style">
                <option v-for="opt in opcionesEstadoViajeAdmin" :key="opt.valor" :value="opt.valor">{{ opt.etiqueta }}</option>
              </select>
            </div>
            <div>
              <label for="filtroFechaDesdeAdmin" class="block text-sm font-medium text-gray-700 mb-1">Viaje Inicia Desde</label>
              <input type="date" id="filtroFechaDesdeAdmin" v-model="filtroFechaDesdeAdmin" class="input-form-style">
            </div>
            <div>
              <label for="filtroFechaHastaAdmin" class="block text-sm font-medium text-gray-700 mb-1">Viaje Inicia Hasta</label>
              <input type="date" id="filtroFechaHastaAdmin" v-model="filtroFechaHastaAdmin" class="input-form-style">
            </div>
          </div>
          <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
            <button @click="limpiarFiltrosAdmin" class="btn-secondary-outline w-full sm:w-auto">Limpiar Filtros Viaje</button>
            <button @click="aplicarFiltrosAdmin" class="btn-primary w-full sm:w-auto">Aplicar Filtros Viaje</button>
          </div>
        </div>

        <!-- Columna para Filtros de Reportes de Gastos -->
        <div>
          <h3 class="text-xl font-semibold text-districorr-text-dark mb-4 border-b pb-2">Filtros para Reportes de Gastos</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-end">
            <div>
              <label for="filtroFechaDesdeReporteGastos" class="block text-sm font-medium text-gray-700 mb-1">Gastos Desde (para Reporte)</label>
              <input type="date" id="filtroFechaDesdeReporteGastos" v-model="filtroFechaDesdeReporteGastos" @change="fetchGastosParaReporteAdmin" class="input-form-style">
            </div>
            <div>
              <label for="filtroFechaHastaReporteGastos" class="block text-sm font-medium text-gray-700 mb-1">Gastos Hasta (para Reporte)</label>
              <input type="date" id="filtroFechaHastaReporteGastos" v-model="filtroFechaHastaReporteGastos" @change="fetchGastosParaReporteAdmin" class="input-form-style">
            </div>
          </div>
           <p class="text-xs text-gray-500 mt-2">Estos filtros de fecha se aplican a los datos usados para generar los "Reportes Consolidados". Si se dejan vacíos, se usarán todos los gastos.</p>
            <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
                 <button @click="()=>{ filtroFechaDesdeReporteGastos=''; filtroFechaHastaReporteGastos=''; fetchGastosParaReporteAdmin(); }" class="btn-secondary-outline w-full sm:w-auto">Limpiar Fechas Reporte</button>
                 <!-- El botón de "Aplicar" no es estrictamente necesario aquí si el @change ya recarga -->
            </div>
        </div>
      </div>
    </div>

    <!-- Mensaje de Error Global para VIAJES -->
    <div v-if="errorMessage && !loading" class="mb-6 p-3.5 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-md text-sm shadow-md">
      <p class="font-bold">Error al cargar viajes:</p> <p>{{ errorMessage }}</p>
    </div>

    <!-- Indicador de Carga Principal para VIAJES -->
    <div v-if="loading && todosLosViajes.length === 0" class="text-center py-16">
      <svg class="animate-spin h-10 w-10 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p class="text-lg text-gray-600 mt-3">Cargando listado de viajes...</p>
    </div>
    <div v-else-if="!loading && todosLosViajes.length === 0 && !errorMessage" class="bg-white p-10 rounded-xl shadow-lg text-center border">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-16 h-16 mx-auto text-gray-300 mb-4"> <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-1.621-.87a3 3 0 01-.879-2.122v-1.007M12 15.75a3 3 0 100-6 3 3 0 000 6zm0 0h0m-6.75 0H12m0 0h6.75M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.454-.034-.902-.1-1.343M12 3c-.302 0-.591.02-.877.06M12 3c.282 0 .56.017.834.05M4.547 4.768A8.96 8.96 0 003 9c0 4.97 4.03 9 9 9s9-4.03 9-9c0-1.266-.264-2.466-.736-3.55M19.453 4.768A8.96 8.96 0 0021 9c0 .828-.111 1.627-.323 2.377M12 8.25c-1.362 0-2.56.398-3.538 1.073L12 12.75l3.538-3.427A6.008 6.008 0 0012 8.25z"/> </svg>
      <p class="text-gray-700 text-xl font-semibold">No se encontraron viajes con los filtros aplicados.</p>
      <p class="text-gray-500 text-sm mt-1">Intenta ajustar los filtros o crea un nuevo viaje.</p>
    </div>

    <!-- VISTA DE TARJETAS para VIAJES -->
    <div v-if="!loading && todosLosViajes.length > 0 && vistaActualAdmin === 'tarjetas'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <!-- Loop de tarjetas de viaje (sin cambios respecto a tu código original) -->
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
          <p class="text-xs font-bold mb-3 uppercase tracking-wider flex items-center" :class="viaje.cerrado_en ? 'text-red-600' : 'text-green-600'">
            <svg v-if="viaje.cerrado_en" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v3H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2.5a2.5 2.5 0 00-2.5 2.5V9h5V7a2.5 2.5 0 00-2.5-2.5z" /></svg>
            {{ getEstadoViajeTextoAdmin(viaje) }}
          </p>
          <div class="text-xs space-y-1 text-gray-600">
            <p><span class="font-medium">Inicio:</span> {{ formatDate(viaje.fecha_inicio) }} <span class="font-medium ml-2">Fin:</span> {{ formatDate(viaje.fecha_fin) || 'N/A' }}</p>
            <p><span class="font-medium">Adelanto Viaje:</span> <span class="font-semibold">{{ formatCurrency(viaje.monto_adelanto, viaje.moneda) }}</span></p>
            <p><span class="font-medium">Gastos Brutos (del viaje):</span> <span class="font-semibold">{{ formatCurrency(viaje.total_gastado_bruto_viaje, viaje.moneda) }}</span></p>
            <p class="text-sm"><span class="font-bold">SALDO VIAJE:</span> <span class="font-bold text-lg" :class="viaje.saldo_adelanto_viaje >=0 ? 'text-green-700':'text-red-700'">{{ formatCurrency(viaje.saldo_adelanto_viaje, viaje.moneda) }}</span></p>
            <p v-if="viaje.observacion_cierre"><span class="font-medium">Obs. Cierre:</span> {{ viaje.observacion_cierre }}</p>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-wrap gap-2 justify-end items-center">
          <button @click="verGastosDelViaje(viaje)" class="btn-admin-action bg-blue-500 hover:bg-blue-600">Ver Gastos</button>
          <button v-if="esViajeAbierto(viaje)" @click="adminCerrarRendicion(viaje)" class="btn-admin-action bg-orange-500 hover:bg-orange-600">Cerrar (Admin)</button>
          <button @click="adminEditarViaje(viaje)" class="btn-admin-action bg-yellow-400 hover:bg-yellow-500 text-yellow-900">Editar (Admin)</button>
        </div>
      </div>
    </div>

    <!-- VISTA DE TABLA para VIAJES -->
    <div v-else-if="!loading && todosLosViajes.length > 0 && vistaActualAdmin === 'tabla'" class="bg-white shadow-xl rounded-lg overflow-hidden border">
      <div class="overflow-x-auto">
        <!-- Tabla de viajes (sin cambios respecto a tu código original) -->
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">ID Rend.</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Concepto</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Responsable</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Inicio</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Fin</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Estado</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Adelanto</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Saldo Viaje</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="viaje in todosLosViajes" :key="viaje.id" class="hover:bg-gray-50 transition-colors" :class="{'opacity-70': viaje.cerrado_en}">
              <td class="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">#{{ viaje.codigo_rendicion }}</td>
              <td class="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" :title="viaje.nombre_viaje">{{ viaje.nombre_viaje }}</td>
              <td class="px-4 py-3 text-sm text-gray-500 truncate max-w-[150px]" :title="viaje.responsable_email">{{ viaje.responsable_nombre }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{{ formatDate(viaje.fecha_inicio) }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{{ formatDate(viaje.fecha_fin) || 'N/A' }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-xs">
                <span class="px-2 py-0.5 inline-flex leading-5 font-semibold rounded-full" :class="viaje.cerrado_en ? 'bg-red-100 text-red-800':'bg-green-100 text-green-800'">
                  {{ getEstadoViajeTextoAdmin(viaje).replace(/CERRADO EL.*|EN CURSO/g, (match) => match === 'EN CURSO' ? 'En Curso' : 'Cerrado') }}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{{ formatCurrency(viaje.monto_adelanto, viaje.moneda) }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-right" :class="viaje.saldo_adelanto_viaje >=0 ? 'text-green-600':'text-red-600'">{{ formatCurrency(viaje.saldo_adelanto_viaje, viaje.moneda) }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-center text-xs space-x-1">
                 <button @click="verGastosDelViaje(viaje)" class="btn-admin-action-xs bg-blue-500 hover:bg-blue-600">Ver Gastos</button>
                 <button v-if="esViajeAbierto(viaje)" @click="adminCerrarRendicion(viaje)" class="btn-admin-action-xs bg-orange-500 hover:bg-orange-600">Cerrar</button>
                 <button @click="adminEditarViaje(viaje)" class="btn-admin-action-xs bg-yellow-400 hover:bg-yellow-500 text-yellow-900">Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<style scoped>
.input-form-style {
  @apply mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-districorr-accent focus:ring-2 focus:ring-districorr-accent/50 sm:text-sm py-2 px-3;
}
.select-form-style { /* Para mantener consistencia con los inputs */
  @apply bg-white;
}
.btn-primary {
  @apply px-5 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-districorr-primary hover:bg-opacity-85 transition-colors;
}
.btn-secondary-outline {
   @apply px-5 py-2.5 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors;
}

.btn-admin-action {
  @apply text-xs text-white font-medium py-1.5 px-3 rounded-md transition duration-150 shadow-sm hover:shadow-md;
}
.btn-admin-action-xs {
  @apply text-[11px] text-white font-medium py-1 px-2 rounded shadow-sm hover:shadow transition-colors;
}
/* Para el dropdown de exportar */
.group:hover .group-hover\:opacity-100 {
    opacity: 1;
    pointer-events: auto;
}
.group:focus-within .group-focus-within\:opacity-100 {
    opacity: 1;
    pointer-events: auto;
}
</style>