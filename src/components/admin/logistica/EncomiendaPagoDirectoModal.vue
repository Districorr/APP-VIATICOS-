<script setup>
import { ref, computed, watch, reactive } from 'vue';
import { supabase } from '../../../supabaseClient.js';
import { formatCurrency, formatDate } from '../../../utils/formatters.js';
import { normalizeProveedor } from '../../../utils/logisticaHelpers.js';
import {
  XMarkIcon,
  BanknotesIcon,
  CreditCardIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon,
  InformationCircleIcon
} from '@heroicons/vue/24/outline';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  gasto: { type: Object, default: null }
});

const emit = defineEmits(['update:modelValue', 'saved', 'show-notification']);

const defaultDate = () => new Date().toISOString().split('T')[0];

const loading = ref(false);
const loadingBancos = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const bancosOptions = ref([]);

const metodosPago = [
  'Transferencia Banco Galicia',
  'Transferencia Banco Santander',
  'Efectivo',
  'E-Cheque',
  'Otro'
];

const formState = reactive({
  monto_total: '',
  fecha_pago: defaultDate(),
  metodo_pago: 'Transferencia Banco Galicia',
  referencia_pago: '',
  observacion_pago: '',
  // Datos E-Cheque
  echeque_banco: null,
  echeque_numero: '',
  echeque_emision: '',
  echeque_vencimiento: '',
  echeque_acreditacion: ''
});

const esEcheque = computed(() => formState.metodo_pago === 'E-Cheque');
const esPagoDirectoActual = computed(() => props.gasto?.origen_gasto === 'pago_directo');

async function cargarBancos() {
  loadingBancos.value = true;
  try {
    const { data, error } = await supabase
      .from('bancos')
      .select('id, nombre, color_hex')
      .order('nombre');

    if (error) throw error;
    bancosOptions.value = (data || []).map(b => ({ label: b.nombre, value: b.id, color: b.color_hex }));
  } catch (e) {
    console.error('Error cargando bancos:', e);
  } finally {
    loadingBancos.value = false;
  }
}

const handleCreateBanco = async (label) => {
  const nombre = (label || '').trim();
  if (!nombre) return;
  try {
    const { data, error } = await supabase.rpc('crear_banco_al_vuelo', { p_nombre_banco: nombre });
    if (error) throw error;

    const newOpt = { label: nombre, value: data };
    bancosOptions.value.push(newOpt);
    formState.echeque_banco = newOpt;
  } catch (e) {
    errorMessage.value = `Error al crear nuevo banco: ${e.message}`;
  }
};

function initFormData() {
  errorMessage.value = '';
  successMessage.value = '';

  if (!props.gasto) return;

  const extra = props.gasto.datos_adicionales || {};

  formState.monto_total = props.gasto.monto_total !== undefined && props.gasto.monto_total !== null
    ? Number(props.gasto.monto_total)
    : '';

  formState.fecha_pago = extra.fecha_pago_directo || (props.gasto.fecha_gasto ? String(props.gasto.fecha_gasto).slice(0, 10) : defaultDate());
  formState.metodo_pago = extra.metodo_pago || 'Transferencia Banco Galicia';
  formState.referencia_pago = extra.referencia_pago || extra.comprobante_pago || extra.numero_transferencia || '';
  formState.observacion_pago = extra.observacion_pago || '';

  if (extra.echeque) {
    const ech = extra.echeque;
    formState.echeque_banco = ech.banco_id ? { label: ech.banco_nombre || 'Banco', value: ech.banco_id } : null;
    formState.echeque_numero = ech.numero || '';
    formState.echeque_emision = ech.emision || '';
    formState.echeque_vencimiento = ech.vencimiento || '';
    formState.echeque_acreditacion = ech.acreditacion || '';
  } else {
    formState.echeque_banco = null;
    formState.echeque_numero = '';
    formState.echeque_emision = '';
    formState.echeque_vencimiento = '';
    formState.echeque_acreditacion = '';
  }
}

function closeModal() {
  if (loading.value) return;
  emit('update:modelValue', false);
}

