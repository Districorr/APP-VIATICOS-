<script setup>
import { computed } from 'vue';
import {
  XMarkIcon,
  MapPinIcon,
  TruckIcon,
  DocumentCheckIcon,
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  CheckCircleIcon
} from '@heroicons/vue/24/outline';
import { normalizeProveedor } from '../../../utils/logisticaHelpers.js';
import { formatCurrency, formatPercent } from '../../../utils/conciliacionHelpers.js';
import { useReporteConsolidadoPDF } from '../../../composables/useReporteConsolidadoPDF.js';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  movimientos: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close']);

const { exportarPdfConsolidado } = useReporteConsolidadoPDF();

// --- CÁLCULO ESTADÍSTICO CONSOLIDADO ---
const stats = computed(() => {
  const guias = props.movimientos || [];
  const totalGuias = guias.length;

  if (totalGuias === 0) {
    return {
      totalGuias: 0,
      totalBultos: 0,
      totalMonto: 0,
      zonaConcurrida: 'Sin datos',
      zonaConcurridaCount: 0,
      transportePrincipal: 'Sin datos',
      transportePrincipalPorcentaje: 0,
      guiasConRespaldo: 0,
      porcentajeRespaldo: 0
    };
  }

  let totalBultos = 0;
  let totalMonto = 0;
  let guiasConRespaldo = 0;

  const destinosMap = {};
  const transportesMap = {};

  guias.forEach(g => {
    const extra = g.datos_adicionales || {};
    
    // Bultos
    const b = extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== ''
      ? Number(extra.cantidad_bultos) || 0
      : (Number(g.bultos) || 0);
    totalBultos += b;

    // Monto
    totalMonto += Number(g.monto_total) || 0;

    // Respaldo de Comprobante / Factura Digital
    const tieneComprobante = Boolean(g.comprobante_url || extra.foto_remito_url || extra.foto_envio || extra.url_comprobante || g.comprobante || g.numero_factura);
    if (tieneComprobante) guiasConRespaldo++;

    // Destino / Provincia
    const dest = (extra.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || 'Destino General').trim();
    destinosMap[dest] = (destinosMap[dest] || 0) + 1;

    // Transporte
    const rawT = g.transportes?.nombre || g.proveedores?.nombre || 'LOGISTICA CIRUGIA';
    const normT = normalizeProveedor(rawT);
    transportesMap[normT] = (transportesMap[normT] || 0) + 1;
  });

  // Determinar destino / provincia principal
  const topDestinoEntry = Object.entries(destinosMap).sort((a, b) => b[1] - a[1])[0];
  const zonaConcurrida = topDestinoEntry ? topDestinoEntry[0] : 'Destino General';
  const zonaConcurridaCount = topDestinoEntry ? topDestinoEntry[1] : 0;

  // Determinar transporte principal
  const topTransporteEntry = Object.entries(transportesMap).sort((a, b) => b[1] - a[1])[0];
  const transportePrincipal = topTransporteEntry ? topTransporteEntry[0] : 'LOGISTICA CIRUGIA';
  const transportePrincipalCount = topTransporteEntry ? topTransporteEntry[1] : 0;
  const transportePrincipalPorcentaje = (transportePrincipalCount / totalGuias) * 100;

  // % respaldo de comprobantes
  const porcentajeRespaldo = (guiasConRespaldo / totalGuias) * 100;

  return {
    totalGuias,
    totalBultos,
    totalMonto,
    zonaConcurrida,
    zonaConcurridaCount,
    transportePrincipal,
    transportePrincipalCount,
    transportePrincipalPorcentaje,
    guiasConRespaldo,
    porcentajeRespaldo
  };
});

