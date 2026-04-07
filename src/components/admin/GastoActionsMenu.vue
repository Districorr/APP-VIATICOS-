<script setup>
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import { 
  EllipsisVerticalIcon, 
  PencilIcon, 
  DocumentDuplicateIcon, 
  TrashIcon 
} from '@heroicons/vue/24/outline';

// 1. Recibimos el objeto 'gasto' como una prop desde el componente padre.
defineProps({
  gasto: {
    type: Object,
    required: true
  }
});

// 2. Definimos los eventos ('edit', 'duplicate', 'delete') que este componente puede emitir hacia el padre.
const emit = defineEmits(['edit', 'duplicate', 'delete']);
</script>
<template>
  <Menu as="div" class="relative inline-block text-left">
    <div>
      <MenuButton class="btn-icon">
        <EllipsisVerticalIcon class="h-5 w-5" aria-hidden="true" />
      </MenuButton>
    </div>

    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <MenuItems class="absolute right-0 mt-2 w-48 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
        <div class="px-1 py-1">
          
          <!-- SOLUCIÓN: Usar `as="button"` y colocar clases/eventos directamente en MenuItem -->
          <MenuItem
            as="button"
            @click="emit('edit', gasto.gasto_id)"
            class="group flex w-full items-center rounded-md px-2 py-2 text-sm text-gray-900 hover:bg-blue-500 hover:text-white"
          >
            <PencilIcon class="mr-2 h-5 w-5 text-blue-400 group-hover:text-white" aria-hidden="true" />
            Editar Gasto
          </MenuItem>
          <MenuItem
            as="button"
            @click="emit('duplicate', gasto)"
            class="group flex w-full items-center rounded-md px-2 py-2 text-sm text-gray-900 hover:bg-blue-500 hover:text-white"
          >
            <DocumentDuplicateIcon class="mr-2 h-5 w-5 text-blue-400 group-hover:text-white" aria-hidden="true" />
            Duplicar
          </MenuItem>
        </div>
        <div class="px-1 py-1">
          <MenuItem
            as="button"
            @click="emit('delete', gasto.gasto_id)"
            class="group flex w-full items-center rounded-md px-2 py-2 text-sm text-red-700 hover:bg-red-500 hover:text-white"
          >
            <TrashIcon class="mr-2 h-5 w-5 text-red-400 group-hover:text-white" aria-hidden="true" />
            Eliminar
          </MenuItem>
        </div>
      </MenuItems>
    </transition>
  </Menu>
</template>