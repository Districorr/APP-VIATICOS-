<script setup>
import { ref, onMounted, computed, watch, inject } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter, useRoute } from 'vue-router';
import { useReportGenerator } from '../composables/useReportGenerator.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';

const router = useRouter();
const route = useRoute();
const userProfile = inject('userProfile', ref(null));

// --- ACTUALIZADO: Importamos la nueva función ---
const { generateGastosExcel, generateRendicionCompletaPDF } = useReportGenerator();

const gastos = ref([]);
const viajeSeleccionadoInfo = ref(null);
const loading = ref(true);
const errorMessage = ref('');
const listaViajesParaFiltro = ref([]);
const tiposDeGastoDisponibles = ref([]);
const currentUserEmail = ref('');
const currentUserName = ref('');
const filtroFechaDesde = ref('');
const filtroFechaHasta = ref('');
const filtroTipoGastoId = ref('');
const filtroViajeId = ref('');

const totalGastadoBrutoFiltradoUI = computed(() => {
    if (!gastos.value || gastos.value.length === 0) return 0;
    return gastos.value.reduce((acc, gasto) => acc + (gasto.monto_total || 0), 0);
});

const totalAdelantosEspecificosFiltradosUI = computed(() => {
    if (!gastos.value || gastos.value.length === 0) return 0;
    const nombreColumnaAdelantoGasto = 'adelanto_especifico_aplicado'; 
    return gastos.value.reduce((acc, gasto) => acc + (gasto[nombreColumnaAdelantoGasto] || 0), 0);
});

const totalAdelantosDisponiblesViajeUI = computed(() => {
  if (!viajeSeleccionadoInfo.value || viajeSeleccionadoInfo.value.monto_adelanto === null || viajeSeleccionadoInfo.value.monto_adelanto === undefined) {
    return viajeSeleccionadoInfo.value ? totalAdelantosEspecificosFiltradosUI.value : totalAdelantosEspecificosFiltradosUI.value;
  }
  const adelantoInicialViaje = viajeSeleccionadoInfo.value.monto_adelanto || 0;
  return adelantoInicialViaje + totalAdelantosEspecificosFiltradosUI.value;
});

const saldoActualViajeUI = computed(() => {
  if (!viajeSeleccionadoInfo.value) { 
    return null; 
  }
  return totalAdelantosDisponiblesViajeUI.value - totalGastadoBrutoFiltradoUI.value;
});

const isViajeActualCerrado = computed(() => {
    return !!viajeSeleccionadoInfo.value?.cerrado_en;
});

const fetchDropdownData = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { 
        currentUserEmail.value = 'Usuario no autenticado'; 
        currentUserName.value = 'N/A'; 
        return; 
    }
    currentUserEmail.value = user.email || 'Email no disponible';
    if (userProfile.value && userProfile.value.nombre_completo) { 
        currentUserName.value = userProfile.value.nombre_completo; 
    } else {
        const { data: profileData } = await supabase.from('perfiles').select('nombre_completo').eq('id', user.id).single();
        currentUserName.value = profileData?.nombre_completo || currentUserEmail.value;
    }
    const { data: tiposData, error: tiposError } = await supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true).order('nombre_tipo_gasto');
    if (tiposError) throw tiposError;
    tiposDeGastoDisponibles.value = tiposData || [];
    const { data: viajesData, error: viajesError } = await supabase.from('viajes').select('id, nombre_viaje, codigo_rendicion').eq('user_id', user.id).order('nombre_viaje', { ascending: true });
    if (viajesError) throw viajesError;
    listaViajesParaFiltro.value = viajesData || [];
  } catch (error) { 
    errorMessage.value = "Error cargando opciones de filtro."; 
  }
};

