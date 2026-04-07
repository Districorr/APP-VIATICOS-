<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient';
import { useRouter, useRoute } from 'vue-router';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { useReportGenerator } from '../../composables/useReportGenerator';

// Componentes UI
import DetallesJson from '../../components/DetallesJson.vue';
import GastoActionsMenu from '../../components/admin/GastoActionsMenu.vue';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import { 
  ArrowUpIcon, ArrowDownIcon, FunnelIcon, XCircleIcon,
  ArrowDownTrayIcon, ChevronDownIcon, PlusIcon, PaperClipIcon,
  ChatBubbleLeftEllipsisIcon
} from '@heroicons/vue/24/solid';

const router = useRouter();
const route = useRoute();
const { exportJsonToExcel } = useReportGenerator();

// --- ESTADOS PRINCIPALES ---
const rendicion = ref(null);
const gastos = ref([]);
const loading = ref(true);
const errorMessage = ref('');

// --- ESTADOS PARA LA UI INTERACTIVA ---
const showFilters = ref(false);
const filters = ref({
  fechaDesde: '',
  fechaHasta: '',
  tipoGastoId: '',
  estadoRevision: '',
});
const sortBy = ref({ key: 'fecha_gasto', order: 'desc' });
const tiposDeGastoDisponibles = ref([]);
const actionLoading = ref(null);
const commentModal = ref({ show: false, gasto: null, comentario: '' });
const expandedRows = ref(new Set());

// --- ESTADOS DE PAGINACIÓN ---
const currentPage = ref(1);
const resultsPerPage = ref(15);
const totalResults = ref(0);

const pageCount = computed(() => Math.ceil(totalResults.value / resultsPerPage.value));
const rangeFrom = computed(() => (currentPage.value - 1) * resultsPerPage.value + 1);
const rangeTo = computed(() => Math.min(currentPage.value * resultsPerPage.value, totalResults.value));

// --- LÓGICA DE CARGA DE DATOS ---
async function fetchData() {
  const viajeId = route.query.viajeId;
  if (!viajeId) {
    errorMessage.value = "No se ha especificado un ID de rendición.";
    loading.value = false;
    return;
  }
  
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase.rpc('get_detalle_rendicion_con_gastos', { 
      p_viaje_id: viajeId,
      p_page: currentPage.value,
      p_page_size: resultsPerPage.value
    });

    if (error) throw error;
    if (!data.viaje) throw new Error(`No se encontró la rendición con ID ${viajeId}.`);

    rendicion.value = data.viaje;
    gastos.value = data.gastos;
    totalResults.value = data.total_count;

    if (tiposDeGastoDisponibles.value.length === 0) {
      const { data: tiposRes, error: tiposError } = await supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true).order('nombre_tipo_gasto');
      if (tiposError) throw tiposError;
      tiposDeGastoDisponibles.value = tiposRes || [];
    }
  } catch (e) {
    errorMessage.value = `Error al cargar los datos: ${e.message}`;
    rendicion.value = null;
    gastos.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);

// --- DATOS COMPUTADOS ---
const tituloVista = computed(() => {
  if (!rendicion.value) return 'Detalle de Rendición';
  return `Gastos del Viaje: "${rendicion.value.nombre_viaje}" (#${rendicion.value.codigo_rendicion})`;
});

const filteredAndSortedGastos = computed(() => {
  let items = [...gastos.value];
  
  if (filters.value.fechaDesde) {
    const fromDate = new Date(filters.value.fechaDesde);
    fromDate.setUTCHours(0,0,0,0);
    items = items.filter(g => new Date(g.fecha_gasto) >= fromDate);
  }
  if (filters.value.fechaHasta) {
    const toDate = new Date(filters.value.fechaHasta);
    toDate.setUTCHours(23,59,59,999);
    items = items.filter(g => new Date(g.fecha_gasto) <= toDate);
  }
  if (filters.value.tipoGastoId) {
    items = items.filter(g => String(g.tipos_gasto_config?.id) === String(filters.value.tipoGastoId));
  }
  if (filters.value.estadoRevision) {
    items = items.filter(g => g.estado_revision === filters.value.estadoRevision);
  }

  const { key, order } = sortBy.value;
  items.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];
    if (key === 'monto_total') {
        valA = Number(valA);
        valB = Number(valB);
    } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
    }
    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0;
  });

  return items;
});

