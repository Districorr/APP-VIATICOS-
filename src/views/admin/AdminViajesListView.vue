<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient'; 
import { useRouter } from 'vue-router'; 
import { formatDate, formatCurrency } from '../../utils/formatters.js';
import AdminRendicionCard from '../../components/admin/AdminRendicionCard.vue';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';        
import { EllipsisVerticalIcon, CheckCircleIcon, XCircleIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/vue/24/solid';

const router = useRouter();

// --- ESTADOS PRINCIPALES ---
const allRendiciones = ref([]);
const loading = ref(true);
const error = ref('');
const activeTab = ref('pendientes');
const viewMode = ref('cards');

// --- ESTADOS PARA FILTROS Y ORDENAMIENTO ---
const filters = ref({
  responsableId: null,
  estado: null,
  fechaDesde: null,
  fechaHasta: null,
});
const sortBy = ref({ key: 'created_at', order: 'desc' });
const responsablesOptions = ref([]);

// --- ESTADOS PARA ACCIONES MASIVAS ---
const selectedRendiciones = ref(new Set());
const actionLoading = ref(false);

// --- ESTADOS PARA MODALES ---
const modal = ref({
  revision: { show: false, data: null, comentarios: '', error: '' },
  delete: { show: false, data: null, confirmText: '' },
  bulkDelete: { show: false, confirmText: ''}
});

// --- CARGA DE DATOS ---
async function fetchData() {
  loading.value = true;
  error.value = '';
  try {
    const rendicionesPromise = supabase.from('admin_viajes_list_view').select('*').order('created_at', { ascending: false });
    const responsablesPromise = supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo');
    
    const [rendicionesRes, responsablesRes] = await Promise.all([rendicionesPromise, responsablesPromise]);

    if (rendicionesRes.error) throw rendicionesRes.error;
    allRendiciones.value = rendicionesRes.data || [];
    
    if (responsablesRes.error) throw responsablesRes.error;
    responsablesOptions.value = responsablesRes.data;

  } catch (e) {
    error.value = `Error al cargar los datos: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);

// --- DATOS COMPUTADOS ---
const rendicionesPendientes = computed(() => allRendiciones.value.filter(v => v.estado_aprobacion === 'pendiente_aprobacion'));
const rendicionesEnCurso = computed(() => allRendiciones.value.filter(v => v.estado_aprobacion === 'en_curso'));

const filteredAndSortedList = computed(() => {
  let list = [];
  if (activeTab.value === 'pendientes') {
    list = rendicionesPendientes.value;
  } else if (activeTab.value === 'en_curso') {
    list = rendicionesEnCurso.value;
  } else if (activeTab.value === 'historial') {
    list = allRendiciones.value.filter(v => ['aprobado', 'rechazado'].includes(v.estado_aprobacion));
  } else {
    list = allRendiciones.value;
  }

  if (filters.value.responsableId) {
    list = list.filter(item => item.user_id === filters.value.responsableId);
  }
  if (filters.value.estado) {
    list = list.filter(item => item.estado_aprobacion === filters.value.estado);
  }
  if (filters.value.fechaDesde) {
    const from = new Date(filters.value.fechaDesde);
    from.setUTCHours(0,0,0,0);
    list = list.filter(item => new Date(item.fecha_inicio) >= from);
  }
  if (filters.value.fechaHasta) {
    const to = new Date(filters.value.fechaHasta);
    to.setUTCHours(23,59,59,999);
    list = list.filter(item => new Date(item.fecha_inicio) <= to);
  }

  const { key, order } = sortBy.value;
  list.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];
    
    if (key === 'saldo' || key === 'monto_adelanto' || key === 'total_gastado') {
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

  return list;
});

const isAllSelected = computed(() => {
  const currentIds = new Set(filteredAndSortedList.value.map(item => item.id));
  if (currentIds.size === 0) return false;
  return filteredAndSortedList.value.every(item => selectedRendiciones.value.has(item.id));
});

// --- LÓGICA DE SELECCIÓN Y ACCIONES ---
const toggleSelectAll = (event) => {
  const isChecked = event.target.checked;
  if (isChecked) {
    filteredAndSortedList.value.forEach(item => selectedRendiciones.value.add(item.id));
  } else {
    selectedRendiciones.value.clear();
  }
};

const handleSelectionChange = ({ id, checked }) => {
  if (checked) {
    selectedRendiciones.value.add(id);
  } else {
    selectedRendiciones.value.delete(id);
  }
};

const handleDeleteSelected = async () => {
  if (modal.value.bulkDelete.confirmText !== 'eliminar' || selectedRendiciones.value.size === 0) return;
  
  actionLoading.value = true;
  try {
    const idsToDelete = Array.from(selectedRendiciones.value);
    // Idealmente, aquí se llamaría a una única función RPC `delete_rendiciones_batch(ids_array)`
    for (const id of idsToDelete) {
      await supabase.rpc('limpiar_rendicion_de_prueba', { p_viaje_id: id });
    }
    selectedRendiciones.value.clear();
    modal.value.bulkDelete.show = false;
    modal.value.bulkDelete.confirmText = '';
    await fetchData();
  } catch (e) {
    console.error("Error en borrado masivo:", e);
    alert('Ocurrió un error durante el borrado masivo.');
  } finally {
    actionLoading.value = false;
  }
};

// --- FUNCIONES DE ACCIONES INDIVIDUALES Y NAVEGACIÓN ---
const abrirModalRevisar = (rendicion) => {
  modal.value.revision = { show: true, data: rendicion, comentarios: rendicion.comentarios_aprobacion || '', error: '' };
};

const abrirModalEliminar = (rendicion) => {
  modal.value.delete = { show: true, data: rendicion, confirmText: '' };
};

const cerrarModales = () => {
  modal.value.revision.show = false;
  modal.value.delete.show = false;
  modal.value.bulkDelete.show = false;
};

const handleDecisionRendicion = async (nuevoEstado) => {
  const modalRev = modal.value.revision;
  if (!modalRev.data) return;
  if (nuevoEstado === 'rechazado' && !modalRev.comentarios.trim()) {
    modalRev.error = 'Es obligatorio añadir un comentario para rechazar.';
    return;
  }
  
  actionLoading.value = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Administrador no autenticado.');
    
    const { error: rpcError } = await supabase.rpc('aprobar_rechazar_rendicion', {
      p_viaje_id: modalRev.data.id, 
      p_nuevo_estado: nuevoEstado,
      p_comentarios: modalRev.comentarios, 
      p_admin_id: user.id
    });

    if (rpcError) throw rpcError;
    
    cerrarModales();
    await fetchData();
  } catch (e) {
    modalRev.error = `Error: ${e.message}`;
  } finally {
    actionLoading.value = false;
  }
};

const handleEliminarRendicionIndividual = async () => {
    const modalDel = modal.value.delete;
    if (!modalDel.data || modalDel.confirmText !== 'eliminar') return;
    
    actionLoading.value = true;
    try {
        await supabase.rpc('limpiar_rendicion_de_prueba', { p_viaje_id: modalDel.data.id });
        cerrarModales();
        await fetchData();
    } catch(e) {
        console.error("Error al eliminar rendición:", e);
        alert('Ocurrió un error al eliminar la rendición.');
    } finally {
        actionLoading.value = false;
    }
}

const verGastosDelViaje = (viajeId) => {
  router.push({ name: 'AdminGastosList', query: { viajeId } });
};

const editarViaje = (viajeId) => {
  router.push({ name: 'ViajeEdit', params: { id: viajeId } });
};

// --- LÓGICA DE ORDENAMIENTO ---
const setSortBy = (key) => {
  if (sortBy.value.key === key) {
    sortBy.value.order = sortBy.value.order === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value.key = key;
    sortBy.value.order = 'desc';
  }
};

// Limpiar selecciones y filtros al cambiar de pestaña
watch(activeTab, () => {
  selectedRendiciones.value.clear();
  filters.value = { responsableId: null, estado: null, fechaDesde: null, fechaHasta: null };
});
</script>
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-wrap justify-between items-center mb-4 gap-4">
      <h1 class="text-3xl font-bold text-gray-900">Gestión de Rendiciones</h1>
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-600">Vista:</span>
        <div class="inline-flex rounded-md shadow-sm bg-white">
          <button @click="viewMode = 'cards'" :class="['px-3 py-1 text-sm font-semibold rounded-l-md transition-colors', viewMode === 'cards' ? 'bg-indigo-600 text-white z-10' : 'text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50']">
            Tarjetas
          </button>
          <button @click="viewMode = 'table'" :class="['px-3 py-1 text-sm font-semibold rounded-r-md transition-colors', viewMode === 'table' ? 'bg-indigo-600 text-white z-10' : 'text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50']">
            Tabla
          </button>
        </div>
      </div>
    </div>
    
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        <button @click="activeTab = 'pendientes'" :class="['tab-button', { 'tab-active': activeTab === 'pendientes' }]">
          Pendientes
          <span v-if="rendicionesPendientes.length > 0" class="tab-badge bg-yellow-100 text-yellow-800">{{ rendicionesPendientes.length }}</span>
        </button>
        <button @click="activeTab = 'en_curso'" :class="['tab-button', { 'tab-active': activeTab === 'en_curso' }]">
          En Curso
           <span v-if="rendicionesEnCurso.length > 0" class="tab-badge bg-blue-100 text-blue-800">{{ rendicionesEnCurso.length }}</span>
        </button>
        <button @click="activeTab = 'historial'" :class="['tab-button', { 'tab-active': activeTab === 'historial' }]">Historial</button>
      </nav>
    </div>

    <!-- Panel de Filtros -->
    <div class="my-6 p-4 bg-gray-50 rounded-lg border">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="md:col-span-2">
          <label class="form-label">Rango de Fechas (Inicio)</label>
          <div class="flex gap-2">
            <input type="date" v-model="filters.fechaDesde" class="form-input">
            <input type="date" v-model="filters.fechaHasta" class="form-input">
          </div>
        </div>
        <div>
          <label class="form-label">Responsable</label>
          <select v-model="filters.responsableId" class="form-input">
            <option :value="null">Todos</option>
            <option v-for="user in responsablesOptions" :key="user.id" :value="user.id">{{ user.nombre_completo }}</option>
          </select>
        </div>
        <div>
          <label class="form-label">Estado</label>
          <select v-model="filters.estado" class="form-input">
            <option :value="null">Todos</option>
            <option value="en_curso">En Curso</option>
            <option value="pendiente_aprobacion">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
      </div>
    </div>
    
    <!-- Barra de Acciones Masivas -->
    <transition name="list">
      <div v-if="selectedRendiciones.size > 0" class="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex justify-between items-center">
        <p class="text-sm font-medium text-indigo-800">{{ selectedRendiciones.size }} rendiciones seleccionadas</p>
        <div>
          <button @click="modal.bulkDelete.show = true" class="btn-sm btn-danger flex items-center gap-2">
            <TrashIcon class="h-4 w-4" />
            Eliminar
          </button>
          <!-- Aquí irían otros botones de acciones masivas, ej: Aprobar seleccionadas -->
        </div>
      </div>
    </transition>

    <div class="mt-8">
      <div v-if="loading" class="text-center py-20 text-gray-500">
        <svg class="animate-spin h-8 w-8 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="mt-4">Cargando rendiciones...</p>
      </div>
      <div v-else-if="error" class="error-banner">{{ error }}</div>
      <div v-else-if="filteredAndSortedList.length === 0" class="empty-state">
          <p class="font-semibold text-lg">No hay rendiciones que coincidan con los filtros.</p>
          <p class="text-sm text-gray-500 mt-1">Prueba a cambiar tu búsqueda.</p>
      </div>
      
      <!-- Vista de Tarjetas -->
      <transition-group v-if="viewMode === 'cards'" tag="div" name="list" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div v-for="viaje in filteredAndSortedList" :key="viaje.id" class="relative">
          <input type="checkbox" :checked="selectedRendiciones.has(viaje.id)" @change="handleSelectionChange({ id: viaje.id, checked: $event.target.checked })" class="absolute top-4 left-4 h-5 w-5 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 z-10">
          <AdminRendicionCard :rendicion="viaje" @revisar="abrirModalRevisar" @ver-gastos="verGastosDelViaje" @editar="editarViaje" @eliminar="abrirModalEliminar" />
        </div>
      </transition-group>
      
      <!-- Vista de Tabla -->
      <div v-else-if="viewMode === 'table'" class="bg-white shadow-md rounded-lg overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-100">
            <tr>
              <th class="table-th w-10"><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"></th>
              <th class="table-th"><button @click="setSortBy('codigo_rendicion')" class="sort-button"># <ArrowUpIcon v-if="sortBy.key === 'codigo_rendicion' && sortBy.order === 'asc'" class="h-3 w-3" /><ArrowDownIcon v-if="sortBy.key === 'codigo_rendicion' && sortBy.order === 'desc'" class="h-3 w-3" /></button></th>
              <th class="table-th"><button @click="setSortBy('nombre_viaje')" class="sort-button">Nombre Rendición <ArrowUpIcon v-if="sortBy.key === 'nombre_viaje' && sortBy.order === 'asc'" class="h-3 w-3" /><ArrowDownIcon v-if="sortBy.key === 'nombre_viaje' && sortBy.order === 'desc'" class="h-3 w-3" /></button></th>
              <th class="table-th"><button @click="setSortBy('responsable_nombre')" class="sort-button">Responsable <ArrowUpIcon v-if="sortBy.key === 'responsable_nombre' && sortBy.order === 'asc'" class="h-3 w-3" /><ArrowDownIcon v-if="sortBy.key === 'responsable_nombre' && sortBy.order === 'desc'" class="h-3 w-3" /></button></th>
              <th class="table-th"><button @click="setSortBy('fecha_inicio')" class="sort-button">Inicio <ArrowUpIcon v-if="sortBy.key === 'fecha_inicio' && sortBy.order === 'asc'" class="h-3 w-3" /><ArrowDownIcon v-if="sortBy.key === 'fecha_inicio' && sortBy.order === 'desc'" class="h-3 w-3" /></button></th>
              <th class="table-th text-right"><button @click="setSortBy('saldo')" class="sort-button justify-end w-full">Saldo <ArrowUpIcon v-if="sortBy.key === 'saldo' && sortBy.order === 'asc'" class="h-3 w-3" /><ArrowDownIcon v-if="sortBy.key === 'saldo' && sortBy.order === 'desc'" class="h-3 w-3" /></button></th>
              <th class="table-th text-center"><button @click="setSortBy('estado_aprobacion')" class="sort-button justify-center w-full">Estado <ArrowUpIcon v-if="sortBy.key === 'estado_aprobacion' && sortBy.order === 'asc'" class="h-3 w-3" /><ArrowDownIcon v-if="sortBy.key === 'estado_aprobacion' && sortBy.order === 'desc'" class="h-3 w-3" /></button></th>
              <th class="table-th text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="viaje in filteredAndSortedList" :key="`table-${viaje.id}`" class="hover:bg-gray-50">
              <td class="table-td"><input type="checkbox" :checked="selectedRendiciones.has(viaje.id)" @change="handleSelectionChange({ id: viaje.id, checked: $event.target.checked })" class="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"></td>
              <td class="table-td font-mono">{{ viaje.codigo_rendicion }}</td>
              <td class="table-td font-semibold text-gray-800">{{ viaje.nombre_viaje }}</td>
              <td class="table-td">{{ viaje.responsable_nombre }}</td>
              <td class="table-td">{{ formatDate(viaje.fecha_inicio) }}</td>
              <td class="table-td text-right font-bold" :class="viaje.saldo >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatCurrency(viaje.saldo) }}</td>
              <td class="table-td text-center">
                 <!-- La lógica de la píldora de estado puede ser un computed en el componente padre o un helper -->
              </td>
              <td class="table-td text-right">
                <Menu as="div" class="relative inline-block text-left">
                  <div>
                    <MenuButton class="btn-icon">
                      <EllipsisVerticalIcon class="h-5 w-5" aria-hidden="true" />
                    </MenuButton>
                  </div>
                  <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
                    <MenuItems class="absolute right-0 mt-2 w-48 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                      <div class="px-1 py-1"><MenuItem v-if="viaje.estado_aprobacion === 'pendiente_aprobacion'" v-slot="{ active }"><button :class="[active ? 'bg-indigo-500 text-white' : 'text-gray-900', 'group flex w-full items-center rounded-md px-2 py-2 text-sm']" @click="abrirModalRevisar(viaje)">Revisar</button></MenuItem></div>
                      <div class="px-1 py-1"><MenuItem v-slot="{ active }"><button :class="[active ? 'bg-indigo-500 text-white' : 'text-gray-900', 'group flex w-full items-center rounded-md px-2 py-2 text-sm']" @click="verGastosDelViaje(viaje.id)">Ver Gastos</button></MenuItem></div>
                      <div class="px-1 py-1"><MenuItem v-slot="{ active }"><button :class="[active ? 'bg-indigo-500 text-white' : 'text-gray-900', 'group flex w-full items-center rounded-md px-2 py-2 text-sm']" @click="editarViaje(viaje.id)">Editar</button></MenuItem></div>
                      <div class="px-1 py-1"><MenuItem v-slot="{ active }"><button :class="[active ? 'bg-red-500 text-white' : 'text-red-600', 'group flex w-full items-center rounded-md px-2 py-2 text-sm']" @click="abrirModalEliminar(viaje)">Eliminar</button></MenuItem></div>
                    </MenuItems>
                  </transition>
                </Menu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Modales -->
    <transition name="modal-fade">
      <div v-if="modal.revision.show" class="modal-backdrop" @click.self="cerrarModales">
        <div class="modal-container">
          <h3 class="modal-title">Revisar Rendición #{{ modal.revision.data.codigo_rendicion }}</h3>
          <div class="mt-4"><label for="comentariosAdmin" class="form-label">Comentarios (Obligatorio al rechazar)</label><textarea id="comentariosAdmin" v-model="modal.revision.comentarios" rows="3" class="form-input mt-1" placeholder="Ej: Faltan comprobantes..."></textarea></div>
          <div v-if="modal.revision.error" class="modal-error">{{ modal.revision.error }}</div>
          <div class="modal-actions">
            <button @click="cerrarModales" class="btn-secondary">Cancelar</button>
            <button @click="handleDecisionRendicion('rechazado')" :disabled="actionLoading" class="btn-danger w-28 flex justify-center">Rechazar</button>
            <button @click="handleDecisionRendicion('aprobado')" :disabled="actionLoading" class="btn-success w-28 flex justify-center">Aprobar</button>
          </div>
        </div>
      </div>
    </transition>
    <transition name="modal-fade">
      <div v-if="modal.delete.show" class="modal-backdrop" @click.self="cerrarModales">
        <div class="modal-container">
          <h3 class="modal-title text-red-600">Eliminar Rendición</h3>
          <p class="text-sm mt-2">Estás a punto de eliminar permanentemente la rendición <strong class="font-bold">#{{ modal.delete.data.codigo_rendicion }} ({{ modal.delete.data.nombre_viaje }})</strong> y todos sus gastos asociados. Esta acción no se puede deshacer.</p>
          <div class="mt-4"><label for="confirmDelete" class="form-label">Para confirmar, escribe "eliminar" en el campo de abajo.</label><input id="confirmDelete" v-model="modal.delete.confirmText" type="text" class="form-input mt-1" autocomplete="off"></div>
          <div class="modal-actions">
            <button @click="cerrarModales" class="btn-secondary">Cancelar</button>
            <button @click="handleEliminarRendicionIndividual" :disabled="modal.delete.confirmText !== 'eliminar' || actionLoading" class="btn-danger w-48 flex justify-center">
              <span v-if="actionLoading">Eliminando...</span><span v-else>Eliminar Permanentemente</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
    <transition name="modal-fade">
      <div v-if="modal.bulkDelete.show" class="modal-backdrop" @click.self="cerrarModales">
        <div class="modal-container">
          <h3 class="modal-title text-red-600">Eliminar Rendiciones Seleccionadas</h3>
          <p class="text-sm mt-2">Estás a punto de eliminar permanentemente <strong class="font-bold">{{ selectedRendiciones.size }} rendiciones</strong> y todos sus gastos asociados. Esta acción no se puede deshacer.</p>
          <div class="mt-4"><label for="confirmBulkDelete" class="form-label">Para confirmar, escribe "eliminar" en el campo de abajo.</label><input id="confirmBulkDelete" v-model="modal.bulkDelete.confirmText" type="text" class="form-input mt-1" autocomplete="off"></div>
          <div class="modal-actions">
            <button @click="cerrarModales" class="btn-secondary">Cancelar</button>
            <button @click="handleDeleteSelected" :disabled="modal.bulkDelete.confirmText !== 'eliminar' || actionLoading" class="btn-danger w-48 flex justify-center">
              <span v-if="actionLoading">Eliminando...</span><span v-else>Eliminar Permanentemente</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>