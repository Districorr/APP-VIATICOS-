<script setup>
import { computed, onMounted, ref } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { ArrowDownTrayIcon, BanknotesIcon, ClipboardDocumentListIcon, CurrencyDollarIcon, FunnelIcon } from '@heroicons/vue/24/outline';

import StatCard from '../StatCard.vue';
import { supabase } from '../../../supabaseClient';
import { useEncomiendasDashboard } from '../../../composables/useEncomiendasDashboard';
import { useEncomiendasExcelExporter } from '../../../composables/useEncomiendasExcelExporter';
import { useEncomiendasPdfExporter } from '../../../composables/useEncomiendasPdfExporter';
import { formatCurrency, formatDate } from '../../../utils/formatters';

const props = defineProps({
  perfilesOptions: { type: Array, default: () => [] },
  loadingOptions: { type: Boolean, default: false },
});

const emit = defineEmits(['show-notification']);

const {
  dashboard,
  filters,
  loading,
  error,
  pageSize,
  currentPage,
  totalCount,
  totalPages,
  hasResults,
  resultFrom,
  resultTo,
  fetchDashboard,
  fetchExportDashboard,
  applyFilters,
  clearFilters,
  goToPage,
  changePageSize,
} = useEncomiendasDashboard();

const { exportDashboard } = useEncomiendasExcelExporter();
const { exportDashboardPdf } = useEncomiendasPdfExporter();

const proveedorOptions = ref([]);
const transporteOptions = ref([]);
const loadingFilterOptions = ref(false);
const exporting = ref(false);
const exportingPdf = ref(false);
const selectedWeek = ref(null);
const isCupoModalOpen = ref(false);
const savingCupo = ref(false);
const cupoForm = ref({
  mes: '',
  cupoMensual: '',
  observaciones: '',
});

const tipoMovimientoOptions = [
  { label: 'Todos', code: null },
  { label: 'Envío', code: 'Envío' },
  { label: 'Recepción', code: 'Recepción' },
];

const modalidadOptions = [
  { label: 'Todas', code: null },
  { label: 'Cuenta corriente empresa', code: 'cuenta_corriente_empresa' },
  { label: 'Rendición', code: 'rendicion' },
  { label: 'Caja chica', code: 'caja_chica' },
];

const pageSizeOptions = [10, 25, 50];

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isoDate = (date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return copy.toISOString().split('T')[0];
};

const getValue = (item, keys, fallback = '') => {
  for (const key of keys) {
    if (item?.[key] !== null && item?.[key] !== undefined && item?.[key] !== '') return item[key];
  }
  return fallback;
};

const modalidadLabel = (value) => {
  const labels = {
    cuenta_corriente_empresa: 'Cuenta corriente empresa',
    rendicion: 'Rendición',
    caja_chica: 'Caja chica',
    otro: 'Otro',
  };
  return labels[value] || value || 'Sin modalidad';
};

const getModalidadValue = (item) => getValue(item, ['modalidad_imputacion', 'modalidad']);

const textToneClass = (value) => {
  const normalized = String(value || '').trim();
  return normalized === 'N/A' || normalized.startsWith('Sin ')
    ? 'text-slate-500 font-medium'
    : 'text-slate-800 font-medium';
};

const statusClass = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('exced')) return 'bg-red-100 text-red-700';
  if (normalized.includes('alert')) return 'bg-amber-100 text-amber-700';
  if (normalized.includes('ok')) return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
};

const kpis = computed(() => dashboard.value?.kpis || {});
const cupo = computed(() => dashboard.value?.cupo || {});
const periodo = computed(() => dashboard.value?.periodo || {});
const cupoMensual = computed(() => numberValue(cupo.value.cupo_mensual));
const porcentajeCupo = computed(() => Math.min(100, Math.max(0, numberValue(cupo.value.porcentaje_consumido))));
const isCupoConfigurado = computed(() => cupoMensual.value > 0);
const emptyDashboard = computed(() => !loading.value && !error.value && totalCount.value === 0);
const currentCupoMonth = computed(() => {
  const source = periodo.value.mes_referencia || periodo.value.fecha_desde || filters.fechaDesde || new Date().toISOString().split('T')[0];
  return String(source).slice(0, 7);
});

