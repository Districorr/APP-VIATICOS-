// src/components/GastoForm.vue
<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatCurrency, formatCurrencyForInput } from '../utils/formatters.js';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import TipoGastoSelector from './TipoGastoSelector.vue';
import { useRouter } from 'vue-router';

// --- INICIO DE MODIFICACIONES ---
const ID_TIPO_GASTO_COMBUSTIBLE = 14;
// --- FIN DE MODIFICACIONES ---

const props = defineProps({
  formatoId: { type: [Number, String], required: true },
  nombreFormato: { type: String, default: 'Formulario de Gasto' },
  gastoId: { type: [Number, String], default: null },
  viajeIdPredeterminado: { type: [Number, String], default: null },
  cajaIdPredeterminada: { type: [Number, String], default: null }
});
const emit = defineEmits(['gasto-guardado', 'cancelar']);

const router = useRouter();
const currentStep = ref(1);
const stepError = ref('');
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');
const isEditMode = computed(() => !!props.gastoId);

const loadingSelects = reactive({
  viajes: true,
  clientes: true,
  transportes: true,
  proveedores: true,
  cajas_chicas: true,
  usuariosParaDelegar: true,
  vehiculos: true,
});

const formState = reactive({});
const opcionesSelect = ref({
  viajes: [],
  tipos_gasto: [],
  clientes: [],
  transportes: [],
  proveedores: [],
  cajas_chicas: [],
  usuariosParaDelegar: [],
  vehiculos: [],
});

const facturaFile = ref(null);
const facturaPreview = ref(null);
const sinFactura = ref(false);
const useCajaDiaria = ref(false);
const selectedCajaId = ref(null);
const isDelegating = ref(false);
const delegatedToUserId = ref(null);

const camposObligatorios = ref([]);
const camposOpcionales = ref([]);
const camposOpcionalesVisibles = ref(new Set());
const formattedMontoTotal = ref('');

const duplicationWarning = ref('');
const duplicationCheckTimeout = ref(null);

const provincias = ref(['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán']);

// --- INICIO DE MODIFICACIONES ---
const isCombustibleGasto = computed(() => formState.tipo_gasto_id === ID_TIPO_GASTO_COMBUSTIBLE);
// --- FIN DE MODIFICACIONES ---


const handleMontoInput = (event) => {
  const input = event.target;
  let value = input.value;
  const digits = value.replace(/\D/g, '');
  const numericValue = digits ? parseInt(digits, 10) / 100 : 0;
  formState.monto_total = numericValue;
  const formattedValue = formatCurrencyForInput(numericValue);
  const cursorPos = input.selectionStart;
  const oldLength = value.length;
  formattedMontoTotal.value = formattedValue;
  nextTick(() => {
    const newLength = formattedValue.length;
    let newCursorPos = cursorPos + (newLength - oldLength);
    if (newLength > oldLength && formattedValue[cursorPos] === '.') newCursorPos = cursorPos + 1;
    input.setSelectionRange(newCursorPos, newCursorPos);
  });
};

const formattedMontoIva = computed(() => {
  if (formState.monto_total > 0) return formatCurrency(formState.monto_iva);
  return '';
});

async function cargarDatosCriticos() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const [camposResult, tiposResult] = await Promise.all([
      supabase.from('campos_formato_config').select('*').eq('formato_id', props.formatoId).order('orden_visualizacion'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto, icono_svg, color_accent').eq('activo', true)
    ]);

    if (camposResult.error) throw camposResult.error;
    const todosLosCampos = camposResult.data || [];
    camposObligatorios.value = todosLosCampos.filter(c => c.es_obligatorio);
    camposOpcionales.value = todosLosCampos.filter(c => !c.es_obligatorio);

    if (tiposResult.error) throw tiposResult.error;
    opcionesSelect.value.tipos_gasto = tiposResult.data || [];

    inicializarFormState();

  } catch (e) {
    errorMessage.value = `Error crítico al cargar el formulario: ${e.message}`;
    loading.value = false;
  }
}

