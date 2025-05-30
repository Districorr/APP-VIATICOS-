<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useRouter } from 'vue-router'; // Importar useRouter para el enlace de "crear viaje"

const props = defineProps({
  gastoId: String,
  viajeIdPredeterminado: [String, Number, null],
  formatoIdUsuario: [Number, String, null]
});
const emit = defineEmits(['gastoGuardado', 'cancelar']);
const router = useRouter(); // Instancia de useRouter

const form = ref({
  id: null,
  fecha_gasto: new Date().toISOString().split('T')[0],
  tipo_gasto_id: null,
  monto_total: null,
  moneda: 'ARS',
  descripcion_general: '',
  viaje_id: null,
  numero_factura: '',
  factura_url: null,
  adelanto_especifico_aplicado: null, // RENOMBRADO (antes monto_adelanto)
  cliente_referido: '', // Ahora obligatorio
  monto_iva: null,
  formato_id: null,
  datos_adicionales: {},
});

const facturaFile = ref(null);
const facturaPreview = ref(null);
const viajes = ref([]);
const tiposDeGastoDisponibles = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const tipoMontoIngresado = ref('bruto'); // 'bruto', 'neto', 'sin_factura'
const tasaIVA = 0.21;

const clientesSugeridos = ref([]); // Para sugerencias de clientes
// --- Lógica para Campos Dinámicos ---
const camposDinamicosConfig = ref([]);
const cargandoCamposDinamicos = ref(false);

async function fetchCamposFormato(formatoId) {
  if (!formatoId) {
    camposDinamicosConfig.value = [];
    if (!props.gastoId) { // Solo limpiar para nuevos gastos si no hay formato
        form.value.datos_adicionales = {};
    }
    return;
  }
  cargandoCamposDinamicos.value = true;
  try {
    const { data, error } = await supabase
      .from('campos_formato_config')
      .select('*')
      .eq('formato_id', formatoId)
      .order('orden_visualizacion', { ascending: true });

    if (error) throw error;
    camposDinamicosConfig.value = data || [];
    
    if (form.value.datos_adicionales === null || form.value.datos_adicionales === undefined) {
        form.value.datos_adicionales = {};
    }
    
    (data || []).forEach(campoConfig => {
      if (!(campoConfig.nombre_campo_tecnico in form.value.datos_adicionales)) {
        if (campoConfig.tipo_dato === 'booleano') {
          form.value.datos_adicionales[campoConfig.nombre_campo_tecnico] = false; 
        } else if (campoConfig.tipo_dato === 'selector' && !campoConfig.es_obligatorio) {
            form.value.datos_adicionales[campoConfig.nombre_campo_tecnico] = null;
        }
        else {
            form.value.datos_adicionales[campoConfig.nombre_campo_tecnico] = undefined;
        }
      }
    });
  } catch (error) {
    console.error('Error cargando campos dinámicos del formato:', error.message);
    errorMessage.value = (errorMessage.value ? errorMessage.value + '\n' : '') + 'No se pudieron cargar los campos específicos del formato.';
    camposDinamicosConfig.value = [];
  } finally {
    cargandoCamposDinamicos.value = false;
  }
}
// --- Fin Lógica para Campos Dinámicos ---

const montoNetoCalculado = computed(() => {
  if (tipoMontoIngresado.value === 'sin_factura' || form.value.monto_total === null || form.value.monto_total === undefined || isNaN(parseFloat(form.value.monto_total))) return null;
  const montoIngresado = parseFloat(form.value.monto_total);
  if (tipoMontoIngresado.value === 'bruto') {
    return parseFloat((montoIngresado / (1 + tasaIVA)).toFixed(2));
  }
  return parseFloat(montoIngresado.toFixed(2));
});

const montoIVACalculado = computed(() => {
  if (tipoMontoIngresado.value === 'sin_factura' || form.value.monto_total === null || form.value.monto_total === undefined || isNaN(parseFloat(form.value.monto_total))) {
    return tipoMontoIngresado.value === 'sin_factura' ? 0 : null;
  }
  const montoIngresado = parseFloat(form.value.monto_total);
  if (tipoMontoIngresado.value === 'bruto') {
    if (montoNetoCalculado.value === null && tipoMontoIngresado.value !== 'sin_factura') return null; // Evitar error si montoNeto es null
    return parseFloat((montoIngresado - (montoNetoCalculado.value || 0)).toFixed(2)); // Usar 0 si montoNetoCalculado es null
  } else { // tipoMontoIngresado es 'neto'
    return parseFloat((montoIngresado * tasaIVA).toFixed(2));
  }
});

watch([() => form.value.monto_total, tipoMontoIngresado], () => {
  if (tipoMontoIngresado.value === 'sin_factura') {
    form.value.monto_iva = 0;
  } else if (form.value.monto_total !== null && !isNaN(parseFloat(form.value.monto_total))) {
    form.value.monto_iva = montoIVACalculado.value;
  } else {
    form.value.monto_iva = null;
  }
}, { deep: true });