const progressBarClass = computed(() => {
  const percentage = porcentajeCupo.value;
  if (percentage < 70) return 'bg-emerald-500';
  if (percentage <= 90) return 'bg-amber-500';
  return 'bg-red-500';
});

const proveedorRows = computed(() => [...(dashboard.value?.por_proveedor || [])].sort((a, b) => {
  return numberValue(getValue(b, ['gasto_total', 'total'])) - numberValue(getValue(a, ['gasto_total', 'total']));
}));

const detalleRows = computed(() => dashboard.value?.detalle || []);
const weeklyProviderRows = computed(() => dashboard.value?.control_semanal_por_proveedor || []);
const backendWeekColumns = computed(() => dashboard.value?.semanas_catalogo || []);
const weeklyTotals = computed(() => dashboard.value?.control_semanal_totales || null);
const filteredTotal = computed(() => numberValue(kpis.value.gasto_total_periodo));

const currentPeriodLabel = computed(() => `${formatDate(periodo.value.fecha_desde || filters.fechaDesde)} - ${formatDate(periodo.value.fecha_hasta || filters.fechaHasta)}`);

const selectedMonthBase = computed(() => {
  const source = filters.fechaDesde || new Date().toISOString().split('T')[0];
  const parsed = new Date(`${source}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
});

const weekOptions = computed(() => {
  const base = selectedMonthBase.value;
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const options = [{ label: 'Todas las semanas', code: null, start: isoDate(firstDay), end: isoDate(lastDay) }];

  let weekStart = new Date(firstDay);
  let index = 1;
  while (weekStart <= lastDay) {
    const weekEnd = new Date(weekStart);
    const day = weekStart.getDay();
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    weekEnd.setDate(weekStart.getDate() + daysUntilSunday);
    if (weekEnd > lastDay) weekEnd.setTime(lastDay.getTime());

    options.push({
      label: `Semana ${index}: ${formatDate(isoDate(weekStart), { day: '2-digit', month: '2-digit' })}-${formatDate(isoDate(weekEnd), { day: '2-digit', month: '2-digit' })}`,
      code: `week-${index}`,
      start: isoDate(weekStart),
      end: isoDate(weekEnd),
    });

    weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() + 1);
    index += 1;
  }

  return options;
});

const selectedWeekOption = computed(() => weekOptions.value.find((option) => option.code === selectedWeek.value));

const weekColumns = computed(() => backendWeekColumns.value.length > 0 ? backendWeekColumns.value : weekOptions.value.slice(1).map((item) => ({
  semana_numero: Number(String(item.code).replace('week-', '')),
  semana_inicio: item.start,
  semana_fin: item.end,
})));

const controlProviderRows = computed(() => weeklyProviderRows.value);

const getWeekAmount = (item, week) => {
  const match = (item?.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
  return numberValue(match?.gasto_total);
};

const getTotalWeekAmount = (week) => {
  const match = (weeklyTotals.value?.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
  return numberValue(match?.gasto_total);
};

const percentBarClass = (estado) => {
  const normalized = String(estado || '').toLowerCase();
  if (normalized.includes('exced')) return 'bg-red-500';
  if (normalized.includes('alert')) return 'bg-amber-500';
  if (normalized.includes('sin_cupo') || normalized.includes('sin cupo')) return 'bg-slate-400';
  return 'bg-emerald-500';
};

const percentWidth = (value) => `${Math.min(100, Math.max(0, numberValue(value)))}%`;

const formatNullableCurrency = (value) => value === null || value === undefined ? '—' : formatCurrency(value);

const differenceClass = (value) => {
  if (value === null || value === undefined) return 'text-slate-500';
  return numberValue(value) < 0 ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold';
};

const filterExportContext = computed(() => ({
  filters: { ...filters },
  labels: {
    semana: selectedWeekOption.value?.label || 'Todas',
    proveedor: proveedorOptions.value.find((option) => option.code === filters.proveedorId)?.label,
    transporte: transporteOptions.value.find((option) => option.code === filters.transporteId)?.label,
    tipoMovimiento: tipoMovimientoOptions.find((option) => option.code === filters.tipoMovimiento)?.label,
    modalidad: modalidadOptions.find((option) => option.code === filters.modalidad)?.label,
    responsable: props.perfilesOptions.find((option) => option.code === filters.responsableId)?.label,
  },
}));

function clearSelectedWeek() {
  selectedWeek.value = null;
}

async function handleWeekChange() {
  const option = selectedWeekOption.value;
  if (!option) return;
  filters.fechaDesde = option.start;
  filters.fechaHasta = option.end;
  await applyFilters();
}

async function handleClearFilters() {
  selectedWeek.value = null;
  await clearFilters();
}

function openCupoModal() {
  cupoForm.value = {
    mes: currentCupoMonth.value,
    cupoMensual: cupo.value.cupo_mensual !== null && cupo.value.cupo_mensual !== undefined ? String(cupo.value.cupo_mensual) : '',
    observaciones: cupo.value.observaciones || '',
  };
  isCupoModalOpen.value = true;
}

function closeCupoModal() {
  if (savingCupo.value) return;
  isCupoModalOpen.value = false;
}

async function saveCupoMensual() {
  const monto = Number(cupoForm.value.cupoMensual);
  if (!cupoForm.value.mes) {
    emit('show-notification', 'Validación', 'El mes del cupo es obligatorio.', 'warning');
    return;
  }
  if (cupoForm.value.cupoMensual === '' || !Number.isFinite(monto) || monto < 0) {
    emit('show-notification', 'Validación', 'El cupo mensual debe ser un número mayor o igual a cero.', 'warning');
    return;
  }

  savingCupo.value = true;
  try {
    const { error: rpcError } = await supabase.rpc('guardar_cupo_encomiendas_mensual', {
      p_mes: `${cupoForm.value.mes}-01`,
      p_cupo_mensual: monto,
      p_observaciones: cupoForm.value.observaciones?.trim() || null,
    });

    if (rpcError) throw rpcError;
    emit('show-notification', 'Cupo actualizado', 'El cupo mensual de encomiendas fue guardado.', 'success');
    isCupoModalOpen.value = false;
    await fetchDashboard();
  } catch (e) {
    console.error('Error guardando cupo mensual de encomiendas:', e);
    emit('show-notification', 'Error', e.message || 'No se pudo guardar el cupo mensual.', 'error');
  } finally {
    savingCupo.value = false;
  }
}

async function fetchFilterOptions() {
  loadingFilterOptions.value = true;
  try {
    const [proveedoresRes, transportesRes] = await Promise.all([
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('transportes').select('id, nombre').order('nombre'),
    ]);

    if (proveedoresRes.error) throw proveedoresRes.error;
    if (transportesRes.error) throw transportesRes.error;

    proveedorOptions.value = (proveedoresRes.data || []).map((item) => ({ label: item.nombre, code: item.id }));
    transporteOptions.value = (transportesRes.data || []).map((item) => ({ label: item.nombre, code: item.id }));
  } catch (e) {
    console.error('Error cargando filtros de encomiendas:', e);
    emit('show-notification', 'Error', 'No se pudieron cargar proveedores u operadores logísticos.', 'error');
  } finally {
    loadingFilterOptions.value = false;
  }
}

async function handleExport() {
  exporting.value = true;
  try {
    const exportData = await fetchExportDashboard();
    exportDashboard(exportData, filterExportContext.value);
    emit('show-notification', 'Excel generado', 'El archivo de encomiendas fue descargado.', 'success');
  } catch (e) {
    console.error('Error exportando encomiendas:', e);
    emit('show-notification', 'Error', 'No se pudo generar el Excel de encomiendas.', 'error');
  } finally {
    exporting.value = false;
  }
}

async function handleExportPdf() {
  exportingPdf.value = true;
  try {
    const exportData = await fetchExportDashboard();
    exportDashboardPdf(exportData, filterExportContext.value);
    emit('show-notification', 'PDF generado', 'El reporte ejecutivo de encomiendas fue descargado.', 'success');
  } catch (e) {
    console.error('Error exportando PDF de encomiendas:', e);
    emit('show-notification', 'Error', 'No se pudo generar el PDF de encomiendas.', 'error');
  } finally {
    exportingPdf.value = false;
  }
}

onMounted(async () => {
  await Promise.all([fetchFilterOptions(), fetchDashboard()]);
});
</script>

<template>
  <div class="space-y-10">
    <div v-if="loading && !hasResults" class="text-center py-20">
      <svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>

    <div v-else-if="error" class="error-banner">{{ error }}</div>

    <div v-else class="space-y-10">
      <section class="section-header">
        <div>
          <h2 class="text-2xl font-bold tracking-tight text-slate-900">Encomiendas / Costos Logísticos</h2>
          <p class="mt-1 text-sm font-medium text-slate-600">Control y análisis de costos logísticos por proveedor</p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span class="period-badge">{{ currentPeriodLabel }}</span>
          <button type="button" class="btn-secondary inline-flex items-center justify-center gap-2" :disabled="loading || exporting" @click="handleExport">
            <ArrowDownTrayIcon class="h-5 w-5" />
            {{ exporting ? 'Exportando...' : 'Exportar Excel' }}
          </button>
          <button type="button" class="btn-secondary inline-flex items-center justify-center gap-2" :disabled="loading || exportingPdf" @click="handleExportPdf">
            {{ exportingPdf ? 'Exportando...' : 'Exportar PDF' }}
          </button>
        </div>
      </section>

      <section>
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Gasto del período" :value="kpis.gasto_total_periodo" formatAs="currency" :loading="loading" :icon="CurrencyDollarIcon" />
          <StatCard title="Despachos" :value="kpis.cantidad_despachos" :loading="loading" :icon="ClipboardDocumentListIcon" />
          <StatCard title="Promedio por despacho" :value="kpis.gasto_promedio_despacho" formatAs="currency" :loading="loading" />
          <StatCard title="Cuenta corriente empresa" :value="kpis.total_cuenta_corriente" formatAs="currency" :loading="loading" :icon="BanknotesIcon" />
          <StatCard title="Rendición" :value="kpis.total_rendicion" formatAs="currency" :loading="loading" />
          <StatCard title="Caja chica" :value="kpis.total_caja_chica" formatAs="currency" :loading="loading" />
        </div>
      </section>

      <section class="section-container panel-section">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="section-title">Cupo mensual general</h2>
            <p class="text-sm font-medium text-slate-600">Período: {{ formatDate(periodo.fecha_desde) }} - {{ formatDate(periodo.fecha_hasta) }}</p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div v-if="!isCupoConfigurado" class="rounded-lg bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">Cupo no configurado</div>
            <button type="button" class="btn-secondary inline-flex items-center justify-center" @click="openCupoModal">Ajustar cupo</button>
          </div>
        </div>
        <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div class="cupo-metric"><span>Cupo mensual</span><strong>{{ formatCurrency(cupo.cupo_mensual || 0) }}</strong></div>
          <div class="cupo-metric"><span>Consumido</span><strong>{{ formatCurrency(cupo.consumido || 0) }}</strong></div>
          <div class="cupo-metric"><span>Disponible</span><strong>{{ formatCurrency(cupo.disponible || 0) }}</strong></div>
          <div class="cupo-metric"><span>% consumido</span><strong>{{ porcentajeCupo.toFixed(1) }}%</strong></div>
        </div>
        <div class="mt-5">
          <div class="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div class="h-full rounded-full transition-all" :class="progressBarClass" :style="{ width: `${porcentajeCupo}%` }" />
          </div>
        </div>
      </section>

      <section class="section-container panel-section">
        <div>
          <h2 class="section-title">Control semanal por proveedor</h2>
          <p class="text-sm font-medium text-slate-600">Gasto acumulado por semana — semanas de lunes a domingo dentro del mes seleccionado — y comparación contra cupo mensual.</p>
        </div>
        <div class="mt-5 overflow-x-auto">
          <table class="data-table min-w-full">
            <thead>
              <tr>
                <th class="table-header">Proveedor</th>
                <th v-for="week in weekColumns" :key="week.semana_numero" class="table-header text-right">
                  <div>Semana {{ week.semana_numero }}</div>
                  <div class="text-[10px] font-semibold normal-case tracking-normal text-slate-500">{{ formatDate(week.semana_inicio, { day: '2-digit', month: '2-digit' }) }} - {{ formatDate(week.semana_fin, { day: '2-digit', month: '2-digit' }) }}</div>
                </th>
                <th class="table-header text-right">Total mes</th>
                <th class="table-header text-right">Despachos del mes</th>
                <th class="table-header text-right">Promedio</th>
                <th class="table-header text-right">Cupo mensual</th>
                <th class="table-header text-right">Disponible / Diferencia</th>
                <th class="table-header text-right">% consumido</th>
                <th class="table-header">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in controlProviderRows" :key="getValue(item, ['proveedor_id', 'proveedor', 'proveedor_nombre'])" class="data-row">
                <td class="table-cell" :class="textToneClass(getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor'))">{{ getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor') }}</td>
                <td v-for="week in weekColumns" :key="week.semana_numero" class="table-cell money-cell">
                  {{ formatCurrency(getWeekAmount(item, week)) }}
                </td>
                <td class="table-cell money-cell">{{ formatCurrency(item.gasto_total_periodo) }}</td>
                <td class="table-cell numeric-cell">{{ numberValue(item.despachos_periodo).toLocaleString('es-AR') }}</td>
                <td class="table-cell money-cell">{{ formatCurrency(item.promedio_por_despacho) }}</td>
                <td class="table-cell text-right">{{ formatNullableCurrency(item.cupo_mensual) }}</td>
                <td class="table-cell text-right" :class="differenceClass(item.disponible_diferencia)">{{ formatNullableCurrency(item.disponible_diferencia) }}</td>
                <td class="table-cell min-w-32">
                  <div v-if="item.porcentaje_consumido !== null && item.porcentaje_consumido !== undefined" class="space-y-1">
                    <div class="text-right font-semibold text-slate-800">{{ numberValue(item.porcentaje_consumido).toFixed(2) }}%</div>
                    <div class="h-1.5 rounded-full bg-slate-200"><div class="h-full rounded-full" :class="percentBarClass(item.estado)" :style="{ width: percentWidth(item.porcentaje_consumido) }"></div></div>
                  </div>
                  <span v-else class="block text-right text-slate-500">—</span>
                </td>
                <td class="table-cell"><span class="status-pill" :class="statusClass(item.estado)">{{ item.estado || '—' }}</span></td>
              </tr>
              <tr v-if="weeklyTotals" class="total-row">
                <td class="table-cell font-bold text-slate-900">TOTAL</td>
                <td v-for="week in weekColumns" :key="week.semana_numero" class="table-cell money-cell">{{ formatCurrency(getTotalWeekAmount(week)) }}</td>
                <td class="table-cell money-cell">{{ formatCurrency(weeklyTotals.gasto_total_periodo) }}</td>
                <td class="table-cell numeric-cell">{{ numberValue(weeklyTotals.despachos_periodo).toLocaleString('es-AR') }}</td>
                <td class="table-cell money-cell">{{ formatCurrency(weeklyTotals.promedio_por_despacho) }}</td>
                <td class="table-cell money-cell">{{ formatNullableCurrency(weeklyTotals.cupo_mensual_total) }}</td>
                <td class="table-cell text-right" :class="differenceClass(weeklyTotals.disponible_diferencia_total)">{{ formatNullableCurrency(weeklyTotals.disponible_diferencia_total) }}</td>
                <td class="table-cell min-w-32">
                  <div v-if="weeklyTotals.porcentaje_consumido_total !== null && weeklyTotals.porcentaje_consumido_total !== undefined" class="space-y-1">
                    <div class="text-right font-semibold text-slate-800">{{ numberValue(weeklyTotals.porcentaje_consumido_total).toFixed(2) }}%</div>
                    <div class="h-1.5 rounded-full bg-slate-200"><div class="h-full rounded-full bg-slate-500" :style="{ width: percentWidth(weeklyTotals.porcentaje_consumido_total) }"></div></div>
                  </div>
                  <span v-else class="block text-right text-slate-500">—</span>
                </td>
                <td class="table-cell text-center text-slate-500">—</td>
              </tr>
              <tr v-if="controlProviderRows.length === 0"><td :colspan="weekColumns.length + 8" class="empty-cell">Sin datos por proveedor para el período seleccionado.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section-container detail-section">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="section-title">Detalle de operaciones</h2>
            <p class="text-sm font-medium text-slate-600">Operaciones filtrables por período, semana, proveedor, operador y modalidad.</p>
          </div>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div><label class="form-label">Fecha desde</label><input v-model="filters.fechaDesde" type="date" class="form-input mt-1" @change="clearSelectedWeek" /></div>
          <div><label class="form-label">Fecha hasta</label><input v-model="filters.fechaHasta" type="date" class="form-input mt-1" @change="clearSelectedWeek" /></div>
          <div>
            <label class="form-label">Semana</label>
            <select v-model="selectedWeek" class="form-input mt-1" @change="handleWeekChange">
              <option v-for="option in weekOptions" :key="option.code || 'all-weeks'" :value="option.code">{{ option.label }}</option>
            </select>
          </div>
          <div><label class="form-label">Proveedor / Empresa vinculada</label><v-select v-model="filters.proveedorId" :options="proveedorOptions" :loading="loadingFilterOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter bg-white" /></div>
          <div><label class="form-label">Operador logístico</label><v-select v-model="filters.transporteId" :options="transporteOptions" :loading="loadingFilterOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter bg-white" /></div>
          <div><label class="form-label">Tipo de movimiento</label><v-select v-model="filters.tipoMovimiento" :options="tipoMovimientoOptions" :reduce="option => option.code" :clearable="false" class="v-select-filter bg-white" /></div>
          <div><label class="form-label">Modalidad de imputación</label><v-select v-model="filters.modalidad" :options="modalidadOptions" :reduce="option => option.code" :clearable="false" class="v-select-filter bg-white" /></div>
          <div><label class="form-label">Responsable</label><v-select v-model="filters.responsableId" :options="props.perfilesOptions" :loading="props.loadingOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter bg-white" /></div>
          <div class="xl:col-span-2"><label class="form-label">Paciente / texto de búsqueda</label><input v-model="filters.paciente" type="text" class="form-input mt-1" placeholder="Buscar en paciente o detalle" @keyup.enter="applyFilters" /></div>
        </div>

        <div v-if="selectedWeekOption" class="mt-3 text-sm font-semibold text-slate-600">
          Semana seleccionada: {{ formatDate(selectedWeekOption.start, { day: '2-digit', month: '2-digit' }) }}-{{ formatDate(selectedWeekOption.end, { day: '2-digit', month: '2-digit' }) }}
        </div>

        <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" class="btn-secondary inline-flex items-center justify-center gap-2" @click="handleClearFilters">Limpiar filtros</button>
          <button type="button" class="btn-primary inline-flex items-center justify-center gap-2" @click="applyFilters"><FunnelIcon class="h-5 w-5" />Aplicar filtros</button>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div class="detail-summary"><span>Operaciones filtradas</span><strong>{{ totalCount.toLocaleString('es-AR') }}</strong></div>
          <div class="detail-summary"><span>Mostrando</span><strong>{{ resultFrom }}-{{ resultTo }}</strong></div>
          <div class="detail-summary"><span>Total filtrado</span><strong>{{ formatCurrency(filteredTotal) }}</strong></div>
        </div>

        <div v-if="emptyDashboard" class="mt-6 rounded-lg border border-slate-200 bg-slate-50 py-10 text-center text-sm font-medium text-slate-600">No hay operaciones de encomiendas para los filtros seleccionados.</div>

        <div class="mt-6 overflow-x-auto">
          <table class="data-table min-w-full">
            <thead>
              <tr>
                <th class="table-header">Fecha</th>
                <th class="table-header">Responsable</th>
                <th class="table-header">Proveedor</th>
                <th class="table-header">Operador logístico</th>
                <th class="table-header">Movimiento</th>
                <th class="table-header">Modalidad</th>
                <th class="table-header">Paciente</th>
                <th class="table-header">Descripción</th>
                <th class="table-header text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in detalleRows" :key="getValue(item, ['gasto_id', 'id', 'fecha'])" class="data-row detail-row">
                <td class="table-cell font-medium text-slate-800">{{ formatDate(getValue(item, ['fecha', 'fecha_gasto', 'created_at'])) }}</td>
                <td class="table-cell" :class="textToneClass(getValue(item, ['responsable', 'responsable_nombre', 'nombre_responsable'], 'N/A'))">{{ getValue(item, ['responsable', 'responsable_nombre', 'nombre_responsable'], 'N/A') }}</td>
                <td class="table-cell" :class="textToneClass(getValue(item, ['proveedor', 'proveedor_nombre', 'nombre_proveedor'], 'N/A'))">{{ getValue(item, ['proveedor', 'proveedor_nombre', 'nombre_proveedor'], 'N/A') }}</td>
                <td class="table-cell" :class="textToneClass(getValue(item, ['transporte', 'transporte_nombre', 'operador_logistico', 'nombre_transporte'], 'N/A'))">{{ getValue(item, ['transporte', 'transporte_nombre', 'operador_logistico', 'nombre_transporte'], 'N/A') }}</td>
                <td class="table-cell" :class="textToneClass(getValue(item, ['tipo_movimiento', 'tipo_movimiento_encomienda'], 'N/A'))">{{ getValue(item, ['tipo_movimiento', 'tipo_movimiento_encomienda'], 'N/A') }}</td>
                <td class="table-cell font-semibold text-slate-800">{{ modalidadLabel(getModalidadValue(item)) }}</td>
                <td class="table-cell" :class="textToneClass(getValue(item, ['paciente', 'paciente_referido', 'nombre_paciente'], 'N/A'))">{{ getValue(item, ['paciente', 'paciente_referido', 'nombre_paciente'], 'N/A') }}</td>
                <td class="table-cell max-w-xs truncate" :class="textToneClass(getValue(item, ['descripcion', 'descripcion_general', 'detalle'], 'N/A'))">{{ getValue(item, ['descripcion', 'descripcion_general', 'detalle'], 'N/A') }}</td>
                <td class="table-cell money-cell">{{ formatCurrency(getValue(item, ['monto', 'monto_total', 'total'])) }}</td>
              </tr>
              <tr v-if="detalleRows.length === 0"><td colspan="9" class="empty-cell">Sin operaciones para mostrar.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" class="pagination-button" :disabled="currentPage <= 1 || loading" @click="goToPage(currentPage - 1)">Anterior</button>
          <div class="flex items-center justify-center gap-3 text-center text-sm font-semibold text-slate-700">
            <span>Página {{ currentPage }} de {{ totalPages }}</span>
            <label class="flex items-center gap-2">
              <span>Filas</span>
              <select :value="pageSize" class="form-input !mt-0 w-24" @change="changePageSize($event.target.value)">
                <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
              </select>
            </label>
          </div>
          <button type="button" class="pagination-button" :disabled="currentPage >= totalPages || loading" @click="goToPage(currentPage + 1)">Siguiente</button>
        </div>
      </section>
    </div>

    <Transition name="modal-fade">
      <div v-if="isCupoModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="closeCupoModal">
        <div class="w-full max-w-lg rounded-xl bg-white shadow-2xl">
          <div class="flex items-start justify-between border-b border-slate-200 p-5">
            <div>
              <h3 class="text-lg font-bold text-slate-900">Ajustar cupo mensual</h3>
              <p class="mt-1 text-sm font-medium text-slate-600">Configuración del límite mensual para encomiendas.</p>
            </div>
            <button type="button" class="rounded-md p-2 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800" :disabled="savingCupo" @click="closeCupoModal">×</button>
          </div>

          <form class="space-y-5 p-5" @submit.prevent="saveCupoMensual">
            <div>
              <label class="form-label">Mes / Año <span class="text-red-500">*</span></label>
              <input v-model="cupoForm.mes" type="month" required class="form-input mt-1" />
            </div>
            <div>
              <label class="form-label">Cupo mensual <span class="text-red-500">*</span></label>
              <input v-model="cupoForm.cupoMensual" type="number" min="0" step="0.01" required class="form-input mt-1" placeholder="0,00" />
            </div>
            <div>
              <label class="form-label">Observaciones</label>
              <textarea v-model="cupoForm.observaciones" rows="3" class="form-input mt-1" placeholder="Comentario opcional sobre el cupo"></textarea>
            </div>

            <div class="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button type="button" class="btn-secondary" :disabled="savingCupo" @click="closeCupoModal">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="savingCupo">{{ savingCupo ? 'Guardando...' : 'Guardar cupo' }}</button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.section-header { @apply flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between; }
.period-badge { @apply inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700; }
.panel-section { @apply border-slate-200 shadow-sm; }
.detail-section { @apply border-slate-300 shadow-sm; }
.cupo-metric { @apply rounded-lg border border-slate-200 bg-slate-50 p-4; }
.cupo-metric span { @apply block text-sm font-semibold text-slate-600; }
.cupo-metric strong { @apply mt-1 block text-xl font-bold text-slate-900; }
.provider-card { @apply rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50; }
.metric-label { @apply text-xs font-bold uppercase tracking-wide text-slate-500; }
.metric-value { @apply mt-1 text-2xl font-bold text-slate-900; }
.detail-summary { @apply rounded-lg border border-slate-200 bg-slate-50 p-4; }
.detail-summary span { @apply block text-xs font-bold uppercase tracking-wide text-slate-500; }
.detail-summary strong { @apply mt-1 block text-xl font-bold text-slate-900; }
.data-table { @apply divide-y divide-slate-300 overflow-hidden rounded-lg border border-slate-300 bg-white; }
.table-header { @apply bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 border-b border-slate-300; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm text-slate-800; }
.data-row { @apply border-b border-slate-200 transition-colors hover:bg-slate-100/80; }
.total-row { @apply border-t-2 border-slate-300 bg-slate-100 font-semibold; }
.detail-row:hover { @apply bg-slate-100; }
.numeric-cell { @apply text-right font-medium text-slate-700; }
.money-cell { @apply text-right font-semibold text-slate-800; }
.status-pill { @apply inline-flex rounded-full px-2.5 py-1 text-xs font-semibold; }
.empty-cell { @apply px-4 py-8 text-center text-sm font-medium text-slate-500; }
.pagination-button { @apply inline-flex min-w-28 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none; }

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