async function cargarDatosSecundarios() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const promesas = {
      viajes: supabase.from('viajes').select('id, nombre_viaje').eq('user_id', user.id).is('cerrado_en', null),
      clientes: supabase.from('clientes').select('id, nombre_cliente'),
      transportes: supabase.from('transportes').select('id, nombre'),
      proveedores: supabase.from('proveedores').select('id, nombre').eq('activo', true),
      cajasChicas: supabase.from('cajas_chicas').select('id, nombre, saldo_actual').eq('responsable_id', user.id).eq('activo', true),
      todosLosUsuarios: supabase.from('perfiles').select('id, nombre_completo, email'),
      vehiculos: supabase.from('vehiculos').select('id, patente, marca, modelo').eq('activo', true),
    };

    for (const key in promesas) {
      promesas[key].then(({ data, error }) => {
        if (error) console.error(`Error cargando ${key}:`, error);
        else {
          if (key === 'clientes' || key === 'transportes' || key === 'proveedores') {
            opcionesSelect.value[key] = (data || []).map(item => ({ label: item.nombre_cliente || item.nombre, value: item.id }));
          } else if (key === 'cajasChicas') {
            opcionesSelect.value.cajas_chicas = (data || []).map(c => ({ label: `${c.nombre} (Saldo: ${formatCurrency(c.saldo_actual)})`, value: c.id }));
          } else if (key === 'todosLosUsuarios') {
            opcionesSelect.value.usuariosParaDelegar = (data || []).filter(u => u.id !== user.id);
          } else if (key === 'vehiculos') {
            opcionesSelect.value.vehiculos = (data || []).map(v => ({ label: `${v.marca || ''} ${v.modelo || ''} (${v.patente})`, value: v.id }));
          } else {
            opcionesSelect.value[key] = data || [];
          }
        }
        loadingSelects[key] = false;
      });
    }

  } catch (e) {
    console.error("Error al iniciar carga de datos secundarios:", e);
  }
}

onMounted(async () => {
  loading.value = true;
  await cargarDatosCriticos();
  
  if (isEditMode.value) {
    await cargarGastoParaEditar();
  } else {
    if (props.viajeIdPredeterminado) formState.viaje_id = parseInt(props.viajeIdPredeterminado);
    if (props.cajaIdPredeterminada) {
      useCajaDiaria.value = true;
      selectedCajaId.value = parseInt(props.cajaIdPredeterminada);
    }
  }

  loading.value = false;
  cargarDatosSecundarios();
});

function inicializarFormState() {
  const camposFijos = { fecha_gasto: new Date().toISOString().split('T')[0], monto_total: 0, monto_iva: 0, moneda: 'ARS', descripcion_general: '', numero_factura: '', viaje_id: null, caja_id: null, tipo_gasto_id: null, adelanto_especifico_aplicado: null, factura_url: null, provincia: null };
  const camposDeIdNormalizados = { cliente_id: null, transporte_id: null, proveedor_id: null };
  const otrosCamposDinamicos = {};
  [...camposObligatorios.value, ...camposOpcionales.value].forEach(campo => {
    if (!(campo.nombre_campo_tecnico in camposDeIdNormalizados) && !(campo.nombre_campo_tecnico in camposFijos)) {
      otrosCamposDinamicos[campo.nombre_campo_tecnico] = campo.valor_por_defecto || null;
    }
  });

  // --- INICIO DE MODIFICACIONES ---
  const camposCombustible = { vehiculo_id: null, litros: null, odometro_actual: null };
  Object.assign(formState, { ...camposFijos, ...camposDeIdNormalizados, ...otrosCamposDinamicos, ...camposCombustible });
  // --- FIN DE MODIFICACIONES ---

  formattedMontoTotal.value = formatCurrencyForInput(formState.monto_total);
  if (!isEditMode.value) {
    const lastProvincia = localStorage.getItem('lastUsedProvincia');
    if (lastProvincia) formState.provincia = lastProvincia;
  }
}

async function cargarGastoParaEditar() {
  const { data: gastoData, error: gastoError } = await supabase.from('gastos').select('*, datos_adicionales, clientes(id, nombre_cliente), transportes(id, nombre), proveedores(id, nombre)').eq('id', props.gastoId).single();
  if (gastoError) throw gastoError;

  // --- INICIO DE MODIFICACIONES ---
  // Extraer datos del vehículo de datos_adicionales si es un gasto de combustible
  let datosVehiculo = {};
  if (gastoData.tipo_gasto_id === ID_TIPO_GASTO_COMBUSTIBLE && gastoData.datos_adicionales) {
    datosVehiculo = {
        vehiculo_id: gastoData.datos_adicionales.vehiculo_id,
        litros: gastoData.datos_adicionales.litros,
        odometro_actual: gastoData.datos_adicionales.odometro,
    };
  }
  Object.assign(formState, gastoData, gastoData.datos_adicionales, datosVehiculo);
  // --- FIN DE MODIFICACIONES ---
  
  if (gastoData.caja_id) {
    useCajaDiaria.value = true;
    selectedCajaId.value = gastoData.caja_id;
  }
  if (gastoData.cliente_id && gastoData.clientes) formState.cliente_id = { label: gastoData.clientes.nombre_cliente, value: gastoData.cliente_id };
  if (gastoData.transporte_id && gastoData.transportes) formState.transporte_id = { label: gastoData.transportes.nombre, value: gastoData.transporte_id };
  if (gastoData.proveedor_id && gastoData.proveedores) formState.proveedor_id = { label: gastoData.proveedores.nombre, value: gastoData.proveedor_id };
  if (gastoData.factura_url) facturaPreview.value = gastoData.factura_url;
  sinFactura.value = !gastoData.numero_factura;
  formattedMontoTotal.value = formatCurrencyForInput(formState.monto_total || 0);
  camposOpcionales.value.forEach(campo => {
    const campoTecnico = campo.nombre_campo_tecnico;
    if (formState[campoTecnico] !== null && formState[campoTecnico] !== undefined && formState[campoTecnico] !== '') {
      camposOpcionalesVisibles.value.add(campoTecnico);
    }
  });
}

