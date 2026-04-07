<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../../supabaseClient';
import { formatCurrency } from '../../utils/formatters';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

const emit = defineEmits(['pago-guardado', 'cancelar']);

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const formState = ref({
  fecha_gasto: new Date().toISOString().split('T')[0],
  monto_total: null,
  descripcion_general: '',
  tipo_gasto_id: null,
  entidad_seleccionada: null,
  metodo_pago: 'Transferencia Banco Galicia',
  cliente_id: null,
  echeque_banco_id: null,
  echeque_numero: '',
  echeque_emision: '',
  echeque_vencimiento: '',
  echeque_acreditacion: '',
});

const opciones = ref({
  tipos_gasto: [],
  entidades: [],
  clientes: [],
  bancos: [],
});

const loadingSelects = ref(true);
const esEcheque = computed(() => formState.value.metodo_pago === 'E-Cheque');

async function cargarOpciones() {
  loadingSelects.value = true;
  try {
    const [tiposRes, proveedoresRes, transportesRes, clientesRes, bancosRes] = await Promise.all([
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').eq('activo', true).order('nombre_tipo_gasto'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true),
      supabase.from('transportes').select('id, nombre'),
      supabase.from('clientes').select('id, nombre_cliente'),
      supabase.from('bancos').select('id, nombre, color_hex').order('nombre')
    ]);

    if (tiposRes.error) throw tiposRes.error;
    opciones.value.tipos_gasto = tiposRes.data;

    if (proveedoresRes.error) throw proveedoresRes.error;
    const proveedores = proveedoresRes.data.map(p => ({ label: p.nombre, value: p.id, type: 'proveedor' }));
    
    if (transportesRes.error) throw transportesRes.error;
    const transportes = transportesRes.data.map(t => ({ label: t.nombre, value: t.id, type: 'transporte' }));

    opciones.value.entidades = [...proveedores, ...transportes].sort((a, b) => a.label.localeCompare(b.label));
    
    if (clientesRes.error) throw clientesRes.error;
    opciones.value.clientes = clientesRes.data.map(c => ({ label: c.nombre_cliente, value: c.id }));

    if (bancosRes.error) throw bancosRes.error;
    opciones.value.bancos = bancosRes.data.map(b => ({ label: b.nombre, value: b.id, color: b.color_hex }));

  } catch (e) {
    errorMessage.value = `Error al cargar opciones: ${e.message}`;
  } finally {
    loadingSelects.value = false;
  }
}

onMounted(cargarOpciones);

const handleCreateOption = async (option, type) => {
  try {
    let rpcName = '';
    let params = {};
    let isBank = type === 'banco';

    if (isBank) {
      rpcName = 'crear_banco_al_vuelo';
      params = { p_nombre_banco: option };
    } else {
      rpcName = 'crear_entidad_al_vuelo';
      params = { p_nombre_entidad: option, p_nombre_tabla: type === 'proveedor' ? 'proveedores' : 'transportes' };
    }
    
    const { data, error } = await supabase.rpc(rpcName, params);
    if (error) throw error;
    
    const newOption = { label: option, value: data, type: isBank ? undefined : type };
    
    if (isBank) {
      opciones.value.bancos.push(newOption);
      formState.value.echeque_banco_id = newOption;
    } else {
      opciones.value.entidades.push(newOption);
      formState.value.entidad_seleccionada = newOption;
    }
  } catch (e) {
    errorMessage.value = `Error al crear nueva entidad: ${e.message}`;
  }
};

