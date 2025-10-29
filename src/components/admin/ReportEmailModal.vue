<script setup>
import { ref, watch } from 'vue';
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
  isSending: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'send']);

// --- LOCAL STATE ---
const recipients = ref('');
const subject = ref('');
const note = ref('');
const error = ref('');

// --- LOGIC ---

// Simple regex for email validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const handleSubmit = () => {
  error.value = '';
  const emailString = recipients.value.trim();

  if (!emailString) {
    error.value = 'Debe ingresar al menos un destinatario.';
    return;
  }

  // Split by comma, semicolon, space, or newline and filter out any empty strings
  const emails = emailString.split(/[\s,;]+/).filter(Boolean);
  const invalidEmails = emails.filter(email => !emailRegex.test(email));

  if (invalidEmails.length > 0) {
    error.value = `Formato de email inválido para: ${invalidEmails.join(', ')}`;
    return;
  }

  // If validation passes, emit the data to the parent component
  emit('send', {
    to: emails,
    subject: subject.value,
    note: note.value,
  });
};

const handleClose = () => {
  // Prevent closing the modal while an email is being sent
  if (props.isSending) return;
  emit('close');
};

// --- WATCHERS ---

// Watch for the modal opening to reset its internal state
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    error.value = '';
    recipients.value = '';
    // Set smart defaults for subject and note
    subject.value = `Reporte Operativo - InfoGastos [${new Date().toLocaleDateString()}]`;
    note.value = 'Adjunto se encuentra el reporte operativo generado desde el sistema InfoGastos.';
  }
});
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
        <div class="fixed inset-0 bg-black bg-opacity-60" />
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
            <DialogPanel class="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
              <DialogTitle as="h3" class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                Enviar Reporte por Correo
              </DialogTitle>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Ingresa los destinatarios y personaliza el asunto o la nota. El PDF del reporte se adjuntará automáticamente.
                </p>
              </div>

              <form @submit.prevent="handleSubmit" class="mt-4 space-y-4">
                <div>
                  <label for="recipients" class="form-label">Destinatarios</label>
                  <input
                    id="recipients"
                    type="text"
                    v-model="recipients"
                    :disabled="isSending"
                    class="form-input"
                    placeholder="ejemplo@dominio.com, otro@dominio.com"
                  />
                  <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">Separa múltiples correos con comas, espacios o punto y coma.</p>
                </div>

                <div>
                  <label for="subject" class="form-label">Asunto</label>
                  <input
                    id="subject"
                    type="text"
                    v-model="subject"
                    :disabled="isSending"
                    class="form-input"
                  />
                </div>

                <div>
                  <label for="note" class="form-label">Nota Adicional (Opcional)</label>
                  <textarea
                    id="note"
                    rows="4"
                    v-model="note"
                    :disabled="isSending"
                    class="form-input"
                  ></textarea>
                </div>

                <div v-if="error" class="mt-2 text-sm text-red-600 dark:text-red-400">
                  {{ error }}
                </div>

                <div class="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    @click="handleClose"
                    :disabled="isSending"
                    class="btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    :disabled="isSending"
                    class="btn-primary flex items-center justify-center w-28"
                  >
                    <svg v-if="isSending" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <span v-if="isSending">Enviando...</span>
                    <span v-else>Enviar</span>
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

<style scoped>
/* Reutilizamos los estilos definidos en AdminReportGenerator para consistencia */
.btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed; }
.btn-secondary { @apply bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed; }
.form-label { @apply block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition disabled:bg-gray-100 dark:disabled:bg-gray-700/50; }
</style>