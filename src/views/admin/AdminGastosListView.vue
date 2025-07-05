<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { formatDate, formatCurrency } from '../../utils/formatters.js';
import { useReportGenerator } from '../../composables/useReportGenerator.js';
import DetallesJson from '../../components/DetallesJson.vue';

const router = useRouter();
const route = useRoute();

const {
  calculateAdminGastosPorTipo,
  generateAdminResumenTiposGastoExcel,
  generateAdminResumenTiposGastoPDF,
  calculateResumenGerencialPorTipo,
  generateResumenGerencialTiposGastoPDF,
  generateResumenGerencialTipoExcel,
} = useReportGenerator();

const todosLosGastos = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const viajeFiltradoInfo = ref(null); 
const usuarioFiltradoInfo = ref(null); 
const listaTodosLosViajesParaFiltro = ref([]);    
const tiposDeGastoDisponibles = ref([]);         
const listaTodosLosUsuariosParaFiltro = ref([]); 
const estadosViajeParaFiltro = ref([
  { valor: '', etiqueta: 'Todos los Estados de Viaje' },
  { valor: 'en_curso', etiqueta: 'Viajes en Curso (Abiertos)' },
  { valor: 'cerrados', etiqueta: 'Viajes Cerrados' },
]);
const adminFiltroFechaDesde = ref('');
const adminFiltroFechaHasta = ref('');
const adminFiltroTipoGastoId = ref('');
const adminFiltroViajeId = ref(route.query.viajeId || ''); 
const adminFiltroUsuarioId = ref(''); 
const adminFiltroEstadoViaje = ref(''); 

// Tus constantes de columnas se mantienen
const colGastoId = 'gasto_id';
const colGastoCreatedAt = 'gasto_created_at';
const colGastoUserId = 'gasto_user_id';
const colFormatoIdGasto = 'formato_id';
const colFechaGasto = 'fecha_gasto';
const colMontoTotalGasto = 'gasto_monto_total';
const colMonedaGasto = 'gasto_moneda';
const colDescripcionGasto = 'gasto_descripcion';
const colNFacturaGasto = 'gasto_n_factura';
const colFacturaUrlGasto = 'gasto_factura_url';
const colAdelantoEspecificoGasto = 'adelanto_especifico_aplicado';
const colDatosAdicionalesGasto = 'gasto_datos_adicionales';
const colViajeIdDelGasto = 'viaje_id';
const colResponsableGastoNombre = 'responsable_gasto_nombre';
const colResponsableGastoEmail = 'responsable_gasto_email';
const colTipoGastoNombre = 'nombre_tipo_gasto'; 
const colTipoGastoIdOriginal = 'tipo_gasto_id'; 
const colViajeNombre = 'nombre_viaje';
const colViajeCodigoRendicion = 'viaje_codigo_rendicion';
const colViajeCerradoEn = 'viaje_cerrado_en';

// Tu computed `tituloVista` se mantiene igual y ahora funcionará correctamente
const tituloVista = computed(() => {
  if (adminFiltroViajeId.value && viajeFiltradoInfo.value) {
    let titulo = `Gastos del Viaje: "${viajeFiltradoInfo.value.nombre_viaje || 'Desconocido'}"`;
    if (viajeFiltradoInfo.value.codigo_rendicion) {
      titulo += ` (#${viajeFiltradoInfo.value.codigo_rendicion})`;
    }
    if (viajeFiltradoInfo.value.responsable_nombre) { 
        titulo += ` - Resp: ${viajeFiltradoInfo.value.responsable_nombre}`;
    }
    return titulo;
  }
  if (adminFiltroUsuarioId.value && usuarioFiltradoInfo.value) {
      return `Gastos del Usuario: ${usuarioFiltradoInfo.value.nombre_completo || usuarioFiltradoInfo.value.email || 'Desconocido'}`;
  }
  return 'Panel de Admin - Listado Global de Gastos';
});