const fetchGastos = async () => {
  loading.value = true; 
  errorMessage.value = ''; 
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const nombreColumnaAdelantoGastoSelect = 'adelanto_especifico_aplicado';
    let query = supabase.from('gastos')
      .select(`id, fecha_gasto, monto_total, moneda, descripcion_general, numero_factura, factura_url, monto_iva, cliente_referido, ${nombreColumnaAdelantoGastoSelect}, viaje_id, viajes!inner(id, nombre_viaje, monto_adelanto, fecha_inicio, fecha_fin, cerrado_en, codigo_rendicion), tipos_gasto_config (id, nombre_tipo_gasto)`)
      .eq('user_id', user.id);

    if (filtroFechaDesde.value) query = query.gte('fecha_gasto', filtroFechaDesde.value);
    if (filtroFechaHasta.value) { 
      const fechaHasta = new Date(filtroFechaHasta.value);
      fechaHasta.setUTCDate(fechaHasta.getUTCDate() + 1);
      query = query.lt('fecha_gasto', fechaHasta.toISOString().split('T')[0]);
    }
    if (filtroTipoGastoId.value) query = query.eq('tipo_gasto_id', filtroTipoGastoId.value);
    
    if (filtroViajeId.value) {
      query = query.eq('viaje_id', filtroViajeId.value);
      const { data: viajeData } = await supabase.from('viajes').select('id, nombre_viaje, monto_adelanto, fecha_inicio, fecha_fin, cerrado_en, codigo_rendicion').eq('id', filtroViajeId.value).eq('user_id', user.id).single();
      viajeSeleccionadoInfo.value = viajeData || null;
    } else { 
      viajeSeleccionadoInfo.value = null; 
    }

    const { data, error } = await query.order('fecha_gasto', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw error;
    gastos.value = data || [];
  } catch (error) { 
    errorMessage.value = 'No se pudieron cargar los gastos: ' + error.message;
    gastos.value = [];
  } finally { 
    loading.value = false; 
  }
};

onMounted(() => { 
  fetchDropdownData(); 
});

watch(() => route.query.viajeId, (newViajeId) => {
    if (filtroViajeId.value !== (newViajeId || '')) {
        filtroViajeId.value = newViajeId || ''; 
    }
    fetchGastos(); 
}, { immediate: true });

const aplicarFiltros = () => {
  if (String(filtroViajeId.value || '') !== String(route.query.viajeId || '')) {
      router.push({ 
        name: 'GastosListUser',
        query: { ...route.query, viajeId: filtroViajeId.value || undefined } 
      });
  } else {
      fetchGastos();
  }
};

const limpiarFiltros = () => {
  filtroFechaDesde.value = ''; 
  filtroFechaHasta.value = ''; 
  filtroTipoGastoId.value = '';
  const teniaViajeIdEnRuta = !!route.query.viajeId;
  filtroViajeId.value = ''; 

  if (teniaViajeIdEnRuta) {
    router.push({ name: 'GastosListUser', query: {} });
  } else {
    fetchGastos(); 
  }
};

const goToNuevoGasto = () => {
  if (isViajeActualCerrado.value) {
    alert("No se pueden agregar nuevos gastos a un Viaje/Período que ya ha sido cerrado.");
    return;
  }
  const query = filtroViajeId.value ? { viajeId: filtroViajeId.value } : {};
  router.push({ name: 'GastoFormCreate', query });
};

const editarGasto = (gasto) => { 
  if (gasto.viajes?.cerrado_en) {
    alert("No se puede editar un gasto de un período que ya ha sido cerrado.");
    return;
  }
  router.push({ name: 'GastoFormEdit', params: { id: gasto.id } });
};

const eliminarGasto = async (gasto) => { 
  if (gasto.viajes?.cerrado_en) {
    alert("No se pueden eliminar gastos de un período que ya ha sido cerrado.");
    return;
  }
  if (!confirm(`¿Estás seguro de que querés eliminar el gasto "${gasto.descripcion_general || 'Gasto sin descripción'}"? Esta acción no se puede deshacer.`)) return;
  
  loading.value = true; 
  errorMessage.value = '';
  try {
    if (gasto.factura_url) {
        try {
            const urlObject = new URL(gasto.factura_url);
            const pathSegments = urlObject.pathname.split('/');
            const bucketNameInUrl = 'facturas'; 
            const bucketIndex = pathSegments.findIndex(segment => segment === bucketNameInUrl);
            if (bucketIndex !== -1 && bucketIndex < pathSegments.length -1) {
                const filePathInBucket = pathSegments.slice(bucketIndex + 1).join('/');
                if (filePathInBucket) { await supabase.storage.from(bucketNameInUrl).remove([filePathInBucket]); }
            }
        } catch (e) { console.warn("EliminarGasto: Error al eliminar factura de Storage:", e.message); }
    }
    const { error } = await supabase.from('gastos').delete().eq('id', gasto.id);
    if (error) throw error;
    fetchGastos(); 
    alert('Gasto eliminado correctamente.');
  } catch (error) {
    errorMessage.value = 'Error al eliminar el gasto: ' + error.message;
  } finally {
    loading.value = false;
  }
};