async function handleGuardarPago() {
  errorMessage.value = '';
  successMessage.value = '';

  const monto = Number(formState.monto_total);
  if (!Number.isFinite(monto) || monto <= 0) {
    errorMessage.value = 'El monto del pago debe ser mayor a 0.';
    return;
  }

  if (!formState.fecha_pago) {
    errorMessage.value = 'La fecha de pago es obligatoria.';
    return;
  }

  if (esEcheque.value) {
    if (!formState.echeque_numero?.trim()) {
      errorMessage.value = 'Para E-Cheque es obligatorio ingresar el número de cheque.';
      return;
    }
  }

  loading.value = true;
  try {
    const extraAnterior = props.gasto.datos_adicionales || {};

    const datosAdicionalesActualizados = {
      ...extraAnterior,
      modulo: extraAnterior.modulo || 'logistica',
      metodo_pago: formState.metodo_pago,
      fecha_pago_directo: formState.fecha_pago,
      referencia_pago: formState.referencia_pago?.trim() || null,
      observacion_pago: formState.observacion_pago?.trim() || null,
    };

    if (esEcheque.value) {
      datosAdicionalesActualizados.echeque = {
        banco_id: formState.echeque_banco?.value || null,
        banco_nombre: formState.echeque_banco?.label || null,
        numero: formState.echeque_numero?.trim() || null,
        emision: formState.echeque_emision || null,
        vencimiento: formState.echeque_vencimiento || null,
        acreditacion: formState.echeque_acreditacion || null,
      };
    } else {
      delete datosAdicionalesActualizados.echeque;
    }

    const { data, error } = await supabase
      .from('gastos')
      .update({
        origen_gasto: 'pago_directo',
        monto_total: monto,
        datos_adicionales: datosAdicionalesActualizados
      })
      .eq('id', props.gasto.id)
      .select()
      .single();

    if (error) throw error;

    successMessage.value = 'Pago directo registrado con éxito.';
    emit('saved', data);
    emit('show-notification', 'Pago Directo Registrado', `Se registró el pago de ${formatCurrency(monto)} vía ${formState.metodo_pago}.`, 'success');

    setTimeout(() => {
      closeModal();
    }, 600);
  } catch (e) {
    console.error('Error al registrar pago directo:', e);
    errorMessage.value = `Error al procesar el pago: ${e.message || 'Error desconocido'}`;
  } finally {
    loading.value = false;
  }
}