const kpis = computed(() => {
    const totalGastado = gastos.value.reduce((sum, g) => sum + Number(g.monto_total || 0), 0);
    const adelanto = Number(rendicion.value?.monto_adelanto || 0);
    const saldo = adelanto - totalGastado;
    return { adelanto, gastado: totalGastado, saldo, numGastos: totalResults.value };
});

const totalesPorCategoria = computed(() => {
    const result = {};
    gastos.value.forEach(gasto => {
        const categoria = gasto.tipos_gasto_config?.nombre_tipo_gasto || 'Sin Categoría';
        if (!result[categoria]) {
            result[categoria] = { total: 0, count: 0 };
        }
        result[categoria].total += Number(gasto.monto_total || 0);
        result[categoria].count++;
    });
    return Object.entries(result).sort((a,b) => b[1].total - a[1].total);
});

// --- LÓGICA DE ACCIONES ---
const setSortBy = (key) => {
  if (sortBy.value.key === key) {
    sortBy.value.order = sortBy.value.order === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value.key = key;
    sortBy.value.order = 'desc';
  }
};

const limpiarFiltros = () => {
  filters.value = { fechaDesde: '', fechaHasta: '', tipoGastoId: '', estadoRevision: '' };
};

const handleEstadoRevisionChange = async (gastoId, nuevoEstado) => {
    actionLoading.value = `revision_${gastoId}`;
    try {
        const { error } = await supabase.rpc('actualizar_estado_gasto', {
            p_gasto_id: gastoId,
            p_nuevo_estado: nuevoEstado,
            p_comentario: null
        });
        if (error) throw error;
        const gastoIndex = gastos.value.findIndex(g => g.id === gastoId);
        if (gastoIndex !== -1) gastos.value[gastoIndex].estado_revision = nuevoEstado;
    } catch (e) {
        alert(`Error al actualizar estado: ${e.message}`);
    } finally {
        actionLoading.value = null;
    }
};

const openCommentModal = (gasto) => {
    commentModal.value = { show: true, gasto: gasto, comentario: gasto.comentario_revision || '' };
};

const saveComment = async () => {
    const { gasto, comentario } = commentModal.value;
    if (!gasto) return;
    actionLoading.value = `comment_${gasto.id}`;
    try {
        const { error } = await supabase.rpc('actualizar_estado_gasto', {
            p_gasto_id: gasto.id,
            p_nuevo_estado: 'observado',
            p_comentario: comentario,
        });
        if (error) throw error;
        const gastoIndex = gastos.value.findIndex(g => g.id === gasto.id);
        if (gastoIndex !== -1) {
            gastos.value[gastoIndex].comentario_revision = comentario;
            gastos.value[gastoIndex].estado_revision = 'observado';
        }
        commentModal.value.show = false;
    } catch(e) {
        alert(`Error al guardar comentario: ${e.message}`);
    } finally {
        actionLoading.value = null;
    }
};

const editarGasto = (gastoId) => {
    router.push({ name: 'GastoFormEdit', params: { id: gastoId }, query: { adminEdit: 'true' } });
};

const duplicarGasto = (gasto) => {
    const gastoData = { ...gasto };
    delete gastoData.id;
    delete gastoData.created_at;
    delete gastoData.estado_revision;
    delete gastoData.comentario_revision;
    
    localStorage.setItem('gastoParaDuplicar', JSON.stringify(gastoData));
    router.push({ name: 'GastoFormCreate', query: { duplicar: 'true', viajeId: rendicion.value.id } });
};

const agregarGasto = () => {
    if (rendicion.value) {
        router.push({ name: 'GastoFormCreate', query: { viajeId: rendicion.value.id } });
    }
};