async function fetchClientesSugeridos() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('clientes_referidos_usuario')
      .select('nombre_cliente')
      .eq('user_id', user.id)
      .order('nombre_cliente', { ascending: true })
      .limit(100); 

    if (error) {
      console.error("Error cargando clientes sugeridos:", error.message);
      return; 
    }
    clientesSugeridos.value = data.map(c => c.nombre_cliente);
  } catch (e) {
    console.error("Excepción al cargar clientes sugeridos:", e.message);
  }
}
const fetchDropdownData = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.warn('GastoForm: Usuario no autenticado en fetchDropdownData.');
        return;
    }
    const { data: tiposData, error: tiposError } = await supabase
      .from('tipos_gasto_config')
      .select('id, nombre_tipo_gasto')
      .eq('activo', true)
      .order('nombre_tipo_gasto');
    if (tiposError) throw tiposError;
    tiposDeGastoDisponibles.value = tiposData || [];

    const { data: viajesData, error: viajesError } = await supabase
      .from('viajes')
      .select('id, nombre_viaje')
      .eq('user_id', user.id)
      .order('fecha_inicio', { ascending: false });
    if (viajesError) throw viajesError;
    viajes.value = viajesData || [];
  } catch (error) {
    console.error('GastoForm fetchDropdownData: Error cargando datos de selectores:', error.message);
    errorMessage.value = (errorMessage.value ? errorMessage.value + '\n' : '') + "No se pudieron cargar opciones para el formulario (tipos de gasto/viajes).";
  }
};

onMounted(async () => {
  loading.value = true; 
  errorMessage.value = ''; 
  successMessage.value = '';

  // Cargar datos para selectores y sugerencias de clientes
  const loadingPromises = [fetchDropdownData(), fetchClientesSugeridos()]; 

  if (props.gastoId) { // Modo Edición
    console.log('GastoForm: Modo Edición, ID:', props.gastoId);
    try {
      const { data: gastoData, error } = await supabase.from('gastos').select('*').eq('id', props.gastoId).single();
      if (error) {
        console.error("Error cargando gasto para editar:", error);
        throw error; // Esto será atrapado por el catch más abajo
      }
      if (gastoData) {
        // Mapear adelanto_especifico_aplicado si la columna se renombró
        // Si la columna en BD aún es monto_adelanto, esto necesita ajustarse o la BD renombrarse.
        // Asumimos que gastoData.adelanto_especifico_aplicado existe o es null.
        form.value = { 
            ...gastoData, 
            fecha_gasto: gastoData.fecha_gasto.split('T')[0],
            datos_adicionales: gastoData.datos_adicionales || {},
            // Si la columna en BD se llama 'monto_adelanto' pero en el form es 'adelanto_especifico_aplicado':
            adelanto_especifico_aplicado: gastoData.monto_adelanto // O el nombre correcto de tu columna renombrada
        };
        
        // Heurística para tipoMontoIngresado y valor de form.value.monto_total (input)
        // Asumimos que gastoData.monto_total es el BRUTO FINAL guardado en BD.
        if (gastoData.monto_iva !== null && gastoData.monto_total !== null && gastoData.monto_iva >= 0) {
            // Si el gasto fue 'sin_factura' (IVA = 0 pero no null)
            if (gastoData.monto_iva === 0 && gastoData.monto_total > 0) {
                 // Podríamos tener un campo extra en BD para 'tipo_monto_ingresado_original'
                 // o inferir. Si IVA es 0, es probable que fuera 'sin_factura'.
                 // O si no hay factura_url y no hay numero_factura.
                 // Por ahora, si IVA es 0, lo tratamos como si se hubiera ingresado bruto (el monto total)
                 // y se selecciona 'sin_factura'
                 // Esta heurística puede mejorarse si se guarda el tipoMontoIngresado original.
                 // Una heurística simple: si el IVA es exactamente 0, fue "sin factura"
                 if (Math.abs(gastoData.monto_iva) < 0.001) {
                    tipoMontoIngresado.value = 'sin_factura';
                 } else {
                    const ivaCalculadoDesdeBrutoGuardado = parseFloat((gastoData.monto_total / (1 + tasaIVA) * tasaIVA).toFixed(2));
                    if (Math.abs(gastoData.monto_iva - ivaCalculadoDesdeBrutoGuardado) < 0.015) {
                        tipoMontoIngresado.value = 'bruto';
                    } else {
                        tipoMontoIngresado.value = 'neto';
                        form.value.monto_total = parseFloat((gastoData.monto_total / (1 + tasaIVA)).toFixed(2));
                    }
                 }
            } else { // IVA > 0
                const ivaCalculadoDesdeBrutoGuardado = parseFloat((gastoData.monto_total / (1 + tasaIVA) * tasaIVA).toFixed(2));
                if (Math.abs(gastoData.monto_iva - ivaCalculadoDesdeBrutoGuardado) < 0.015) {
                    tipoMontoIngresado.value = 'bruto';
                } else {
                    tipoMontoIngresado.value = 'neto';
                    form.value.monto_total = parseFloat((gastoData.monto_total / (1 + tasaIVA)).toFixed(2));
                }
            }
        } else if (gastoData.monto_total !== null) { 
            tipoMontoIngresado.value = 'bruto'; 
        } else { 
            tipoMontoIngresado.value = 'bruto';
        }

        if (gastoData.factura_url) {
          facturaPreview.value = gastoData.factura_url;
        }
        
        if (form.value.formato_id) {
          loadingPromises.push(fetchCamposFormato(form.value.formato_id));
        } else {
             console.warn("GastoForm: Gasto en edición no tiene formato_id. No se cargarán campos dinámicos.");
             camposDinamicosConfig.value = [];
        }
      } else {
        errorMessage.value = `GastoForm: No se encontró el gasto con ID: ${props.gastoId}.`;
      }
    } catch (e) { 
      errorMessage.value = 'GastoForm: Error al cargar el gasto para editar: ' + e.message; 
      console.error(e); 
    }
  } else { // Modo Creación
    console.log('GastoForm: Modo Creación.');
    form.value.formato_id = props.formatoIdUsuario ? parseInt(props.formatoIdUsuario) : null;
    form.value.viaje_id = props.viajeIdPredeterminado ? parseInt(props.viajeIdPredeterminado) : null;
    form.value.datos_adicionales = {}; 

    if (form.value.formato_id) {
      loadingPromises.push(fetchCamposFormato(form.value.formato_id));
    } else {
      console.warn('GastoForm (Nuevo): No se proporcionó formatoIdUsuario. No se cargarán campos dinámicos si no se establece uno.');
      camposDinamicosConfig.value = [];
    }
  }
  
  try {
      await Promise.all(loadingPromises);
  } catch (e) {
      console.error("GastoForm: Error durante la carga inicial de datos del formulario (onMounted):", e);
  } finally {
      loading.value = false;
  }
});