const exportarAExcelWrapper = () => {
  if (gastos.value.length === 0) { alert('No hay gastos para exportar a Excel.'); return; }
  const userInfo = { nombre: currentUserName.value, email: currentUserEmail.value };
  generateGastosExcel(JSON.parse(JSON.stringify(gastos.value)), viajeSeleccionadoInfo.value, userInfo);
};

// --- NUEVA FUNCIÓN WRAPPER PARA LA RENDICIÓN COMPLETA ---
const generarRendicionPDFWrapper = () => {
  if (!viajeSeleccionadoInfo.value) {
    alert('Por favor, selecciona un viaje/período desde los filtros para generar la rendición.');
    return;
  }
  if (gastos.value.length === 0) {
    alert('No hay gastos en este período para generar la rendición.');
    return;
  }

  const userInfo = { nombre: currentUserName.value, email: currentUserEmail.value };
  const totales = {
    gastosBruto: totalGastadoBrutoFiltradoUI.value,
    adelantosExtras: totalAdelantosEspecificosFiltradosUI.value,
    adelantosDisponibles: totalAdelantosDisponiblesViajeUI.value,
    saldoFinal: saldoActualViajeUI.value
  };

  // Usamos la nueva función del composable
  generateRendicionCompletaPDF(
    JSON.parse(JSON.stringify(gastos.value)), 
    viajeSeleccionadoInfo.value, 
    userInfo,
    totales
  );
};
</script>
<template>
  <div class="container mx-auto px-2 sm:px-4 lg:px-6 py-8">
    <!-- Encabezado y Botón Nuevo Gasto -->
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary tracking-tight">
          Listado de Gastos
          <span v-if="viajeSeleccionadoInfo && filtroViajeId" class="text-xl text-districorr-accent font-normal block sm:inline mt-1 sm:mt-0">
            del Viaje/Período: "{{ viajeSeleccionadoInfo.nombre_viaje }}"
            <span v-if="viajeSeleccionadoInfo.codigo_rendicion" class="font-mono text-sm">(#{{ viajeSeleccionadoInfo.codigo_rendicion }})</span>
          </span>
        </h1>
        <router-link v-if="filtroViajeId" :to="{ name: 'GastosListUser' }" 
                     class="text-sm text-districorr-accent hover:underline mt-1.5 inline-flex items-center group">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform duration-150"><path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd" /></svg>
          Ver todos los gastos
        </router-link>
      </div>
      <button
        @click="goToNuevoGasto"
        :disabled="isViajeActualCerrado"
        class="w-full sm:w-auto bg-green-500 text-white font-semibold py-2.5 px-5 rounded-lg hover:bg-green-600 transition-all duration-150 ease-in-out shadow-md hover:shadow-lg flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-103"
        :title="isViajeActualCerrado ? 'No se pueden agregar gastos a un período cerrado' : 'Registrar un nuevo gasto'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
        Nuevo Gasto
      </button>
    </div>
    <p v-if="isViajeActualCerrado" class="text-xs text-center sm:text-right text-red-600 mb-4 -mt-4 bg-red-50 p-2 rounded-md border border-red-200 shadow-sm">
      Este período de rendición está cerrado. No se pueden agregar, editar o eliminar gastos.
    </p>

    <!-- Sección de Filtros -->
    <div class="bg-white p-4 sm:p-6 rounded-xl shadow-lg mb-6 border border-gray-200">
      <h3 class="text-lg font-semibold text-districorr-text-dark mb-4">Filtrar Gastos</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 items-end">
        <div>
          <label for="filtroFechaDesde" class="block text-sm font-medium text-districorr-text-medium mb-1">Desde</label>
          <input type="date" id="filtroFechaDesde" v-model="filtroFechaDesde" @change="aplicarFiltros" class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-districorr-accent focus:ring-2 focus:ring-districorr-accent/50 sm:text-sm py-2 px-3">
        </div>
        <div>
          <label for="filtroFechaHasta" class="block text-sm font-medium text-districorr-text-medium mb-1">Hasta</label>
          <input type="date" id="filtroFechaHasta" v-model="filtroFechaHasta" @change="aplicarFiltros" class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-districorr-accent focus:ring-2 focus:ring-districorr-accent/50 sm:text-sm py-2 px-3">
        </div>
        <div>
          <label for="filtroTipoGastoId" class="block text-sm font-medium text-districorr-text-medium mb-1">Tipo de Gasto</label>
          <select id="filtroTipoGastoId" v-model.number="filtroTipoGastoId" @change="aplicarFiltros" class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-districorr-accent focus:ring-2 focus:ring-districorr-accent/50 sm:text-sm py-2.5 px-3 bg-white">
            <option value="">Todos los tipos</option>
            <option v-for="tipo in tiposDeGastoDisponibles" :key="tipo.id" :value="tipo.id">{{ tipo.nombre_tipo_gasto }}</option>
          </select>
        </div>
        <div>
          <label for="filtroViajeId" class="block text-sm font-medium text-districorr-text-medium mb-1">Viaje / Período</label>
          <select id="filtroViajeId" v-model.number="filtroViajeId" @change="aplicarFiltros" class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-districorr-accent focus:ring-2 focus:ring-districorr-accent/50 sm:text-sm py-2.5 px-3 bg-white">
            <option value="">Todos los viajes/períodos</option>
            <option v-for="viajeFiltro in listaViajesParaFiltro" :key="viajeFiltro.id" :value="viajeFiltro.id">
              {{ viajeFiltro.nombre_viaje }} <span v-if="viajeFiltro.codigo_rendicion">(#{{ viajeFiltro.codigo_rendicion }})</span>
            </option>
          </select>
        </div>
      </div>
      <div class="mt-5 flex flex-col sm:flex-row gap-3 justify-end">
        <button @click="limpiarFiltros" class="w-full sm:w-auto px-5 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
          Limpiar Filtros
        </button>
        <button @click="aplicarFiltros" class="w-full sm:w-auto px-5 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-districorr-primary hover:bg-opacity-85 transition-colors">
          Aplicar Filtros
        </button>
      </div>
    </div>

    <!-- Sección de Exportación y Contador de Saldo -->
     <div v-if="!loading || gastos.length > 0" class="mb-6 flex flex-col md:flex-row gap-4 justify-between items-start">
        <div class="flex flex-wrap gap-3">
            <!-- BOTÓN EXCEL ACTUALIZADO -->
            <button @click="exportarAExcelWrapper" :disabled="gastos.length === 0"
                    class="btn btn-success flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"> <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm10 2.75a.75.75 0 00-1.5 0v1.5H9.25a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5V6.75zM5.5 11.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3zM5.5 15a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-6z" /> </svg>
              Exportar Excel
            </button>
            <!-- BOTÓN PDF ACTUALIZADO -->
            <button @click="generarRendicionPDFWrapper" 
                    v-if="viajeSeleccionadoInfo"
                    class="btn btn-danger flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 2.25A2.25 2.25 0 017.25 0h5.5A2.25 2.25 0 0115 2.25v15A2.25 2.25 0 0112.75 20h-5.5A2.25 2.25 0 015 17.75V2.25zm4.75.75a.75.75 0 00-1.5 0v3.509l-.46-.46a.75.75 0 00-1.06 1.061l1.75 1.75a.75.75 0 001.06 0l1.75-1.75a.75.75 0 10-1.06-1.061l-.46.46V3zM7.25 11a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5z" clip-rule="evenodd" /></svg>
              Rendición a PDF
            </button>
        </div>
        
        <div v-if="viajeSeleccionadoInfo" 
             class="bg-blue-50 p-4 rounded-lg shadow-md text-right sm:min-w-[400px] border border-blue-200 space-y-1.5">
            <p class="text-sm text-districorr-text-dark font-semibold mb-1.5 text-center sm:text-right">
              Resumen: "{{ viajeSeleccionadoInfo.nombre_viaje }}" 
              <span v-if="viajeSeleccionadoInfo.codigo_rendicion" class="font-mono text-xs">(#{{ viajeSeleccionadoInfo.codigo_rendicion }})</span>
            </p>
            <div v-if="isViajeActualCerrado" class="text-xs text-red-600 font-semibold text-center sm:text-right mb-1.5">PERÍODO CERRADO</div>
            <hr class="my-2 border-blue-200/60">
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Adelanto Inicial:</span>
                <span class="font-semibold text-blue-700">{{ formatCurrency(viajeSeleccionadoInfo.monto_adelanto) }}</span>
            </div>
            <div class="flex justify-between items-center" v-if="totalAdelantosEspecificosFiltradosUI > 0 || !viajeSeleccionadoInfo.monto_adelanto">
                <span class="text-sm text-gray-600">(+) Adelantos Extras:</span>
                <span class="font-semibold text-green-600">{{ formatCurrency(totalAdelantosEspecificosFiltradosUI) }}</span>
            </div>
            <hr class="my-1.5 border-blue-200/60">
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-700 font-medium">(=) Total Adelantos Disponibles:</span>
                <span class="font-semibold text-green-700">{{ formatCurrency(totalAdelantosDisponiblesViajeUI) }}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">(-) Total Gastos Brutos (lista):</span>
                <span class="font-semibold text-red-600">{{ formatCurrency(totalGastadoBrutoFiltradoUI) }}</span>
            </div>
            <hr class="my-1.5 border-blue-300 font-bold">
            <div class="flex justify-between items-center">
                <span class="text-lg font-bold" :class="saldoActualViajeUI !== null && saldoActualViajeUI >= 0 ? 'text-green-600' : 'text-red-600'">SALDO ACTUAL:</span>
                <span class="text-lg font-bold" :class="saldoActualViajeUI !== null && saldoActualViajeUI >= 0 ? 'text-green-600' : 'text-red-600'">
                    {{ saldoActualViajeUI !== null ? formatCurrency(saldoActualViajeUI) : 'N/A' }}
                </span>
            </div>
            <p v-if="saldoActualViajeUI !== null && saldoActualViajeUI < 0" class="text-xs text-red-600 text-right">(A REPONER A RESPONSABLE)</p>
        </div>
     </div>

    <!-- Indicador de Carga, Error o "No hay gastos" -->
    <div v-if="loading" class="text-center py-12"> <svg class="animate-spin h-10 w-10 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p class="text-lg text-gray-600 mt-3">Cargando gastos...</p></div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-red-600 text-red-700 p-4 rounded-md shadow-md" role="alert"><p class="font-bold">Error al Cargar Gastos</p><p>{{ errorMessage }}</p></div>
    <div v-else-if="gastos.length === 0" class="bg-white p-10 rounded-xl shadow-lg text-center border border-gray-200"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-16 h-16 mx-auto text-gray-400 mb-4"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V6.75m0 0A1.125 1.125 0 012.25 5.625h1.125m17.25 0h.001M15 12a3 3 0 11-6 0 3 3 0 016 0zm1.28 4.491l4.568 4.568a.75.75 0 101.06-1.06l-4.567-4.568a8.223 8.223 0 00-1.06-1.061l-4.568-4.567a.75.75 0 00-1.06 1.06l4.568 4.567a8.223 8.223 0 001.06 1.061z" /></svg><p class="text-gray-700 text-xl font-semibold">No hay gastos para mostrar.</p><p v-if="viajeSeleccionadoInfo" class="mt-1 text-sm text-gray-500">No se encontraron gastos para el viaje/período seleccionado.</p><p v-else class="mt-1 text-sm text-gray-500">Registra un nuevo gasto o ajusta los filtros.</p><button @click="goToNuevoGasto" :disabled="isViajeActualCerrado" class="mt-6 bg-green-500 text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-green-600 shadow-md disabled:opacity-60 disabled:cursor-not-allowed">Registrar Gasto</button></div>

    <!-- Tabla de Gastos -->
    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-100">
            <tr>
              <th scope="col" class="px-4 py-3.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wider sm:px-6">Fecha</th>
              <th scope="col" class="px-4 py-3.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Tipo</th>
              <th scope="col" class="px-4 py-3.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Descripción / Cliente Ref.</th>
              <th scope="col" class="px-4 py-3.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wider hidden md:table-cell">Viaje (#ID)</th>
              <th scope="col" class="px-4 py-3.5 text-left text-xs font-medium text-gray-600 uppercase tracking-wider hidden sm:table-cell">N° Factura</th>
              <th scope="col" class="px-4 py-3.5 text-right text-xs font-medium text-gray-600 uppercase tracking-wider sm:px-6">Monto Bruto <span class="block text-[10px] normal-case text-gray-500">(Ad.Espec.)</span></th>
              <th scope="col" class="px-4 py-3.5 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Comp.</th>
              <th scope="col" class="relative px-4 py-3.5 sm:px-6"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="gasto in gastos" :key="gasto.id" class="hover:bg-gray-50/75 transition-colors duration-150"
                :class="{'opacity-60 bg-gray-100 cursor-not-allowed': isViajeActualCerrado || gasto.viajes?.cerrado_en}">
              <td class="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 sm:px-6">{{ formatDate(gasto.fecha_gasto) }}</td>
              <td class="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto || 'N/A' }}</td>
              <td class="px-4 py-3.5 text-sm text-districorr-text-dark font-medium max-w-xs">
                <div class="truncate" :title="gasto.descripcion_general">{{ gasto.descripcion_general || '-' }}</div>
                <div v-if="gasto.cliente_referido" class="text-xs text-gray-500 italic truncate pt-0.5" :title="`Cliente: ${gasto.cliente_referido}`">
                  (Cliente: {{ gasto.cliente_referido }})
                </div>
              </td>
              <td class="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                {{ gasto.viajes?.nombre_viaje || 'N/A' }}
                <span v-if="gasto.viajes?.codigo_rendicion" class="text-xs font-mono text-gray-400 ml-1">#{{ gasto.viajes.codigo_rendicion }}</span>
              </td>
              <td class="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">{{ gasto.numero_factura || '-' }}</td>
              <td class="px-4 py-3.5 whitespace-nowrap text-sm text-gray-800 text-right font-semibold sm:px-6">
                <div>{{ formatCurrency(gasto.monto_total, gasto.moneda) }}</div>
                <div v-if="gasto.adelanto_especifico_aplicado && gasto.adelanto_especifico_aplicado > 0" 
                     class="text-xs text-green-700 font-normal" 
                     :title="`Adelanto Específico Aplicado: -${formatCurrency(gasto.adelanto_especifico_aplicado)}`">
                  (-{{ formatCurrency(gasto.adelanto_especifico_aplicado) }})
                </div>
              </td>
              <td class="px-4 py-3.5 whitespace-nowrap text-center text-sm">
                <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="text-districorr-accent hover:underline font-medium">Ver</a>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium space-x-3 sm:px-6">
                <button @click="editarGasto(gasto)" 
                        :disabled="isViajeActualCerrado || gasto.viajes?.cerrado_en"
                        class="text-districorr-accent hover:text-blue-700 transition-colors duration-150 font-medium disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:text-gray-400"
                        title="Editar gasto (deshabilitado si el período está cerrado)">Editar</button>
                <button @click="eliminarGasto(gasto)" 
                        :disabled="isViajeActualCerrado || gasto.viajes?.cerrado_en"
                        class="text-red-600 hover:text-red-800 transition-colors duration-150 font-medium disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:text-gray-400"
                        title="Eliminar gasto (deshabilitado si el período está cerrado)">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>