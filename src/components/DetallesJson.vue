<!-- src/components/DetallesJson.vue -->
<script setup>
import { computed } from 'vue';
// Importamos los íconos que usaremos
import { UserCircleIcon, HashtagIcon, MapPinIcon, BuildingOfficeIcon, TagIcon, InformationCircleIcon } from '@heroicons/vue/24/outline';

const props = defineProps({
  datos: {
    type: [Object, String], // Aceptamos objeto o string (si viene como JSON string)
    default: () => ({})
  }
});

// Mapeo de llaves a íconos para un look profesional
const iconMap = {
  cliente_referido: UserCircleIcon,
  provincia: MapPinIcon,
  localidad: MapPinIcon,
  hotel: BuildingOfficeIcon,
  paciente: UserCircleIcon,
  numero_de_cuit: HashtagIcon,
  default: TagIcon // Ícono por defecto si no hay match
};

const formatKey = (key) => {
  return key.replace(/_/g, ' ').replace(/(^\w{1})|(\s+\w{1})/g, letra => letra.toUpperCase());
};

const itemsValidos = computed(() => {
  let parsedData = props.datos;
  
  // Si los datos llegan como un string JSON, lo parseamos
  if (typeof props.datos === 'string') {
    try {
      parsedData = JSON.parse(props.datos);
    } catch (e) {
      console.error("Error al parsear JSON en DetallesJson:", e);
      return []; // Devolvemos vacío si el JSON es inválido
    }
  }

  if (!parsedData || typeof parsedData !== 'object') {
    return [];
  }

  return Object.entries(parsedData)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key: formatKey(key),
      value: value,
      icon: iconMap[key.toLowerCase()] || iconMap.default
    }));
});
</script>

<template>
  <div v-if="itemsValidos.length > 0">
    <ul class="space-y-1.5">
      <li v-for="item in itemsValidos" :key="item.key" class="flex items-center gap-2 text-xs">
        <component :is="item.icon" class="h-4 w-4 text-gray-500 flex-shrink-0" />
        <span class="font-semibold text-gray-700">{{ item.key }}:</span>
        <span class="text-gray-900 truncate" :title="item.value">{{ item.value }}</span>
      </li>
    </ul>
  </div>
  <div v-else class="text-xs text-gray-400 italic">
    Sin detalles
  </div>
</template>