const eliminarGasto = async (gastoId) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar el gasto con ID ${gastoId}? Esta acción no se puede deshacer.`)) {
        return;
    }
    try {
        const { error } = await supabase.from('gastos').delete().eq('id', gastoId);
        if (error) throw error;
        alert('Gasto eliminado con éxito.');
        fetchData();
    } catch (e) {
        alert(`Error al eliminar el gasto: ${e.message}`);
    }
};

const handleExport = () => {
  if (!gastos.value || gastos.value.length === 0) {
    alert('No hay gastos para exportar.');
    return;
  }
  const dataToExport = gastos.value.map(g => ({
    'ID Gasto': g.id,
    'Fecha': formatDate(g.fecha_gasto),
    'Responsable': g.responsable_principal_nombre,
    'Rendido Por': g.es_delegado ? g.dueno_nombre : '',
    'Tipo Gasto': g.tipos_gasto_config?.nombre_tipo_gasto,
    'Descripción': g.descripcion_general,
    'Monto': g.monto_total,
    'Moneda': g.moneda,
    'Factura N°': g.numero_factura,
    'Estado Revisión': g.estado_revision,
    'Comentario Admin': g.comentario_revision,
    'Rendición (#)': `${rendicion.value.nombre_viaje} (#${rendicion.value.codigo_rendicion})`,
  }));

  exportJsonToExcel(dataToExport, `Detalle_${rendicion.value.codigo_rendicion || 'gastos'}`);
};

const toggleRowExpansion = (gastoId) => {
  const newSet = new Set(expandedRows.value);
  if (newSet.has(gastoId)) {
    newSet.delete(gastoId);
  } else {
    newSet.add(gastoId);
  }
  expandedRows.value = newSet;
};

function goToPage(page) {
  if (page > 0 && page <= pageCount.value) {
    currentPage.value = page;
    fetchData();
  }
}

