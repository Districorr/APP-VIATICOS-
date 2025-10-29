<!-- src/views/admin/AdminGestionCajasView.vue -->
<script setup>
import { ref, onMounted, reactive } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency } from '../../utils/formatters.js';
import HistorialMovimientosCaja from '../../components/HistorialMovimientosCaja.vue'; // <-- IMPORTAMOS EL NUEVO COMPONENTE

// --- ESTADO PRINCIPAL DE LA VISTA ---
const loading = ref(true);
const errorMessage = ref('');
const todasLasCajas = ref([]);
const cajaSeleccionada = ref(null);

// --- ESTADO PARA MODAL DE AJUSTE ---
const showAjusteModal = ref(false);
const cajaParaAjuste = ref(null);
const ajusteMonto = ref(null);
const ajusteDescripcion = ref('');
const ajusteLoading = ref(false);
const ajusteError = ref('');

// --- ESTADO PARA MODAL DE CREACIÓN ---
const showCrearModal = ref(false);
const nuevaCaja = reactive({
  nombre: '',
  responsable_id: null,
  monto_objetivo: null,
  umbral_reposicion: null,
  activo: true,
});
const listaUsuarios = ref([]);
const crearLoading = ref(false);
const crearError = ref('');
const adminActiveTab = ref('movimientos');

// --- LÓGICA DE CARGA DE DATOS ---
async function cargarTodasLasCajas() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('cajas_chicas')
      .select(`
        *,
        responsable: perfiles (id, nombre_completo, email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    todasLasCajas.value = data;
  } catch (e) {
    console.error('Error al cargar todas las cajas chicas:', e);
    errorMessage.value = `No se pudieron cargar las cajas: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

// --- LÓGICA DE NAVEGACIÓN DE LA VISTA ---
function verDetalleCaja(caja) {
  cajaSeleccionada.value = caja;
}

function volverALista() {
  cajaSeleccionada.value = null;
}

// --- ACCIONES DEL ADMINISTRADOR ---

// Lógica del Modal de Ajuste de Saldo
function abrirModalAjuste(caja) {
  cajaParaAjuste.value = caja;
  ajusteMonto.value = null;
  ajusteDescripcion.value = '';
  ajusteError.value = '';
  ajusteLoading.value = false;
  showAjusteModal.value = true;
}

function cerrarModalAjuste() {
  showAjusteModal.value = false;
  cajaParaAjuste.value = null;
}

async function confirmarAjusteSaldo() {
  ajusteError.value = '';
  if (!ajusteMonto.value || parseFloat(ajusteMonto.value) === 0) {
    ajusteError.value = 'El monto no puede ser cero ni estar vacío.';
    return;
  }
  if (!ajusteDescripcion.value.trim()) {
    ajusteError.value = 'La descripción es obligatoria.';
    return;
  }
  ajusteLoading.value = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado.');

    const { data: rpcData, error: rpcError } = await supabase.rpc('ajustar_saldo_caja_manual', {
      p_caja_id: cajaParaAjuste.value.id,
      p_monto_ajuste: parseFloat(ajusteMonto.value),
      p_descripcion: ajusteDescripcion.value,
      p_realizado_por_id: user.id
    });
    if (rpcError) throw rpcError;
    if (!rpcData.success) throw new Error(rpcData.message);

    const cajaIndex = todasLasCajas.value.findIndex(c => c.id === cajaParaAjuste.value.id);
    if (cajaIndex !== -1) {
      todasLasCajas.value[cajaIndex].saldo_actual = rpcData.new_saldo;
    }
    if (cajaSeleccionada.value && cajaSeleccionada.value.id === cajaParaAjuste.value.id) {
      cajaSeleccionada.value.saldo_actual = rpcData.new_saldo;
    }
    cerrarModalAjuste();
  } catch (e) {
    console.error('Error al ajustar saldo:', e);
    ajusteError.value = e.message;
  } finally {
    ajusteLoading.value = false;
  }
}

// Lógica del Modal de Creación de Caja
async function cargarUsuariosParaSelector() {
  if (listaUsuarios.value.length > 0) return;
  try {
    const { data, error } = await supabase.from('perfiles').select('id, nombre_completo, email').order('nombre_completo');
    if (error) throw error;
    listaUsuarios.value = data;
  } catch (e) {
    crearError.value = `No se pudo cargar la lista de usuarios: ${e.message}`;
  }
}

function abrirModalCreacion() {
  Object.assign(nuevaCaja, {
    nombre: '',
    responsable_id: null,
    monto_objetivo: null,
    umbral_reposicion: null,
    activo: true,
  });
  crearError.value = '';
  crearLoading.value = false;
  showCrearModal.value = true;
  cargarUsuariosParaSelector();
}

function cerrarModalCreacion() {
  showCrearModal.value = false;
}