async function handleRevertirACtaCte() {
  if (!window.confirm('¿Estás seguro de revertir este movimiento a Cuenta Corriente Empresa (Pendiente de pago)?')) {
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  try {
    const extraAnterior = props.gasto.datos_adicionales || {};
    const extraActualizado = { ...extraAnterior };
    delete extraActualizado.metodo_pago;
    delete extraActualizado.fecha_pago_directo;
    delete extraActualizado.referencia_pago;
    delete extraActualizado.observacion_pago;
    delete extraActualizado.echeque;

    const { data, error } = await supabase
      .from('gastos')
      .update({
        origen_gasto: 'cuenta_corriente_empresa',
        datos_adicionales: extraActualizado
      })
      .eq('id', props.gasto.id)
      .select()
      .single();

    if (error) throw error;

    emit('saved', data);
    emit('show-notification', 'Pago Revertido', 'El movimiento volvió a figurar en Cuenta Corriente Empresa.', 'info');
    closeModal();
  } catch (e) {
    console.error('Error al revertir pago:', e);
    errorMessage.value = `No se pudo revertir: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

watch(() => props.modelValue, async (isOpen) => {
  if (isOpen) {
    initFormData();
    await cargarBancos();
  }
});
</script>

<template>
  <Transition name="modal-fade">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6 overflow-y-auto"
      @click="closeModal"
    >
      <div
        class="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all my-auto"
        @click.stop
      >
        <!-- Encabezado Modal -->
        <div class="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-5 text-white">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner">
              <BanknotesIcon class="h-6 w-6" />
            </div>
            <div>
              <h3 class="text-lg font-bold">
                {{ esPagoDirectoActual ? 'Editar Pago Directo de Encomienda' : 'Registrar Pago Directo' }}
              </h3>
              <p class="text-xs text-emerald-100">
                Imputación de pago directo para liquidar o asentar fletes y encomiendas.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            @click="closeModal"
          >
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <!-- Cuerpo del Modal -->
        <div class="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5">
          <!-- Tarjeta de Resumen de la Encomienda -->
          <div v-if="gasto" class="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <div class="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Transporte</span>
                <span class="font-extrabold text-slate-900 text-sm">
                  {{ normalizeProveedor(gasto.transportes?.nombre || gasto.proveedores?.nombre || 'Sin Transporte') }}
                </span>
              </div>
              <span class="text-xs font-semibold text-slate-600">
                📅 {{ formatDate(gasto.fecha_gasto) }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div>
                <span class="text-[11px] font-semibold text-slate-500 block">Cliente / Referente:</span>
                <span class="font-bold text-slate-800">
                  {{ gasto.clientes?.nombre_cliente || gasto.paciente_referido || '—' }}
                </span>
              </div>

              <div>
                <span class="text-[11px] font-semibold text-slate-500 block">N° Guía / Factura:</span>
                <span class="font-mono font-semibold text-slate-800">
                  {{ gasto.numero_factura || gasto.datos_adicionales?.numero_guia || '—' }}
                </span>
              </div>

              <div>
                <span class="text-[11px] font-semibold text-slate-500 block">Bultos / Movimiento:</span>
                <span class="font-bold text-indigo-700">
                  {{ gasto.datos_adicionales?.cantidad_bultos ?? 1 }} bulto(s) · {{ gasto.datos_adicionales?.tipo_movimiento_encomienda || 'Envío' }}
                </span>
              </div>

              <div class="col-span-2 sm:col-span-3">
                <span class="text-[11px] font-semibold text-slate-500 block">Destino:</span>
                <span class="text-slate-700">
                  {{ gasto.datos_adicionales?.destino_texto || gasto.localidad_destino?.nombre || gasto.provincias?.nombre || 'Sin destino especificado' }}
                </span>
              </div>
            </div>

            <!-- Estado de Imputación Actual -->
            <div class="flex items-center justify-between pt-2 border-t border-slate-200/70 text-xs">
              <span class="text-slate-500">Estado de imputación actual:</span>
              <span
                v-if="esPagoDirectoActual"
                class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800"
              >
                <CheckCircleIcon class="h-3.5 w-3.5" /> Pago Directo
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800"
              >
                <ExclamationCircleIcon class="h-3.5 w-3.5" /> Cuenta Corriente Empresa (Pendiente)
              </span>
            </div>
          </div>

          <!-- Mensajes de Alerta / Éxito -->
          <div v-if="errorMessage" class="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700 flex items-start gap-2">
            <ExclamationCircleIcon class="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
            <span>{{ errorMessage }}</span>
          </div>

          <div v-if="successMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-700 flex items-start gap-2">
            <CheckCircleIcon class="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            <span>{{ successMessage }}</span>
          </div>

          <!-- Formulario de Pago -->
          <form class="space-y-4" @submit.prevent="handleGuardarPago">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <!-- Importe Total a Pagar -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">
                  Monto Total a Pagar ($) <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-bold">$</span>
                  <input
                    v-model.number="formState.monto_total"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    class="w-full rounded-xl border border-slate-300 py-2.5 pl-8 pr-3 text-sm font-bold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>

              <!-- Fecha de Pago -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">
                  Fecha de Pago <span class="text-rose-500">*</span>
                </label>
                <input
                  v-model="formState.fecha_pago"
                  type="date"
                  required
                  class="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>

            <!-- Método de Pago -->
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">
                Método de Pago <span class="text-rose-500">*</span>
              </label>
              <select
                v-model="formState.metodo_pago"
                class="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              >
                <option v-for="m in metodosPago" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>

            <!-- Referencia / Comprobante de Transferencia (Si no es echeque) -->
            <div v-if="!esEcheque">
              <label class="block text-xs font-bold text-slate-700 mb-1">
                N° de Comprobante / Referencia Bancaria (Opcional)
              </label>
              <input
                v-model="formState.referencia_pago"
                type="text"
                placeholder="Ej: Transf. 984723 / Ref. Banco"
                class="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <!-- Sección Especial: Datos E-Cheque -->
            <div v-if="esEcheque" class="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <div class="flex items-center gap-2 text-amber-800 font-bold text-xs pb-1 border-b border-amber-200">
                <BuildingLibraryIcon class="h-4 w-4" />
                <span>Detalle de E-Cheque</span>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">Banco Emisor</label>
                  <v-select
                    v-model="formState.echeque_banco"
                    :options="bancosOptions"
                    taggable
                    placeholder="Seleccionar o escribir banco..."
                    :loading="loadingBancos"
                    @option:created="handleCreateBanco"
                    class="v-select-custom text-xs"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">
                    N° E-Cheque <span class="text-rose-500">*</span>
                  </label>
                  <input
                    v-model="formState.echeque_numero"
                    type="text"
                    required
                    placeholder="Ej: 00048291"
                    class="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">Fecha Emisión</label>
                  <input
                    v-model="formState.echeque_emision"
                    type="date"
                    class="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">Fecha Vencimiento</label>
                  <input
                    v-model="formState.echeque_vencimiento"
                    type="date"
                    class="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>
            </div>

            <!-- Observación Adicional -->
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Observación / Nota de Pago</label>
              <textarea
                v-model="formState.observacion_pago"
                rows="2"
                placeholder="Detalle complementario o número de recibo..."
                class="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              ></textarea>
            </div>
          </form>
        </div>

        <!-- Pie del Modal -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <button
              v-if="esPagoDirectoActual"
              type="button"
              :disabled="loading"
              class="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
              @click="handleRevertirACtaCte"
            >
              <ArrowPathIcon class="h-4 w-4 text-amber-600" />
              Revertir a Cta. Cte.
            </button>
          </div>

          <div class="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer shadow-xs transition-colors"
              :disabled="loading"
              @click="closeModal"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer shadow-md transition-all disabled:opacity-50"
              :disabled="loading"
              @click="handleGuardarPago"
            >
              <ShieldCheckIcon v-if="!loading" class="h-4 w-4" />
              <ArrowPathIcon v-else class="h-4 w-4 animate-spin" />
              {{ loading ? 'Guardando...' : (esPagoDirectoActual ? 'Actualizar Pago' : 'Confirmar Pago Directo') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
