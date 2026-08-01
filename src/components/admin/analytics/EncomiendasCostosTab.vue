<script setup>
import { computed, inject, onMounted, ref } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { ArrowDownTrayIcon, BanknotesIcon, ClipboardDocumentListIcon, CurrencyDollarIcon, FunnelIcon, TruckIcon, ArrowRightIcon } from '@heroicons/vue/24/outline';

import StatCard from '../StatCard.vue';
import AdminEditarGastoCuentaCorrienteModal from '../AdminEditarGastoCuentaCorrienteModal.vue';
import EncomiendasBulkPaymentsModal from '../EncomiendasBulkPaymentsModal.vue';
import AdminCtaCteVencimientosModal from '../AdminCtaCteVencimientosModal.vue';
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
const userProfile = inject('userProfile', ref(null));

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
  fetchDashboard: fetchDashboardBase,
  fetchExportDashboard,
  applyFilters: applyDashboardFilters,
  clearFilters: clearDashboardFilters,
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
const loadingProviderCupos = ref(false);
const cupoMode = ref('general');
const providerCupos = ref([]);
const isEditModalOpen = ref(false);
const gastoEnEdicion = ref(null);
const isBulkModalOpen = ref(false);
const seedPayment = ref(null);
const isCtaCteModalOpen = ref(false);
const showFilters = ref(false);

const expandedRows = ref({});
const isTotalExpanded = ref(false);

const getRowKey = (item) => {
  return String(getValue(item, ['proveedor_id']) || getValue(item, ['proveedor_nombre']) || 'sin_proveedor');
};

const toggleRow = (key) => {
  expandedRows.value[key] = !expandedRows.value[key];
};

const drillDownFilter = ref({
  providerName: null,
  weekNumber: null,
  startDate: null,
  endDate: null
});