async function confirmarCreacionCaja() {
  crearError.value = '';
  if (!nuevaCaja.nombre.trim()) {
    crearError.value = 'El nombre de la caja es obligatorio.';
    return;
  }
  if (!nuevaCaja.responsable_id) {
    crearError.value = 'Debe seleccionar un responsable.';
    return;
  }
  if (!nuevaCaja.monto_objetivo || nuevaCaja.monto_objetivo <= 0) {
    crearError.value = 'El monto objetivo debe ser un número positivo.';
    return;
  }
  if (nuevaCaja.umbral_reposicion === null || nuevaCaja.umbral_reposicion < 0) {
    crearError.value = 'El umbral de reposición es obligatorio y no puede ser negativo.';
    return;
  }
  if (nuevaCaja.umbral_reposicion >= nuevaCaja.monto_objetivo) {
    crearError.value = 'El umbral debe ser menor que el monto objetivo.';
    return;
  }

  crearLoading.value = true;
  try {
    const { data: cajaCreada, error: insertError } = await supabase
      .from('cajas_chicas')
      .insert({
        nombre: nuevaCaja.nombre,
        responsable_id: nuevaCaja.responsable_id,
        monto_objetivo: nuevaCaja.monto_objetivo,
        umbral_reposicion: nuevaCaja.umbral_reposicion,
        activo: nuevaCaja.activo,
        saldo_actual: 0,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const responsableSeleccionado = listaUsuarios.value.find(u => u.id === cajaCreada.responsable_id);
    const cajaParaUI = {
      ...cajaCreada,
      responsable: responsableSeleccionado || { nombre_completo: 'Desconocido', email: '' }
    };
    todasLasCajas.value.unshift(cajaParaUI);
    
    cerrarModalCreacion();
  } catch (e) {
    console.error('Error al crear caja:', e);
    crearError.value = e.message;
  } finally {
    crearLoading.value = false;
  }
}

// --- Carga inicial al montar el componente ---
onMounted(cargarTodasLasCajas);
</script>
<template>
  <div class="max-w-7xl mx-auto px-4 py-8">
    <!-- MODO LISTA -->
    <div v-if="!cajaSeleccionada">
      <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-6">
        <h1 class="text-3xl font-bold text-gray-900">Gestión de Cajas Diarias</h1>
        <button @click="abrirModalCreacion" class="btn-primary mt-4 sm:mt-0 min-h-[44px]">+ Crear Nueva Caja</button>
      </div>

      <div v-if="loading" class="text-center py-12">
        <svg class="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="mt-3 text-gray-600">Cargando cajas...</p>
      </div>
      <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
      
      <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caja</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Responsable</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saldo / Objetivo</th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="caja in todasLasCajas" :key="caja.id">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-semibold text-gray-900">{{ caja.nombre }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">{{ caja.responsable?.nombre_completo || 'N/A' }}</div>
                    <div class="text-xs text-gray-500">{{ caja.responsable?.email || 'Sin email' }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-bold">{{ formatCurrency(caja.saldo_actual) }}</div>
                  <div class="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                    <div class="h-2.5 rounded-full" 
                         :class="{ 'bg-green-500': caja.saldo_actual >= caja.umbral_reposicion, 'bg-yellow-500': caja.saldo_actual < caja.umbral_reposicion && caja.saldo_actual >= 0, 'bg-red-500': caja.saldo_actual < 0 }"
                         :style="{ width: `${Math.min(100, (caja.monto_objetivo > 0 ? (caja.saldo_actual / caja.monto_objetivo) * 100 : 0))}%` }">
                    </div>
                  </div>
                  <div class="text-xs text-gray-500 mt-1">de {{ formatCurrency(caja.monto_objetivo) }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                        :class="caja.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                    {{ caja.activo ? 'Activa' : 'Inactiva' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div class="flex justify-end items-center gap-2">
                    <button @click="abrirModalAjuste(caja)" class="btn-secondary text-xs">Ajustar Saldo</button>
                    <button @click="verDetalleCaja(caja)" class="btn-primary text-xs">Ver Movimientos</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODO DETALLE -->
    <div v-else>
      <button @click="volverALista" class="btn-secondary mb-6">← Volver a la lista de Cajas</button>
      
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        Historial de: <span class="text-indigo-600">{{ cajaSeleccionada.nombre }}</span>
      </h1>
      <p class="text-gray-600 mb-6">Responsable: {{ cajaSeleccionada.responsable?.nombre_completo || 'N/A' }}</p>

      <!-- ESTRUCTURA DE PESTAÑAS PARA ADMIN -->
      <div class="mt-8">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8" aria-label="Tabs">
            <button @click="adminActiveTab = 'movimientos'" :class="['tab-button', { 'tab-active': adminActiveTab === 'movimientos' }]">Movimientos</button>
            <button @click="adminActiveTab = 'solicitudes'" :class="['tab-button', { 'tab-active': adminActiveTab === 'solicitudes' }]">Solicitudes</button>
          </nav>
        </div>
        <div class="mt-6">
          <div v-show="adminActiveTab === 'movimientos'">
            <HistorialMovimientosCaja 
              :key="cajaSeleccionada.id"
              :caja="cajaSeleccionada"
              :is-admin-report="true"
            />
          </div>
          <div v-show="adminActiveTab === 'solicitudes'">
            <div class="p-4 bg-gray-100 rounded-md text-center text-gray-600">
              <p>El historial de solicitudes para esta caja se mostrará aquí.</p>
              <p class="text-xs">(Funcionalidad en desarrollo)</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODALES -->
    <div v-if="showAjusteModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center" @click.self="cerrarModalAjuste">
        <div class="relative p-6 bg-white rounded-lg shadow-xl max-w-md mx-auto w-full">
            <h3 class="text-xl font-semibold leading-6 text-gray-900">Ajustar Saldo de Caja</h3>
            <p class="mt-1 text-sm text-gray-600">Para: <span class="font-bold">{{ cajaParaAjuste?.nombre }}</span></p>
            <div class="mt-6 space-y-4">
              <div>
                <label for="ajuste_monto" class="form-label">Monto del Ajuste</label>
                <input type="number" id="ajuste_monto" v-model.number="ajusteMonto" class="form-input mt-1" placeholder="Ej: 50000 (reposición) o -150 (ajuste)">
                <p class="text-xs text-gray-500 mt-1">Usa un número positivo para reponer y negativo para reducir.</p>
              </div>
              <div>
                <label for="ajuste_descripcion" class="form-label">Descripción / Motivo <span class="text-red-500">*</span></label>
                <input type="text" id="ajuste_descripcion" v-model="ajusteDescripcion" class="form-input mt-1" placeholder="Ej: Reposición semanal, corrección..." maxlength="100">
              </div>
            </div>
            <div v-if="ajusteError" class="mt-4 bg-red-100 p-3 rounded-md text-sm text-red-700"><p>{{ ajusteError }}</p></div>
            <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3">
                 <button type="button" @click="cerrarModalAjuste" :disabled="ajusteLoading" class="btn-secondary mt-3 sm:mt-0 w-full sm:w-auto">Cancelar</button>
                <button type="button" @click="confirmarAjusteSaldo" :disabled="ajusteLoading" class="btn-primary w-full sm:w-auto">
                    <span v-if="ajusteLoading">Procesando...</span><span v-else>Confirmar Ajuste</span>
                </button>
            </div>
        </div>
    </div>
    <div v-if="showCrearModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center" @click.self="cerrarModalCreacion">
        <div class="relative p-6 bg-white rounded-lg shadow-xl max-w-lg mx-auto w-full">
            <h3 class="text-xl font-semibold leading-6 text-gray-900">Crear Nueva Caja Diaria</h3>
            <p class="mt-1 text-sm text-gray-600">Completa los datos para la nueva caja.</p>
            <div class="mt-6 space-y-4">
              <div>
                <label for="nueva_caja_nombre" class="form-label">Nombre de la Caja <span class="text-red-500">*</span></label>
                <input type="text" id="nueva_caja_nombre" v-model="nuevaCaja.nombre" class="form-input mt-1" placeholder="Ej: Caja Chica Logística">
              </div>
              <div>
                <label for="nueva_caja_responsable" class="form-label">Responsable Asignado <span class="text-red-500">*</span></label>
                <select id="nueva_caja_responsable" v-model="nuevaCaja.responsable_id" class="form-input mt-1">
                  <option :value="null" disabled>-- Seleccione un usuario --</option>
                  <option v-for="usuario in listaUsuarios" :key="usuario.id" :value="usuario.id">
                    {{ usuario.nombre_completo }} ({{ usuario.email }})
                  </option>
                </select>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="nueva_caja_objetivo" class="form-label">Monto Objetivo <span class="text-red-500">*</span></label>
                  <input type="number" id="nueva_caja_objetivo" v-model.number="nuevaCaja.monto_objetivo" class="form-input mt-1" placeholder="200000">
                </div>
                <div>
                  <label for="nueva_caja_umbral" class="form-label">Umbral de Reposición <span class="text-red-500">*</span></label>
                  <input type="number" id="nueva_caja_umbral" v-model.number="nuevaCaja.umbral_reposicion" class="form-input mt-1" placeholder="20000">
                </div>
              </div>
              <div class="flex items-center">
                  <input id="nueva_caja_activa" type="checkbox" v-model="nuevaCaja.activo" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600">
                  <label for="nueva_caja_activa" class="ml-2 block text-sm text-gray-900">Activar esta caja inmediatamente</label>
              </div>
            </div>
            <div v-if="crearError" class="mt-4 bg-red-100 p-3 rounded-md text-sm text-red-700"><p>{{ crearError }}</p></div>
            <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3">
                 <button type="button" @click="cerrarModalCreacion" :disabled="crearLoading" class="btn-secondary mt-3 sm:mt-0 w-full sm:w-auto">Cancelar</button>
                <button type="button" @click="confirmarCreacionCaja" :disabled="crearLoading" class="btn-primary w-full sm:w-auto">
                    <span v-if="crearLoading">Creando Caja...</span><span v-else>Guardar Caja</span>
                </button>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium leading-6 text-gray-900; }
.form-input { @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50; }
.btn-secondary { @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50; }
.tab-button { @apply whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700; }
.tab-active { @apply border-indigo-500 text-indigo-600; }
</style>