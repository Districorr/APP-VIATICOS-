<script setup>
import { ref, computed, watch } from 'vue';
import {
  TransitionRoot,
  TransitionChild,
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/vue';
import { BanknotesIcon, PlusCircleIcon, XMarkIcon } from '@heroicons/vue/24/solid';
import { useViajes } from '../composables/useViajes.js';

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  rendicion: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['close', 'fondos-agregados']);

const { agregarFondosARendicion, loadingFondos } = useViajes();

const montoAdicional = ref('');
const observacion = ref('');
const errorMessage = ref('');

const montoActual = computed(() => {
  if (!props.rendicion) return 0;
  return parseFloat(props.rendicion.monto_adelanto) || 0;
});

const parseMontoNumerico = (val) => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let cleanStr = String(val).trim().replace(/\s/g, '');
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
  } else if (cleanStr.includes(',')) {
    cleanStr = cleanStr.replace(',', '.');
  }
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
};

const montoAdicionalNumerico = computed(() => {
  return parseMontoNumerico(montoAdicional.value);
});

const nuevoMontoTotal = computed(() => {
  return montoActual.value + montoAdicionalNumerico.value;
});

const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

const setPresetMonto = (preset) => {
  const current = montoAdicionalNumerico.value;
  montoAdicional.value = String(current + preset);
};

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    montoAdicional.value = '';
    observacion.value = '';
    errorMessage.value = '';
  }
});

const handleClose = () => {
  if (loadingFondos.value) return;
  emit('close');
};

const handleSubmit = async () => {
  errorMessage.value = '';
  const numMonto = montoAdicionalNumerico.value;

  if (isNaN(numMonto) || numMonto <= 0) {
    errorMessage.value = 'Ingrese un monto adicional válido mayor a 0.';
    return;
  }

  if (!props.rendicion || !props.rendicion.id) {
    errorMessage.value = 'No se ha seleccionado ninguna rendición.';
    return;
  }

  try {
    const res = await agregarFondosARendicion(props.rendicion.id, numMonto, observacion.value);
    emit('fondos-agregados', {
      viajeId: props.rendicion.id,
      nuevoMonto: res.monto_adelanto,
      montoAdicional: numMonto,
    });
    emit('close');
  } catch (err) {
    errorMessage.value = err.message || 'Error al agregar fondos a la rendición.';
  }
};
</script>