function drillDownToWeek(item, week) {
  const isTotalRow = !item;
  const providerName = isTotalRow ? null : getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor');
  
  drillDownFilter.value = {
    providerName,
    weekNumber: week.semana_numero,
    startDate: week.semana_inicio,
    endDate: week.semana_fin
  };
  
  const detailSection = document.querySelector('.detail-section');
  if (detailSection) {
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearDrillDown() {
  drillDownFilter.value = {
    providerName: null,
    weekNumber: null,
    startDate: null,
    endDate: null
  };
}
const activeFiltersCount = computed(() => {
  let count = 0;
  if (filters.proveedorId) count++;
  if (filters.transporteId) count++;
  if (filters.tipoMovimiento) count++;
  if (filters.modalidad) count++;
  if (filters.responsableId) count++;
  if (filters.paciente?.trim()) count++;
  if (localDetailFilters.value.cliente?.trim()) count++;
  if (localDetailFilters.value.destino?.trim()) count++;
  if (localDetailFilters.value.numeroGuia?.trim()) count++;
  if (localDetailFilters.value.proveedor?.trim()) count++;
  return count;
});
const detailViewMode = ref('detailed');
const detailLoading = ref(false);
const fullDetailRows = ref([]);
const detailPage = ref(1);
const detailPageSize = ref(10);
const detailPageSizeOptions = [10, 25, 50];
const localDetailFilters = ref({
  cliente: '',
  destino: '',
  numeroGuia: '',
  proveedor: '',
});
const cupoForm = ref({
  mes: '',
  proveedorId: null,
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

const defaultDate = () => new Date().toISOString().split('T')[0];

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

const getAdditionalData = (item) => {
  const raw = item?.datos_adicionales;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const firstNonEmptyText = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return '';
};

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const extractName = (val) => {
  if (!val) return '';
  if (typeof val === 'object') {
    return String(val.nombre || val.nombre_cliente || val.cliente_nombre || val.transporte_nombre || val.proveedor_nombre || val.nombre_proveedor || '').trim();
  }
  return String(val).trim();
};

const getClienteValue = (item) => firstNonEmptyText(
  extractName(getValue(item, ['cliente_nombre', 'cliente', 'nombre_cliente', 'cliente_referido'], '')),
  getAdditionalData(item).cliente_nombre,
);

const getProveedorValue = (item) => firstNonEmptyText(
  extractName(getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], '')),
  getAdditionalData(item).proveedor_nombre,
);

const getTransporteValue = (item) => firstNonEmptyText(
  extractName(getValue(item, ['transporte_nombre', 'transporte', 'operador_logistico', 'nombre_transporte'], '')),
  getAdditionalData(item).transporte_nombre,
);

const getNumeroGuiaValue = (item) => firstNonEmptyText(
  extractName(getValue(item, ['numero_guia', 'numero_factura', 'guia', 'remito'], '')),
  getAdditionalData(item).numero_guia,
);

const getDestinoValue = (item) => {
  const additional = getAdditionalData(item);
  const destinoTexto = firstNonEmptyText(
    extractName(getValue(item, ['destino_texto', 'destino', 'localidad', 'localidad_destino', 'provincia', 'provincia_nombre'], '')),
    additional.destino_texto,
  );
  const provincia = firstNonEmptyText(
    extractName(getValue(item, ['provincia_nombre', 'provincia'], '')),
    additional.provincia_nombre,
  );
  if (destinoTexto && provincia && !normalizeText(destinoTexto).includes(normalizeText(provincia))) {
    return `${destinoTexto} - ${provincia}`;
  }
  return destinoTexto || provincia || '';
};

const detailRowsSource = computed(() => fullDetailRows.value.length > 0 ? fullDetailRows.value : (dashboard.value?.detalle || []));
const detailRowsFiltered = computed(() => {
  const clienteFilter = normalizeText(localDetailFilters.value.cliente);
  const destinoFilter = normalizeText(localDetailFilters.value.destino);
  const guiaFilter = normalizeText(localDetailFilters.value.numeroGuia);
  const proveedorFilter = normalizeText(localDetailFilters.value.proveedor);

  const dd = drillDownFilter.value;

  return detailRowsSource.value.filter((item) => {
    // 1. Filtros locales del usuario
    const cliente = normalizeText(getClienteValue(item));
    const destino = normalizeText(getDestinoValue(item));
    const guia = normalizeText(getNumeroGuiaValue(item));
    const proveedor = normalizeText(getProveedorValue(item));
    if (clienteFilter && !cliente.includes(clienteFilter)) return false;
    if (destinoFilter && !destino.includes(destinoFilter)) return false;
    if (guiaFilter && !guia.includes(guiaFilter)) return false;
    if (proveedorFilter && !proveedor.includes(proveedorFilter)) return false;

    // 2. Filtros de Drill-Down por semana y proveedor
    if (dd.startDate && dd.endDate) {
      const itemFecha = item.fecha_gasto || item.fecha || '';
      if (!itemFecha) return false;
      const fString = String(itemFecha).slice(0, 10);
      if (fString < dd.startDate || fString > dd.endDate) return false;
    }
    
    if (dd.providerName) {
      const itemProv = getProveedorValue(item) || 'Sin proveedor';
      if (normalizeText(itemProv) !== normalizeText(dd.providerName)) return false;
    }

    return true;
  });
});

const detailTotalCount = computed(() => detailRowsFiltered.value.length);
const detailTotalPages = computed(() => Math.max(1, Math.ceil(detailTotalCount.value / detailPageSize.value)));
const detailOffset = computed(() => (detailPage.value - 1) * detailPageSize.value);
const detailResultFrom = computed(() => detailTotalCount.value === 0 ? 0 : detailOffset.value + 1);
const detailResultTo = computed(() => Math.min(detailOffset.value + detailPageSize.value, detailTotalCount.value));
const detailFilteredTotal = computed(() => detailRowsFiltered.value.reduce((total, item) => total + numberValue(getValue(item, ['monto', 'monto_total', 'total'], 0)), 0));
const paginatedDetailRows = computed(() => detailRowsFiltered.value.slice(detailOffset.value, detailOffset.value + detailPageSize.value));

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
const isAdmin = computed(() => userProfile.value?.rol === 'admin');
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

const parseDateOnly = (value) => {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

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

const buildWeeksForPeriod = (fechaDesde, fechaHasta) => {
  const start = parseDateOnly(fechaDesde);
  const end = parseDateOnly(fechaHasta);
  if (!start || !end || start > end) return [];

  const weeks = [];
  let weekStart = new Date(start);
  let index = 1;

  while (weekStart <= end) {
    const weekEnd = new Date(weekStart);
    const daysUntilSunday = weekEnd.getDay() === 0 ? 0 : 7 - weekEnd.getDay();
    weekEnd.setDate(weekStart.getDate() + daysUntilSunday);
    if (weekEnd > end) weekEnd.setTime(end.getTime());

    weeks.push({
      semana_numero: index,
      semana_inicio: isoDate(weekStart),
      semana_fin: isoDate(weekEnd),
    });

    weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() + 1);
    index += 1;
  }

  return weeks;
};

const normalizeWeekColumns = (weeks = []) => (Array.isArray(weeks) ? weeks : Object.values(weeks || {}))
  .map((week, index) => ({
    ...week,
    semana_numero: Number(week?.semana_numero || index + 1),
    semana_inicio: week?.semana_inicio,
    semana_fin: week?.semana_fin,
  }))
  .filter((week) => Number.isFinite(week.semana_numero))
  .sort((a, b) => a.semana_numero - b.semana_numero);

const weekColumns = computed(() => {
  const catalogWeeks = normalizeWeekColumns(backendWeekColumns.value);
  const periodWeeks = buildWeeksForPeriod(periodo.value.fecha_desde || filters.fechaDesde, periodo.value.fecha_hasta || filters.fechaHasta);

  if (periodWeeks.length === 0) {
    return catalogWeeks.length > 0 ? catalogWeeks : weekOptions.value.slice(1).map((item) => ({
      semana_numero: Number(String(item.code).replace('week-', '')),
      semana_inicio: item.start,
      semana_fin: item.end,
    }));
  }

  const catalogByNumber = new Map(catalogWeeks.map((week) => [Number(week.semana_numero), week]));
  return periodWeeks.map((periodWeek) => ({
    ...periodWeek,
    ...(catalogByNumber.get(Number(periodWeek.semana_numero)) || {}),
    semana_numero: periodWeek.semana_numero,
    semana_inicio: periodWeek.semana_inicio,
    semana_fin: periodWeek.semana_fin,
  }));
});

const controlProviderRows = computed(() => weeklyProviderRows.value);

const dateKey = (value) => value ? String(value).slice(0, 10) : '';

const findWeekData = (weeks = [], weekColumn) => {
  const sourceWeeks = Array.isArray(weeks) ? weeks : Object.values(weeks || {});
  return sourceWeeks.find((week) => {
    const sameNumber = week?.semana_numero !== null
      && week?.semana_numero !== undefined
      && Number(week.semana_numero) === Number(weekColumn.semana_numero);
    const sameRange = dateKey(week?.semana_inicio) === dateKey(weekColumn.semana_inicio)
      && dateKey(week?.semana_fin) === dateKey(weekColumn.semana_fin);
    return sameNumber || sameRange;
  });
};

const getWeekAmount = (item, week) => {
  const match = findWeekData(item?.semanas, week);
  return numberValue(match?.gasto_total);
};

const getWeekDispatches = (item, week) => {
  const match = findWeekData(item?.semanas, week);
  return numberValue(match?.despachos);
};

const computedWeeklyTotals = computed(() => {
  const semanas = weekColumns.value.map((week) => ({
    ...week,
    gasto_total: controlProviderRows.value.reduce((total, item) => total + getWeekAmount(item, week), 0),
    despachos: controlProviderRows.value.reduce((total, item) => total + getWeekDispatches(item, week), 0),
  }));
  const gastoTotalPeriodo = controlProviderRows.value.reduce((total, item) => total + numberValue(item.gasto_total_periodo), 0);
  const despachosPeriodo = controlProviderRows.value.reduce((total, item) => total + numberValue(item.despachos_periodo), 0);

  return {
    semanas,
    gasto_total_periodo: gastoTotalPeriodo,
    despachos_periodo: despachosPeriodo,
    promedio_por_despacho: despachosPeriodo > 0 ? gastoTotalPeriodo / despachosPeriodo : 0,
    cupo_mensual_total: weeklyTotals.value?.cupo_mensual_total,
    disponible_diferencia_total: weeklyTotals.value?.disponible_diferencia_total,
    porcentaje_consumido_total: weeklyTotals.value?.porcentaje_consumido_total,
  };
});

const displayWeeklyTotals = computed(() => {
  if (controlProviderRows.value.length > 0) return computedWeeklyTotals.value;

  const totals = weeklyTotals.value || {};
  const hasCompleteBackendTotals = Array.isArray(totals.semanas)
    && totals.semanas.length > 0
    && totals.gasto_total_periodo !== null
    && totals.gasto_total_periodo !== undefined
    && totals.despachos_periodo !== null
    && totals.despachos_periodo !== undefined;

  return hasCompleteBackendTotals ? totals : computedWeeklyTotals.value;
});

const getTotalWeekAmount = (week) => {
  const match = findWeekData(displayWeeklyTotals.value?.semanas, week);
  return numberValue(match?.gasto_total);
};

const getGastoId = (item) => getValue(item, ['gasto_id', 'id'], null);
const editableLogisticOrigins = new Set(['cuenta_corriente_empresa', 'rendicion', 'caja_chica']);

const normalizeOrigin = (value) => String(value || '').trim().toLowerCase().replaceAll(' ', '_');

const isEditableLogisticRow = (item) => {
  const rawValue = getValue(item, ['origen_gasto', 'modalidad_imputacion', 'modalidad'], '');
  return editableLogisticOrigins.has(normalizeOrigin(rawValue));
};

const canEditGastoLogistico = (item) => {
  return isAdmin.value
    && getGastoId(item)
    && isEditableLogisticRow(item);
};

function openEditGastoLogistico(item) {
  if (!isAdmin.value) {
    emit('show-notification', 'Sin permisos', 'No tenes permisos para editar este registro.', 'warning');
    return;
  }
  if (!canEditGastoLogistico(item)) {
    emit('show-notification', 'No editable', 'Este gasto no corresponde al contexto de encomiendas/logistica y no puede editarse desde esta pantalla.', 'warning');
    return;
  }
  gastoEnEdicion.value = {
    ...item,
    id: getGastoId(item),
    origen_gasto: getValue(item, ['origen_gasto', 'modalidad_imputacion', 'modalidad'], ''),
    fecha_gasto: getValue(item, ['fecha_gasto', 'fecha']),
    monto_total: getValue(item, ['monto_total', 'monto', 'total']),
    descripcion_general: getValue(item, ['descripcion_general', 'descripcion', 'detalle']),
    paciente_referido: getValue(item, ['paciente_referido', 'paciente', 'nombre_paciente']),
    tipo_movimiento_encomienda: getValue(item, ['tipo_movimiento_encomienda', 'tipo_movimiento']),
  };
  isEditModalOpen.value = true;
}

async function handleGastoLogisticoSaved() {
  emit('show-notification', 'Registro actualizado', 'Registro actualizado correctamente.', 'success');
  await refreshDashboardData();
}

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
  detailFilters: {
    cliente: localDetailFilters.value.cliente || 'Todos',
    destino: localDetailFilters.value.destino || 'Todos',
    numeroGuia: localDetailFilters.value.numeroGuia || 'Todos',
    proveedor: localDetailFilters.value.proveedor || 'Todos',
    vista: detailViewMode.value === 'simple' ? 'Simple' : 'Detallada',
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
  localDetailFilters.value = {
    cliente: '',
    destino: '',
    numeroGuia: '',
    proveedor: '',
  };
  detailPage.value = 1;
  clearDrillDown();
  await clearFilters();
}

async function refreshDetailRows() {
  detailLoading.value = true;
  try {
    const exportData = await fetchExportDashboard();
    fullDetailRows.value = exportData?.detalle || [];
  } catch (e) {
    console.error('Error cargando detalle completo de encomiendas:', e);
    fullDetailRows.value = dashboard.value?.detalle || [];
  } finally {
    detailLoading.value = false;
  }
}

async function refreshDashboardData() {
  await fetchDashboardBase();
  await refreshDetailRows();
}

async function applyFilters() {
  detailPage.value = 1;
  await applyDashboardFilters();
  await refreshDetailRows();
}

async function clearFilters() {
  detailPage.value = 1;
  await clearDashboardFilters();
  await refreshDetailRows();
}

function openBulkPaymentsModal(item = null) {
  const additional = getAdditionalData(item || {});
  seedPayment.value = item ? {
    fecha: String(getValue(item, ['fecha', 'fecha_gasto'], defaultDate())).slice(0, 10),
    cliente_id: getValue(item, ['cliente_id'], null),
    transporte_id: getValue(item, ['transporte_id'], null),
    provincia_id: getValue(item, ['provincia_id'], null),
    localidad_destino_id: getValue(item, ['localidad_destino_id'], null),
    destino_texto: getDestinoValue(item),
    descripcion: firstNonEmptyText(getValue(item, ['descripcion', 'descripcion_general', 'detalle'], ''), 'Pago de encomienda'),
    proveedor_id: getValue(item, ['proveedor_id'], null),
    numero_guia: firstNonEmptyText(getNumeroGuiaValue(item), getValue(item, ['numero_factura'], '')),
    observacion: firstNonEmptyText(additional.observacion_logistica, ''),
    tipo_movimiento_encomienda: firstNonEmptyText(getValue(item, ['tipo_movimiento', 'tipo_movimiento_encomienda'], ''), additional.tipo_movimiento_encomienda),
    encomienda_id: additional.encomienda_id || null,
    importe: numberValue(getValue(item, ['monto', 'monto_total', 'total'], 0)),
  } : null;
  isBulkModalOpen.value = true;
}

async function handleBulkPaymentsSaved() {
  await refreshDashboardData();
}

function handleDetailPageChange(page) {
  const nextPage = Math.min(Math.max(1, page), detailTotalPages.value);
  detailPage.value = nextPage;
}

function changeDetailPageSize(size) {
  detailPageSize.value = Number(size);
  detailPage.value = 1;
}

function handleLocalFilterInput() {
  detailPage.value = 1;
}

function buildDetailExportDashboard(baseDashboard) {
  const total = detailFilteredTotal.value;
  const count = detailTotalCount.value;
  return {
    ...baseDashboard,
    detalle: detailRowsFiltered.value,
    total_count: count,
    kpis: {
      ...(baseDashboard?.kpis || {}),
      gasto_total_periodo: total,
      cantidad_despachos: count,
      gasto_promedio_despacho: count > 0 ? total / count : 0,
    },
  };
}

function openCupoModal() {
  cupoMode.value = 'general';
  cupoForm.value = {
    mes: currentCupoMonth.value,
    proveedorId: null,
    cupoMensual: cupo.value.cupo_mensual !== null && cupo.value.cupo_mensual !== undefined ? String(cupo.value.cupo_mensual) : '',
    observaciones: cupo.value.observaciones || '',
  };
  isCupoModalOpen.value = true;
  fetchProviderCuposForMonth();
}

function closeCupoModal() {
  if (savingCupo.value) return;
  isCupoModalOpen.value = false;
}

async function fetchProviderCuposForMonth() {
  if (!cupoForm.value.mes) {
    providerCupos.value = [];
    return;
  }

  loadingProviderCupos.value = true;
  try {
    const { data, error: rpcError } = await supabase.rpc('get_cupos_encomiendas_proveedor_mensual', {
      p_mes: `${cupoForm.value.mes}-01`,
    });
    if (rpcError) throw rpcError;
    providerCupos.value = data || [];
  } catch (e) {
    console.error('Error cargando cupos por proveedor:', e);
    providerCupos.value = [];
    emit('show-notification', 'Error', 'No se pudieron cargar los cupos por proveedor del mes.', 'error');
  } finally {
    loadingProviderCupos.value = false;
  }
}

function handleCupoMonthChange() {
  fetchProviderCuposForMonth();
}

function switchCupoMode(mode) {
  cupoMode.value = mode;
  if (mode === 'general') {
    cupoForm.value.proveedorId = null;
    cupoForm.value.cupoMensual = cupo.value.cupo_mensual !== null && cupo.value.cupo_mensual !== undefined ? String(cupo.value.cupo_mensual) : '';
    cupoForm.value.observaciones = cupo.value.observaciones || '';
  } else {
    cupoForm.value.cupoMensual = '';
    cupoForm.value.observaciones = '';
  }
}

function editProviderCupo(item) {
  cupoMode.value = 'proveedor';
  cupoForm.value.proveedorId = item.proveedor_id;
  cupoForm.value.cupoMensual = item.cupo_mensual !== null && item.cupo_mensual !== undefined ? String(item.cupo_mensual) : '';
  cupoForm.value.observaciones = item.observaciones || '';
}

async function saveCupoMensual() {
  const monto = Number(cupoForm.value.cupoMensual);
  if (!cupoForm.value.mes) {
    emit('show-notification', 'Validación', 'El mes del cupo es obligatorio.', 'warning');
    return;
  }
  if (cupoMode.value === 'proveedor' && !cupoForm.value.proveedorId) {
    emit('show-notification', 'Validación', 'El proveedor es obligatorio para configurar un cupo por proveedor.', 'warning');
    return;
  }
  if (cupoForm.value.cupoMensual === '' || !Number.isFinite(monto) || monto < 0) {
    emit('show-notification', 'Validación', 'El cupo mensual debe ser un número mayor o igual a cero.', 'warning');
    return;
  }

  savingCupo.value = true;
  try {
    const rpcName = cupoMode.value === 'general'
      ? 'guardar_cupo_encomiendas_mensual'
      : 'guardar_cupo_encomiendas_proveedor_mensual';
    const params = {
      p_mes: `${cupoForm.value.mes}-01`,
      p_cupo_mensual: monto,
      p_observaciones: cupoForm.value.observaciones?.trim() || null,
    };
    if (cupoMode.value === 'proveedor') params.p_proveedor_id = cupoForm.value.proveedorId;

    const { error: rpcError } = await supabase.rpc(rpcName, params);

    if (rpcError) throw rpcError;
    emit('show-notification', 'Cupo actualizado', cupoMode.value === 'general' ? 'El cupo mensual general fue guardado.' : 'El cupo mensual por proveedor fue guardado.', 'success');
    if (cupoMode.value === 'proveedor') await fetchProviderCuposForMonth();
    else isCupoModalOpen.value = false;
    await refreshDashboardData();
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
    const exportData = buildDetailExportDashboard(await fetchExportDashboard());
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
    const exportData = buildDetailExportDashboard(await fetchExportDashboard());
    exportDashboardPdf(exportData, filterExportContext.value);
    emit('show-notification', 'PDF generado', 'El reporte ejecutivo de encomiendas fue descargado.', 'success');
  } catch (e) {
    console.error('Error exportando PDF de encomiendas:', e);
    emit('show-notification', 'Error', 'No se pudo generar el PDF de encomiendas.', 'error');
  } finally {
    exportingPdf.value = false;
  }
}

const selectedGastoIds = ref([]);
const bulkFields = ref({
  proveedorId: null,
  transporteId: null,
  tipoMovimiento: null,
  isSurgeryLogistics: false,
});
const savingBulk = ref(false);

const isAllSelected = computed(() => {
  const pageIds = paginatedDetailRows.value.map(getGastoId).filter(Boolean);
  if (pageIds.length === 0) return false;
  return pageIds.every(id => selectedGastoIds.value.includes(id));
});

const toggleSelectAll = (e) => {
  const pageIds = paginatedDetailRows.value.map(getGastoId).filter(Boolean);
  if (e.target.checked) {
    pageIds.forEach(id => {
      if (!selectedGastoIds.value.includes(id)) {
        selectedGastoIds.value.push(id);
      }
    });
  } else {
    selectedGastoIds.value = selectedGastoIds.value.filter(id => !pageIds.includes(id));
  }
};

async function applyBulkUpdates() {
  if (selectedGastoIds.value.length === 0) return;
  
  const payload = {};
  if (bulkFields.value.isSurgeryLogistics) {
    payload.proveedor_id = 14;
  } else if (bulkFields.value.proveedorId) {
    payload.proveedor_id = bulkFields.value.proveedorId;
  }
  
  if (bulkFields.value.transporteId) {
    payload.transporte_id = bulkFields.value.transporteId;
  }
  
  if (bulkFields.value.tipoMovimiento) {
    payload.tipo_movimiento_encomienda = bulkFields.value.tipoMovimiento;
  }
  
  if (Object.keys(payload).length === 0) {
    emit('show-notification', 'Sin cambios', 'Selecciona al menos un campo para modificar.', 'warning');
    return;
  }
  
  savingBulk.value = true;
  try {
    const { error } = await supabase
      .from('gastos')
      .update(payload)
      .in('id', selectedGastoIds.value);
      
    if (error) throw error;
    
    emit('show-notification', 'Actualización masiva exitosa', `Se actualizaron ${selectedGastoIds.value.length} registros correctamente.`, 'success');
    
    selectedGastoIds.value = [];
    bulkFields.value = {
      proveedorId: null,
      transporteId: null,
      tipoMovimiento: null,
      isSurgeryLogistics: false,
    };
    
    await refreshDashboardData();
  } catch (e) {
    console.error('Error al aplicar actualización masiva:', e);
    emit('show-notification', 'Error', `No se pudieron actualizar los registros: ${e.message}`, 'error');
  } finally {
    savingBulk.value = false;
  }
}

onMounted(async () => {
  await Promise.all([fetchFilterOptions(), refreshDashboardData()]);
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

    <div v-else class="space-y-4">
      <section class="section-header">
        <div>
          <h2 class="text-2xl font-bold tracking-tight text-slate-900">Encomiendas / Costos Logísticos</h2>
          <p class="mt-1 text-sm font-medium text-slate-600">Control y análisis de costos logísticos por proveedor</p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span class="period-badge">{{ currentPeriodLabel }}</span>
          <button v-if="isAdmin" type="button" class="btn-primary inline-flex items-center justify-center gap-2" @click="openBulkPaymentsModal()">
            Cargar pagos
          </button>
          <button type="button" class="btn-secondary inline-flex items-center justify-center gap-2" @click="isCtaCteModalOpen = true">
            Vencimientos Cta. Cte.
          </button>
          <button type="button" class="btn-secondary inline-flex items-center justify-center gap-2" :disabled="loading || exporting" @click="handleExport">
            <ArrowDownTrayIcon class="h-5 w-5" />
            {{ exporting ? 'Exportando...' : 'Exportar Excel' }}
          </button>
          <button type="button" class="btn-secondary inline-flex items-center justify-center gap-2" :disabled="loading || exportingPdf" @click="handleExportPdf">
            {{ exportingPdf ? 'Exportando...' : 'Exportar PDF' }}
          </button>
        </div>
      </section>

      <!-- Banner de Redirección a la Nueva Ventana Operativa -->
      <div class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <TruckIcon class="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <h4 class="text-sm font-bold text-indigo-900">Módulo Operativo de Transportes y Movimientos Activo</h4>
            <p class="text-xs text-indigo-700 mt-0.5">
              Se ha habilitado la nueva ventana operativa completa con paginación, control semanal por acordeón y libro mayor de cuentas corrientes.
            </p>
          </div>
        </div>
        <router-link to="/admin/movimientos-transporte" class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 shrink-0">
          <span>Ir a Transportes y Movimientos</span>
          <ArrowRightIcon class="h-4 w-4" />
        </router-link>
      </div>

      <section class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 gap-6 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <!-- Bloque 1: Resumen de Operación -->
        <div class="flex flex-col justify-between space-y-2 pb-4 lg:pb-0 lg:pr-6">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500">Resumen de Operación</h3>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <span class="block text-[11px] font-medium text-slate-500">Gasto Total</span>
              <span class="text-base font-extrabold text-slate-900 leading-tight block mt-0.5">{{ formatCurrency(kpis.gasto_total_periodo || 0) }}</span>
            </div>
            <div>
              <span class="block text-[11px] font-medium text-slate-500">Despachos</span>
              <span class="text-base font-extrabold text-slate-900 leading-tight block mt-0.5">{{ kpis.cantidad_despachos || 0 }}</span>
            </div>
            <div>
              <span class="block text-[11px] font-medium text-slate-500">Promedio</span>
              <span class="text-base font-extrabold text-slate-950 leading-tight block mt-0.5 text-slate-800">{{ formatCurrency(kpis.gasto_promedio_despacho || 0) }}</span>
            </div>
          </div>
        </div>

        <!-- Bloque 2: Modalidad de Imputación -->
        <div class="flex flex-col justify-between space-y-2 py-4 lg:py-0 lg:px-6">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500">Modalidades de Pago</h3>
          <div class="space-y-1.5 text-[11px]">
            <div class="flex justify-between items-center">
              <span class="text-slate-600 font-medium">Cuenta Corriente:</span>
              <span class="font-bold text-slate-900">{{ formatCurrency(kpis.total_cuenta_corriente || 0) }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-600 font-medium">Rendiciones:</span>
              <span class="font-bold text-slate-900">{{ formatCurrency(kpis.total_rendicion || 0) }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-600 font-medium">Caja Chica:</span>
              <span class="font-bold text-slate-900">{{ formatCurrency(kpis.total_caja_chica || 0) }}</span>
            </div>
          </div>
        </div>

        <!-- Bloque 3: Límite y Cupo -->
        <div class="flex flex-col justify-between space-y-2 pt-4 lg:pt-0 lg:pl-6">
          <div class="flex justify-between items-center">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500">Cupo Mensual</h3>
            <button type="button" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors" @click="openCupoModal">Ajustar Cupo</button>
          </div>
          <div v-if="!isCupoConfigurado" class="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md w-fit">Cupo no configurado</div>
          <div v-else class="space-y-1 text-xs">
            <div class="flex justify-between font-medium">
              <span class="text-slate-500 text-[11px]">Consumido: <span class="font-bold text-slate-800">{{ formatCurrency(cupo.consumido || 0) }}</span></span>
              <span class="text-slate-500 text-[11px]">Límite: <span class="font-bold text-slate-800">{{ formatCurrency(cupo.cupo_mensual || 0) }}</span></span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full transition-all" :class="progressBarClass" :style="{ width: `${porcentajeCupo}%` }" />
            </div>
            <div class="flex justify-between text-[11px] mt-0.5">
              <span class="text-slate-600 font-medium">Disponible: <span class="font-bold" :class="cupo.disponible < 0 ? 'text-red-600':'text-emerald-600'">{{ formatCurrency(cupo.disponible || 0) }}</span></span>
              <span class="font-semibold text-slate-800">{{ porcentajeCupo.toFixed(1) }}%</span>
            </div>
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
              <template v-for="item in controlProviderRows" :key="getRowKey(item)">
                <tr class="data-row">
                  <td class="table-cell">
                    <div class="flex items-center gap-2 cursor-pointer select-none" @click="toggleRow(getRowKey(item))">
                      <svg class="h-4 w-4 transform transition-transform text-slate-400" :class="{'rotate-90': expandedRows[getRowKey(item)]}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                      <span :class="textToneClass(getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor'))">
                        {{ getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor') }}
                      </span>
                    </div>
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
                <!-- Detalle semanal expandido por proveedor -->
                <tr v-if="expandedRows[getRowKey(item)]">
                  <td colspan="8" class="bg-slate-50/50 p-4 border-b border-slate-200 shadow-inner">
                    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                      <div 
                        v-for="week in weekColumns" 
                        :key="week.semana_numero" 
                        class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-400 hover:shadow transition-all cursor-pointer active:scale-95 group"
                        @click="drillDownToWeek(item, week)"
                        title="Ver detalles de esta semana"
                      >
                        <div>
                          <div class="flex justify-between items-start">
                            <span class="block text-[10px] font-bold text-slate-500 uppercase">Semana {{ week.semana_numero }}</span>
                            <span class="text-[9px] font-semibold text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">Ver →</span>
                          </div>
                          <span class="block text-[10px] text-slate-400 mt-0.5">
                            {{ formatDate(week.semana_inicio, { day: '2-digit', month: '2-digit' }) }} - {{ formatDate(week.semana_fin, { day: '2-digit', month: '2-digit' }) }}
                          </span>
                        </div>
                        <div class="mt-2 flex justify-between items-baseline">
                          <span class="text-sm font-bold text-slate-900">{{ formatCurrency(getWeekAmount(item, week)) }}</span>
                          <span class="text-[10px] font-medium text-slate-500">({{ getWeekDispatches(item, week) }} desp.)</span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>

              <!-- Fila de Totales -->
              <tr v-if="controlProviderRows.length > 0 || weeklyTotals" class="total-row">
                <td class="table-cell">
                  <div class="flex items-center gap-2 cursor-pointer select-none" @click="isTotalExpanded = !isTotalExpanded">
                    <svg class="h-4 w-4 transform transition-transform text-slate-600" :class="{'rotate-90': isTotalExpanded}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <span class="font-bold text-slate-900">TOTAL</span>
                  </div>
                </td>
                <td class="table-cell money-cell">{{ formatCurrency(displayWeeklyTotals.gasto_total_periodo) }}</td>
                <td class="table-cell numeric-cell">{{ numberValue(displayWeeklyTotals.despachos_periodo).toLocaleString('es-AR') }}</td>
                <td class="table-cell money-cell">{{ formatCurrency(displayWeeklyTotals.promedio_por_despacho) }}</td>
                <td class="table-cell money-cell">{{ formatNullableCurrency(displayWeeklyTotals.cupo_mensual_total) }}</td>
                <td class="table-cell text-right" :class="differenceClass(displayWeeklyTotals.disponible_diferencia_total)">{{ formatNullableCurrency(displayWeeklyTotals.disponible_diferencia_total) }}</td>
                <td class="table-cell min-w-32">
                  <div v-if="displayWeeklyTotals.porcentaje_consumido_total !== null && displayWeeklyTotals.porcentaje_consumido_total !== undefined" class="space-y-1">
                    <div class="text-right font-semibold text-slate-800">{{ numberValue(displayWeeklyTotals.porcentaje_consumido_total).toFixed(2) }}%</div>
                    <div class="h-1.5 rounded-full bg-slate-200"><div class="h-full rounded-full bg-slate-500" :style="{ width: percentWidth(displayWeeklyTotals.porcentaje_consumido_total) }"></div></div>
                  </div>
                  <span v-else class="block text-right text-slate-500">—</span>
                </td>
                <td class="table-cell text-center text-slate-500">—</td>
              </tr>
              <!-- Detalle semanal expandido de Totales -->
              <tr v-if="isTotalExpanded && (controlProviderRows.length > 0 || weeklyTotals)">
                <td colspan="8" class="bg-slate-100/50 p-4 border-b-2 border-slate-300 shadow-inner">
                  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    <div 
                      v-for="week in weekColumns" 
                      :key="week.semana_numero" 
                      class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-400 hover:shadow transition-all cursor-pointer active:scale-95 group"
                      @click="drillDownToWeek(null, week)"
                      title="Ver detalles consolidados de esta semana"
                    >
                      <div>
                        <div class="flex justify-between items-start">
                          <span class="block text-[10px] font-bold text-slate-600 uppercase">Total Semana {{ week.semana_numero }}</span>
                          <span class="text-[9px] font-semibold text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">Ver →</span>
                        </div>
                        <span class="block text-[10px] text-slate-400 mt-0.5">
                          {{ formatDate(week.semana_inicio, { day: '2-digit', month: '2-digit' }) }} - {{ formatDate(week.semana_fin, { day: '2-digit', month: '2-digit' }) }}
                        </span>
                      </div>
                      <div class="mt-2 flex justify-between items-baseline">
                        <span class="text-sm font-bold text-slate-900">{{ formatCurrency(getTotalWeekAmount(week)) }}</span>
                        <span class="text-[10px] font-semibold text-slate-500">
                          ({{ controlProviderRows.reduce((total, item) => total + getWeekDispatches(item, week), 0) }} desp.)
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>

              <tr v-if="controlProviderRows.length === 0"><td colspan="8" class="empty-cell">Sin datos por proveedor para el período seleccionado.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section-container detail-section">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="section-title">Pagos asociados</h2>
            <p class="text-sm font-medium text-slate-600">Vista operativa y detallada de pagos logísticos asociados a encomiendas.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" :class="{ 'is-view-active': detailViewMode === 'simple' }" @click="detailViewMode = 'simple'">Vista simple</button>
            <button type="button" class="btn-secondary" :class="{ 'is-view-active': detailViewMode === 'detailed' }" @click="detailViewMode = 'detailed'">Vista detallada</button>
          </div>
        </div>

        <!-- Banner de Filtro Activo de Drill-Down -->
        <div v-if="drillDownFilter.startDate && drillDownFilter.endDate" class="mt-4 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="bg-indigo-600 text-white rounded-lg p-1.5 flex items-center justify-center">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </span>
            <div>
              <h4 class="text-xs font-bold text-indigo-900 uppercase tracking-wider">Filtro de Selección Activo</h4>
              <p class="text-xs text-indigo-700 font-semibold mt-0.5">
                Mostrando detalles de: 
                <span class="font-extrabold underline">{{ drillDownFilter.providerName || 'Todos los proveedores' }}</span> 
                — Semana {{ drillDownFilter.weekNumber }} 
                ({{ formatDate(drillDownFilter.startDate, { day: '2-digit', month: '2-digit' }) }} al {{ formatDate(drillDownFilter.endDate, { day: '2-digit', month: '2-digit' }) }})
              </p>
            </div>
          </div>
          <button 
            type="button" 
            class="text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors shadow-sm"
            @click="clearDrillDown"
          >
            Quitar Filtro Masivo
          </button>
        </div>

        <!-- Panel de Filtros Colapsables -->
        <div class="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-sm">
          <button 
            type="button" 
            class="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            @click="showFilters = !showFilters"
          >
            <FunnelIcon class="h-4 w-4 text-slate-500" />
            {{ showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros de Búsqueda' }}
            <span v-if="activeFiltersCount > 0" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700">
              {{ activeFiltersCount }}
            </span>
          </button>
          
          <div class="flex gap-2">
            <button type="button" class="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors" @click="handleClearFilters">Limpiar Filtros</button>
            <button type="button" class="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm" @click="applyFilters">
              Aplicar filtros
            </button>
          </div>
        </div>

        <div v-show="showFilters" class="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4 shadow-inner">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div><label class="form-label text-[11px]">Fecha desde</label><input v-model="filters.fechaDesde" type="date" class="form-input mt-1" @change="clearSelectedWeek" /></div>
            <div><label class="form-label text-[11px]">Fecha hasta</label><input v-model="filters.fechaHasta" type="date" class="form-input mt-1" @change="clearSelectedWeek" /></div>
            <div>
              <label class="form-label text-[11px]">Semana</label>
              <select v-model="selectedWeek" class="form-input mt-1" @change="handleWeekChange">
                <option v-for="option in weekOptions" :key="option.code || 'all-weeks'" :value="option.code">{{ option.label }}</option>
              </select>
            </div>
            <div><label class="form-label text-[11px]">Proveedor / Empresa vinculada</label><v-select v-model="filters.proveedorId" :options="proveedorOptions" :loading="loadingFilterOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter bg-white mt-1" /></div>
            <div><label class="form-label text-[11px]">Operador logístico</label><v-select v-model="filters.transporteId" :options="transporteOptions" :loading="loadingFilterOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter bg-white mt-1" /></div>
            <div><label class="form-label text-[11px]">Tipo de movimiento</label><v-select v-model="filters.tipoMovimiento" :options="tipoMovimientoOptions" :reduce="option => option.code" :clearable="false" class="v-select-filter bg-white mt-1" /></div>
            <div><label class="form-label text-[11px]">Modalidad de imputación</label><v-select v-model="filters.modalidad" :options="modalidadOptions" :reduce="option => option.code" :clearable="false" class="v-select-filter bg-white mt-1" /></div>
            <div><label class="form-label text-[11px]">Responsable</label><v-select v-model="filters.responsableId" :options="props.perfilesOptions" :loading="props.loadingOptions" :reduce="option => option.code" placeholder="Todos" class="v-select-filter bg-white mt-1" /></div>
            <div class="xl:col-span-2"><label class="form-label text-[11px]">Paciente / texto de búsqueda</label><input v-model="filters.paciente" type="text" class="form-input mt-1" placeholder="Buscar en paciente o detalle" @keyup.enter="applyFilters" /></div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 border-t border-slate-200/60 pt-4">
            <div><label class="form-label text-[11px]">Cliente (Filtro local)</label><input v-model="localDetailFilters.cliente" type="text" class="form-input mt-1" placeholder="Filtrar cliente" @input="handleLocalFilterInput" /></div>
            <div><label class="form-label text-[11px]">Destino (Filtro local)</label><input v-model="localDetailFilters.destino" type="text" class="form-input mt-1" placeholder="Filtrar destino" @input="handleLocalFilterInput" /></div>
            <div><label class="form-label text-[11px]">N° guía (Filtro local)</label><input v-model="localDetailFilters.numeroGuia" type="text" class="form-input mt-1" placeholder="Filtrar guía" @input="handleLocalFilterInput" /></div>
            <div><label class="form-label text-[11px]">Proveedor en detalle (Filtro local)</label><input v-model="localDetailFilters.proveedor" type="text" class="form-input mt-1" placeholder="Filtrar proveedor" @input="handleLocalFilterInput" /></div>
          </div>
          
          <div v-if="selectedWeekOption" class="mt-2 text-xs font-semibold text-slate-600 bg-slate-100/50 p-2 rounded-lg w-fit">
            Semana seleccionada: {{ formatDate(selectedWeekOption.start, { day: '2-digit', month: '2-digit' }) }}-{{ formatDate(selectedWeekOption.end, { day: '2-digit', month: '2-digit' }) }}
          </div>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div class="detail-summary"><span>Pagos cargados</span><strong>{{ detailTotalCount.toLocaleString('es-AR') }}</strong></div>
          <div class="detail-summary"><span>Mostrando</span><strong>{{ detailResultFrom }}-{{ detailResultTo }}</strong></div>
          <div class="detail-summary"><span>Total filtrado</span><strong>{{ formatCurrency(detailFilteredTotal) }}</strong></div>
          <div class="detail-summary"><span>Vista activa</span><strong>{{ detailViewMode === 'simple' ? 'Simple' : 'Detallada' }}</strong></div>
        </div>

        <div v-if="detailLoading" class="mt-6 rounded-lg border border-slate-200 bg-slate-50 py-10 text-center text-sm font-medium text-slate-600">Actualizando detalle logístico…</div>
        <div v-else-if="emptyDashboard && detailTotalCount === 0" class="mt-6 rounded-lg border border-slate-200 bg-slate-50 py-10 text-center text-sm font-medium text-slate-600">No hay operaciones de encomiendas para los filtros seleccionados.</div>

        <div v-else class="mt-6 overflow-x-auto">
          <table class="data-table min-w-full">
            <thead>
              <tr>
                <th v-if="isAdmin" class="table-header w-10 text-center">
                  <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                </th>
                <th class="table-header">Fecha</th>
                <th v-if="detailViewMode === 'detailed'" class="table-header">Cliente</th>
                <th v-if="detailViewMode === 'detailed'" class="table-header">Proveedor</th>
                <th class="table-header">Operador logístico</th>
                <th v-if="detailViewMode === 'detailed'" class="table-header">Destino</th>
                <th v-if="detailViewMode === 'detailed'" class="table-header">N° guía</th>
                <th class="table-header">Descripción</th>
                <th v-if="detailViewMode === 'simple'" class="table-header">Cliente</th>
                <th class="table-header text-right">Monto</th>
                <th v-if="isAdmin" class="table-header text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in paginatedDetailRows" :key="getValue(item, ['gasto_id', 'id', 'fecha'])" class="data-row detail-row">
                <td v-if="isAdmin" class="table-cell text-center">
                  <input type="checkbox" :value="getGastoId(item)" v-model="selectedGastoIds" class="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                </td>
                <td class="table-cell font-medium text-slate-800">{{ formatDate(getValue(item, ['fecha', 'fecha_gasto', 'created_at'])) }}</td>
                <td v-if="detailViewMode === 'detailed'" class="table-cell" :class="textToneClass(getClienteValue(item) || 'N/A')">{{ getClienteValue(item) || 'N/A' }}</td>
                <td v-if="detailViewMode === 'detailed'" class="table-cell" :class="textToneClass(getProveedorValue(item) || 'N/A')">{{ getProveedorValue(item) || 'N/A' }}</td>
                <td class="table-cell" :class="textToneClass(getTransporteValue(item) || 'N/A')">{{ getTransporteValue(item) || 'N/A' }}</td>
                <td v-if="detailViewMode === 'detailed'" class="table-cell" :class="textToneClass(getDestinoValue(item) || 'N/A')">{{ getDestinoValue(item) || 'N/A' }}</td>
                <td v-if="detailViewMode === 'detailed'" class="table-cell" :class="textToneClass(getNumeroGuiaValue(item) || 'N/A')">{{ getNumeroGuiaValue(item) || 'N/A' }}</td>
                <td class="table-cell max-w-xs truncate" :class="textToneClass(getValue(item, ['descripcion', 'descripcion_general', 'detalle'], 'N/A'))">{{ getValue(item, ['descripcion', 'descripcion_general', 'detalle'], 'N/A') }}</td>
                <td v-if="detailViewMode === 'simple'" class="table-cell" :class="textToneClass(getClienteValue(item) || 'N/A')">{{ getClienteValue(item) || 'N/A' }}</td>
                <td class="table-cell money-cell">{{ formatCurrency(getValue(item, ['monto', 'monto_total', 'total'])) }}</td>
                <td v-if="isAdmin" class="table-cell text-right">
                  <div class="flex justify-end gap-2">
                    <button type="button" class="edit-button secondary" @click="openBulkPaymentsModal(item)">Usar base</button>
                    <button v-if="canEditGastoLogistico(item)" type="button" class="edit-button" @click="openEditGastoLogistico(item)">
                      Editar
                    </button>
                    <span v-else class="self-center text-slate-400">-</span>
                  </div>
                </td>
              </tr>
              <tr v-if="paginatedDetailRows.length === 0">
                <td :colspan="isAdmin ? (detailViewMode === 'simple' ? 7 : 10) : (detailViewMode === 'simple' ? 5 : 8)" class="empty-cell">
                  Sin operaciones para mostrar.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" class="pagination-button" :disabled="detailPage <= 1 || detailLoading" @click="handleDetailPageChange(detailPage - 1)">Anterior</button>
          <div class="flex items-center justify-center gap-3 text-center text-sm font-semibold text-slate-700">
            <span>Página {{ detailPage }} de {{ detailTotalPages }}</span>
            <label class="flex items-center gap-2">
              <span>Filas</span>
              <select :value="detailPageSize" class="form-input !mt-0 w-24" @change="changeDetailPageSize($event.target.value)">
                <option v-for="size in detailPageSizeOptions" :key="size" :value="size">{{ size }}</option>
              </select>
            </label>
          </div>
          <button type="button" class="pagination-button" :disabled="detailPage >= detailTotalPages || detailLoading" @click="handleDetailPageChange(detailPage + 1)">Siguiente</button>
        </div>
      </section>
    </div>

    <Transition name="modal-fade">
      <div v-if="isCupoModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="closeCupoModal">
        <div class="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
          <div class="flex items-start justify-between border-b border-slate-200 p-5">
            <div>
              <h3 class="text-lg font-bold text-slate-900">Ajustar cupo mensual</h3>
              <p class="mt-1 text-sm font-medium text-slate-600">Configuración del límite mensual para encomiendas.</p>
            </div>
            <button type="button" class="rounded-md p-2 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800" :disabled="savingCupo" @click="closeCupoModal">×</button>
          </div>

          <form class="space-y-5 p-5" @submit.prevent="saveCupoMensual">
            <div>
              <label class="form-label">Tipo de cupo</label>
              <div class="mt-1 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                <button type="button" class="cupo-mode-button" :class="{ 'is-active': cupoMode === 'general' }" @click="switchCupoMode('general')">Cupo general</button>
                <button type="button" class="cupo-mode-button" :class="{ 'is-active': cupoMode === 'proveedor' }" @click="switchCupoMode('proveedor')">Cupo por proveedor</button>
              </div>
            </div>
            <div>
              <label class="form-label">Mes / Año <span class="text-red-500">*</span></label>
              <input v-model="cupoForm.mes" type="month" required class="form-input mt-1" @change="handleCupoMonthChange" />
            </div>
            <div v-if="cupoMode === 'proveedor'">
              <label class="form-label">Proveedor <span class="text-red-500">*</span></label>
              <v-select v-model="cupoForm.proveedorId" :options="proveedorOptions" :reduce="option => option.code" :loading="loadingFilterOptions" placeholder="Buscar proveedor" class="v-select-filter bg-white" />
            </div>
            <div>
              <label class="form-label">Cupo mensual <span class="text-red-500">*</span></label>
              <input v-model="cupoForm.cupoMensual" type="number" min="0" step="0.01" required class="form-input mt-1" placeholder="0,00" />
            </div>
            <div>
              <label class="form-label">Observaciones</label>
              <textarea v-model="cupoForm.observaciones" rows="3" class="form-input mt-1" placeholder="Comentario opcional sobre el cupo"></textarea>
            </div>

            <div v-if="cupoMode === 'proveedor'" class="rounded-lg border border-slate-200">
              <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h4 class="text-sm font-bold text-slate-800">Cupos por proveedor configurados para {{ cupoForm.mes || 'el mes seleccionado' }}</h4>
                <span v-if="loadingProviderCupos" class="text-xs font-semibold text-slate-500">Cargando...</span>
              </div>
              <div class="max-h-56 overflow-y-auto">
                <table class="min-w-full">
                  <thead>
                    <tr>
                      <th class="table-header">Proveedor</th>
                      <th class="table-header text-right">Cupo mensual</th>
                      <th class="table-header">Observación</th>
                      <th class="table-header text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in providerCupos" :key="item.id || `${item.proveedor_id}-${item.mes}`" class="data-row">
                      <td class="table-cell font-medium text-slate-800">{{ item.proveedor_nombre }}</td>
                      <td class="table-cell money-cell">{{ formatCurrency(item.cupo_mensual) }}</td>
                      <td class="table-cell max-w-xs truncate text-slate-600">{{ item.observaciones || '—' }}</td>
                      <td class="table-cell text-right">
                        <button type="button" class="text-sm font-semibold text-indigo-600 hover:text-indigo-800" @click="editProviderCupo(item)">Editar</button>
                      </td>
                    </tr>
                    <tr v-if="!loadingProviderCupos && providerCupos.length === 0">
                      <td colspan="4" class="empty-cell">No hay cupos por proveedor configurados para este mes.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button type="button" class="btn-secondary" :disabled="savingCupo" @click="closeCupoModal">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="savingCupo">{{ savingCupo ? 'Guardando...' : 'Guardar cupo' }}</button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- Barra flotante de acciones en lote (Bulk Actions) -->
    <Transition name="slide-up">
      <div v-if="selectedGastoIds.length > 0" 
           class="fixed bottom-6 left-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex flex-col md:flex-row items-center gap-4 border border-slate-700 max-w-5xl w-[92%] md:w-auto transform -translate-x-1/2">
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="bg-indigo-600 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
            {{ selectedGastoIds.length }}
          </span>
          <span class="text-xs font-bold uppercase tracking-wider text-slate-300">Seleccionados</span>
        </div>
        
        <div class="h-6 w-px bg-slate-700 hidden md:block"></div>
        
        <div class="flex flex-wrap items-center gap-3 w-full md:w-auto justify-center">
          <!-- Cambiar Proveedor -->
          <div class="w-44 text-slate-900 text-xs">
            <v-select 
              v-model="bulkFields.proveedorId" 
              :options="proveedorOptions" 
              :reduce="option => option.code" 
              placeholder="Cambiar Proveedor" 
              class="v-select-filter bg-white rounded-md"
            />
          </div>

          <!-- Cambiar Operador Logístico -->
          <div class="w-44 text-slate-900 text-xs">
            <v-select 
              v-model="bulkFields.transporteId" 
              :options="transporteOptions" 
              :reduce="option => option.code" 
              placeholder="Cambiar Operador" 
              class="v-select-filter bg-white rounded-md"
            />
          </div>

          <!-- Tipo Movimiento -->
          <div class="w-32 text-slate-900 text-xs">
            <v-select 
              v-model="bulkFields.tipoMovimiento" 
              :options="[
                { label: 'Envío', code: 'Envío' },
                { label: 'Recepción', code: 'Recepción' }
              ]" 
              :reduce="option => option.code" 
              placeholder="Movimiento" 
              class="v-select-filter bg-white rounded-md"
            />
          </div>

          <!-- Marcar como Cirugía -->
          <label class="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
            <input 
              type="checkbox" 
              v-model="bulkFields.isSurgeryLogistics" 
              class="rounded text-indigo-500 focus:ring-indigo-400 focus:ring-offset-slate-900 border-slate-600 bg-slate-800" 
            />
            ¿Es Cirugía?
          </label>
        </div>

        <div class="h-6 w-px bg-slate-700 hidden md:block"></div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <button 
            type="button" 
            class="text-xs text-slate-400 hover:text-white font-bold px-3 py-1.5 transition-colors" 
            @click="selectedGastoIds = []"
          >
            Cancelar
          </button>
          <button 
            type="button" 
            class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-md flex items-center gap-1.5 disabled:opacity-50"
            :disabled="savingBulk || (!bulkFields.proveedorId && !bulkFields.transporteId && !bulkFields.tipoMovimiento && !bulkFields.isSurgeryLogistics)"
            @click="applyBulkUpdates"
          >
            {{ savingBulk ? 'Aplicando...' : 'Aplicar' }}
          </button>
        </div>
      </div>
    </Transition>

    <AdminEditarGastoCuentaCorrienteModal
      v-model="isEditModalOpen"
      :gasto="gastoEnEdicion"
      :proveedores="proveedorOptions"
      :transportes="transporteOptions"
      :loading-options="loadingFilterOptions"
      @saved="handleGastoLogisticoSaved"
    />

    <EncomiendasBulkPaymentsModal
      v-model="isBulkModalOpen"
      :seed-payment="seedPayment"
      @saved="handleBulkPaymentsSaved"
      @show-notification="(...args) => emit('show-notification', ...args)"
    />

    <AdminCtaCteVencimientosModal
      v-model="isCtaCteModalOpen"
      @show-notification="(...args) => emit('show-notification', ...args)"
    />
  </div>
</template>

<style scoped>
.section-header { @apply flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between; }
.period-badge { @apply inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700; }
.cupo-mode-button { @apply rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-white/70; }
.cupo-mode-button.is-active { @apply bg-white text-slate-900 shadow-sm; }
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
.edit-button { @apply inline-flex items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 hover:text-indigo-900; }
.edit-button.secondary { @apply border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900; }
.btn-secondary.is-view-active { @apply border-indigo-300 bg-indigo-50 text-indigo-700; }

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }

.btn-primary { @apply inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50; }
.btn-secondary { @apply inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50; }

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.25s ease-out;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 50px);
}
</style>