// Tu función `fetchAdminDropdownData` se mantiene igual
async function fetchAdminDropdownData() {
  try {
    const [tiposRes, viajesRes, usuariosRes] = await Promise.all([
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true).order('nombre_tipo_gasto'),
      supabase.rpc('get_viajes_protegidos'), // Usando la función segura
      supabase.from('perfiles').select('id, nombre_completo, email').order('nombre_completo')
    ]);

    if (tiposRes.error) throw tiposRes.error;
    tiposDeGastoDisponibles.value = tiposRes.data || [];

    if (viajesRes.error) throw viajesRes.error;
    listaTodosLosViajesParaFiltro.value = (viajesRes.data || []).map(v => ({
        id: v.id,
        display_name: `${v.nombre_viaje || 'Viaje sin nombre'} (#${v.codigo_rendicion || 'S/C'}) ${v.responsable_nombre ? `- ${v.responsable_nombre}` : ''}`.trim(),
        nombre_viaje: v.nombre_viaje,
        codigo_rendicion: v.codigo_rendicion,
        responsable_nombre: v.responsable_nombre,
        monto_adelanto: v.monto_adelanto,
        cerrado_en: v.cerrado_en
    })).sort((a,b) => a.display_name.localeCompare(b.display_name));

    if (usuariosRes.error) throw usuariosRes.error;
    listaTodosLosUsuariosParaFiltro.value = (usuariosRes.data || []).map(u => ({
        id: u.id, 
        nombre_completo: u.nombre_completo,
        email: u.email,
        display_name: `${u.nombre_completo || 'Usuario sin nombre'} (${u.email || 'Sin email'})`
    })).sort((a,b) => (a.nombre_completo || a.email || '').localeCompare(b.nombre_completo || b.email || ''));

  } catch (error) {
    errorMessage.value = `Error cargando opciones de filtro: ${error.message}`;
  }
}

// ***** FUNCIÓN fetchAdminGastos REFACTORIZADA *****
async function fetchAdminGastos() {
  const viajeIdActivoParaFiltrar = route.query.viajeId || adminFiltroViajeId.value;
  loading.value = true; 
  errorMessage.value = '';

  try {
    // 1. OBTENEMOS TODOS LOS DATOS CRUDOS EN PARALELO
    const [gastosResult, viajesResult] = await Promise.all([
        supabase.rpc('get_gastos_protegidos'),
        // Obtenemos los viajes de nuevo para tener siempre la info más fresca
        supabase.rpc('get_viajes_protegidos') 
    ]);

    if (gastosResult.error) throw gastosResult.error;
    if (viajesResult.error) throw viajesResult.error;

    let todosLosGastosCrudos = gastosResult.data || [];
    let todosLosViajesCrudos = viajesResult.data || [];

    // 2. APLICAMOS LOS FILTROS SOBRE LOS DATOS CRUDOS
    let gastosFiltrados = todosLosGastosCrudos;
    
    if (adminFiltroFechaDesde.value) gastosFiltrados = gastosFiltrados.filter(g => new Date(g.fecha_gasto) >= new Date(adminFiltroFechaDesde.value));
    if (adminFiltroFechaHasta.value) {
      const fechaHasta = new Date(adminFiltroFechaHasta.value);
      fechaHasta.setUTCDate(fechaHasta.getUTCDate() + 1);
      gastosFiltrados = gastosFiltrados.filter(g => new Date(g.fecha_gasto) < fechaHasta);
    }
    if (adminFiltroTipoGastoId.value) gastosFiltrados = gastosFiltrados.filter(g => String(g.tipo_gasto_id) === String(adminFiltroTipoGastoId.value));
    if (viajeIdActivoParaFiltrar) gastosFiltrados = gastosFiltrados.filter(g => String(g.viaje_id) === String(viajeIdActivoParaFiltrar));
    if (adminFiltroEstadoViaje.value) {
        if (adminFiltroEstadoViaje.value === 'en_curso') gastosFiltrados = gastosFiltrados.filter(g => g.viaje_cerrado_en === null);
        else if (adminFiltroEstadoViaje.value === 'cerrados') gastosFiltrados = gastosFiltrados.filter(g => g.viaje_cerrado_en !== null);
    }
    if (adminFiltroUsuarioId.value) gastosFiltrados = gastosFiltrados.filter(g => String(g.gasto_user_id) === String(adminFiltroUsuarioId.value));
    
    // 3. ACTUALIZAMOS EL ESTADO DE LA UI AL MISMO TIEMPO
    if (viajeIdActivoParaFiltrar) {
        const info = todosLosViajesCrudos.find(v => String(v.id) === String(viajeIdActivoParaFiltrar));
        // Guardamos toda la info relevante del viaje
        viajeFiltradoInfo.value = info ? {
            id: info.id,
            nombre_viaje: info.nombre_viaje,
            codigo_rendicion: info.codigo_rendicion,
            responsable_nombre: info.responsable_nombre,
            monto_adelanto: info.monto_adelanto,
            cerrado_en: info.cerrado_en
        } : { id: viajeIdActivoParaFiltrar, nombre_viaje: "Cargando..." };
    } else {
        viajeFiltradoInfo.value = null;
    }

    if (adminFiltroUsuarioId.value) {
        // Asumimos que listaTodosLosUsuariosParaFiltro ya está cargada
        const info = listaTodosLosUsuariosParaFiltro.value.find(u => String(u.id) === String(adminFiltroUsuarioId.value));
        usuarioFiltradoInfo.value = info || { id: adminFiltroUsuarioId.value, nombre_completo: "Cargando..." };
    } else if (!viajeIdActivoParaFiltrar) {
        usuarioFiltradoInfo.value = null;
    }

    // Ordenamos y asignamos los gastos a la variable reactiva
    gastosFiltrados.sort((a,b) => new Date(b[colFechaGasto]) - new Date(a[colFechaGasto]) || new Date(b[colGastoCreatedAt]) - new Date(a[colGastoCreatedAt]));
    todosLosGastos.value = gastosFiltrados;

  } catch (error) {
    errorMessage.value = `No se pudieron cargar los gastos: ${error.message || 'Error desconocido.'}`;
    todosLosGastos.value = []; 
  } finally { 
    loading.value = false; 
  }
}