watch(() => props.formatoIdUsuario, (newFormatoIdProp) => {
    if (!props.gastoId && newFormatoIdProp && newFormatoIdProp !== form.value.formato_id) {
        console.log("GastoForm: props.formatoIdUsuario cambió a", newFormatoIdProp, ". Actualizando form y recargando campos.");
        form.value.formato_id = parseInt(newFormatoIdProp);
    }
});

watch(() => form.value.formato_id, (newFormatoIdForm, oldFormatoIdForm) => {
  if (newFormatoIdForm !== oldFormatoIdForm) {
     console.log("GastoForm: form.value.formato_id cambió de", oldFormatoIdForm, "a", newFormatoIdForm, ". Recargando campos dinámicos.");
     // Al cambiar de formato, resetear los datos adicionales que pudieran existir del formato anterior
     if (!props.gastoId) { // Solo para nuevos gastos, en edición los datos adicionales vienen con el gasto
         form.value.datos_adicionales = {};
     }
     fetchCamposFormato(newFormatoIdForm);
  }
}, { immediate: false });

const handleFacturaChange = (event) => {
  const file = event.target.files[0];
  const facturaInput = event.target;
  if (file) {
    facturaFile.value = file;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => facturaPreview.value = e.target.result;
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      facturaPreview.value = null; // O un ícono de PDF, o el nombre del archivo.
      console.log("GastoForm: Archivo PDF seleccionado:", file.name);
    } else {
      facturaPreview.value = null;
    }
  } else {
    facturaFile.value = null;
    if (props.gastoId && form.value.factura_url) {
        facturaPreview.value = form.value.factura_url;
    } else {
        facturaPreview.value = null;
    }
    if (facturaInput) facturaInput.value = null;
  }
};