function agregarCampoOpcional(campo) { camposOpcionalesVisibles.value.add(campo.nombre_campo_tecnico); }
function quitarCampoOpcional(campo) {
  const campoTecnico = campo.nombre_campo_tecnico;
  camposOpcionalesVisibles.value.delete(campoTecnico);
  formState[campoTecnico] = null;
}

watch([() => formState.monto_total, sinFactura], ([newMonto, noTieneFactura]) => {
  if (noTieneFactura) formState.monto_iva = 0;
  else formState.monto_iva = parseFloat(((newMonto || 0) - ((newMonto || 0) / 1.21)).toFixed(2));
}, { immediate: true });

watch(sinFactura, (esSinFactura) => { if (esSinFactura) formState.numero_factura = ''; });

watch(() => [formState.numero_factura, formState.proveedor_id], ([numFactura, provId]) => {
  clearTimeout(duplicationCheckTimeout.value);
  duplicationWarning.value = '';
  if (!numFactura || sinFactura.value || !provId) return;
  
  duplicationCheckTimeout.value = setTimeout(async () => {
    try {
      const proveedorIdFinal = provId.value || provId;
      let query = supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('numero_factura', numFactura).eq('proveedor_id', proveedorIdFinal);
      if (isEditMode.value) query = query.neq('id', props.gastoId);
      const { count, error } = await query;
      if (error) throw error;
      if (count > 0) duplicationWarning.value = 'Alerta: Ya existe un gasto con este N° de factura y proveedor.';
    } catch (e) {
      console.error("Error verificando duplicados:", e.message);
    }
  }, 800);
});

const handleFacturaChange = (event) => {
  const file = event.target.files[0];
  if (file) {
    facturaFile.value = file;
    facturaPreview.value = URL.createObjectURL(file);
  }
};

function validateStep1() {
  if (!formState.monto_total || formState.monto_total <= 0) { stepError.value = 'Por favor, ingresa un monto total válido.'; return false; }
  if (useCajaDiaria.value && !selectedCajaId.value) { stepError.value = 'Si pagas con Caja Diaria, debes seleccionar una caja.'; return false; }
  return true;
}

function validateStep2() {
  if (!useCajaDiaria.value && !isDelegating.value && !formState.viaje_id) { stepError.value = 'Debes asociar este gasto a una rendición o delegarlo.'; return false; }
  if (isDelegating.value && !delegatedToUserId.value) { stepError.value = 'Debes seleccionar un responsable a quien delegar el gasto.'; return false; }
  if (!formState.tipo_gasto_id) { stepError.value = 'Debes seleccionar un tipo de gasto.'; return false; }
  
  // --- INICIO DE MODIFICACIONES ---
  if (isCombustibleGasto.value) {
    if (!formState.vehiculo_id) { stepError.value = 'Debes seleccionar un vehículo para un gasto de combustible.'; return false; }
    if (!formState.litros || formState.litros <= 0) { stepError.value = 'Debes ingresar una cantidad de litros válida.'; return false; }
    if (!formState.odometro_actual || formState.odometro_actual <= 0) { stepError.value = 'Debes ingresar el odómetro actual del vehículo.'; return false; }
  }
  // --- FIN DE MODIFICACIONES ---
  
  return true;
}

function nextStep() { if (validateStep1()) { stepError.value = ''; currentStep.value = 2; } }
function prevStep() { currentStep.value = 1; }

