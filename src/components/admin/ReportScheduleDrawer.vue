<script setup>
import { ref, reactive, watch, computed } from 'vue';
import {
  TransitionRoot,
  TransitionChild,
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/vue';

// --- PROPS & EMITS ---
const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  isSaving: {
    type: Boolean,
    default: false,
  },
  // Puede recibir una configuración existente para editarla
  existingConfig: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['close', 'save', 'test-send']);

// --- LOCAL STATE ---
const schedule = reactive({
  id: null,
  isActive: true,
  frequency: 'weekly', // 'weekly' or 'monthly'
  dayOfWeek: 1, // 1 for Monday, 7 for Sunday
  dayOfMonth: 1, // 1-31
  time: '09:00',
  recipients: '',
  subject: '',
});

const error = ref('');

// --- COMPUTED ---
const isFormValid = computed(() => {
  const recipientsValid = schedule.recipients.trim() !== '';
  const subjectValid = schedule.subject.trim() !== '';
  return recipientsValid && subjectValid;
});

// --- LOGIC ---
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateAndGetData = () => {
  error.value = '';
  const emailString = schedule.recipients.trim();

  if (!emailString) {
    error.value = 'Debe ingresar al menos un destinatario.';
    return null;
  }
  if (!schedule.subject.trim()) {
    error.value = 'El asunto no puede estar vacío.';
    return null;
  }

  const emails = emailString.split(/[\s,;]+/).filter(Boolean);
  const invalidEmails = emails.filter(email => !emailRegex.test(email));

  if (invalidEmails.length > 0) {
    error.value = `Formato de email inválido para: ${invalidEmails.join(', ')}`;
    return null;
  }

  // Return a clean copy of the schedule data
  return {
    ...schedule,
    recipients: emails, // Return as an array of strings
  };
};

const handleSave = () => {
  const scheduleData = validateAndGetData();
  if (scheduleData) {
    emit('save', scheduleData);
  }
};

const handleTestSend = () => {
  const scheduleData = validateAndGetData();
  if (scheduleData) {
    // We can emit a separate event for testing if needed, or just use the save event
    // For simplicity, we'll just log it and assume the parent handles it.
    console.log("Triggering a test send with config:", scheduleData);
    alert("Simulando 'Enviar ahora'... Revisa la consola.");
    // In a real scenario, you might emit a specific event:
    // emit('test-send', scheduleData);
  }
};

const handleClose = () => {
  if (props.isSaving) return;
  emit('close');
};

// --- WATCHERS ---
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    error.value = '';
    // If an existing config is passed, populate the form with it
    if (props.existingConfig) {
      schedule.id = props.existingConfig.id;
      schedule.isActive = props.existingConfig.isActive ?? true;
      schedule.frequency = props.existingConfig.frequency || 'weekly';
      schedule.dayOfWeek = props.existingConfig.dayOfWeek || 1;
      schedule.dayOfMonth = props.existingConfig.dayOfMonth || 1;
      schedule.time = props.existingConfig.time || '09:00';
      // Join array back to string for the textarea
      schedule.recipients = Array.isArray(props.existingConfig.recipients) ? props.existingConfig.recipients.join(', ') : '';
      schedule.subject = props.existingConfig.subject || `Reporte Automático - InfoGastos`;
    } else {
      // Reset to defaults for a new schedule
      schedule.id = null;
      schedule.isActive = true;
      schedule.frequency = 'weekly';
      schedule.dayOfWeek = 1;
      schedule.dayOfMonth = 1;
      schedule.time = '09:00';
      schedule.recipients = '';
      schedule.subject = `Reporte Automático Semanal - InfoGastos`;
    }
  }
});

