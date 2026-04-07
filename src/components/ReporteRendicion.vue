<!-- src/components/ReporteRendicion.vue -->
<!-- VERSIÓN CORREGIDA: Cada bloque tiene un ID único para ser encontrado por el selector -->
<script setup>
import { formatCurrency } from '../utils/formatters.js';

defineProps({
  tabla_gastos: { type: Array, default: null },
  tabla_tipos: { type: Array, default: null },
  tabla_provincias: { type: Array, default: null },
  resumen_financiero: { type: Object, default: null }
});

const getGastoDetalles = (gasto) => {
  const detallesVisibles = [];
  const detalles = gasto.detalles_adicionales || {};

  for (const key in detalles) {
    const value = detalles[key];
    if (value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim().toLowerCase() !== 'null') {
      const formattedKey = key
        .replace('numero_factura', 'Nº Factura')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      
      detallesVisibles.push(`${formattedKey}: ${value}`);
    }
  }
  return detallesVisibles.join(' | ');
};
</script>

<template>
  <!-- El div raíz ahora solo es un contenedor -->
  <div class="font-sans bg-white">

    <!-- 1. Molde para la TABLA DE GASTOS con su propio ID -->
    <div id="render-block-gastos" v-if="tabla_gastos">
      <table class="w-full text-sm border-collapse">
        <thead class="bg-gray-200">
          <tr>
            <th class="p-2 text-left font-semibold text-gray-700 w-3/5">Descripción Detallada</th>
            <th class="p-2 text-right font-semibold text-gray-700 w-2/5">Monto total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(gasto, gIndex) in tabla_gastos" :key="gIndex" class="border-b border-gray-200">
            <td class="p-2 align-top">
              <p class="font-medium">{{ gasto.descripcion }}</p>
              <p class="text-xs text-gray-500 mt-1">
                <span>{{ gasto.fecha }}</span>
                <span class="mx-1">|</span>
                <span>{{ gasto.tipo_gasto || 'Gasto General' }}</span>
                <span v-if="getGastoDetalles(gasto)" class="mx-1">|</span>
                <span class="italic">{{ getGastoDetalles(gasto) }}</span>
              </p>
            </td>
            <td class="p-2 align-top text-right font-bold text-lg">{{ formatCurrency(gasto.monto) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 2. Molde para la TABLA DE GASTOS POR TIPO con su propio ID -->
    <div id="render-block-tipos" v-if="tabla_tipos">
      <table class="w-full text-sm bg-white">
        <tbody>
          <tr v-for="item in tabla_tipos" :key="item.tipo" class="border-b border-gray-300">
            <td class="p-2 text-gray-800">{{ item.tipo }}</td>
            <td class="p-2 text-right font-semibold text-gray-900">{{ formatCurrency(item.monto) }}</td>
            <td class="p-2 text-right text-gray-500 w-20">{{ item.porcentaje }}%</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 3. Molde para la TABLA DE GASTOS POR PROVINCIA con su propio ID -->
    <div id="render-block-provincias" v-if="tabla_provincias">
       <table class="w-full text-sm bg-white">
        <tbody>
          <tr v-for="item in tabla_provincias" :key="item.provincia" class="border-b border-gray-300">
            <td class="p-2 text-gray-800">{{ item.provincia }}</td>
            <td class="p-2 text-right font-semibold text-gray-900">{{ formatCurrency(item.monto) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- 4. Molde para el RESUMEN FINANCIERO con su propio ID -->
    <div id="render-block-resumen" v-if="resumen_financiero">
      <div class="bg-yellow-100 p-4">
        <div class="flex justify-between items-center py-2 border-b border-yellow-300">
          <span class="font-semibold text-gray-800">Total Adelantos Disponibles:</span>
          <span class="font-bold text-lg text-green-700">{{ formatCurrency(resumen_financiero.total_adelantos) }}</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-yellow-300">
          <span class="font-semibold text-gray-800">Total Gastos (Bruto):</span>
          <span class="font-bold text-lg text-red-700">{{ formatCurrency(resumen_financiero.total_gastos_bruto) }}</span>
        </div>
        <div class="flex justify-between items-center py-3" :class="resumen_financiero.saldo < 0 ? 'text-red-700' : 'text-green-700'">
          <span class="font-bold text-lg">{{ resumen_financiero.etiqueta_saldo }}</span>
          <span class="font-extrabold text-2xl">{{ formatCurrency(Math.abs(resumen_financiero.saldo)) }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Estilos no son necesarios, Tailwind se encarga de todo. */
</style>