const handleSubmit = async () => {
  loading.value = true; 
  errorMessage.value = '';
  successMessage.value = '';
  
  // Validaciones básicas de campos fijos
  if (!form.value.formato_id) {
      errorMessage.value = 'Error: No se ha definido un formato para el gasto.';
      loading.value = false; return;
  }
  if (!form.value.tipo_gasto_id) {
    errorMessage.value = 'Selecciona un tipo de gasto.';
    loading.value = false; return;
  }
  if (form.value.monto_total === null || form.value.monto_total <= 0 || isNaN(parseFloat(form.value.monto_total))) {
    errorMessage.value = 'Ingresa un monto total válido y mayor a cero.';
    loading.value = false; return;
  }
  if (!form.value.fecha_gasto) {
    errorMessage.value = 'La fecha del gasto es obligatoria.';
    loading.value = false; return;
  }
  if (!form.value.viaje_id) {
    errorMessage.value = 'Debes asociar este gasto a un Viaje / Período de Rendición.';
    loading.value = false; return;
  }
  // Nueva validación: Cliente Referido es obligatorio
  if (!form.value.cliente_referido || form.value.cliente_referido.trim() === '') {
    errorMessage.value = 'El campo "Cliente Referido" es obligatorio.';
    loading.value = false;
    // Opcional: document.getElementById('cliente_referido')?.focus();
    return;
  }

  // Validar campos dinámicos obligatorios
  if (camposDinamicosConfig.value && camposDinamicosConfig.value.length > 0) {
    for (const campoConfig of camposDinamicosConfig.value) {
      if (campoConfig.es_obligatorio) {
        const valorCampo = form.value.datos_adicionales[campoConfig.nombre_campo_tecnico];
        let esInvalido = false;
        if (valorCampo === null || valorCampo === undefined) {
          esInvalido = true;
        } else if (typeof valorCampo === 'string' && valorCampo.trim() === '') {
          esInvalido = true;
        } else if (campoConfig.tipo_dato === 'booleano' && typeof valorCampo !== 'boolean') {
          if (valorCampo === undefined) esInvalido = true; 
        }
        if (esInvalido) {
          errorMessage.value = `El campo "${campoConfig.etiqueta_visible}" (del formato) es obligatorio.`;
          loading.value = false;
          const elCampo = document.getElementById(`campo_dinamico_${campoConfig.nombre_campo_tecnico}`);
          if (elCampo) elCampo.focus();
          return;
        }
      }
    }
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado. Por favor, inicia sesión de nuevo.');

    let finalFacturaUrl = form.value.factura_url;
    if (facturaFile.value) {
      if (props.gastoId && form.value.factura_url) {
        try { /* ... tu lógica de borrado de factura anterior ... */ }
        catch (e) { console.warn('No se pudo borrar factura anterior del storage:', e.message); }
      }
      const nameParts = facturaFile.value.name.split('.');
      const fileExt = nameParts.length > 1 ? nameParts.pop().toLowerCase() : '';
      const baseName = nameParts.join('.');
      const cleanBaseName = baseName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const filePath = `${user.id}/${Date.now()}_${cleanBaseName}${fileExt ? '.' + fileExt : ''}`;
      
      const { error: uploadError } = await supabase.storage.from('facturas').upload(filePath, facturaFile.value);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(filePath);
      finalFacturaUrl = urlData.publicUrl;
    }

    let montoBrutoFinalAGuardar = parseFloat(form.value.monto_total) || 0;
    let ivaParaGuardar = form.value.monto_iva;

    if (tipoMontoIngresado.value === 'sin_factura') {
        ivaParaGuardar = 0; // O null, consistente con cómo lo muestras/calculas
        // montoBrutoFinalAGuardar ya es el monto ingresado
    } else if (tipoMontoIngresado.value === 'neto') {
        montoBrutoFinalAGuardar = parseFloat((montoBrutoFinalAGuardar + (ivaParaGuardar || 0)).toFixed(2));
    }
    // Si es 'bruto', montoBrutoFinalAGuardar ya es el bruto.

    const datosAdicionalesParaGuardar = { ...form.value.datos_adicionales };
    for (const key in datosAdicionalesParaGuardar) {
        if (datosAdicionalesParaGuardar[key] === undefined) {
            datosAdicionalesParaGuardar[key] = null; 
        }
    }

    const gastoPayload = {
      user_id: user.id,
      formato_id: parseInt(form.value.formato_id),
      viaje_id: parseInt(form.value.viaje_id),
      fecha_gasto: form.value.fecha_gasto,
      tipo_gasto_id: parseInt(form.value.tipo_gasto_id),
      monto_total: montoBrutoFinalAGuardar,
      moneda: form.value.moneda,
      descripcion_general: form.value.descripcion_general,
      numero_factura: tipoMontoIngresado.value === 'sin_factura' ? null : form.value.numero_factura, // Nulo si es sin factura
      factura_url: finalFacturaUrl,
      adelanto_especifico_aplicado: form.value.adelanto_especifico_aplicado ? parseFloat(form.value.adelanto_especifico_aplicado) : null, // Usar nuevo nombre
      cliente_referido: form.value.cliente_referido.trim() || null, // Guardar trim o null
      monto_iva: ivaParaGuardar !== null ? parseFloat(ivaParaGuardar.toFixed(2)) : null,
      datos_adicionales: datosAdicionalesParaGuardar,
    };

    let dataResponse, errorResponse;
    if (props.gastoId) {
      const { user_id, created_at, id, ...updatePayload } = gastoPayload; 
      delete updatePayload.formato_id; 
      const { data, error } = await supabase.from('gastos').update(updatePayload).eq('id', props.gastoId).select().single();
      dataResponse = data; errorResponse = error;
    } else {
      const { data, error } = await supabase.from('gastos').insert(gastoPayload).select().single();
      dataResponse = data; errorResponse = error;
    }

    if (errorResponse) throw errorResponse;

    // Guardar/Actualizar Cliente Referido para Sugerencias
    if (form.value.cliente_referido && form.value.cliente_referido.trim() !== '' && user) {
      const clienteTrimmed = form.value.cliente_referido.trim();
      try {
        const { error: clienteUpsertError } = await supabase
          .from('clientes_referidos_usuario')
          .upsert({ 
            user_id: user.id, 
            nombre_cliente: clienteTrimmed,
            ultima_vez_usado: new Date().toISOString() 
          }, { 
            onConflict: 'user_id, nombre_cliente'
          });
        if (clienteUpsertError) {
          console.warn("Advertencia al guardar/actualizar cliente sugerido:", clienteUpsertError.message);
        } else {
          if (!clientesSugeridos.value.includes(clienteTrimmed)) {
              clientesSugeridos.value.push(clienteTrimmed);
              clientesSugeridos.value.sort((a, b) => a.localeCompare(b));
          }
        }
      } catch (e) { console.warn("Excepción al guardar/actualizar cliente sugerido:", e.message); }
    }

    successMessage.value = props.gastoId ? '¡Gasto actualizado exitosamente!' : '¡Gasto guardado exitosamente!';
    
    if (!props.gastoId) { // Resetear formulario si fue creación
      const formatoIdAlResetear = form.value.formato_id;
      const viajeIdAlResetear = props.viajeIdPredeterminado ? form.value.viaje_id : null;
      form.value = { 
        fecha_gasto: new Date().toISOString().split('T')[0],
        tipo_gasto_id: null, monto_total: null, moneda: 'ARS',
        descripcion_general: '',
        viaje_id: viajeIdAlResetear, 
        numero_factura: '', factura_url: null, 
        adelanto_especifico_aplicado: null, // Usar nuevo nombre
        cliente_referido: '', // Resetear cliente
        monto_iva: null,
        formato_id: formatoIdAlResetear, 
        datos_adicionales: {},
      };
      if (formatoIdAlResetear && camposDinamicosConfig.value.length > 0) {
          camposDinamicosConfig.value.forEach(campoConfig => { /* ... lógica de reseteo de datos_adicionales ... */ });
      }
      facturaFile.value = null; facturaPreview.value = null; tipoMontoIngresado.value = 'bruto';
      const elFileInput = document.getElementById('factura_file'); 
      if (elFileInput) elFileInput.value = null;
    }
    emit('gastoGuardado', dataResponse);

  } catch (error) {
    console.error('GastoForm handleSubmit: Error general al procesar el gasto:', error);
    errorMessage.value = 'Error al procesar el gasto: ' + (error.details || error.message || 'Error desconocido.');
  } finally {
    loading.value = false;
  }
};