// `onMounted` y `watch` se mantienen, ahora llamarán a la función refactorizada
onMounted(() => {
  fetchAdminDropdownData();
});
watch(() => route.query.viajeId, (newViajeIdQuery) => {
    adminFiltroViajeId.value = newViajeIdQuery || '';
    fetchAdminGastos(); 
}, { immediate: true }); 

// El resto de tus funciones se mantienen sin cambios
const adminAplicarFiltrosManualmente = () => {
  const viajeIdEnRuta = route.query.viajeId || '';
  const viajeIdEnSelect = adminFiltroViajeId.value || '';
  if (viajeIdEnSelect !== viajeIdEnRuta) {
    router.push({ name: 'AdminGastosList', query: { viajeId: viajeIdEnSelect || undefined } });
  } else { fetchAdminGastos(); }
};

const adminLimpiarFiltros = () => {
  adminFiltroFechaDesde.value = ''; adminFiltroFechaHasta.value = ''; adminFiltroTipoGastoId.value = '';
  adminFiltroUsuarioId.value = ''; adminFiltroEstadoViaje.value = '';
  const teniaViajeIdEnRuta = !!route.query.viajeId;
  adminFiltroViajeId.value = ''; viajeFiltradoInfo.value = null; usuarioFiltradoInfo.value = null;
  if (teniaViajeIdEnRuta) { router.push({ name: 'AdminGastosList', query: {} }); } 
  else { fetchAdminGastos(); }
};

const adminVerDetalleGasto = (gasto) => {
  alert(`Admin: Detalle Gasto ID: ${gasto[colGastoId]}\nResp: ${gasto[colResponsableGastoNombre] || 'N/A'}\nViaje: ${gasto[colViajeNombre] || 'N/A'} (#${gasto[colViajeCodigoRendicion] || 'S/C'})\nMonto: ${formatCurrency(gasto[colMontoTotalGasto], gasto[colMonedaGasto])}`);
};

const handleExportAdminResumenDetalladoTipoExcel = () => {
  if (!todosLosGastos.value || todosLosGastos.value.length === 0) { alert('No hay gastos para exportar.'); return; }
  const gastosAgrupados = calculateAdminGastosPorTipo(todosLosGastos.value);
  generateAdminResumenTiposGastoExcel(gastosAgrupados, 'Admin_Gastos_ResumenDetalladoTipo');
};
const handleExportAdminResumenDetalladoTipoPDF = () => {
  if (!todosLosGastos.value || todosLosGastos.value.length === 0) { alert('No hay gastos para exportar.'); return; }
  const gastosAgrupados = calculateAdminGastosPorTipo(todosLosGastos.value);
  generateAdminResumenTiposGastoPDF(gastosAgrupados, 'Admin_Gastos_ResumenDetalladoTipo');
};

