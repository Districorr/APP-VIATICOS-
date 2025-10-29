<script setup>
import { computed } from 'vue';
import { formatDate, formatCurrency } from '../utils/formatters.js';

const props = defineProps({
  solicitudes: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const getStatusClass = (status) => {
  switch (status) {
    case 'aprobada':
      return 'bg-green-100 text-green-800';
    case 'rechazada':
      return 'bg-red-100 text-red-800';
    case 'pendiente':
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
};
</script>

<template>
  <div class="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
    <div class="p-6 border-b">
      <h3 class="text-xl font-bold text-gray-800">Historial de Solicitudes de Reposición</h3>
      <p class="text-sm text-gray-500 mt-1">Trazabilidad de todas las solicitudes de reposición para esta caja.</p>
    </div>
    
    <div v-if="loading" class="p-6 text-center text-gray-500">
      Cargando historial de solicitudes...
    </div>
    <div v-else-if="solicitudes.length === 0" class="p-6 text-center text-gray-500">
      No se han realizado solicitudes de reposición para esta caja.
    </div>
    <div v-else class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="table-header">Fecha Solicitud</th>
            <th class="table-header">Monto Solicitado</th>
            <th class="table-header text-center">Estado</th>
            <th class="table-header">Fecha Revisión</th>
            <th class="table-header">Revisado Por</th>
            <th class="table-header">Comentarios</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="solicitud in solicitudes" :key="solicitud.id">
            <!-- CORRECCIÓN: Usar 'created_at' en lugar de 'fecha_solicitud' -->
            <td class="table-cell">{{ formatDate(solicitud.created_at) }}</td>
            <td class="table-cell font-semibold">{{ formatCurrency(solicitud.monto_solicitado) }}</td>
            <td class="table-cell text-center">
              <span :class="getStatusClass(solicitud.estado)" class="px-2 py-1 font-semibold leading-tight text-xs rounded-full uppercase">
                {{ solicitud.estado }}
              </span>
            </td>
            <td class="table-cell">{{ solicitud.fecha_revision ? formatDate(solicitud.fecha_revision) : 'N/A' }}</td>
            <td class="table-cell">{{ solicitud.revisado_por?.nombre_completo || 'N/A' }}</td>
            <td class="table-cell">{{ solicitud.comentarios_revision || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-header {
  @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider;
}
.table-cell {
  @apply px-4 py-4 whitespace-nowrap text-gray-700;
}
</style>