function descargarPDF() {
  exportarPdfConsolidado(stats.value, props.movimientos);
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
    <div class="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
      
      <!-- CABECERA DE MODAL -->
      <div class="flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white">
        <div class="flex items-center gap-3">
          <div class="rounded-xl bg-indigo-600/30 p-2.5 border border-indigo-400/30">
            <SparklesIcon class="h-6 w-6 text-indigo-300" />
          </div>
          <div>
            <h3 class="text-lg font-bold">Reporte Consolidado de Transporte y Envíos</h3>
            <p class="text-xs text-indigo-200">Análisis ejecutivo de destinos principales, transportes y comprobantes adjuntos</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <XMarkIcon class="h-6 w-6" />
        </button>
      </div>

      <!-- CUERPO DEL MODAL -->
      <div class="p-6 space-y-6 max-h-[80vh] overflow-y-auto bg-slate-50/50">
        
        <!-- MATRIZ DE 4 TARJETAS KPI ESTADÍSTICAS -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          <!-- TARJETA 1: DESTINO / PROVINCIA PRINCIPAL -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-indigo-300 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Destino / Provincia Principal</span>
              <div class="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                <MapPinIcon class="h-5 w-5" />
              </div>
            </div>
            <div class="mt-3">
              <p class="text-lg font-extrabold text-slate-900 truncate" :title="stats.zonaConcurrida">
                {{ stats.zonaConcurrida }}
              </p>
              <div class="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>Volumen registrado:</span>
                <span class="font-bold text-indigo-600">{{ stats.zonaConcurridaCount }} envíos</span>
              </div>
            </div>
          </div>

          <!-- TARJETA 2: TRANSPORTE PRINCIPAL -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-purple-300 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Transporte / Courier Líder</span>
              <div class="rounded-lg bg-purple-50 p-2 text-purple-600">
                <TruckIcon class="h-5 w-5" />
              </div>
            </div>
            <div class="mt-3">
              <p class="text-lg font-extrabold text-slate-900 truncate" :title="stats.transportePrincipal">
                {{ stats.transportePrincipal }}
              </p>
              <div class="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>Participación del total:</span>
                <span class="font-bold text-purple-600">{{ formatPercent(stats.transportePrincipalPorcentaje) }}</span>
              </div>
            </div>
          </div>

          <!-- TARJETA 3: COMPROBANTES Y FACTURAS ADJUNTAS -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-emerald-300 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Comprobantes y Facturas</span>
              <div class="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <DocumentCheckIcon class="h-5 w-5" />
              </div>
            </div>
            <div class="mt-3">
              <div class="flex items-baseline gap-2">
                <p class="text-2xl font-black text-emerald-600">
                  {{ formatPercent(stats.porcentajeRespaldo) }}
                </p>
                <span class="text-xs text-slate-500 font-medium">con comprobante</span>
              </div>
              
              <!-- BARRITA DE PROGRESO -->
              <div class="mt-2.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  class="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  :style="{ width: `${Math.min(stats.porcentajeRespaldo, 100)}%` }"
                ></div>
              </div>
              <p class="mt-1.5 text-[11px] text-slate-500 text-right">
                {{ stats.guiasConRespaldo }} de {{ stats.totalGuias }} movimientos respaldados
              </p>
            </div>
          </div>

          <!-- TARJETA 4: BULTOS Y GASTO ACUMULADO -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-sky-300 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Bultos Movilizados</span>
              <div class="rounded-lg bg-sky-50 p-2 text-sky-600">
                <ArchiveBoxIcon class="h-5 w-5" />
              </div>
            </div>
            <div class="mt-3">
              <div class="flex items-baseline gap-2">
                <p class="text-2xl font-black text-slate-900">
                  {{ stats.totalBultos }}
                </p>
                <span class="text-xs text-slate-500 font-medium">bultos tot.</span>
              </div>
              <div class="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                <span>Costo acumulado:</span>
                <span class="font-bold text-slate-800">{{ formatCurrency(stats.totalMonto) }}</span>
              </div>
            </div>
          </div>

        </div>

        <!-- RESUMEN INTERPRETATIVO -->
        <div class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-900 flex items-start gap-3">
          <CheckCircleIcon class="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span class="font-bold">Síntesis operacional:</span>
            Se procesaron {{ stats.totalGuias }} envíos logísticos. El destino principal detectado es <strong class="text-indigo-950">{{ stats.zonaConcurrida }}</strong>, mientras que <strong class="text-indigo-950">{{ stats.transportePrincipal }}</strong> encabeza los despachos. El {{ formatPercent(stats.porcentajeRespaldo) }} de los movimientos cuenta con comprobante digital o factura adjunta.
          </div>
        </div>

      </div>

      <!-- PIE DE MODAL -->
      <div class="flex items-center justify-between bg-slate-100 px-6 py-4 border-t border-slate-200">
        <button
          type="button"
          @click="emit('close')"
          class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
        >
          Cerrar
        </button>

        <button
          type="button"
          @click="descargarPDF"
          class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-md hover:shadow-indigo-200 transition-all cursor-pointer"
        >
          <ArrowDownTrayIcon class="h-4 w-4" />
          <span>Descargar Reporte PDF</span>
        </button>
      </div>

    </div>
  </div>
</template>
