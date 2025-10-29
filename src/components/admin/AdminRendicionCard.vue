<!-- src/components/admin/AdminRendicionCard.vue -->
<script setup>
import { computed } from 'vue';
import { formatDate, formatCurrency } from '../../utils/formatters.js';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import { 
  CheckCircleIcon, ClockIcon, XCircleIcon, PencilIcon, TrashIcon, EyeIcon, EllipsisVerticalIcon 
} from '@heroicons/vue/24/solid';

const props = defineProps({
  rendicion: { type: Object, required: true }
});

const emit = defineEmits(['revisar', 'ver-gastos', 'editar', 'eliminar']);

const cardClasses = computed(() => {
  const estado = props.rendicion.estado_aprobacion;
  if (estado === 'pendiente_aprobacion') return 'border-yellow-500';
  if (estado === 'aprobado') return 'border-green-500';
  if (estado === 'rechazado') return 'border-red-500';
  return 'border-blue-500';
});

const estadoPill = computed(() => {
    const estado = props.rendicion.estado_aprobacion;
    const commonClasses = 'px-2 py-0.5 text-xs font-semibold rounded-full inline-flex items-center gap-1.5';
    const states = {
        aprobado: { text: 'Aprobado', class: 'bg-green-100 text-green-800', icon: CheckCircleIcon },
        rechazado: { text: 'Rechazado', class: 'bg-red-100 text-red-800', icon: XCircleIcon },
        pendiente_aprobacion: { text: 'Pendiente', class: 'bg-yellow-100 text-yellow-800 animate-pulse', icon: ClockIcon },
        en_curso: { text: 'En Curso', class: 'bg-blue-100 text-blue-800', icon: PencilIcon },
    };
    const result = states[estado] || { text: 'Desconocido', class: 'bg-gray-100 text-gray-800', icon: null };
    return { ...result, class: `${commonClasses} ${result.class}` };
});

const formattedCierreDate = computed(() => {
    if (!props.rendicion.cerrado_en) return '';
    const date = new Date(props.rendicion.cerrado_en);
    const datePart = formatDate(date, { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart} - ${timePart}`;
});
</script>

<template>
  <div class="bg-white rounded-lg shadow-md border-l-4 flex flex-col transition-all duration-300 ease-in-out hover:shadow-xl hover:scale-[1.02]" :class="cardClasses">
    <!-- Contenido Principal -->
    <div class="p-4 flex-grow">
      <div class="flex justify-between items-start mb-2">
        <div class="pr-4">
            <h3 class="text-base font-bold text-gray-800 leading-tight">#{{ rendicion.codigo_rendicion }} - {{ rendicion.nombre_viaje }}</h3>
            <p class="text-sm font-medium text-gray-600 mt-1">Resp: {{ rendicion.responsable_nombre }}</p>
        </div>
        <span :class="estadoPill.class">
            <component v-if="estadoPill.icon" :is="estadoPill.icon" class="h-4 w-4" />
            {{ estadoPill.text }}
        </span>
      </div>

      <div class="mt-3 text-xs font-semibold" :class="rendicion.cerrado_en ? 'text-red-600' : 'text-green-600'">
        {{ rendicion.cerrado_en ? `CERRADO EL ${formattedCierreDate.toUpperCase()}` : 'EN CURSO' }}
      </div>
      
      <div class="mt-3 pt-3 border-t border-gray-200 grid grid-cols-3 gap-2 text-center">
        <div><p class="text-xs text-gray-500">Adelanto</p><p class="font-semibold text-gray-700">{{ formatCurrency(rendicion.monto_adelanto) }}</p></div>
        <div><p class="text-xs text-gray-500">Gastos</p><p class="font-semibold text-gray-700">{{ formatCurrency(rendicion.total_gastado) }}</p></div>
        <div><p class="text-xs text-gray-500">Saldo</p><p class="font-bold text-lg" :class="rendicion.saldo >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatCurrency(rendicion.saldo) }}</p></div>
      </div>
    </div>
    
    <!-- Pie de Tarjeta con Menú Contextual -->
    <div class="bg-gray-50 px-4 py-2 flex justify-between items-center rounded-b-lg">
      <div v-if="rendicion.comentarios_aprobacion" class="text-xs text-gray-500 italic truncate pr-2" :title="rendicion.comentarios_aprobacion">
        "{{ rendicion.comentarios_aprobacion }}"
      </div>
      <div v-else></div>

      <Menu as="div" class="relative inline-block text-left">
        <MenuButton class="btn-icon">
          <EllipsisVerticalIcon class="h-5 w-5 text-gray-600" aria-hidden="true" />
        </MenuButton>
        <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
          <MenuItems class="absolute right-0 bottom-full mb-2 w-48 origin-bottom-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
            <div class="px-1 py-1">
              <MenuItem v-if="rendicion.estado_aprobacion === 'pendiente_aprobacion'" v-slot="{ active }">
                <button @click="$emit('revisar', rendicion)" class="menu-item" :class="{ 'bg-indigo-500 text-white': active, 'text-gray-900': !active }">
                  <CheckCircleIcon class="mr-2 h-5 w-5" /> Revisar
                </button>
              </MenuItem>
              <MenuItem v-slot="{ active }">
                <button @click="$emit('ver-gastos', rendicion.id)" class="menu-item" :class="{ 'bg-indigo-500 text-white': active, 'text-gray-900': !active }">
                  <EyeIcon class="mr-2 h-5 w-5" /> Ver Gastos
                </button>
              </MenuItem>
              <MenuItem v-slot="{ active }">
                <button @click="$emit('editar', rendicion.id)" class="menu-item" :class="{ 'bg-indigo-500 text-white': active, 'text-gray-900': !active }">
                  <PencilIcon class="mr-2 h-5 w-5" /> Editar
                </button>
              </MenuItem>
            </div>
            <div class="px-1 py-1">
              <MenuItem v-slot="{ active }">
                <button @click="$emit('eliminar', rendicion)" class="menu-item" :class="{ 'bg-red-500 text-white': active, 'text-red-700': !active }">
                  <TrashIcon class="mr-2 h-5 w-5" /> Eliminar
                </button>
              </MenuItem>
            </div>
          </MenuItems>
        </transition>
      </Menu>
    </div>
  </div>
</template>

<style scoped>
.menu-item {
    @apply flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors;
}
</style>