async function handleSubmit() {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    if (!formState.value.monto_total || !formState.value.descripcion_general || !formState.value.tipo_gasto_id) {
      throw new Error("Monto, descripción y tipo de gasto son obligatorios.");
    }

    const datosAdicionales = { metodo_pago: formState.value.metodo_pago };
    if (esEcheque.value) {
      datosAdicionales.echeque = {
        banco_id: formState.value.echeque_banco_id?.value,
        banco_nombre: formState.value.echeque_banco_id?.label,
        numero: formState.value.echeque_numero,
        emision: formState.value.echeque_emision,
        vencimiento: formState.value.echeque_vencimiento,
        acreditacion: formState.value.echeque_acreditacion,
      };
    }

    const payload = {
      formato_id: 3, // ID del formato por defecto para Pagos Directos
      fecha_gasto: formState.value.fecha_gasto,
      monto_total: formState.value.monto_total,
      descripcion_general: formState.value.descripcion_general,
      tipo_gasto_id: formState.value.tipo_gasto_id,
      cliente_id: formState.value.cliente_id,
      proveedor_id: formState.value.entidad_seleccionada?.type === 'proveedor' ? formState.value.entidad_seleccionada.value : null,
      transporte_id: formState.value.entidad_seleccionada?.type === 'transporte' ? formState.value.entidad_seleccionada.value : null,
      origen_gasto: 'pago_directo',
      user_id: user.id,
      creado_por_id: user.id,
      datos_adicionales: datosAdicionales,
    };

    const { data, error } = await supabase.from('gastos').insert(payload).select().single();
    if (error) throw error;

    successMessage.value = "Pago directo registrado con éxito.";
    setTimeout(() => {
      emit('pago-guardado', data);
    }, 1500);

  } catch (e) {
    errorMessage.value = `Error al guardar el pago: ${e.message}`;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <div v-if="successMessage" class="success-banner">{{ successMessage }}</div>
    <div v-if="errorMessage" class="error-banner">{{ errorMessage }}</div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label for="fecha_pago" class="form-label">Fecha del Pago <span class="text-red-500">*</span></label>
        <input type="date" id="fecha_pago" v-model="formState.fecha_gasto" required class="form-input mt-1">
      </div>
      <div>
        <label for="monto_pago" class="form-label">Monto Total <span class="text-red-500">*</span></label>
        <input type="number" step="0.01" id="monto_pago" v-model.number="formState.monto_total" required class="form-input mt-1" placeholder="0.00">
      </div>
    </div>

    <div>
      <label for="descripcion_pago" class="form-label">Descripción <span class="text-red-500">*</span></label>
      <input type="text" id="descripcion_pago" v-model="formState.descripcion_general" required class="form-input mt-1" placeholder="Ej: Pago servicio de internet mes de Julio">
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label for="tipo_gasto_pago" class="form-label">Tipo de Gasto <span class="text-red-500">*</span></label>
        <select id="tipo_gasto_pago" v-model="formState.tipo_gasto_id" required class="form-input mt-1">
          <option :value="null" disabled>-- Seleccione un tipo --</option>
          <option v-for="tipo in opciones.tipos_gasto" :key="tipo.id" :value="tipo.id">{{ tipo.nombre_tipo_gasto }}</option>
        </select>
      </div>
      <div>
        <label for="entidad_pago" class="form-label">Proveedor / Transporte</label>
        <v-select 
          id="entidad_pago"
          v-model="formState.entidad_seleccionada"
          :options="opciones.entidades"
          :loading="loadingSelects"
          taggable
          @option:created="handleCreateOption($event, 'proveedor')"
          placeholder="Buscar o crear..."
          class="mt-1 bg-white"
        ></v-select>
      </div>
    </div>
    
    <div>
      <label for="metodo_pago" class="form-label">Método de Pago</label>
      <select id="metodo_pago" v-model="formState.metodo_pago" class="form-input mt-1">
        <option value="Transferencia Banco Galicia">Transferencia Banco Galicia</option>
        <option value="Transferencia Banco Santander">Transferencia Banco Santander</option>
        <option value="Efectivo">Efectivo</option>
        <option value="E-Cheque">E-Cheque</option>
        <option value="Otro">Otro</option>
      </select>
    </div>

    <transition name="fade">
      <div v-if="esEcheque" class="p-4 border border-gray-200 rounded-lg space-y-4 bg-gray-50">
        <h3 class="font-semibold text-gray-800">Detalles del E-Cheque</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label for="echeque_banco" class="form-label">Banco</label>
            <v-select 
              id="echeque_banco"
              v-model="formState.echeque_banco_id"
              :options="opciones.bancos"
              taggable
              @option:created="handleCreateOption($event, 'banco')"
              placeholder="Buscar o crear banco..."
              class="mt-1 bg-white"
            ></v-select>
          </div>
          <div>
            <label for="echeque_numero" class="form-label">N° de E-Cheque</label>
            <input type="text" id="echeque_numero" v-model="formState.echeque_numero" class="form-input mt-1">
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div><label for="echeque_emision" class="form-label">Emisión</label><input type="date" id="echeque_emision" v-model="formState.echeque_emision" class="form-input mt-1"></div>
          <div><label for="echeque_vencimiento" class="form-label">Vencimiento</label><input type="date" id="echeque_vencimiento" v-model="formState.echeque_vencimiento" class="form-input mt-1"></div>
          <div><label for="echeque_acreditacion" class="form-label">Acreditación</label><input type="date" id="echeque_acreditacion" v-model="formState.echeque_acreditacion" class="form-input mt-1"></div>
        </div>
      </div>
    </transition>

    <div>
      <label for="cliente_pago" class="form-label">Asociar a Cliente (Opcional)</label>
      <v-select 
        id="cliente_pago"
        v-model="formState.cliente_id"
        :options="opciones.clientes"
        :reduce="option => option.value"
        :loading="loadingSelects"
        placeholder="Buscar cliente..."
        class="mt-1 bg-white"
      ></v-select>
    </div>

    <div class="pt-6 border-t flex justify-end gap-4">
      <button type="button" @click="emit('cancelar')" class="btn-secondary">Cancelar</button>
      <button type="submit" :disabled="loading" class="btn-primary">
        <span v-if="loading">Guardando...</span>
        <span v-else>Registrar Pago</span>
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.btn-primary { @apply bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:bg-indigo-400; }
.btn-secondary { @apply bg-white text-gray-700 font-semibold py-2 px-4 rounded-lg border border-gray-300 shadow-sm hover:bg-gray-50; }
.success-banner { @apply p-4 mb-4 bg-green-50 text-green-700 border border-green-200 rounded-md; }
.error-banner { @apply p-4 mb-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.fade-enter-active, .fade-leave-active { transition: all 0.3s ease-out; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-10px); }
</style>