// Adjust subject placeholder when frequency changes
watch(() => schedule.frequency, (newFreq) => {
  if (newFreq === 'weekly') {
    schedule.subject = `Reporte Automático Semanal - InfoGastos`;
  } else {
    schedule.subject = `Reporte Automático Mensual - InfoGastos`;
  }
});
</script>
<template>
  <TransitionRoot appear :show="isOpen" as="template">
    <Dialog as="div" @close="handleClose" class="relative z-40">
      <!-- Overlay -->
      <TransitionChild
        as="template"
        enter="ease-in-out duration-500"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="ease-in-out duration-500"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-hidden">
        <div class="absolute inset-0 overflow-hidden">
          <div class="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <!-- Drawer Panel -->
            <TransitionChild
              as="template"
              enter="transform transition ease-in-out duration-500 sm:duration-700"
              enter-from="translate-x-full"
              enter-to="translate-x-0"
              leave="transform transition ease-in-out duration-500 sm:duration-700"
              leave-from="translate-x-0"
              leave-to="translate-x-full"
            >
              <DialogPanel class="pointer-events-auto w-screen max-w-md">
                <div class="flex h-full flex-col overflow-y-scroll bg-white dark:bg-gray-800 shadow-xl">
                  <div class="flex-1 overflow-y-auto py-6 px-4 sm:px-6">
                    <!-- Header -->
                    <div class="flex items-start justify-between">
                      <DialogTitle class="text-lg font-medium text-gray-900 dark:text-white">
                        Programar Envío Automático
                      </DialogTitle>
                      <div class="ml-3 flex h-7 items-center">
                        <button
                          type="button"
                          class="-m-2 p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                          @click="handleClose"
                        >
                          <span class="sr-only">Cerrar panel</span>
                          <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Configura el envío recurrente del reporte con los filtros actualmente seleccionados.
                    </p>

                    <!-- Form -->
                    <div class="mt-8 space-y-6">
                      <!-- Estado -->
                      <div class="flex items-center justify-between">
                        <span class="form-label mb-0">Estado de la Programación</span>
                        <label for="isActiveToggle" class="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" v-model="schedule.isActive" id="isActiveToggle" class="sr-only peer">
                          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                          <span class="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{{ schedule.isActive ? 'Activa' : 'Inactiva' }}</span>
                        </label>
                      </div>

                      <!-- Frecuencia -->
                      <div>
                        <label class="form-label">Frecuencia</label>
                        <div class="flex gap-4">
                          <label class="flex items-center">
                            <input type="radio" v-model="schedule.frequency" value="weekly" class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Semanal</span>
                          </label>
                          <label class="flex items-center">
                            <input type="radio" v-model="schedule.frequency" value="monthly" class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Mensual</span>
                          </label>
                        </div>
                      </div>

                      <!-- Día y Hora -->
                      <div class="grid grid-cols-2 gap-4">
                        <div v-if="schedule.frequency === 'weekly'">
                          <label for="dayOfWeek" class="form-label">Día de la Semana</label>
                          <select id="dayOfWeek" v-model="schedule.dayOfWeek" class="form-input">
                            <option :value="1">Lunes</option>
                            <option :value="2">Martes</option>
                            <option :value="3">Miércoles</option>
                            <option :value="4">Jueves</option>
                            <option :value="5">Viernes</option>
                            <option :value="6">Sábado</option>
                            <option :value="7">Domingo</option>
                          </select>
                        </div>
                        <div v-if="schedule.frequency === 'monthly'">
                          <label for="dayOfMonth" class="form-label">Día del Mes</label>
                          <select id="dayOfMonth" v-model="schedule.dayOfMonth" class="form-input">
                            <option v-for="day in 31" :key="day" :value="day">{{ day }}</option>
                          </select>
                        </div>
                        <div>
                          <label for="time" class="form-label">Hora de Envío</label>
                          <input type="time" id="time" v-model="schedule.time" class="form-input">
                        </div>
                      </div>

                      <!-- Destinatarios -->
                      <div>
                        <label for="schedule-recipients" class="form-label">Destinatarios</label>
                        <textarea id="schedule-recipients" rows="3" v-model="schedule.recipients" class="form-input" placeholder="ejemplo@dominio.com, otro@dominio.com"></textarea>
                      </div>

                      <!-- Asunto -->
                      <div>
                        <label for="schedule-subject" class="form-label">Asunto del Correo</label>
                        <input type="text" id="schedule-subject" v-model="schedule.subject" class="form-input">
                      </div>

                      <div v-if="error" class="text-sm text-red-600 dark:text-red-400">
                        {{ error }}
                      </div>
                    </div>
                  </div>

                  <!-- Footer con Acciones -->
                  <div class="border-t border-gray-200 dark:border-gray-700 py-4 px-4 sm:px-6">
                    <div class="flex justify-between gap-4">
                      <button type="button" @click="handleTestSend" class="btn-secondary flex-1">
                        Probar (Enviar Ahora)
                      </button>
                      <button
                        type="button"
                        @click="handleSave"
                        :disabled="isSaving || !isFormValid"
                        class="btn-primary flex-1 flex items-center justify-center"
                      >
                        <svg v-if="isSaving" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        {{ isSaving ? 'Guardando...' : 'Guardar Programación' }}
                      </button>
                    </div>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<style scoped>
/* Reutilizamos los estilos definidos en AdminReportGenerator para consistencia */
.btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed; }
.btn-secondary { @apply bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed; }
.form-label { @apply block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition; }
</style>