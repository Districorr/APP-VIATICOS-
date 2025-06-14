<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatCurrency, parseCurrency } from '../utils/formatters.js';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

// --- Props y Emits ---
const props = defineProps({
  formatoId: { type: [Number, String], required: true },
  nombreFormato: { type: String, default: 'Formulario de Gasto' },
  gastoId: { type: [Number, String], default: null },
  viajeIdPredeterminado: { type: [Number, String], default: null }
});
const emit = defineEmits(['gasto-guardado', 'cancelar']);

// --- Estado del Componente ---
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');
const isEditMode = computed(() => !!props.gastoId);

// --- Estado del Formulario ---
const formState = reactive({});
const formattedMontoTotal = ref('');
const opcionesSelect = ref({
  viajes: [],
  tipos_gasto: [],
  clientes: [],
  transportes: []
});
const tipoMontoIngresado = ref('bruto');
const facturaFile = ref(null);
const facturaPreview = ref(null);
const sugerenciasGastos = ref([]);

// --- Lógica de Campos Dinámicos ---
const camposObligatorios = ref([]);
const camposOpcionales = ref([]);
const camposOpcionalesVisibles = ref(new Set());

// --- Lógica de Carga ---
async function cargarConfiguracionYDatos() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [camposResult, _, sugerenciasResult] = await Promise.all([
      supabase.from('campos_formato_config').select('*').eq('formato_id', props.formatoId).order('orden_visualizacion'),
      cargarOpcionesParaSelects(),
      supabase.rpc('get_sugerencias_gastos_usuario')
    ]);

    if (camposResult.error) throw camposResult.error;
    const todosLosCampos = camposResult.data || [];
    camposObligatorios.value = todosLosCampos.filter(c => c.es_obligatorio);
    camposOpcionales.value = todosLosCampos.filter(c => !c.es_obligatorio);

    if (sugerenciasResult.error) {
      console.warn("No se pudieron cargar las sugerencias:", sugerenciasResult.error.message);
    } else {
      sugerenciasGastos.value = sugerenciasResult.data || [];
    }

    inicializarFormState();

    if (isEditMode.value) {
      await cargarGastoParaEditar();
    } else {
      if (props.viajeIdPredeterminado) {
        formState.viaje_id = parseInt(props.viajeIdPredeterminado);
      }
    }
  } catch (e) {
    console.error("Error al cargar la configuración del formulario:", e);
    errorMessage.value = `No se pudo cargar el formulario: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

function inicializarFormState() {
  const camposFijos = {
    fecha_gasto: new Date().toISOString().split('T')[0],
    monto_total: null,
    monto_iva: null,
    moneda: 'ARS',
    descripcion_general: '',
    numero_factura: '',
    viaje_id: null,
    tipo_gasto_id: null,
    cliente_id: null,
    transporte_id: null,
    adelanto_especifico_aplicado: null,
    factura_url: null,
  };

  const camposDinamicos = {};
  [...camposObligatorios.value, ...camposOpcionales.value].forEach(campo => {
    camposDinamicos[campo.nombre_campo_tecnico] = campo.valor_por_defecto || null;
  });

  Object.assign(formState, { ...camposFijos, ...camposDinamicos });

  if (!isEditMode.value) {
    if (opcionesSelect.value.viajes.length === 1) {
      formState.viaje_id = opcionesSelect.value.viajes[0].id;
    }
  }
}

async function cargarGastoParaEditar() {
  const { data: gastoData, error: gastoError } = await supabase
    .from('gastos')
    .select('*, datos_adicionales, cliente_id(id, nombre_cliente), transporte_id(id, nombre)')
    .eq('id', props.gastoId)
    .single();
  if (gastoError) throw gastoError;

  Object.assign(formState, gastoData, gastoData.datos_adicionales);
  
  if (gastoData.cliente_id) {
    formState.cliente_id = { label: gastoData.cliente_id.nombre_cliente, value: gastoData.cliente_id.id };
  }
  if (gastoData.transporte_id) {
    formState.transporte_id = { label: gastoData.transporte_id.nombre, value: gastoData.transporte_id.id };
  }

  if (gastoData.factura_url) {
    facturaPreview.value = gastoData.factura_url;
  }
  if (gastoData.monto_iva === 0) {
    tipoMontoIngresado.value = 'sin_factura';
  } else {
    tipoMontoIngresado.value = 'bruto';
  }

  formattedMontoTotal.value = formatCurrency(formState.monto_total);

  camposOpcionales.value.forEach(campo => {
    const campoTecnico = campo.nombre_campo_tecnico;
    if (formState[campoTecnico] !== null && formState[campoTecnico] !== undefined && formState[campoTecnico] !== '') {
      camposOpcionalesVisibles.value.add(campoTecnico);
    }
  });
}

async function cargarOpcionesParaSelects() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const [viajes, tipos, clientes, transportes] = await Promise.all([
    supabase.from('viajes').select('id, nombre_viaje').eq('user_id', user.id).is('cerrado_en', null),
    supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true),
    supabase.from('clientes').select('id, nombre_cliente'),
    supabase.from('transportes').select('id, nombre')
  ]);

  opcionesSelect.value = {
    viajes: viajes.data || [],
    tipos_gasto: tipos.data || [],
    clientes: (clientes.data || []).map(c => ({ label: c.nombre_cliente, value: c.id })),
    transportes: (transportes.data || []).map(t => ({ label: t.nombre, value: t.id }))
  };
}

onMounted(cargarConfiguracionYDatos);

function agregarCampoOpcional(campo) {
  camposOpcionalesVisibles.value.add(campo.nombre_campo_tecnico);
}

function quitarCampoOpcional(campo) {
  const campoTecnico = campo.nombre_campo_tecnico;
  camposOpcionalesVisibles.value.delete(campoTecnico);
  formState[campoTecnico] = null;
}

watch(formattedMontoTotal, (newVal) => {
  const numericValue = parseCurrency(newVal);
  if (formState.monto_total !== numericValue) {
    formState.monto_total = numericValue;
  }
});

watch(() => formState.monto_total, (newVal) => {
  if (tipoMontoIngresado.value === 'bruto') {
    formState.monto_iva = parseFloat((newVal / 1.21 * 0.21).toFixed(2));
  } else if (tipoMontoIngresado.value === 'neto') {
    formState.monto_iva = parseFloat((newVal * 0.21).toFixed(2));
  } else {
    formState.monto_iva = 0;
  }
});

const montoBrutoFinal = computed(() => {
  if (tipoMontoIngresado.value === 'neto') {
    return (formState.monto_total || 0) + (formState.monto_iva || 0);
  }
  return formState.monto_total || 0;
});

const handleFacturaChange = (event) => {
  const file = event.target.files[0];
  if (file) {
    facturaFile.value = file;
    facturaPreview.value = URL.createObjectURL(file);
  }
};

function aplicarSugerencia() {
  const desc = formState.descripcion_general;
  const sugerenciaEncontrada = sugerenciasGastos.value.find(s => s.descripcion_general === desc);
  if (sugerenciaEncontrada) {
    formState.tipo_gasto_id = sugerenciaEncontrada.tipo_gasto_id;
  }
}

async function handleSubmit() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    let finalFacturaUrl = formState.factura_url;
    if (facturaFile.value) {
      const filePath = `${user.id}/${Date.now()}-${facturaFile.value.name}`;
      const { error: uploadError } = await supabase.storage.from('facturas').upload(filePath, facturaFile.value);
      if (uploadError) throw uploadError;
      finalFacturaUrl = supabase.storage.from('facturas').getPublicUrl(filePath).data.publicUrl;
    }

    const payloadFijo = {
      user_id: user.id,
      formato_id: props.formatoId,
      fecha_gasto: formState.fecha_gasto,
      monto_total: montoBrutoFinal.value,
      monto_iva: formState.monto_iva,
      moneda: formState.moneda,
      descripcion_general: formState.descripcion_general,
      numero_factura: formState.numero_factura,
      viaje_id: formState.viaje_id,
      tipo_gasto_id: formState.tipo_gasto_id,
      cliente_id: formState.cliente_id?.value || formState.cliente_id || null,
      transporte_id: formState.transporte_id?.value || formState.transporte_id || null,
      adelanto_especifico_aplicado: formState.adelanto_especifico_aplicado,
      factura_url: finalFacturaUrl,
    };

    const datosAdicionales = {};
    const todosLosCampos = [...camposObligatorios.value, ...camposOpcionales.value];
    todosLosCampos.forEach(campo => {
      if (!payloadFijo.hasOwnProperty(campo.nombre_campo_tecnico)) {
        datosAdicionales[campo.nombre_campo_tecnico] = formState[campo.nombre_campo_tecnico];
      }
    });
    payloadFijo.datos_adicionales = datosAdicionales;

    const { data, error } = isEditMode.value
      ? await supabase.from('gastos').update(payloadFijo).eq('id', props.gastoId).select().single()
      : await supabase.from('gastos').insert(payloadFijo).select().single();

    if (error) throw error;

    successMessage.value = `Gasto ${isEditMode.value ? 'actualizado' : 'registrado'} con éxito.`;
    setTimeout(() => {
      emit('gasto-guardado', data);
    }, 1000);

  } catch (e) {
    console.error("Error al guardar el gasto:", e);
    errorMessage.value = `Error al guardar: ${e.message}`;
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <div v-if="loading" class="text-center py-12">
    <svg class="animate-spin h-10 w-10 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
    <p class="mt-3 text-gray-600">Cargando formulario...</p>
  </div>
  <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
  
  <form v-else @submit.prevent="handleSubmit" class="space-y-8 bg-white p-6 sm:p-8 rounded-xl shadow-lg border">
    
    <!-- ENCABEZADO DEL FORMULARIO -->
    <div class="border-b border-gray-200 pb-5">
      <h2 class="text-2xl font-bold leading-7 text-gray-900">
        {{ isEditMode ? 'Editar Gasto' : 'Registrar Nuevo Gasto' }}
      </h2>
      <p class="mt-1 text-sm leading-6 text-gray-600">
        Usando el formato: <span class="font-semibold text-indigo-600">{{ nombreFormato }}</span>
      </p>
    </div>

    <!-- SECCIÓN DE MONTOS -->
    <fieldset>
      <legend class="form-legend">Información de Montos</legend>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label for="monto_total" class="form-label">Monto Total <span class="text-red-500">*</span></label>
          <div class="relative mt-1">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span class="text-gray-500 sm:text-sm">$</span>
            </div>
            <input 
              type="text" 
              id="monto_total" 
              v-model="formattedMontoTotal" 
              @blur="formattedMontoTotal = formatCurrency(parseCurrency($event.target.value))"
              required 
              class="form-input pl-7"
            >
          </div>
        </div>
        <div>
          <label for="tipo_monto_ingresado" class="form-label">Tipo de Monto</label>
          <select id="tipo_monto_ingresado" v-model="tipoMontoIngresado" class="form-input mt-1">
            <option value="bruto">Bruto (IVA Incluido)</option>
            <option value="neto">Neto (Sin IVA)</option>
            <option value="sin_factura">Sin Factura</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label for="monto_iva" class="form-label">IVA (21%) Calculado</label>
          <input type="text" id="monto_iva" :value="formatCurrency(formState.monto_iva)" disabled class="form-input mt-1 bg-gray-100 cursor-not-allowed">
        </div>
      </div>
    </fieldset>

    <!-- SECCIÓN DE DETALLES -->
    <fieldset>
      <legend class="form-legend">Detalles del Gasto</legend>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label for="fecha_gasto" class="form-label">Fecha del Gasto <span class="text-red-500">*</span></label>
          <input type="date" id="fecha_gasto" v-model="formState.fecha_gasto" required class="form-input mt-1">
        </div>
        <div>
          <label for="tipo_gasto_id" class="form-label">Tipo de Gasto <span class="text-red-500">*</span></label>
          <select id="tipo_gasto_id" v-model.number="formState.tipo_gasto_id" required class="form-input mt-1">
            <option disabled :value="null">-- Seleccione un tipo --</option>
            <option v-for="tipo in opcionesSelect.tipos_gasto" :key="tipo.id" :value="tipo.id">{{ tipo.nombre_tipo_gasto }}</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label for="descripcion_general" class="form-label">Descripción General</label>
          <input type="text" id="descripcion_general" v-model="formState.descripcion_general" @change="aplicarSugerencia" list="sugerencias-gastos" class="form-input mt-1" placeholder="Ej: Nafta YPF, Almuerzo en...">
          <datalist id="sugerencias-gastos">
            <option v-for="sugerencia in sugerenciasGastos" :key="sugerencia.descripcion_general" :value="sugerencia.descripcion_general"></option>
          </datalist>
        </div>
        <div>
          <label for="numero_factura" class="form-label">N° de Factura</label>
          <input type="text" id="numero_factura" v-model="formState.numero_factura" class="form-input mt-1">
        </div>
        <div>
          <label for="viaje_id" class="form-label">Asociar a Rendición <span class="text-red-500">*</span></label>
          <select id="viaje_id" v-model.number="formState.viaje_id" required class="form-input mt-1">
            <option disabled :value="null">-- Seleccione una rendición --</option>
            <option v-for="viaje in opcionesSelect.viajes" :key="viaje.id" :value="viaje.id">{{ viaje.nombre_viaje }}</option>
          </select>
        </div>
      </div>
    </fieldset>

    <!-- SECCIÓN DE CAMPOS OBLIGATORIOS -->
    <fieldset v-if="camposObligatorios.length > 0">
      <legend class="form-legend">Detalles Específicos del Formato</legend>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div v-for="campo in camposObligatorios" :key="campo.id">
          <label :for="campo.nombre_campo_tecnico" class="form-label">
            {{ campo.etiqueta_visible }} <span v-if="campo.es_obligatorio" class="text-red-500">*</span>
          </label>
          <input v-if="campo.tipo_input === 'texto'" type="text" :id="campo.nombre_campo_tecnico" v-model="formState[campo.nombre_campo_tecnico]" :required="campo.es_obligatorio" class="form-input mt-1">
          <v-select v-else-if="campo.tipo_input === 'select_cliente'" :id="campo.nombre_campo_tecnico" v-model="formState.cliente_id" :options="opcionesSelect.clientes" placeholder="-- Buscar cliente --" class="mt-1" :class="{ 'v-select-required': campo.es_obligatorio && !formState.cliente_id }"></v-select>
          <v-select v-else-if="campo.tipo_input === 'select_transporte'" :id="campo.nombre_campo_tecnico" v-model="formState.transporte_id" :options="opcionesSelect.transportes" placeholder="-- Buscar transporte --" class="mt-1" :class="{ 'v-select-required': campo.es_obligatorio && !formState.transporte_id }"></v-select>
        </div>
      </div>
    </fieldset>

    <!-- SECCIÓN DE CAMPOS OPCIONALES -->
    <div class="border-t border-gray-200 pt-6">
        <h3 class="text-base font-semibold leading-7 text-gray-900">¿Necesitas más detalles?</h3>
        <p class="mt-1 text-sm leading-6 text-gray-600">Añade solo los campos que necesites para este gasto.</p>
        <div class="mt-4 flex flex-wrap gap-3">
            <template v-for="campo in camposOpcionales" :key="`btn-${campo.id}`">
                <button v-if="!camposOpcionalesVisibles.has(campo.nombre_campo_tecnico)"
                        type="button"
                        @click="agregarCampoOpcional(campo)"
                        class="btn-add-optional">
                    + {{ campo.etiqueta_visible }}
                </button>
            </template>
        </div>
        <fieldset v-if="camposOpcionalesVisibles.size > 0" class="mt-6">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <template v-for="campo in camposOpcionales" :key="campo.id">
                    <div v-if="camposOpcionalesVisibles.has(campo.nombre_campo_tecnico)" class="relative group">
                        <label :for="`opcional-${campo.nombre_campo_tecnico}`" class="form-label">{{ campo.etiqueta_visible }}</label>
                        <input v-if="campo.tipo_input === 'texto'" type="text" :id="`opcional-${campo.nombre_campo_tecnico}`" v-model="formState[campo.nombre_campo_tecnico]" class="form-input mt-1">
                        <v-select v-else-if="campo.tipo_input === 'select_cliente'" :id="`opcional-${campo.nombre_campo_tecnico}`" v-model="formState.cliente_id" :options="opcionesSelect.clientes" placeholder="-- Buscar cliente --" class="mt-1"></v-select>
                        <v-select v-else-if="campo.tipo_input === 'select_transporte'" :id="`opcional-${campo.nombre_campo_tecnico}`" v-model="formState.transporte_id" :options="opcionesSelect.transportes" placeholder="-- Buscar transporte --" class="mt-1"></v-select>
                        <button type="button" @click="quitarCampoOpcional(campo)" class="btn-remove-optional">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>
                </template>
            </div>
        </fieldset>
    </div>

    <!-- BOTONES DE ACCIÓN -->
    <div class="pt-8 flex items-center justify-end gap-x-6 border-t border-gray-200">
      <button type="button" @click="emit('cancelar')" class="btn-secondary">Cancelar</button>
      <button type="submit" :disabled="loading" class="btn-primary">
        <span v-if="loading">Guardando...</span>
        <span v-else>{{ isEditMode ? 'Actualizar Gasto' : 'Guardar Gasto' }}</span>
      </button>
    </div>
  </form>
</template>
<style>
/* Estilos para vue-select (se mantienen) */
:root {
  --vs-colors--lightest: rgba(60, 60, 60, 0.26);
  --vs-colors--light: rgba(60, 60, 60, 0.5);
  --vs-colors--dark: #333;
  --vs-colors--darkest: rgba(0, 0, 0, 0.15);
  --vs-search-input-color: inherit;
  --vs-font-size: 0.875rem;
  --vs-line-height: 1.4;
  --vs-border-color: #d1d5db;
  --vs-border-width: 1px;
  --vs-border-radius: 0.375rem;
  --vs-actions-padding: 4px 6px 0 3px;
  --vs-dropdown-bg: #fff;
  --vs-dropdown-color: inherit;
  --vs-dropdown-z-index: 1000;
  --vs-dropdown-min-width: 160px;
  --vs-dropdown-max-height: 350px;
  --vs-dropdown-box-shadow: 0px 3px 6px 0px var(--vs-colors--darkest);
  --vs-dropdown-option-bg: #4f46e5; /* Color indigo para el hover */
  --vs-dropdown-option-color: #fff;
  --vs-dropdown-option-padding: 6px 12px;
}
.v-select-required .vs__dropdown-toggle {
  border-color: #ef4444;
}

/* --- NUEVOS ESTILOS PARA EL FORMULARIO --- */
.form-legend {
  @apply text-base font-semibold leading-7 text-gray-900 mb-4;
}
.form-label {
  @apply block text-sm font-medium leading-6 text-gray-900;
}
.form-input {
  @apply block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6;
}
.btn-primary {
  @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50;
}
.btn-secondary {
  @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-100;
}
.btn-add-optional {
  @apply rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50;
}
.btn-remove-optional {
  @apply absolute -top-2 -right-2 h-6 w-6 bg-white rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 flex items-center justify-center border transition-opacity opacity-0 group-hover:opacity-100;
}
</style>