</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6 bg-white p-6 sm:p-8 rounded-xl shadow-2xl">
    <div class="text-center mb-8">
      <h3 class="text-2xl sm:text-3xl font-bold text-districorr-primary leading-tight">
        {{ gastoId ? 'Editar Gasto Registrado' : 'Registrar Nuevo Gasto' }}
      </h3>
      <p v-if="!gastoId && form.formato_id && camposDinamicosConfig.length > 0 && !cargandoCamposDinamicos" class="text-sm text-gray-500 mt-1.5">
        Utilizando campos específicos del formato.
      </p>
      <p v-else-if="!gastoId && form.formato_id && !cargandoCamposDinamicos && camposDinamicosConfig.length === 0" class="text-sm text-gray-500 mt-1.5">
        Este formato no tiene campos adicionales.
      </p>
       <p v-else-if="!gastoId && !form.formato_id && !cargandoCamposDinamicos" class="text-sm text-orange-600 mt-1.5">
        No se ha definido un formato. Se usarán campos generales.
      </p>
    </div>

    <!-- FILA 1: Fecha y Tipo de Gasto -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
      <div>
        <label for="fecha_gasto" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Fecha del Gasto <span class="text-red-500">*</span></label>
        <input type="date" id="fecha_gasto" v-model="form.fecha_gasto" required
               class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out">
      </div>
      <div>
        <label for="tipo_gasto_id" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Tipo de Gasto <span class="text-red-500">*</span></label>
        <select id="tipo_gasto_id" v-model.number="form.tipo_gasto_id" required
                class="block w-full px-3.5 py-2.5 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out">
          <option :value="null" disabled>-- Seleccione un tipo --</option>
          <option v-for="tipo in tiposDeGastoDisponibles" :key="tipo.id" :value="tipo.id">{{ tipo.nombre_tipo_gasto }}</option>
        </select>
      </div>
    </div>

    <!-- FILA 2: Montos e IVA -->
    <fieldset class="border border-gray-300 p-4 rounded-lg shadow-sm">
        <legend class="text-sm font-medium text-districorr-text-dark px-2">Información de Montos</legend>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5 items-end mt-2">
            <div>
                <label for="monto_total_input" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Monto Ingresado <span class="text-red-500">*</span></label>
                <input type="number" id="monto_total_input" v-model.number="form.monto_total" step="0.01" required
                    class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out"
                    placeholder="0.00">
            </div>
            <div>
                <label for="tipo_monto_ingresado" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Tipo Monto Ingresado</label>
                <select id="tipo_monto_ingresado" v-model="tipoMontoIngresado" class="block w-full px-3.5 py-2.5 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out">
                  <option value="bruto">Bruto (IVA Incluido)</option>
                  <option value="neto">Neto (Sin IVA)</option>
                  <option value="sin_factura">Sin Factura / No Gravado</option>
                </select>
            </div>
            <div>
                <label for="monto_iva_calculado" class="block text-sm font-medium text-districorr-text-medium mb-1.5">IVA ({{ tasaIVA * 100 }}%) Calculado</label>
                <input type="number" id="monto_iva_calculado" 
                       :value="tipoMontoIngresado === 'sin_factura' ? '0.00' : (form.monto_iva !== null ? form.monto_iva.toFixed(2) : '0.00')" 
                       step="0.01" readonly
                       :disabled="tipoMontoIngresado === 'sin_factura'"
                       class="block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm bg-gray-100 sm:text-sm cursor-not-allowed disabled:opacity-70"
                       placeholder="0.00">
            </div>
        </div>
         <div class="mt-5">
            <label for="moneda" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Moneda</label>
            <input type="text" id="moneda" v-model="form.moneda" required
                  class="block w-full max-w-xs px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out"
                  placeholder="ARS">
         </div>
    </fieldset>

    <!-- FILA 3: Descripción General -->
    <div>
      <label for="descripcion_general" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Descripción General <span class="text-gray-400 text-xs">(Opcional)</span></label>
      <textarea id="descripcion_general" v-model="form.descripcion_general" rows="3"
                class="block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out"
                placeholder="Detalles generales del gasto..."></textarea>
    </div>
    
    <!-- FILA: Cliente Referido (Ahora Obligatorio) -->
    <div>
      <label for="cliente_referido" class="block text-sm font-medium text-districorr-text-medium mb-1.5">
        Cliente Referido <span class="text-red-500">*</span>
      </label>
      <input type="text" 
             id="cliente_referido" 
             v-model.trim="form.cliente_referido" 
             required
             list="clientes-sugeridos-list"
             class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out"
             placeholder="Nombre del cliente o referencia (ej. SAI, Pérez Juan)">
      <datalist id="clientes-sugeridos-list">
        <option v-for="cliente in clientesSugeridos" :key="cliente" :value="cliente"></option>
      </datalist>
      <p class="mt-1 text-xs text-gray-500">Asocia este gasto a un cliente específico.</p>
    </div>

    <!-- FILA: N° Factura y Viaje Asociado -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
       <div :class="{'opacity-50 cursor-not-allowed': tipoMontoIngresado === 'sin_factura'}">
         <label for="numero_factura" class="block text-sm font-medium text-districorr-text-medium mb-1.5">N° de Factura 
           <span v-if="tipoMontoIngresado !== 'sin_factura'" class="text-gray-400 text-xs">(Opcional)</span>
           <span v-else class="text-gray-400 text-xs">(No aplica)</span>
         </label>
         <input type="text" id="numero_factura" v-model="form.numero_factura"
               :disabled="tipoMontoIngresado === 'sin_factura'"
               class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out disabled:bg-gray-100">
       </div>
       <div>
         <label for="viaje_id" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Asociar a Viaje / Período <span class="text-red-500">*</span></label>
         <div v-if="viajes.length === 0 && !loading && !gastoId" class="my-1 p-2 bg-yellow-100 text-yellow-800 text-xs rounded-md border border-yellow-300">
            No tienes Viajes/Períodos creados. Debes 
            <a href="#" @click.prevent="emit('cancelar'); router.push({ name: 'ViajeNuevo' })" class="font-semibold underline hover:text-yellow-900">crear uno</a> primero.
          </div>
         <select id="viaje_id" v-model.number="form.viaje_id" required :disabled="viajes.length === 0 && !gastoId"
                 class="block w-full px-3.5 py-2.5 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out disabled:bg-gray-100 disabled:cursor-not-allowed">
           <option :value="null" disabled>
             {{ (viajes.length === 0 && !gastoId) ? '-- Crea un viaje/período primero --' : '-- Seleccione un Viaje/Período --' }}
           </option>
           <option v-for="viaje in viajes" :key="viaje.id" :value="viaje.id">{{ viaje.nombre_viaje }}</option>
         </select>
       </div>
    </div>

    <!-- FILA: Adelanto Aplicado al Gasto (Específico) -->
    <div>
      <label for="adelanto_especifico_aplicado" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Adelanto Aplicado Directo al Gasto <span class="text-gray-400 text-xs">(Opcional)</span></label>
      <input type="number" id="adelanto_especifico_aplicado" v-model.number="form.adelanto_especifico_aplicado" step="0.01"
             class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out"
             placeholder="0.00">
      <p class="mt-1 text-xs text-gray-500">Si parte de este gasto se cubrió con un adelanto específico para este mismo gasto (diferente al adelanto general del viaje/período).</p>
    </div>

    <!-- FILA: Adjuntar Comprobante -->
    <div>
      <label for="factura_file" class="block text-sm font-medium text-districorr-text-medium mb-1.5">Adjuntar Comprobante <span class="text-gray-400 text-xs">(Opcional)</span></label>
      <input type="file" id="factura_file" @change="handleFacturaChange" accept="image/*,application/pdf,.heic,.heif"
             class="block w-full text-sm text-gray-500 transition-colors duration-150 ease-in-out
                    file:mr-4 file:py-2.5 file:px-5 file:rounded-lg file:border-0
                    file:text-sm file:font-semibold file:cursor-pointer
                    file:bg-districorr-accent file:text-white
                    hover:file:bg-opacity-90 active:file:bg-opacity-75">
      <div v-if="facturaPreview || (form.factura_url && !facturaFile)" class="mt-3 border border-gray-200 rounded-lg p-2 inline-block max-w-xs shadow-sm bg-gray-50">
        <p class="text-xs text-gray-600 mb-1.5 font-medium">
          {{ facturaFile ? 'Nueva previsualización:' : (form.factura_url ? 'Comprobante actual:' : '') }}
        </p>
        <img v-if="facturaPreview && facturaPreview.startsWith('data:image')" :src="facturaPreview" alt="Previsualización de factura" class="max-h-48 w-auto rounded object-contain mx-auto">
        <a v-else-if="form.factura_url && !facturaFile && (form.factura_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || form.factura_url.startsWith('data:image'))" :href="form.factura_url" target="_blank" class="block text-center">
            <img :src="form.factura_url" alt="Factura actual" class="max-h-48 w-auto rounded object-contain mx-auto">
        </a>
        <a v-else-if="(form.factura_url && !facturaFile && form.factura_url.match(/\.pdf$/i)) || (facturaFile && facturaFile.type === 'application/pdf')" 
           :href="facturaFile && facturaFile.type === 'application/pdf' ? '#' : (form.factura_url || '#')" 
           target="_blank" 
           class="flex items-center justify-center text-districorr-accent hover:underline p-3 bg-white rounded-md border border-gray-300 shadow-sm hover:bg-gray-50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 mr-2 text-red-600"><path fill-rule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.53 9.514l3.453-3.552a.75.75 0 011.06 1.06l-3.453 3.552a1.125 1.125 0 001.591 1.59l3.455-3.553a3 3 0 000-4.242z" clip-rule="evenodd" /></svg>
            {{ facturaFile ? facturaFile.name : 'Ver PDF actual' }}
        </a>
        <p v-else-if="facturaFile" class="text-sm p-3 bg-white rounded-md border border-gray-300 shadow-sm">📄 {{ facturaFile.name }}</p>
      </div>
    </div>

    <!-- SECCIÓN DE CAMPOS DINÁMICOS -->
    <div v-if="form.formato_id" class="pt-2">
      <div v-if="cargandoCamposDinamicos && !gastoId" class="text-center my-6 py-8 border-t border-b border-gray-200">
          <svg class="animate-spin h-8 w-8 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-sm text-gray-500 mt-3">Cargando campos específicos del formato...</p>
      </div>

      <div v-if="!cargandoCamposDinamicos && camposDinamicosConfig.length > 0" class="space-y-5 border-t-2 border-districorr-accent/50 mt-8 pt-6">
        <h4 class="text-xl font-semibold text-districorr-primary mb-1 tracking-tight">
          Detalles Específicos del Formato
        </h4>
        <div v-for="campoConfig in camposDinamicosConfig" :key="campoConfig.id" class="campo-dinamico-item py-2 first:pt-0 last:pb-0">
          <label :for="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`" 
                 class="block text-sm font-medium text-districorr-text-medium mb-1.5">
            {{ campoConfig.etiqueta_visible }}
            <span v-if="campoConfig.es_obligatorio" class="text-red-500 ml-0.5">*</span>
          </label>

          <input v-if="campoConfig.tipo_dato === 'texto_corto'"
                 type="text" :id="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`"
                 v-model.trim="form.datos_adicionales[campoConfig.nombre_campo_tecnico]"
                 :required="campoConfig.es_obligatorio"
                 class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out">

          <textarea v-else-if="campoConfig.tipo_dato === 'texto_largo'"
                    :id="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`"
                    v-model.trim="form.datos_adicionales[campoConfig.nombre_campo_tecnico]"
                    :required="campoConfig.es_obligatorio" rows="3"
                    class="block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out"></textarea>

          <input v-else-if="campoConfig.tipo_dato === 'numero'"
                 type="number" :id="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`"
                 v-model.number="form.datos_adicionales[campoConfig.nombre_campo_tecnico]"
                 :required="campoConfig.es_obligatorio" step="any" 
                 class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out">

          <input v-else-if="campoConfig.tipo_dato === 'fecha'"
                 type="date" :id="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`"
                 v-model="form.datos_adicionales[campoConfig.nombre_campo_tecnico]"
                 :required="campoConfig.es_obligatorio"
                 class="appearance-none block w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out">

          <select v-else-if="campoConfig.tipo_dato === 'selector' && campoConfig.opciones_selector"
                  :id="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`"
                  v-model="form.datos_adicionales[campoConfig.nombre_campo_tecnico]"
                  :required="campoConfig.es_obligatorio"
                  class="block w-full px-3.5 py-2.5 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm transition-colors duration-150 ease-in-out">
            <option :value="undefined" v-if="!form.datos_adicionales[campoConfig.nombre_campo_tecnico] && campoConfig.es_obligatorio">-- Seleccione --</option>
            <option :value="null" v-if="!campoConfig.es_obligatorio && (!form.datos_adicionales[campoConfig.nombre_campo_tecnico] || form.datos_adicionales[campoConfig.nombre_campo_tecnico] === undefined)">-- (Opcional) --</option>
            <option v-for="opcion in campoConfig.opciones_selector" :key="opcion.valor !== undefined ? opcion.valor : opcion.etiqueta" :value="opcion.valor">
              {{ opcion.etiqueta }}
            </option>
          </select>

          <div v-else-if="campoConfig.tipo_dato === 'booleano'" class="flex items-center mt-1 py-1.5">
            <input type="checkbox"
                   :id="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`"
                   v-model="form.datos_adicionales[campoConfig.nombre_campo_tecnico]"
                   :true-value="true" :false-value="false"
                   class="h-5 w-5 text-districorr-accent border-gray-300 rounded-md focus:ring-2 focus:ring-offset-1 focus:ring-districorr-accent cursor-pointer shadow-sm">
            <label :for="`campo_dinamico_${campoConfig.nombre_campo_tecnico}`" class="ml-2.5 block text-sm text-gray-700 cursor-pointer select-none">
              {{ campoConfig.etiqueta_visible }} <!-- Se puede quitar si la etiqueta de arriba es suficiente -->
            </label>
          </div>
          
          <p v-else class="text-xs text-red-600 mt-1 p-2 bg-red-50 rounded-md border border-red-200">
            <span class="font-semibold">Advertencia:</span> Tipo de campo dinámico no implementado en el formulario ('{{ campoConfig.tipo_dato }}') para "{{ campoConfig.etiqueta_visible }}".
          </p>
        </div>
      </div>
      <div v-else-if="!cargandoCamposDinamicos && form.formato_id && camposDinamicosConfig.length === 0 && !gastoId" class="my-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 shadow-sm">
          Este formato no tiene campos adicionales configurados.
      </div>
    </div>
    <!-- FIN SECCIÓN DE CAMPOS DINÁMICOS -->

    <!-- Mensajes y Botones -->
    <div v-if="errorMessage" class="my-5 p-3.5 bg-red-100 border-l-4 border-red-600 text-red-700 rounded-r-md text-sm shadow-md">
      <p class="font-semibold">Error al procesar el formulario:</p>
      <p class="whitespace-pre-line mt-1">{{ errorMessage }}</p>
    </div>
    <div v-if="successMessage" class="my-5 p-3.5 bg-green-100 border-l-4 border-green-600 text-green-700 rounded-r-md text-sm shadow-md">
      {{ successMessage }}
    </div>

    <div class="flex flex-col sm:flex-row justify-end items-center space-y-3 sm:space-y-0 sm:space-x-4 pt-5 border-t border-gray-200 mt-8">
      <button type="button" @click="emit('cancelar')"
              class="w-full sm:w-auto px-6 py-3 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-all duration-150 ease-in-out">
        Cancelar
      </button>
      <button type="submit"
              :disabled="loading || (cargandoCamposDinamicos && !gastoId)"
              class="w-full sm:w-auto flex justify-center items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-districorr-primary hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out">
        <svg v-if="loading || (cargandoCamposDinamicos && !gastoId)" class="animate-spin -ml-1 mr-2.5 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span v-if="loading">Procesando...</span>
        <span v-else-if="cargandoCamposDinamicos && !gastoId">Cargando Formato...</span>
        <span v-else>{{ gastoId ? 'Actualizar Gasto' : 'Guardar Gasto' }}</span>
      </button>
    </div>
  </form>
</template>

<style scoped>
/* Si necesitas anular algún estilo de Tailwind o añadir algo muy específico */
input[type="date"]::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.6;
}
input[type="date"]::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
}
.campo-dinamico-item + .campo-dinamico-item {
    /* border-top: 1px dashed #e5e7eb; Opcional: separador entre campos dinámicos */
    /* padding-top: 1rem; Opcional: más espacio */
}
</style>