<template>
  <TransitionRoot appear :show="isOpen" as="template">
    <Dialog as="div" @close="handleClose" class="relative z-50">
      <TransitionChild
        as="template"
        enter="duration-300 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-200 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 text-center">
          <TransitionChild
            as="template"
            enter="duration-300 ease-out"
            enter-from="opacity-0 scale-95"
            enter-to="opacity-100 scale-100"
            leave="duration-200 ease-in"
            leave-from="opacity-100 scale-100"
            leave-to="opacity-0 scale-95"
          >
            <DialogPanel class="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-2xl transition-all border border-slate-100">
              <!-- Header -->
              <div class="flex items-start justify-between border-b border-slate-100 pb-4 mb-5">
                <div class="flex items-center gap-3">
                  <div class="p-3 bg-emerald-50 text-emerald-600 rounded-2xl ring-1 ring-emerald-500/20 shadow-2xs">
                    <BanknotesIcon class="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle as="h3" class="text-lg font-bold text-slate-900 leading-tight">
                      Agregar Fondos a Rendición
                    </DialogTitle>
                    <p class="text-xs text-slate-500 font-medium mt-0.5" v-if="rendicion">
                      #{{ rendicion.codigo_rendicion || rendicion.id }} — {{ rendicion.nombre_viaje }}
                    </p>
                  </div>
                </div>
                <button
                  @click="handleClose"
                  class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <XMarkIcon class="w-5 h-5" />
                </button>
              </div>

              <!-- Form Body -->
              <form @submit.prevent="handleSubmit" class="space-y-5">
                <!-- Panel Resumen Financiero con Alta Distinción -->
                <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                  <div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80 pb-2">
                    <span>Resumen de Saldo</span>
                    <span class="text-emerald-700 font-semibold lowercase text-[11px] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">Moneda: ARS</span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                    <!-- Tarjeta Adelanto Actual -->
                    <div class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div>
                        <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Adelanto Actual</span>
                        <p class="text-lg font-black text-slate-900 mt-1">{{ formatCurrency(montoActual) }}</p>
                      </div>
                      <span class="text-[10px] text-slate-400 font-medium mt-1">Saldo base registrado</span>
                    </div>

                    <!-- Tarjeta Nuevo Total -->
                    <div class="flex flex-col justify-between rounded-xl border p-3.5 transition-all"
                         :class="montoAdicionalNumerico > 0
                           ? 'border-emerald-500 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-600/20'
                           : 'border-slate-200 bg-slate-100 text-slate-400'">
                      <div>
                        <span class="block text-[11px] font-bold uppercase tracking-wider"
                              :class="montoAdicionalNumerico > 0 ? 'text-emerald-100' : 'text-slate-500'">
                          Nuevo Total
                        </span>
                        <p class="text-xl font-black mt-1" :class="montoAdicionalNumerico > 0 ? 'text-white' : 'text-slate-500'">
                          {{ formatCurrency(nuevoMontoTotal) }}
                        </p>
                      </div>
                      <div class="flex items-center justify-between text-[11px] font-semibold mt-1"
                           :class="montoAdicionalNumerico > 0 ? 'text-emerald-100' : 'text-slate-400'">
                        <span>+ {{ formatCurrency(montoAdicionalNumerico) }}</span>
                        <span v-if="montoAdicionalNumerico > 0" class="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-bold">
                          Actualizado
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Input Monto Adicional -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label for="monto-adicional" class="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Monto Adicional a Recargar <span class="text-red-500">*</span>
                    </label>
                    <span class="text-[11px] text-slate-400 font-medium">Soporta coma o punto</span>
                  </div>

                  <div class="flex rounded-xl border border-slate-300 shadow-2xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 overflow-hidden bg-white transition-all">
                    <span class="inline-flex items-center px-4 bg-slate-100/80 border-r border-slate-200 text-slate-600 font-extrabold text-base select-none shrink-0">
                      $
                    </span>
                    <input
                      type="text"
                      inputmode="decimal"
                      id="monto-adicional"
                      v-model="montoAdicional"
                      placeholder="0,00"
                      required
                      class="block w-full border-0 px-4 py-2.5 text-slate-900 text-base font-extrabold focus:ring-0 focus:outline-none placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>

                  <!-- Chips de acceso rápido -->
                  <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span class="text-[11px] text-slate-400 font-medium mr-1">Sumar rápido:</span>
                    <button
                      type="button"
                      @click="setPresetMonto(1000)"
                      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer"
                    >
                      +$ 1.000
                    </button>
                    <button
                      type="button"
                      @click="setPresetMonto(5000)"
                      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer"
                    >
                      +$ 5.000
                    </button>
                    <button
                      type="button"
                      @click="setPresetMonto(10000)"
                      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer"
                    >
                      +$ 10.000
                    </button>
                    <button
                      type="button"
                      @click="setPresetMonto(20000)"
                      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer"
                    >
                      +$ 20.000
                    </button>
                  </div>
                </div>

                <!-- Input Observación Opcional -->
                <div>
                  <label for="observacion-fondos" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Motivo / Observación <span class="text-slate-400 font-normal lowercase">(opcional)</span>
                  </label>
                  <textarea
                    id="observacion-fondos"
                    v-model="observacion"
                    rows="2"
                    placeholder="Ej.: Adicional para cubrir mayores costos de combustible, peajes o días extra de comisión..."
                    class="block w-full rounded-xl border border-slate-300 p-3 text-slate-900 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                  ></textarea>
                </div>

                <!-- Mensaje de Error -->
                <div v-if="errorMessage" class="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
                  <svg class="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  </svg>
                  <span>{{ errorMessage }}</span>
                </div>

                <!-- Actions -->
                <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    @click="handleClose"
                    :disabled="loadingFondos"
                    class="px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    :disabled="loadingFondos || montoAdicionalNumerico <= 0"
                    class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    <svg v-if="loadingFondos" class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <PlusCircleIcon v-else class="w-4 h-4" />
                    Confirmar Fondos
                  </button>
                </div>
              </form>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