watch(() => route.query.viajeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    currentPage.value = 1;
    fetchData();
  }
}, { immediate: true });
</script>
<template>
  <div class="container mx-auto px-2 sm:px-4 lg:px-6 py-8">
    <div v-if="loading && !rendicion" class="text-center py-20">
      <svg class="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p class="text-lg text-gray-600 mt-3">Cargando detalle de la rendición...</p>
    </div>
    <div v-else-if="errorMessage" class="error-banner" role="alert">
      <p class="font-bold">Error:</p>
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="rendicion">
      <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div><h1 class="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">{{ tituloVista }}</h1></div>
        <div class="flex gap-3 self-start sm:self-center">
          <button @click="handleExport" class="btn-secondary flex items-center gap-2"><ArrowDownTrayIcon class="h-5 w-5" /> Exportar XLS</button>
          <button @click="agregarGasto" class="btn-primary flex items-center gap-2"><PlusIcon class="w-5 h-5" />Agregar Gasto</button>
        </div>
      </header>
      
      <section class="mb-8 p-6 bg-white rounded-lg border shadow-sm">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div><p class="text-sm text-gray-500 uppercase tracking-wider">Adelanto</p><p class="text-2xl font-semibold text-gray-800 mt-1">{{ formatCurrency(kpis.adelanto) }}</p></div>
          <div><p class="text-sm text-gray-500 uppercase tracking-wider">Total Gastado</p><p class="text-2xl font-semibold text-gray-800 mt-1">{{ formatCurrency(kpis.gastado) }}</p></div>
          <div><p class="text-sm text-gray-500 uppercase tracking-wider">Saldo Actual</p><p class="text-3xl font-bold mt-1" :class="kpis.saldo < 0 ? 'text-red-600' : 'text-green-600'">{{ formatCurrency(kpis.saldo) }}</p></div>
          <div><p class="text-sm text-gray-500 uppercase tracking-wider">Nº de Gastos</p><p class="text-3xl font-bold text-gray-800 mt-1">{{ kpis.numGastos }}</p></div>
        </div>
      </section>

      <section class="mb-8">
        <div class="bg-gray-50 border border-gray-200 rounded-lg">
          <button @click="showFilters = !showFilters" class="w-full p-4 flex justify-between items-center text-left hover:bg-gray-100 transition-colors">
            <h3 class="text-lg font-semibold text-gray-700 flex items-center gap-3"><FunnelIcon class="h-5 w-5" />Filtrar Gastos</h3>
            <ChevronDownIcon class="h-6 w-6 text-gray-500 transition-transform duration-300" :class="{ 'rotate-180': showFilters }"/>
          </button>
          <transition name="list"><div v-if="showFilters" class="p-4 border-t border-gray-200">
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div><label class="form-label">Desde</label><input type="date" v-model="filters.fechaDesde" class="form-input"></div>
                <div><label class="form-label">Hasta</label><input type="date" v-model="filters.fechaHasta" class="form-input"></div>
                <div><label class="form-label">Tipo de Gasto</label><select v-model="filters.tipoGastoId" class="form-input"><option value="">Todos</option><option v-for="tipo in tiposDeGastoDisponibles" :key="tipo.id" :value="tipo.id">{{ tipo.nombre_tipo_gasto }}</option></select></div>
                <div><label class="form-label">Estado Revisión</label><select v-model="filters.estadoRevision" class="form-input"><option value="">Todos</option><option value="en_revision">En Revisión</option><option value="aprobado">Aprobado</option><option value="observado">Observado</option></select></div>
              </div>
              <div class="mt-4 flex justify-end"><button @click="limpiarFiltros" class="btn-secondary-outline flex items-center gap-2"><XCircleIcon class="h-5 w-5" /> Limpiar</button></div>
          </div></transition>
        </div>
      </section>

      <div class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-100">
              <tr>
                <th class="table-th w-32">Revisión</th>
                <th class="table-th"><button @click="setSortBy('fecha_gasto')" class="sort-button">Fecha</button></th>
                <th class="table-th">Responsable</th>
                <th class="table-th">Tipo Gasto</th>
                <th class="table-th">Descripción</th>
                <th class="table-th text-right"><button @click="setSortBy('monto_total')" class="sort-button justify-end w-full">Monto</button></th>
                <th class="table-th text-center w-28">Docs</th>
                <th class="table-th text-right w-20">Acciones</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="filteredAndSortedGastos.length === 0"><td colspan="8" class="text-center py-10 text-gray-500">No hay gastos que coincidan con los filtros.</td></tr>
              <template v-for="gasto in filteredAndSortedGastos" :key="gasto.id">
                <tr class="hover:bg-gray-50/75 transition-colors cursor-pointer" :class="{'bg-blue-50': gasto.es_delegado}" @click="toggleRowExpansion(gasto.id)">
                  <td class="table-cell px-4 py-3">
                    <Menu as="div" class="relative inline-block text-left">
                      <MenuButton class="w-full text-xs font-semibold rounded-md px-2 py-1.5 inline-flex items-center justify-center gap-1.5 transition-colors" :class="{'bg-green-100 text-green-800 hover:bg-green-200': gasto.estado_revision === 'aprobado', 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200': gasto.estado_revision === 'observado', 'bg-gray-100 text-gray-700 hover:bg-gray-200': gasto.estado_revision === 'en_revision'}">
                        <span v-if="actionLoading === `revision_${gasto.id}`" class="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                        <template v-else>{{ gasto.estado_revision && gasto.estado_revision.replace('_',' ') }}</template>
                        <ChevronDownIcon class="h-4 w-4"/>
                      </MenuButton>
                      <MenuItems class="absolute left-0 mt-2 w-40 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                        <div class="px-1 py-1">
                          <MenuItem><button @click="() => handleEstadoRevisionChange(gasto.id, 'aprobado')" class="menu-item text-green-600">Aprobado</button></MenuItem>
                          <MenuItem><button @click="() => handleEstadoRevisionChange(gasto.id, 'en_revision')" class="menu-item text-gray-700">En Revisión</button></MenuItem>
                          <MenuItem><button @click="() => handleEstadoRevisionChange(gasto.id, 'observado')" class="menu-item text-yellow-600">Observado</button></MenuItem>
                        </div>
                      </MenuItems>
                    </Menu>
                  </td>
                  <td class="table-cell">{{ formatDate(gasto.fecha_gasto) }}</td>
                  <td class="table-cell">
                    <div class="font-medium text-gray-900">{{ gasto.responsable_principal_nombre }}</div>
                    <div v-if="gasto.es_delegado" class="text-xs text-gray-500">(Rendido por: {{ gasto.dueno_nombre }})</div>
                  </td>
                  <td class="table-cell"><span class="px-2 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700">{{ gasto.tipos_gasto_config?.nombre_tipo_gasto }}</span></td>
                  <td class="table-cell max-w-xs"><div class="truncate" :title="gasto.descripcion_general">{{ gasto.descripcion_general || '-' }}</div></td>
                  <td class="table-cell text-right font-semibold">{{ formatCurrency(gasto.monto_total, gasto.moneda) }}</td>
                  <td class="table-cell text-center">
                    <div class="flex justify-center items-center gap-3">
                      <a v-if="gasto.factura_url" :href="gasto.factura_url" target="_blank" class="text-blue-600 hover:text-blue-800" title="Ver factura"><PaperClipIcon class="h-5 w-5"/></a>
                      <button @click="() => openCommentModal(gasto)" class="text-gray-500 hover:text-gray-800" title="Comentarios"><ChatBubbleLeftEllipsisIcon class="h-5 w-5" :class="{'text-yellow-500': gasto.comentario_revision}"/></button>
                    </div>
                  </td>
                  <td class="table-cell text-right pr-2">
                    <GastoActionsMenu :gasto="gasto" @edit="editarGasto" @duplicate="duplicarGasto" @delete="eliminarGasto" />
                  </td>
                </tr>
                <tr v-if="expandedRows.has(gasto.id)">
                  <td colspan="8" class="p-0"><DetallesJson :datos="gasto.datos_adicionales" /></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div class="pagination-controls mt-4 flex justify-between items-center px-4 py-2">
          <span class="text-sm text-gray-600">
            Mostrando {{ rangeFrom }} - {{ rangeTo }} de {{ totalResults }} resultados
          </span>
          <div class="flex gap-2">
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1" class="btn-secondary-outline">Anterior</button>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === pageCount" class="btn-secondary-outline">Siguiente</button>
          </div>
        </div>
      </div>
      
      <section class="mt-8">
        <h3 class="text-xl font-semibold text-gray-800 mb-4">Totales por Categoría (Página Actual)</h3>
        <div class="p-6 bg-white rounded-lg border shadow-sm">
          <dl class="divide-y divide-gray-200">
            <div v-if="totalesPorCategoria.length === 0" class="py-3 text-center text-gray-500">No hay datos para mostrar.</div>
            <div v-for="[categoria, data] in totalesPorCategoria" :key="categoria" class="flex justify-between items-center py-3">
              <dt class="text-sm font-medium text-gray-600">{{ categoria }} <span class="text-xs text-gray-400">({{ data.count }} items)</span></dt>
              <dd class="text-base font-semibold text-gray-900">{{ formatCurrency(data.total) }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>

    <transition name="modal-fade">
      <div v-if="commentModal.show" class="modal-backdrop" @click.self="commentModal.show = false">
        <div class="modal-container">
          <h3 class="modal-title">Comentario de Revisión</h3>
          <p class="text-sm text-gray-600 mt-1">Para el gasto: <span class="font-semibold">{{ commentModal.gasto?.descripcion_general }}</span></p>
          <div class="mt-4"><textarea v-model="commentModal.comentario" rows="4" class="form-input" placeholder="Añadir observación o comentario..."></textarea></div>
          <div class="modal-actions">
            <button @click="commentModal.show = false" class="btn-secondary">Cancelar</button>
            <button @click="saveComment" :disabled="actionLoading === `comment_${commentModal.gasto?.id}`" class="btn-primary flex justify-center w-24">
              <span v-if="actionLoading === `comment_${commentModal.gasto?.id}`" class="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span v-else>Guardar</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style>
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.table-th { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm text-gray-600; }
.btn-primary { @apply bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors; }
.btn-secondary { @apply bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors; }
.btn-secondary-outline { @apply bg-white text-gray-700 font-semibold py-2 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed; }
.sort-button { @apply flex items-center gap-1 font-medium text-gray-500 hover:text-gray-800; }
.menu-item { @apply flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors; }
.modal-backdrop { @apply fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40; }
.modal-container { @apply bg-white rounded-xl shadow-2xl p-6 w-full max-w-md m-4 transform transition-all; }
.modal-title { @apply text-xl font-bold text-gray-900; }
.modal-actions { @apply mt-6 flex justify-end gap-3; }
.list-enter-active, .list-leave-active { transition: all 0.3s ease-out; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(-10px); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.3s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>