const handleExportAdminResumenGerencialTipoExcel = () => {
  if (!todosLosGastos.value || todosLosGastos.value.length === 0) { alert('No hay gastos para exportar.'); return; }
  const dataResumen = calculateResumenGerencialPorTipo(todosLosGastos.value, 'ARS');
  generateResumenGerencialTiposGastoExcel(dataResumen, 'Admin_Gastos_ResumenGerencialTipo');
};
const handleExportAdminResumenGerencialTipoPDF = () => {
  if (!todosLosGastos.value || todosLosGastos.value.length === 0) { alert('No hay gastos para exportar.'); return; }
  const dataResumen = calculateResumenGerencialPorTipo(todosLosGastos.value, 'ARS');
  generateResumenGerencialTiposGastoPDF(dataResumen, 'Admin_Gastos_ResumenGerencialTipo');
};

const resumenSaldoViaje = computed(() => {
    if (!viajeFiltradoInfo.value || !adminFiltroViajeId.value) return null;
    const adelantoInicial = parseFloat(viajeFiltradoInfo.value.monto_adelanto) || 0;
    const adelantosExtrasLista = todosLosGastos.value.reduce((sum, g) => sum + (parseFloat(g[colAdelantoEspecificoGasto]) || 0), 0);
    const totalAdelantos = adelantoInicial + adelantosExtrasLista;
    const totalGastosLista = todosLosGastos.value.reduce((sum, g) => sum + (parseFloat(g[colMontoTotalGasto]) || 0), 0);
    const saldo = totalAdelantos - totalGastosLista;
    const monedaViaje = 'ARS';
    return {
        nombre: viajeFiltradoInfo.value.nombre_viaje, codigo: viajeFiltradoInfo.value.codigo_rendicion,
        cerrado: !!viajeFiltradoInfo.value.cerrado_en, adelantoInicialF: formatCurrency(adelantoInicial, monedaViaje),
        adelantosExtrasListaF: formatCurrency(adelantosExtrasLista, monedaViaje),
        totalAdelantosF: formatCurrency(totalAdelantos, monedaViaje),
        totalGastosListaF: formatCurrency(totalGastosLista, monedaViaje),
        saldoF: formatCurrency(saldo, monedaViaje), saldoEsPositivo: saldo >= 0, moneda: monedaViaje
    };
});
</script>
<template>
  <div class="container mx-auto px-2 sm:px-4 lg:px-6 py-8">
    <!-- Encabezado y Limpiar Filtros -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
          {{ tituloVista }}
        </h1>
        <router-link 
          v-if="route.query.viajeId || adminFiltroViajeId || adminFiltroUsuarioId || adminFiltroTipoGastoId || adminFiltroEstadoViaje || adminFiltroFechaDesde || adminFiltroFechaHasta" 
          to="#"
          @click.prevent="adminLimpiarFiltros"
          class="text-sm text-blue-600 hover:underline mt-1.5 inline-flex items-center group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 group-hover:rotate-[-90deg] transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Limpiar Filtros y Ver Todos
        </router-link>
      </div>

      <!-- Botones de Reportes para Admin -->
      <div v-if="!loading && todosLosGastos.length > 0" class="flex flex-col sm:flex-row gap-2 sm:items-center mt-3 sm:mt-0 self-start sm:self-center">
        <div class="relative group">
            <button class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                Exportar Reportes
            </button>
            <div class="absolute right-0 mt-1 w-72 bg-white rounded-md shadow-xl z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto py-1">
                <p class="menu-section-title">Resúmenes Detallados Admin:</p>
                <a @click.prevent="handleExportAdminResumenDetalladoTipoExcel" href="#" class="menu-item">Resumen Detallado por Tipo (Excel)</a>
                <a @click.prevent="handleExportAdminResumenDetalladoTipoPDF" href="#" class="menu-item">Resumen Detallado por Tipo (PDF)</a>
                
                <div class="menu-divider"></div>
                <p class="menu-section-title">Reportes Gerenciales:</p>
                <a @click.prevent="handleExportAdminResumenGerencialTipoExcel" href="#" class="menu-item">Resumen Gerencial por Tipo (Excel)</a>
                <a @click.prevent="handleExportAdminResumenGerencialTipoPDF" href="#" class="menu-item">Resumen Gerencial por Tipo (PDF)</a>
            </div>
        </div>
      </div>
    </div>

    <!-- Sección de Filtros para Admin -->
    <div class="bg-white p-4 sm:p-6 rounded-xl shadow-lg mb-8 border border-gray-200">
      <h3 class="text-xl font-semibold text-gray-800 mb-4">Filtrar Gastos</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-6 gap-y-5 items-end">
        <div><label for="adminFiltroFechaDesde" class="block text-sm font-medium text-gray-700 mb-1">Gasto Desde</label><input type="date" id="adminFiltroFechaDesde" v-model="adminFiltroFechaDesde" class="input-form-style"></div>
        <div><label for="adminFiltroFechaHasta" class="block text-sm font-medium text-gray-700 mb-1">Gasto Hasta</label><input type="date" id="adminFiltroFechaHasta" v-model="adminFiltroFechaHasta" class="input-form-style"></div>
        <div><label for="adminFiltroTipoGastoId" class="block text-sm font-medium text-gray-700 mb-1">Tipo de Gasto</label><select id="adminFiltroTipoGastoId" v-model="adminFiltroTipoGastoId" class="input-form-style select-form-style"><option value="">Todos los tipos</option><option v-for="tipo in tiposDeGastoDisponibles" :key="tipo.id" :value="tipo.id">{{ tipo.nombre_tipo_gasto }}</option></select></div>
        <div><label for="adminFiltroViajeId" class="block text-sm font-medium text-gray-700 mb-1">Viaje / Período Específico</label><select id="adminFiltroViajeId" v-model="adminFiltroViajeId" class="input-form-style select-form-style" :disabled="!!route.query.viajeId"><option value="">Todos los viajes</option><option v-for="viajeFiltro in listaTodosLosViajesParaFiltro" :key="viajeFiltro.id" :value="viajeFiltro.id">{{ viajeFiltro.display_name }}</option></select><p v-if="route.query.viajeId" class="text-xs text-gray-500 mt-1">Filtro de viaje aplicado desde URL. Limpie filtros para cambiar.</p></div>
        <div><label for="adminFiltroEstadoViaje" class="block text-sm font-medium text-gray-700 mb-1">Estado del Viaje/Período</label><select id="adminFiltroEstadoViaje" v-model="adminFiltroEstadoViaje" class="input-form-style select-form-style"><option v-for="estado in estadosViajeParaFiltro" :key="estado.valor" :value="estado.valor">{{ estado.etiqueta }}</option></select></div>
        <div><label for="adminFiltroUsuarioId" class="block text-sm font-medium text-gray-700 mb-1">Responsable del Gasto</label><select id="adminFiltroUsuarioId" v-model="adminFiltroUsuarioId" class="input-form-style select-form-style"><option value="">Todos los responsables</option><option v-for="usuario in listaTodosLosUsuariosParaFiltro" :key="usuario.id" :value="usuario.id">{{ usuario.display_name }}</option></select></div>
      </div>
      <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
        <button @click="adminLimpiarFiltros" class="btn-secondary-outline w-full sm:w-auto">Limpiar</button>
        <button @click="adminAplicarFiltrosManualmente" class="btn-primary w-full sm:w-auto">Aplicar Filtros</button>
      </div>
    </div>

    <div v-if="!loading && resumenSaldoViaje" class="mb-6 bg-blue-50 p-4 rounded-lg shadow-md text-right sm:min-w-[400px] border border-blue-200 space-y-1.5">
        <p class="text-sm text-gray-800 font-semibold mb-1.5 text-center sm:text-right">Resumen del Viaje: "{{ resumenSaldoViaje.nombre }}" <span v-if="resumenSaldoViaje.codigo" class="font-mono text-xs">(#{{ resumenSaldoViaje.codigo }})</span></p>
        <div v-if="resumenSaldoViaje.cerrado" class="text-xs text-red-600 font-semibold text-center sm:text-right mb-1.5">PERÍODO CERRADO</div><hr class="my-2 border-blue-200/60">
        <div class="flex justify-between items-center"><span class="text-sm text-gray-600">Adelanto Inicial:</span><span class="font-semibold text-blue-700">{{ resumenSaldoViaje.adelantoInicialF }}</span></div>
        <div class="flex justify-between items-center"><span class="text-sm text-gray-600">(+) Adelantos Extras (lista):</span><span class="font-semibold text-green-600">{{ resumenSaldoViaje.adelantosExtrasListaF }}</span></div><hr class="my-1.5 border-blue-200/60">
        <div class="flex justify-between items-center"><span class="text-sm text-gray-700 font-medium">(=) Total Adelantos:</span><span class="font-semibold text-green-700">{{ resumenSaldoViaje.totalAdelantosF }}</span></div>
        <div class="flex justify-between items-center"><span class="text-sm text-gray-600">(-) Total Gastos Brutos (lista):</span><span class="font-semibold text-red-600">{{ resumenSaldoViaje.totalGastosListaF }}</span></div><hr class="my-1.5 border-blue-300 font-bold">
        <div class="flex justify-between items-center"><span class="text-lg font-bold" :class="resumenSaldoViaje.saldoEsPositivo ? 'text-green-600':'text-red-600'">SALDO:</span><span class="text-lg font-bold" :class="resumenSaldoViaje.saldoEsPositivo ? 'text-green-600':'text-red-600'">{{ resumenSaldoViaje.saldoF }}</span></div>
    </div>

    <div v-if="loading" class="text-center py-12"><svg class="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p class="text-lg text-gray-600 mt-3">Cargando...</p></div>
    <div v-else-if="errorMessage" class="error-banner" role="alert"><p class="font-bold">Error:</p><p>{{ errorMessage }}</p></div>
    <div v-else-if="todosLosGastos.length === 0" class="no-data-placeholder"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-16 h-16 mx-auto text-gray-300 mb-4"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v.001c0 .621.504 1.125 1.125 1.125z" /></svg><p>No se encontraron gastos.</p></div>

    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-100">
            <tr>
              <th scope="col" class="table-header">Fecha</th>
              <th scope="col" class="table-header">Responsable</th>
              <th scope="col" class="table-header">Tipo Gasto</th>
              <th scope="col" class="table-header">Desc.</th>
              <th scope="col" class="table-header">Detalles Adicionales</th>
              <th scope="col" class="table-header">Viaje (#ID)</th>
              <th scope="col" class="table-header text-right">Monto Bruto <span class="block text-[10px] normal-case text-gray-500">(Ad.Esp.)</span></th>
              <th scope="col" class="table-header text-center">Estado Viaje</th>
              <th scope="col" class="table-header text-center">Fact.</th>
              <th scope="col" class="relative table-header"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="gasto in todosLosGastos" :key="gasto[colGastoId]" class="hover:bg-gray-50/75 transition-colors" :class="{'opacity-70': gasto[colViajeCerradoEn]}">
              <td class="table-cell">{{ formatDate(gasto[colFechaGasto]) }}</td>
              <td class="table-cell" :title="gasto[colResponsableGastoEmail]">{{ gasto[colResponsableGastoNombre] || 'N/A' }}</td>
              <td class="table-cell">{{ gasto[colTipoGastoNombre] || 'N/A' }}</td>
              <td class="table-cell max-w-xs">
                <div class="truncate" :title="gasto[colDescripcionGasto]">{{ gasto[colDescripcionGasto] || '-' }}</div>
              </td>
              <td class="table-cell">
                <DetallesJson :datos="gasto[colDatosAdicionalesGasto]" />
              </td>
              <td class="table-cell">
                <span :title="gasto[colViajeNombre]">{{ gasto[colViajeNombre] ? gasto[colViajeNombre].substring(0,20) + (gasto[colViajeNombre].length > 20 ? '...' : '') : 'N/A' }}</span>
                <span v-if="gasto[colViajeCodigoRendicion]" class="text-xs font-mono text-gray-400 ml-1">#{{ gasto[colViajeCodigoRendicion] }}</span>
              </td>
              <td class="table-cell text-right font-semibold">
                {{ formatCurrency(gasto[colMontoTotalGasto], gasto[colMonedaGasto]) }}
                <div v-if="gasto[colAdelantoEspecificoGasto] && parseFloat(gasto[colAdelantoEspecificoGasto]) !== 0" class="text-xs font-normal" :class="parseFloat(gasto[colAdelantoEspecificoGasto]) > 0 ? 'text-green-600' : 'text-red-600'" :title="`Adelanto Específico: ${formatCurrency(gasto[colAdelantoEspecificoGasto], gasto[colMonedaGasto])}`">
                  ({{ formatCurrency(gasto[colAdelantoEspecificoGasto], gasto[colMonedaGasto]) }})
                </div>
              </td>
              <td class="table-cell text-center text-xs font-medium">
                <span class="px-2 py-0.5 inline-flex leading-5 rounded-full" :class="gasto[colViajeCerradoEn] ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'">
                  {{ gasto[colViajeCerradoEn] ? 'Cerrado' : 'En Curso' }}
                </span>
              </td>
              <td class="table-cell text-center">
                <a v-if="gasto[colFacturaUrlGasto]" :href="gasto[colFacturaUrlGasto]" target="_blank" class="text-blue-600 hover:underline font-medium">Ver</a>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="table-cell text-right space-x-2">
                <button @click="adminVerDetalleGasto(gasto)" class="text-blue-600 hover:text-blue-800 font-medium transition-colors">Detalles</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>