async function handleSubmit() {
  if (!validateStep2()) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado.');

    // --- INICIO DE MODIFICACIONES ---
    // Si es un gasto de combustible, usamos la nueva función unificada.
    if (isCombustibleGasto.value && !isDelegating.value && !isEditMode.value) {
        const { data: result, error: rpcError } = await supabase.rpc('registrar_gasto_combustible_unificado', {
            p_vehiculo_id: formState.vehiculo_id,
            p_fecha_carga: formState.fecha_gasto,
            p_litros: formState.litros,
            p_monto_total: formState.monto_total,
            p_odometro_actual: formState.odometro_actual,
            p_proveedor_id: formState.proveedor_id?.value || formState.proveedor_id,
            p_numero_comprobante: formState.numero_factura,
            p_descripcion: formState.descripcion_general,
            p_viaje_id: useCajaDiaria.value ? null : formState.viaje_id,
            p_caja_id: useCajaDiaria.value ? selectedCajaId.value : null,
            p_user_id: user.id
        });

        if (rpcError) throw rpcError;

        emit('gasto-guardado', {
            viaje_id: useCajaDiaria.value ? null : formState.viaje_id,
            caja_id: useCajaDiaria.value ? selectedCajaId.value : null
        });
        return; // Terminamos aquí el flujo para combustible
    }
    // Si no es combustible (o es delegado/edición), sigue el flujo original.
    // --- FIN DE MODIFICACIONES ---


    let finalFacturaUrl = formState.factura_url;
    if (facturaFile.value) {
      const filePath = `${user.id}/${Date.now()}-${facturaFile.value.name}`;
      const { error: uploadError } = await supabase.storage.from('facturas').upload(filePath, facturaFile.value);
      if (uploadError) throw uploadError;
      finalFacturaUrl = supabase.storage.from('facturas').getPublicUrl(filePath).data.publicUrl;
    }

    let finalClienteId = formState.cliente_id?.value || formState.cliente_id || null;
    if (formState.cliente_id && typeof formState.cliente_id === 'string') {
        const nuevoNombreCliente = formState.cliente_id.trim();
        const { data: nuevoCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({ nombre_cliente: nuevoNombreCliente, creado_por_id: user.id })
          .select('id')
          .single();
        if (clienteError) throw new Error(`Error al crear el nuevo cliente: ${clienteError.message}`);
        finalClienteId = nuevoCliente.id;
    }
    
    const payload = {
      formato_id: props.formatoId,
      fecha_gasto: formState.fecha_gasto,
      monto_total: formState.monto_total,
      monto_iva: formState.monto_iva,
      moneda: formState.moneda,
      descripcion_general: formState.descripcion_general,
      numero_factura: sinFactura.value ? null : formState.numero_factura,
      tipo_gasto_id: formState.tipo_gasto_id,
      cliente_id: finalClienteId,
      transporte_id: formState.transporte_id?.value || formState.transporte_id || null,
      proveedor_id: formState.proveedor_id?.value || formState.proveedor_id || null,
      adelanto_especifico_aplicado: formState.adelanto_especifico_aplicado,
      factura_url: finalFacturaUrl,
      provincia: formState.provincia,
    };

    const datosAdicionales = {};
    const CAMPOS_FIJOS_TABLA = ['id', 'user_id', 'creado_por_id', 'estado_delegacion', 'formato_id', 'fecha_gasto', 'monto_total', 'monto_iva', 'moneda', 'descripcion_general', 'numero_factura', 'viaje_id', 'caja_id', 'tipo_gasto_id', 'cliente_id', 'transporte_id', 'proveedor_id', 'adelanto_especifico_aplicado', 'factura_url', 'datos_adicionales', 'provincia'];
    const todosLosCamposDelFormato = [...camposObligatorios.value, ...camposOpcionales.value];
    todosLosCamposDelFormato.forEach(campo => {
      const nombreTecnico = campo.nombre_campo_tecnico;
      if (!CAMPOS_FIJOS_TABLA.includes(nombreTecnico)) {
        if (formState[nombreTecnico] !== null && formState[nombreTecnico] !== undefined && formState[nombreTecnico] !== '') {
          datosAdicionales[nombreTecnico] = formState[nombreTecnico];
        }
      }
    });
    payload.datos_adicionales = Object.keys(datosAdicionales).length > 0 ? datosAdicionales : null;

    let gastoGuardadoData;
    let error;

    if (isEditMode.value) {
        if (isDelegating.value) {
            const { data, error: rpcError } = await supabase.rpc('crear_gasto_delegado', { payload: { ...payload, user_id: delegatedToUserId.value } });
            gastoGuardadoData = data;
            error = rpcError;
            if (!error && props.gastoId && gastoGuardadoData.id !== props.gastoId) {
                const { error: deleteOriginalError } = await supabase.from('gastos').delete().eq('id', props.gastoId);
                if (deleteOriginalError) console.error("Error al borrar gasto original en re-delegación:", deleteOriginalError);
            }
        } else {
            const payloadUpdate = { ...payload, user_id: user.id, creado_por_id: null, estado_delegacion: 'directo', viaje_id: useCajaDiaria.value ? null : formState.viaje_id, caja_id: useCajaDiaria.value ? selectedCajaId.value : null };
            ({ data: gastoGuardadoData, error } = await supabase.from('gastos').update(payloadUpdate).eq('id', props.gastoId).select().single());
        }
    } else {
        if (isDelegating.value) {
            const payloadDelegado = { ...payload, user_id: delegatedToUserId.value };
            const { data, error: rpcError } = await supabase.rpc('crear_gasto_delegado', { payload: payloadDelegado });
            gastoGuardadoData = data;
            error = rpcError;
        } else {
            let payloadPropio = { ...payload, user_id: user.id, creado_por_id: null, estado_delegacion: 'directo', viaje_id: useCajaDiaria.value ? null : formState.viaje_id, caja_id: useCajaDiaria.value ? selectedCajaId.value : null };
            ({ data: gastoGuardadoData, error } = await supabase.from('gastos').insert(payloadPropio).select().single());
        }
    }

    if (error) {
        if (error.code === '23505' && error.message.includes('unique_factura_proveedor')) {
            throw new Error('Error: Ya existe un gasto con este número de factura para este proveedor.');
        }
        throw new Error(`Error al guardar el gasto: ${error.message}`);
    }

    if (useCajaDiaria.value && !isDelegating.value) {
        const { error: rpcError } = await supabase.rpc('registrar_gasto_caja_chica', { p_gasto_id: gastoGuardadoData.id, p_caja_id: selectedCajaId.value });
        if (rpcError) throw new Error(`Problema con Caja Diaria: ${rpcError.message}`);
    }

    if (isDelegating.value) {
        const { data: delegadorProfile } = await supabase.from('perfiles').select('nombre_completo').eq('id', user.id).single();
        const nombreDelegador = delegadorProfile?.nombre_completo || user.email;
        const { error: notifError } = await supabase.rpc('crear_notificacion_delegacion', { p_receptor_id: delegatedToUserId.value, p_mensaje: `${nombreDelegador} te ha delegado un gasto por ${formatCurrency(gastoGuardadoData.monto_total)}`, p_link: '/rendiciones/delegados' });
        if (notifError) console.warn("Gasto delegado guardado, pero falló la notificación:", notifError.message);
    }
    
    emit('gasto-guardado', gastoGuardadoData);

  } catch (e) {
    errorMessage.value = `Error al guardar: ${e.message}`;
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <div v-if="loading" class="text-center py-12">
    <svg class="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
    <p class="mt-3 text-gray-600">Cargando formulario...</p>
  </div>
  <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-lg text-red-700">{{ errorMessage }}</div>
  
  <form v-else @submit.prevent="handleSubmit" class="form-container bg-white pb-28">
    
    <div class="p-6 sm:p-8">
      <div class="border-b border-gray-200 pb-5 mb-6">
        <h2 class="text-2xl font-bold leading-7 text-gray-900">{{ isEditMode ? 'Editar Gasto' : 'Registrar Nuevo Gasto' }}</h2>
        <p class="mt-1 text-sm leading-6 text-gray-600">Usando el formato: <span class="font-semibold text-indigo-600">{{ nombreFormato }}</span></p>
      </div>

      <div class="mb-8">
        <div class="flex justify-between mb-1">
          <span class="text-sm font-medium" :class="currentStep === 1 ? 'text-indigo-600' : 'text-gray-500'">Paso 1: Montos y Destino</span>
          <span class="text-sm font-medium" :class="currentStep === 2 ? 'text-indigo-600' : 'text-gray-500'">Paso 2: Detalles del Gasto</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-1.5">
          <div class="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" :style="{ width: currentStep === 1 ? '50%' : '100%' }"></div>
        </div>
      </div>

      <div class="space-y-8">
        <!-- PASO 1 (sin cambios) -->
        <div v-show="currentStep === 1">
          <fieldset>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div class="input-wrapper">
                <label for="monto_total" class="form-label">Monto Total <span class="text-red-500">*</span></label>
                <div class="relative mt-1">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><span class="text-gray-500 sm:text-sm">$</span></div>
                  <input type="text" id="monto_total" :value="formattedMontoTotal" @input="handleMontoInput" required class="form-input pl-7 text-right" inputmode="decimal" placeholder="0,00" title="Ingrese el monto total del gasto"/>
                </div>
              </div>
              <transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
                <div v-if="!sinFactura" class="input-wrapper">
                  <label for="monto_iva" class="form-label">IVA (21%) Desglosado</label>
                  <input type="text" id="monto_iva" :value="formattedMontoIva" disabled class="form-input mt-1 bg-gray-100 cursor-not-allowed text-right" />
                </div>
              </transition>
              <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 items-start">
                  <div class="input-wrapper">
                      <label for="numero_factura" class="form-label">N° de Factura / Comprobante</label>
                      <input type="text" id="numero_factura" v-model="formState.numero_factura" :disabled="sinFactura" class="form-input mt-1" :class="{ 'bg-gray-100 cursor-not-allowed': sinFactura }" title="Número del comprobante o factura"/>
                      <div v-if="duplicationWarning" class="mt-2 p-2 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 text-xs rounded-md">
                        <p>{{ duplicationWarning }}</p>
                      </div>
                  </div>
                  <div class="flex items-center h-full pt-6">
                      <div class="flex items-center">
                          <label class="checkbox-wrapper"><input id="sin_factura_check" type="checkbox" v-model="sinFactura" class="checkbox-native" /><span class="checkbox-custom"></span></label>
                          <label for="sin_factura_check" class="ml-2 block text-sm text-gray-900 cursor-pointer">Este gasto no tiene factura</label>
                      </div>
                  </div>
              </div>
            </div>
          </fieldset>

          <fieldset class="mt-8 border-t pt-6">
            <legend class="form-legend">¿Cómo se rinde este gasto?</legend>
            <div class="space-y-6">
              <div v-if="opcionesSelect.cajas_chicas.length > 0" class="flex items-start">
                <div class="flex h-6 items-center"><input id="assign-caja" name="assignment-type" type="radio" :value="true" v-model="useCajaDiaria" @change="isDelegating = false" class="radio-input"></div>
                <div class="ml-3 text-sm leading-6"><label for="assign-caja" class="font-medium text-gray-900">Pagar con mi Caja Diaria</label><transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0"><div v-if="useCajaDiaria" class="mt-2"><select v-model="selectedCajaId" class="form-input"><option disabled :value="null">-- Selecciona tu caja --</option><option v-for="caja in opcionesSelect.cajas_chicas" :key="caja.value" :value="caja.value">{{ caja.label }}</option></select></div></transition></div>
              </div>
              <div class="flex items-start">
                <div class="flex h-6 items-center"><input id="assign-rendicion" name="assignment-type" type="radio" :checked="!useCajaDiaria && !isDelegating" @change="useCajaDiaria = false; isDelegating = false" class="radio-input"></div>
                <div class="ml-3 text-sm leading-6"><label for="assign-rendicion" class="font-medium text-gray-900">Asociar a una de mis Rendiciones</label><transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0"><div v-if="!useCajaDiaria && !isDelegating" class="mt-2"><select v-model.number="formState.viaje_id" class="form-input"><option disabled :value="null">-- Selecciona una rendición --</option><option v-for="viaje in opcionesSelect.viajes" :key="viaje.id" :value="viaje.id">{{ viaje.nombre_viaje }}</option></select></div></transition></div>
              </div>
              <div class="flex items-start">
                <div class="flex h-6 items-center"><input id="assign-delegar" name="assignment-type" type="radio" :value="true" v-model="isDelegating" @change="useCajaDiaria = false" class="radio-input"></div>
                <div class="ml-3 text-sm leading-6"><label for="assign-delegar" class="font-medium text-gray-900">Delegar gasto a otro responsable</label><p class="text-gray-500">El gasto será enviado para que otro usuario lo apruebe y lo incluya en su propia rendición.</p><transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0"><div v-if="isDelegating" class="mt-2"><select v-model="delegatedToUserId" class="form-input"><option disabled :value="null">-- Selecciona un responsable --</option><option v-for="user in opcionesSelect.usuariosParaDelegar" :key="user.id" :value="user.id">{{ user.nombre_completo || user.email }}</option></select></div></transition></div>
              </div>
            </div>
          </fieldset>
        </div>

        <!-- PASO 2 (MODIFICADO) -->
        <div v-show="currentStep === 2">
          <fieldset>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div class="input-wrapper"><label for="fecha_gasto" class="form-label">Fecha del Gasto <span class="text-red-500">*</span></label><input type="date" id="fecha_gasto" v-model="formState.fecha_gasto" required class="form-input mt-1" /></div>
              <div class="sm:col-span-2"><label class="form-label">Tipo de Gasto <span class="text-red-500">*</span></label><TipoGastoSelector v-model="formState.tipo_gasto_id" :options="opcionesSelect.tipos_gasto" class="mt-2"/></div>
              <div class="sm:col-span-2 input-wrapper"><label for="descripcion_general" class="form-label">Descripción General</label><input type="text" id="descripcion_general" v-model="formState.descripcion_general" class="form-input mt-1" placeholder="Ej: Nafta YPF, Almuerzo en..." /></div>
              <div class="input-wrapper"><label for="provincia" class="form-label">Provincia del Gasto</label><select id="provincia" v-model="formState.provincia" class="form-input mt-1"><option disabled :value="null">-- Seleccione una provincia --</option><option v-for="prov in provincias" :key="prov" :value="prov">{{ prov }}</option></select></div>
            </div>
          </fieldset>
          
          <!-- SECCIÓN DE COMBUSTIBLE CONDICIONAL -->
          <fieldset v-if="isCombustibleGasto && !isEditMode" class="mt-8 border-t pt-6">
            <legend class="form-legend">Datos de Combustible</legend>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div class="input-wrapper sm:col-span-1">
                <label for="vehiculo_id" class="form-label">Vehículo <span class="text-red-500">*</span></label>
                <v-select id="vehiculo_id" v-model="formState.vehiculo_id" :options="opcionesSelect.vehiculos" :loading="loadingSelects.vehiculos" placeholder="-- Seleccionar --" class="mt-1 bg-white" :reduce="option => option.value"></v-select>
              </div>
              <div class="input-wrapper">
                <label for="litros" class="form-label">Litros <span class="text-red-500">*</span></label>
                <input type="number" step="0.01" id="litros" v-model.number="formState.litros" class="form-input mt-1" placeholder="Ej: 45.5" />
              </div>
              <div class="input-wrapper">
                <label for="odometro_actual" class="form-label">Odómetro Actual (km) <span class="text-red-500">*</span></label>
                <input type="number" step="1" id="odometro_actual" v-model.number="formState.odometro_actual" class="form-input mt-1" placeholder="Ej: 150000" />
              </div>
            </div>
          </fieldset>

          <fieldset v-if="camposObligatorios.length > 0" class="mt-8 border-t pt-6"><legend class="form-legend">Detalles Específicos del Formato</legend><div class="grid grid-cols-1 sm:grid-cols-2 gap-6"><div v-for="campo in camposObligatorios" :key="campo.id" class="input-wrapper"><label :for="campo.nombre_campo_tecnico" class="form-label">{{ campo.etiqueta_visible }} <span v-if="campo.es_obligatorio" class="text-red-500">*</span></label><input v-if="campo.tipo_input === 'texto'" type="text" :id="campo.nombre_campo_tecnico" v-model="formState[campo.nombre_campo_tecnico]" :required="campo.es_obligatorio" class="form-input mt-1" /><v-select v-else-if="campo.tipo_input === 'select_cliente'" :id="campo.nombre_campo_tecnico" v-model="formState.cliente_id" :options="opcionesSelect.clientes" taggable :create-option="(newOption) => newOption" placeholder="-- Buscar o crear cliente --" class="mt-1" :class="{ 'v-select-required': campo.es_obligatorio && !formState.cliente_id }"></v-select><v-select v-else-if="campo.tipo_input === 'select_transporte'" :id="campo.nombre_campo_tecnico" v-model="formState.transporte_id" :options="opcionesSelect.transportes" placeholder="-- Buscar transporte --" class="mt-1" :class="{ 'v-select-required': campo.es_obligatorio && !formState.transporte_id }"></v-select><v-select v-else-if="campo.tipo_input === 'select_proveedor'" :id="campo.nombre_campo_tecnico" v-model="formState.proveedor_id" :options="opcionesSelect.proveedores" placeholder="-- Buscar proveedor --" class="mt-1" :class="{ 'v-select-required': campo.es_obligatorio && !formState.proveedor_id }"></v-select></div></div></fieldset>
          
          <div class="border-t border-gray-200 pt-6 mt-8">
            <h3 class="text-base font-semibold leading-7 text-gray-900">¿Necesitas más detalles?</h3>
            <p class="mt-1 text-sm leading-6 text-gray-600">Añade solo los campos que necesites para este gasto.</p>
            <div class="mt-4 flex flex-wrap gap-3">
              <template v-for="campo in camposOpcionales" :key="`btn-${campo.id}`">
                <button v-if="!camposOpcionalesVisibles.has(campo.nombre_campo_tecnico)" type="button" @click="agregarCampoOpcional(campo)" class="btn-add-optional">+ {{ campo.etiqueta_visible }}</button>
              </template>
            </div>
            
            <fieldset v-if="camposOpcionalesVisibles.size > 0" class="mt-6">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <template v-for="campo in camposOpcionales" :key="campo.id">
                  <div v-if="camposOpcionalesVisibles.has(campo.nombre_campo_tecnico)" class="relative group input-wrapper">
                    <label :for="`opcional-${campo.nombre_campo_tecnico}`" class="form-label">{{ campo.etiqueta_visible }}</label>
                    <input v-if="campo.tipo_input === 'texto'" type="text" :id="`opcional-${campo.nombre_campo_tecnico}`" v-model="formState[campo.nombre_campo_tecnico]" class="form-input mt-1" />
                    <v-select v-else-if="campo.tipo_input === 'select_cliente'" :id="`opcional-${campo.nombre_campo_tecnico}`" v-model="formState.cliente_id" :options="opcionesSelect.clientes" taggable :create-option="(newOption) => newOption" placeholder="-- Buscar o crear cliente --" class="mt-1"></v-select>
                    <v-select v-else-if="campo.tipo_input === 'select_transporte'" :id="`opcional-${campo.nombre_campo_tecnico}`" v-model="formState.transporte_id" :options="opcionesSelect.transportes" placeholder="-- Buscar transporte --" class="mt-1"></v-select>
                    <v-select v-else-if="campo.tipo_input === 'select_proveedor'" :id="`opcional-${campo.nombre_campo_tecnico}`" v-model="formState.proveedor_id" :options="opcionesSelect.proveedores" placeholder="-- Buscar proveedor --" class="mt-1"></v-select>
                    <button type="button" @click="quitarCampoOpcional(campo)" class="btn-remove-optional" aria-label="Quitar campo"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg></button>
                  </div>
                </template>
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </div>

    <div class="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 shadow-lg-top z-10">
      <div class="max-w-3xl mx-auto px-6 sm:px-8 py-4">
        <div v-if="stepError" class="text-center text-red-600 text-sm mb-2 font-semibold">{{ stepError }}</div>
        <div v-if="currentStep === 1" class="flex items-center justify-end gap-x-3">
          <button type="button" @click="emit('cancelar')" class="btn-secondary" aria-label="Cancelar creación de gasto">Cancelar</button>
          <button type="button" @click="nextStep" class="btn-primary" aria-label="Siguiente paso">
            Siguiente <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 ml-1"><path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.28a.75.75 0 111.04-1.06l5.5 5.25a.75.75 0 010 1.06l-5.5 5.25a.75.75 0 11-1.04-1.06l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" /></svg>
          </button>
        </div>
        <div v-if="currentStep === 2" class="flex items-center justify-between gap-x-3">
          <button type="button" @click="prevStep" class="btn-secondary" aria-label="Volver al paso anterior">Atrás</button>
          <div class="flex items-center gap-x-3">
            <button type="button" @click="emit('cancelar')" class="btn-secondary" aria-label="Cancelar creación de gasto">Cancelar</button>
            <button type="submit" :disabled="loading" class="btn-primary" aria-label="Guardar gasto">
              <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {{ loading ? 'Guardando...' : (isEditMode ? 'Actualizar Gasto' : 'Guardar Gasto') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </form>
</template>
<style>
:root {
  --vs-border-radius: 0.5rem;
  --vs-line-height: 1.5;
  --vs-font-size: 0.875rem;
  --vs-border-color: #d1d5db;
  --vs-dropdown-option--active-bg: #4f46e5;
  --vs-dropdown-option--active-color: #ffffff;
}
.v-select-required .vs__dropdown-toggle {
  border-color: #ef4444;
}

.form-container {
  @apply rounded-xl shadow-lg border border-gray-200;
}
.form-legend {
  @apply text-base font-semibold leading-7 text-gray-900;
}
.form-label {
  @apply block text-sm font-medium leading-6 text-gray-900;
}
.form-input {
  @apply block w-full rounded-lg border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-shadow;
}
.input-wrapper:focus-within .form-input {
  @apply ring-indigo-500;
}

.btn-primary {
  @apply inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:bg-indigo-400;
}
.btn-secondary {
  @apply inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50;
}
.btn-add-optional {
  @apply rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50;
}
.btn-remove-optional {
  @apply absolute -top-2 -right-2 h-6 w-6 bg-white rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 flex items-center justify-center border transition-opacity opacity-0 group-hover:opacity-100;
}

.shadow-lg-top {
  box-shadow: 0 -4px 6px -1px rgb(0 0 0 / 0.1), 0 -2px 4px -2px rgb(0 0 0 / 0.1);
}

.checkbox-wrapper {
  @apply inline-block relative cursor-pointer;
}
.checkbox-native {
  @apply opacity-0 w-0 h-0 absolute;
}
.checkbox-custom {
  @apply w-5 h-5 bg-white border-2 border-gray-300 rounded-md inline-block align-middle transition-all duration-200;
}
.checkbox-native:checked + .checkbox-custom {
  background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
  @apply bg-indigo-600 border-indigo-600;
}
.radio-input {
  @apply h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600;
}
</style>