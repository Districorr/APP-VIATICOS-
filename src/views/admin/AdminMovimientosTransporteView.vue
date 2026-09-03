<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import VueMultiselect from 'vue-multiselect';
import 'vue-multiselect/dist/vue-multiselect.css';
import { LMap, LTileLayer, LMarker, LTooltip } from "@vue-leaflet/vue-leaflet";
import L from 'leaflet';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip as ChartTooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { useExcelExporter } from '../../composables/useExcelExporter.js';
import { getProveedorLabel, isLogisticaCirugia } from '../../utils/logisticaHelpers.js';

// Componentes y Modales
import MovimientoLogisticoForm from '../../components/admin/logistica/MovimientoLogisticoForm.vue';
import EncomiendasBulkPaymentsModal from '../../components/admin/EncomiendasBulkPaymentsModal.vue';
import AdminEditarGastoCuentaCorrienteModal from '../../components/admin/AdminEditarGastoCuentaCorrienteModal.vue';
import AdminCtaCteVencimientosModal from '../../components/admin/AdminCtaCteVencimientosModal.vue';
import ToastNotification from '../../components/ToastNotification.vue';

// Iconos
import {
  TruckIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  PlusIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PrinterIcon,
  ArrowRightIcon,
  InformationCircleIcon,
  TrashIcon,
  UserIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  MapPinIcon,
  ScaleIcon,
  SparklesIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';
import { useLogisticaPdfExportVariants } from '../../composables/useLogisticaPdfExportVariants.js';
import { normalizeProveedor, normalizeTransporte, getProveedorBadgeColor } from '../../utils/logisticaHelpers.js';
import { calculateConciliacionSummary, formatPercent } from '../../utils/conciliacionHelpers.js';
import { useConciliacionPDF } from '../../composables/useConciliacionPDF.js';
import ReporteConsolidadoModal from '../../components/admin/logistica/ReporteConsolidadoModal.vue';

ChartJS.register(Title, ChartTooltip, Legend, BarElement, CategoryScale, LinearScale);

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'leaflet/dist/images/marker-icon-2x.png',
  iconUrl: 'leaflet/dist/images/marker-icon.png',
  shadowUrl: 'leaflet/dist/images/marker-shadow.png',
});

const activeTab = ref('movimientos'); // 'movimientos' | 'transportes' | 'control_semanal' | 'ctacte' | 'conciliacion' | 'analisis'
const loading = ref(true);
const gastosLogistica = ref([]);
const notification = ref({});

const isReporteConsolidadoOpen = ref(false);
const { exportarPdfConciliacion } = useConciliacionPDF();

// Pestaña Conciliación
const conciliacionSubTab = ref('resumen'); // 'resumen' | 'detalle'
const conciliacionFiltroTransporte = ref(null);
const conciliacionFiltroEstado = ref('TODOS'); // 'TODOS' | 'CONCILIADO' | 'PENDIENTE' | 'EN_REVISION'
const conciliacionSearch = ref('');
const conciliacionFiltroClienteMedico = ref(null);

function getConciliacionClienteNombre(g) {
  const extra = g.datos_adicionales || {};
  return (
    g.clientes?.nombre_cliente || 
    g.cliente_nombre || 
    g.cliente || 
    extra.obra_social || 
    extra.cliente || 
    (g.paciente_referido ? `Pte: ${g.paciente_referido}` : 'Consumo Interno / Sin Cliente')
  ).trim();
}

function getConciliacionMedicoNombre(g) {
  const extra = g.datos_adicionales || {};
  return (
    g.paciente_referido || 
    extra.medico_cirujano || 
    extra.medico || 
    extra.referente || 
    g.medico || 
    'General / Sin Referente'
  ).trim();
}

const summaryConciliacion = computed(() => {
  return calculateConciliacionSummary(movimientosFiltrados.value);
});

const guiasConciliacionFiltradasDetalle = computed(() => {
  let list = movimientosFiltrados.value;

  if (conciliacionFiltroClienteMedico.value) {
    const q = conciliacionFiltroClienteMedico.value.toLowerCase().trim();
    list = list.filter(g => {
      const c = getConciliacionClienteNombre(g).toLowerCase();
      const m = getConciliacionMedicoNombre(g).toLowerCase();
      const cRaw = (g.clientes?.nombre_cliente || '').toLowerCase();
      const mRaw = (g.paciente_referido || g.datos_adicionales?.medico_cirujano || '').toLowerCase();

      return c === q || m === q || c.includes(q) || m.includes(q) || cRaw.includes(q) || mRaw.includes(q);
    });
  }

  if (conciliacionFiltroTransporte.value) {
    list = list.filter(g => {
      const tNorm = normalizeProveedor(g.transportes?.nombre || g.proveedores?.nombre || '');
      return tNorm === conciliacionFiltroTransporte.value;
    });
  }

  if (conciliacionFiltroEstado.value !== 'TODOS') {
    list = list.filter(g => {
      const est = g.datos_adicionales?.estado_conciliacion || 'PENDIENTE';
      return est === conciliacionFiltroEstado.value;
    });
  }

  if (conciliacionSearch.value.trim()) {
    const q = conciliacionSearch.value.toLowerCase().trim();
    list = list.filter(g => {
      const extra = g.datos_adicionales || {};
      const c = getConciliacionClienteNombre(g).toLowerCase();
      const m = getConciliacionMedicoNombre(g).toLowerCase();
      const t = normalizeProveedor(g.transportes?.nombre || g.proveedores?.nombre || '').toLowerCase();
      const guia = (g.numero_factura || extra.numero_guia || '').toLowerCase();
      return c.includes(q) || m.includes(q) || t.includes(q) || guia.includes(q);
    });
  }

  return list;
});

function filtrarConciliacionPorItem(nombre) {
  conciliacionFiltroClienteMedico.value = nombre;
  conciliacionSubTab.value = 'detalle';
  showNotification('Filtro Aplicado', `Filtrando detalle por: "${nombre}"`, 'info');
}

function limpiarFiltroClienteMedico() {
  conciliacionFiltroClienteMedico.value = null;
}

async function cambiarEstadoConciliacion(gasto, nuevoEstado) {
  try {
    const extra = { ...(gasto.datos_adicionales || {}), estado_conciliacion: nuevoEstado };
    const { error } = await supabase
      .from('gastos')
      .update({ datos_adicionales: extra })
      .eq('id', gasto.id);

    if (error) throw error;

    gasto.datos_adicionales = extra;
    showNotification('Estado de Conciliación', `Movimiento actualizado a: ${nuevoEstado}`, 'success');
  } catch (e) {
    console.error('Error al actualizar estado de conciliación:', e);
    showNotification('Error', `No se pudo cambiar el estado: ${e.message}`, 'error');
  }
}

function generarPdfConciliacionFletes() {
  const metadata = {
    periodoText: `Período: ${filters.fechaDesde} al ${filters.fechaHasta}`
  };
  exportarPdfConciliacion(movimientosFiltrados.value, metadata);
  showNotification('PDF Generado', 'Se descargó el reporte ejecutivo de conciliación de fletes.', 'success');
}

function exportarExcelConciliacionFletes() {
  const summary = summaryConciliacion.value;
  const rowsResumen = summary.byCliente.map(c => ({
    'Cliente / Obra Social': c.nombre,
    'Total Guías': c.totalGuias,
    'Total Bultos': c.totalBultos,
    'Total Gastado ($)': c.totalCost,
    '% Participación': `${c.porcentaje.toFixed(1)}%`
  }));

  const rowsMedicos = summary.byMedico.map(m => ({
    'Médico / Referente': m.nombre,
    'Total Guías': m.totalGuias,
    'Total Bultos': m.totalBultos,
    'Total Gastado ($)': m.totalCost,
    '% Participación': `${m.porcentaje.toFixed(1)}%`
  }));

  const rowsDetalle = guiasConciliacionFiltradasDetalle.value.map(g => {
    const extra = g.datos_adicionales || {};
    return {
      'Fecha': formatDate(g.fecha_gasto),
      'Nº Guía / Factura': g.numero_factura || extra.numero_guia || 'N/A',
      'Transporte': normalizeProveedor(g.transportes?.nombre || g.proveedores?.nombre || 'LOGISTICA CIRUGIA'),
      'Cliente / Obra Social': g.clientes?.nombre_cliente || 'N/A',
      'Médico / Referente': g.paciente_referido || extra.medico_cirujano || 'N/A',
      'Bultos': extra.cantidad_bultos ?? 0,
      'Monto ($)': Number(g.monto_total) || 0,
      'Estado Conciliación': extra.estado_conciliacion || 'PENDIENTE'
    };
  });

  exportToExcel([
    { name: 'Resumen Clientes', data: rowsResumen },
    { name: 'Resumen Médicos', data: rowsMedicos },
    { name: 'Detalle Guías', data: rowsDetalle }
  ], `Conciliacion_Fletes_Districorr_${todayStr}`);
  showNotification('Excel Exportado', 'Se exportó la conciliación de fletes a Excel.', 'success');
}

const isPdfMenuOpen = ref(false);
const transporteExpandido = ref(null);
const vistaModoMovimientos = ref('tabla'); // 'tabla' | 'bloques'
const vistaModoTransportes = ref('bloques'); // 'bloques' | 'tabla'

const {
  exportarPdfMovimientosPeriodo,
  exportarPdfResumenTransportes,
  exportarPdfMovimientosClientePaciente
} = useLogisticaPdfExportVariants();

const { exportToExcel } = useExcelExporter();

// Modales de Acción
const isNuevoMovimientoOpen = ref(false);
const isCargaMasivaOpen = ref(false);
const isEditarModalOpen = ref(false);
const isCtaCteModalOpen = ref(false);
const isDetalleModalOpen = ref(false);
const gastoEnEdicion = ref(null);
const gastoSeleccionadoDetalle = ref(null);

// Nombres de Meses en Español
const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Filtro de Período en Encabezado (Inicializado con el 1º día del mes actual y fecha de hoy)
const todayObj = new Date();
const todayStr = todayObj.toISOString().split('T')[0];
const firstDayMonthStr = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1).toISOString().split('T')[0];

const periodoFiltro = reactive({
  fechaDesde: firstDayMonthStr,
  fechaHasta: todayStr,
});

// Filtros Colapsables en Tab Movimientos
const showFilters = ref(false);

const filters = reactive({
  searchQuery: '',
  fechaDesde: firstDayMonthStr,
  fechaHasta: todayStr,
  transporteId: null,
  tipoMovimiento: null,
  tipoLogistica: null,
  sentido: null,
  clienteId: null,
  paciente: '',
  proveedorId: null,
  provinciaId: null,
  localidadId: null,
  numeroGuia: '',
  conBultos: 'todos', // 'todos' | 'con_bultos' | 'sin_bultos'
  soloInconsistentes: false,
  soloSinDestino: false,
  usuarioId: null, // Filtro por usuario / responsable de carga
});

const localidadesMapRef = ref(new Map());
const targetGastoIdsRef = ref(null);

function handleIrACorregir(payload) {
  isCtaCteModalOpen.value = false;
  activeTab.value = 'movimientos';
  filters.fechaDesde = '';
  filters.fechaHasta = '';
  filters.searchQuery = '';
  filters.transporteId = null;
  filters.tipoMovimiento = null;
  filters.tipoLogistica = null;
  filters.sentido = null;
  filters.clienteId = null;
  filters.paciente = '';
  filters.proveedorId = null;
  filters.provinciaId = null;
  filters.localidadId = null;
  filters.numeroGuia = '';
  filters.conBultos = 'todos';
  filters.usuarioId = null;

  targetGastoIdsRef.value = payload?.gastoIds && payload.gastoIds.length > 0 ? payload.gastoIds : (payload?.gastoId ? [payload.gastoId] : null);

  if (payload?.tipo === 'sin_destino') {
    filters.soloInconsistentes = false;
    filters.soloSinDestino = true;
  } else {
    filters.soloSinDestino = false;
    filters.soloInconsistentes = true;
    if (payload?.provinciaId && payload.provinciaId !== 'todos') {
      filters.provinciaId = payload.provinciaId;
    }
  }

  if (payload?.gastoId && (!payload?.gastoIds || payload.gastoIds.length === 1)) {
    filters.searchQuery = String(payload.gastoId);
  }

  const countStr = targetGastoIdsRef.value ? `(${targetGastoIdsRef.value.length} halladas)` : '';

  showNotification(
    'Redirección a Movimientos',
    payload?.tipo === 'sin_destino'
      ? `Filtrando operaciones sin destino asignado ${countStr}. Hacé clic en "Editar" en la fila para asignar provincia y localidad.`
      : `Filtrando las inconsistencias geográficas ${payload?.provinciaNombre ? 'de ' + payload.provinciaNombre : ''} ${countStr}. Hacé clic en "Editar" en la fila para corregir.`,
    'info'
  );
}

function verTodoElHistorico() {
  filters.fechaDesde = '';
  filters.fechaHasta = '';
  showNotification('Período Ajustado', 'Mostrando todo el historial de movimientos de transporte.', 'info');
}

function verMesActual() {
  filters.fechaDesde = firstDayMonthStr;
  filters.fechaHasta = todayStr;
  showNotification('Período Ajustado', 'Filtrando por el mes en curso.', 'info');
}

function verUltimos3Meses() {
  const d = new Date(todayObj.getFullYear(), todayObj.getMonth() - 2, 1);
  filters.fechaDesde = d.toISOString().split('T')[0];
  filters.fechaHasta = todayStr;
  showNotification('Período Ajustado', 'Filtrando por los últimos 3 meses.', 'info');
}

// Opciones de Selectores para Filtros
const clientesOptions = ref([]);
const transportesOptions = ref([]);
const proveedoresOptions = ref([]);
const provinciasOptions = ref([]);
const localidadesOptions = ref([]);

const usuariosOptions = computed(() => {
  const set = new Set();
  gastosLogistica.value.forEach(g => {
    if (g.cargado_por && g.cargado_por !== '—') {
      set.add(g.cargado_por);
    }
  });
  return Array.from(set).sort().map(u => ({ id: u, label: u }));
});

// Paginación en Movimientos
const currentPage = ref(1);
const pageSize = ref(50);

// Paginación en Transportes
const currentTransportePage = ref(1);
const transportesPageSize = ref(25);
const searchTransporte = ref('');

watch(vistaModoTransportes, (nuevoModo) => {
  if (nuevoModo === 'tabla' && transportesPageSize.value < 25) {
    transportesPageSize.value = 25;
  }
});

// Acordeón en Control Semanal
const controlMes = ref(todayObj.getMonth() + 1);
const controlAnio = ref(todayObj.getFullYear());
const controlTransporteId = ref(null);
const controlProvinciaId = ref(null);
const expandedTransportes = ref({});

function showNotification(title, message, type = 'info') {
  notification.value = { title, message, type, timestamp: new Date() };
}

function toggleExpandTransporte(key) {
  expandedTransportes.value[key] = !expandedTransportes.value[key];
}

async function fetchDatosLogistica() {
  loading.value = true;
  try {
    const [gastosRes, clientesRes, transportesRes, proveedoresRes, provinciasRes, localidadesRes, tiposRes, perfilesRes] = await Promise.all([
      supabase.from('gastos').select('*').order('fecha_gasto', { ascending: false }),
      supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
      supabase.from('transportes').select('id, nombre, created_at').order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('provincias').select('id, nombre').order('nombre'),
      supabase.from('localidades').select('id, nombre').order('nombre'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto'),
      supabase.from('perfiles').select('id, nombre_completo, email')
    ]);

    if (clientesRes.data) clientesOptions.value = clientesRes.data.map(c => ({ id: c.id, label: c.nombre_cliente }));
    if (transportesRes.data) transportesOptions.value = transportesRes.data.map(t => ({ id: t.id, code: t.id, value: t.id, label: t.nombre, nombre: t.nombre, tarifa_por_bulto: t.tarifa_por_bulto || 0, created_at: t.created_at }));
    if (proveedoresRes.data) {
      const provs = proveedoresRes.data.map(p => ({ id: p.id, label: p.nombre }));
      if (!provs.some(p => String(p.id) === 'logistica_cirugia')) {
        provs.unshift({ id: 'logistica_cirugia', label: 'Logística de Cirugía' });
      }
      proveedoresOptions.value = provs;
    }
    if (provinciasRes.data) provinciasOptions.value = provinciasRes.data.map(p => ({ id: p.id, label: p.nombre }));
    if (localidadesRes.data) localidadesOptions.value = localidadesRes.data.map(l => ({ id: l.id, label: l.nombre }));

    const gastosList = gastosRes.data || [];
    const clientesMap = new Map((clientesRes.data || []).map(c => [c.id, c]));
    const transportesMap = new Map((transportesRes.data || []).map(t => [t.id, t]));
    const proveedoresMap = new Map((proveedoresRes.data || []).map(p => [p.id, p]));
    const provinciasMap = new Map((provinciasRes.data || []).map(p => [p.id, p]));
    const localidadesMap = new Map((localidadesRes.data || []).map(l => [l.id, l]));
    const perfilesMap = new Map((perfilesRes.data || []).map(u => [u.id, u.nombre_completo || u.email]));
    localidadesMapRef.value = localidadesMap;
    const tiposMap = new Map((tiposRes.data || []).map(t => [t.id, t.nombre_tipo_gasto]));

    const logistica = gastosList.map(g => {
      let p = g.proveedor_id ? proveedoresMap.get(g.proveedor_id) : null;
      const pNorm = normalizeProveedor(p?.nombre);
      p = { id: p?.id || 'sin_proveedor', nombre: pNorm };

      let t = g.transporte_id ? transportesMap.get(g.transporte_id) : null;
      const tNorm = normalizeTransporte(t?.nombre);
      t = { id: t?.id || 'sin_encomienda', nombre: tNorm };

      const uKey = g.usuario_id || g.responsable_principal_id || g.user_id || g.creado_por;
      const uName = uKey ? perfilesMap.get(uKey) : null;
      const cargadoPor = uName || g.datos_adicionales?.usuario_cargo || g.datos_adicionales?.creado_por || g.user_email || '—';

      return {
        ...g,
        clientes: g.cliente_id ? clientesMap.get(g.cliente_id) : null,
        transportes: t,
        proveedores: p,
        provincias: g.provincia_id ? provinciasMap.get(g.provincia_id) : null,
        localidad_destino: g.localidad_destino_id ? localidadesMap.get(g.localidad_destino_id) : null,
        cargado_por: cargadoPor
      };
    }).filter(g => {
      const extra = g.datos_adicionales || {};
      const tipoNombre = (tiposMap.get(g.tipo_gasto_id) || '').toLowerCase();
      
      const isLogisticaTipo = (
        g.transporte_id != null ||
        g.tipo_gasto_id === 22 ||
        extra.modulo === 'logistica' ||
        extra.origen_carga === 'encomiendas_carga_multiple' ||
        tipoNombre.includes('envio') ||
        tipoNombre.includes('envío') ||
        tipoNombre.includes('devolucion') ||
        tipoNombre.includes('devolución') ||
        tipoNombre.includes('logistica') ||
        tipoNombre.includes('logística') ||
        tipoNombre.includes('despacho') ||
        tipoNombre.includes('encomienda')
      );

      return isLogisticaTipo;
    });

    gastosLogistica.value = logistica;
  } catch (e) {
    console.error('Error al cargar datos logísticos:', e);
    gastosLogistica.value = [];
  } finally {
    loading.value = false;
  }
}

// --- ESTADO Y MÉTODOS PARA GESTIÓN DE EMPRESAS DE TRANSPORTE (CRUD) ---
const searchEmpresaTransporte = ref('');
const isEmpresaModalOpen = ref(false);
const isEmpresaEdicion = ref(false);
const savingEmpresa = ref(false);
const empresaForm = reactive({
  id: null,
  nombre: '',
  tarifa_por_bulto: 0,
});

function abrirCrearEmpresa() {
  isEmpresaEdicion.value = false;
  empresaForm.id = null;
  empresaForm.nombre = '';
  empresaForm.tarifa_por_bulto = 0;
  isEmpresaModalOpen.value = true;
}

function abrirEditarEmpresa(transporte) {
  isEmpresaEdicion.value = true;
  empresaForm.id = transporte.id || transporte.code;
  empresaForm.nombre = transporte.nombre || transporte.label || '';
  empresaForm.tarifa_por_bulto = Number(transporte.tarifa_por_bulto || 0);
  isEmpresaModalOpen.value = true;
}

async function guardarEmpresaTransporte() {
  if (!empresaForm.nombre?.trim()) {
    showNotification('Campo Requerido', 'Debe ingresar el nombre de la empresa de transporte.', 'error');
    return;
  }

  savingEmpresa.value = true;
  try {
    const payload = {
      nombre: empresaForm.nombre.trim(),
      tarifa_por_bulto: Number(empresaForm.tarifa_por_bulto) || 0,
    };

    let res = isEmpresaEdicion.value && empresaForm.id
      ? await supabase.from('transportes').update(payload).eq('id', empresaForm.id)
      : await supabase.from('transportes').insert([payload]);

    if (res.error && (res.error.code === 'PGRST204' || (res.error.message || '').includes('tarifa_por_bulto'))) {
      delete payload.tarifa_por_bulto;
      res = isEmpresaEdicion.value && empresaForm.id
        ? await supabase.from('transportes').update(payload).eq('id', empresaForm.id)
        : await supabase.from('transportes').insert([payload]);

      if (res.error) throw res.error;
      showNotification('Nombre Actualizado (Atención)', `Se guardó "${payload.nombre}". Ejecuta el script SQL en Supabase para activar tarifas en la BD.`, 'warning');
    } else if (res.error) {
      throw res.error;
    } else {
      showNotification('Empresa Guardada', `Se guardó "${payload.nombre}" con tarifa de ${formatCurrency(payload.tarifa_por_bulto)} por bulto.`, 'success');
    }

    isEmpresaModalOpen.value = false;
    await fetchDatosLogistica();
  } catch (e) {
    console.error('Error guardando empresa de transporte:', e);
    showNotification('Error', `No se pudo guardar la empresa: ${e.message}`, 'error');
  } finally {
    savingEmpresa.value = false;
  }
}

async function eliminarEmpresaTransporte(transporte) {
  const nombreT = transporte.label || transporte.nombre;
  if (!confirm(`¿Estás seguro de eliminar la empresa de transporte "${nombreT}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    const { error } = await supabase.from('transportes').delete().eq('id', transporte.id);
    if (error) {
      if (error.code === '23503') {
        throw new Error('No se puede eliminar la empresa porque tiene movimientos o gastos vinculados.');
      }
      throw error;
    }
    showNotification('Empresa eliminada', 'La empresa de transporte fue eliminada.', 'success');
    await fetchDatosLogistica();
  } catch (e) {
    console.error('Error al eliminar empresa de transporte:', e);
    showNotification('Error', e.message, 'error');
  }
}

const empresasTransporteFiltradas = computed(() => {
  if (!searchEmpresaTransporte.value.trim()) return transportesOptions.value;
  const q = searchEmpresaTransporte.value.toLowerCase().trim();
  return transportesOptions.value.filter(t => (t.label || t.nombre || '').toLowerCase().includes(q));
});

// --- ESTADO Y MÉTODOS PARA ANÁLISIS GEOGRÁFICO DE TRANSPORTES ---
const analisisLoading = ref(false);
const analisisError = ref('');
const analisisData = ref(null);
const selectedAnalisisTransportes = ref([]);
const selectedAnalisisProvinciaId = ref(null);
const selectedAnalisisLocalidades = ref([]);
const isComparisonMode = ref(false);
const fechaInicioA = ref(firstDayMonthStr);
const fechaFinA = ref(todayStr);
const fechaInicioB = ref(null);
const fechaFinB = ref(null);
const isExportingAnalisis = ref(false);
const mapKey = ref(0);

async function fetchAnalisisData() {
  if (!fechaInicioA.value || !fechaFinA.value) return;
  if (isComparisonMode.value && (!fechaInicioB.value || !fechaFinB.value)) return;

  analisisLoading.value = true;
  analisisError.value = '';
  try {
    const transporteIds = selectedAnalisisTransportes.value.map(t => t.id || t.code);
    const localidadIds = selectedAnalisisLocalidades.value.map(l => l.id || l.code);

    const { data, error } = await supabase.rpc('get_transporte_analisis_geografico', {
      p_transporte_ids: transporteIds,
      p_provincia_id: selectedAnalisisProvinciaId.value,
      p_localidad_ids: localidadIds,
      p_fecha_inicio_a: fechaInicioA.value,
      p_fecha_fin_a: fechaFinA.value,
      p_fecha_inicio_b: isComparisonMode.value ? fechaInicioB.value : null,
      p_fecha_fin_b: isComparisonMode.value ? fechaFinB.value : null
    });

    if (error) throw error;
    analisisData.value = data;
  } catch (e) {
    analisisError.value = `Error al cargar el análisis: ${e.message}.`;
    analisisData.value = null;
  } finally {
    analisisLoading.value = false;
  }
}

watch(
  [selectedAnalisisTransportes, selectedAnalisisProvinciaId, selectedAnalisisLocalidades, fechaInicioA, fechaFinA, isComparisonMode, fechaInicioB, fechaFinB],
  fetchAnalisisData,
  { deep: true }
);

// Sincronización automática de Filtros Globales superiores con el Análisis Geográfico
watch(
  () => [filters.fechaDesde, filters.fechaHasta, filters.provinciaId, filters.transporteId, filters.localidadId],
  ([fDesde, fHasta, provId, transpId, locId]) => {
    if (fDesde) fechaInicioA.value = fDesde;
    if (fHasta) fechaFinA.value = fHasta;
    selectedAnalisisProvinciaId.value = provId || null;

    if (transpId) {
      const foundT = transportesOptions.value.find(t => String(t.id) === String(transpId));
      selectedAnalisisTransportes.value = foundT ? [foundT] : [];
    } else {
      selectedAnalisisTransportes.value = [];
    }

    if (locId) {
      const foundL = localidadesOptions.value.find(l => String(l.id) === String(locId));
      selectedAnalisisLocalidades.value = foundL ? [foundL] : [];
    } else {
      selectedAnalisisLocalidades.value = [];
    }
  },
  { immediate: true }
);

watch(isComparisonMode, (newValue) => {
  if (!newValue) {
    fechaInicioB.value = null;
    fechaFinB.value = null;
  }
});

watch(activeTab, (newTab) => {
  if (newTab === 'analisis') {
    fetchAnalisisData();
  }
});

const kpisPeriodoA = computed(() => analisisData.value?.kpis?.periodo_a || {});
const kpisPeriodoB = computed(() => analisisData.value?.kpis?.periodo_b || {});
const localidadesComparativa = computed(() => analisisData.value?.localidades || []);

// Diccionario de Coordenadas Geográficas Reales de Argentina (Fallback para Localidades sin Geolocalización en BD)
const PROVINCIA_COORDINATES = {
  'CORRIENTES': [-27.4692, -58.8306],
  'CÓRDOBA': [-31.4201, -64.1888],
  'CORDOBA': [-31.4201, -64.1888],
  'BUENOS AIRES': [-34.6037, -58.3816],
  'CABA': [-34.6037, -58.3816],
  'SANTA FE': [-31.6333, -60.7000],
  'CHACO': [-27.4514, -58.9867],
  'MISIONES': [-27.3621, -55.8969],
  'ENTRE RÍOS': [-31.7333, -60.5333],
  'ENTRE RIOS': [-31.7333, -60.5333],
  'MENDOZA': [-32.8895, -68.8458],
  'TUCUMÁN': [-26.8241, -65.2226],
  'TUCUMAN': [-26.8241, -65.2226],
  'SALTA': [-24.7859, -65.4117],
  'JUJUY': [-24.1858, -65.2995],
  'FORMOSA': [-26.1775, -58.1781],
  'SANTIAGO DEL ESTERO': [-27.7951, -64.2615],
  'SAN LUIS': [-33.2950, -66.3356],
  'SAN JUAN': [-31.5375, -68.5364],
  'LA RIOJA': [-29.4131, -66.8558],
  'CATAMARCA': [-28.4696, -65.7852],
  'NEUQUÉN': [-38.9516, -68.0591],
  'NEUQUEN': [-38.9516, -68.0591],
  'RÍO NEGRO': [-40.8135, -62.9967],
  'RIO NEGRO': [-40.8135, -62.9967],
  'CHUBUT': [-43.3002, -65.1023],
  'SANTA CRUZ': [-51.6226, -69.2181],
  'TIERRA DEL FUEGO': [-54.8019, -68.3030]
};

const LOCALIDAD_COORDINATES = {
  'CORRIENTES': [-27.4692, -58.8306],
  'CURUZU CUATIA': [-29.7917, -58.0546],
  'CURUZÚ CUATIÁ': [-29.7917, -58.0546],
  'GOYA': [-29.1441, -59.2647],
  'PASO DE LOS LIBRES': [-29.7125, -57.0866],
  'MERCEDES': [-29.1842, -58.0754],
  'BELLA VISTA': [-28.5085, -59.0454],
  'SANTO TOME': [-28.5494, -56.0428],
  'SANTO TOMÉ': [-28.5494, -56.0428],
  'ITUZAINGO': [-27.5925, -56.6825],
  'ITUZAINGÓ': [-27.5925, -56.6825],
  'ESQUINA': [-30.0152, -59.6006],
  'MONTE CASEROS': [-30.2547, -57.5997],
  'CÓRDOBA': [-31.4201, -64.1888],
  'CORDOBA': [-31.4201, -64.1888],
  'VILLA MARÍA': [-32.4075, -63.2403],
  'VILLA MARIA': [-32.4075, -63.2403],
  'RÍO CUARTO': [-33.1307, -64.3499],
  'RIO CUARTO': [-33.1307, -64.3499],
  'RESISTENCIA': [-27.4514, -58.9867],
  'SÁENZ PEÑA': [-26.7847, -60.4439],
  'SAENZ PEÑA': [-26.7847, -60.4439],
  'POSADAS': [-27.3621, -55.8969],
  'OBERÁ': [-27.4868, -55.1206],
  'OBERA': [-27.4868, -55.1206],
  'ELDORADO': [-26.4069, -54.6292],
  'ROSARIO': [-32.9442, -60.6505],
  'SANTA FE': [-31.6333, -60.7000],
  'PARANÁ': [-31.7333, -60.5333],
  'PARANA': [-31.7333, -60.5333],
  'CONCORDIA': [-31.3929, -58.0209],
  'GUALEGUAYCHÚ': [-33.0094, -58.5172],
  'GUALEGUAYCHU': [-33.0094, -58.5172]
};

function getMarkerLatLng(loc) {
  if (!loc) return [-31.4201, -64.1888];
  
  // 1. Probar latitud/longitud directas enviadas por la base de datos o RPC
  const latNum = Number(loc.lat ?? loc.latitud);
  const lngNum = Number(loc.lng ?? loc.longitud);

  if (!isNaN(latNum) && !isNaN(lngNum) && latNum !== 0 && lngNum !== 0 && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180) {
    return [latNum, lngNum];
  }

  // 2. Buscar en diccionario por nombre de localidad
  const locNameClean = (loc.localidad_nombre || '').toUpperCase().trim();
  if (LOCALIDAD_COORDINATES[locNameClean]) {
    return LOCALIDAD_COORDINATES[locNameClean];
  }

  // 3. Buscar por nombre de provincia
  const provNameClean = (loc.provincia_nombre || '').toUpperCase().trim();
  if (PROVINCIA_COORDINATES[provNameClean]) {
    return PROVINCIA_COORDINATES[provNameClean];
  }

  // 4. Default: Centro geográfico de Argentina (Córdoba)
  return [-31.4201, -64.1888];
}

const mapCenter = computed(() => {
  if (!localidadesComparativa.value || localidadesComparativa.value.length === 0) {
    return [-29.5, -60.5];
  }
  const validCoords = localidadesComparativa.value
    .map(getMarkerLatLng)
    .filter(c => c && c[0] !== 0 && c[1] !== 0);

  if (validCoords.length === 0) return [-29.5, -60.5];

  const avgLat = validCoords.reduce((acc, curr) => acc + curr[0], 0) / validCoords.length;
  const avgLng = validCoords.reduce((acc, curr) => acc + curr[1], 0) / validCoords.length;
  return [avgLat, avgLng];
});

const maxGastoLocalidad = computed(() => {
  if (localidadesComparativa.value.length === 0) return 0;
  return Math.max(...localidadesComparativa.value.map(l => l.gasto_total_a || 0));
});

watch(analisisData, () => { mapKey.value++; });

function getMarkerIcon(gasto) {
  const max = maxGastoLocalidad.value;
  let size = 14;
  let color = '#4f46e5';
  if (max > 0 && gasto > 0) {
    const intensity = gasto / max;
    size = 14 + (intensity * 26);
    if (intensity > 0.75) color = '#e11d48';
    else if (intensity > 0.4) color = '#eab308';
  }
  return L.divIcon({
    html: `<span style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; display: block; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4);"></span>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

const chartAnalisisOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: { y: { beginAtZero: true, ticks: { callback: (value) => formatCurrency(value) } } }
}));

const chartGastosData = computed(() => {
  const sorted = [...localidadesComparativa.value].sort((a, b) => (b.gasto_total_a || 0) - (a.gasto_total_a || 0));
  return {
    labels: sorted.map(loc => loc.localidad_nombre),
    datasets: [
      { label: 'Gasto Período A', backgroundColor: '#4f46e5', data: sorted.map(l => l.gasto_total_a) },
      ...(isComparisonMode.value ? [{ label: 'Gasto Período B', backgroundColor: '#a5b4fc', data: sorted.map(l => l.gasto_total_b) }] : [])
    ]
  };
});

const chartFrecuenciaData = computed(() => {
  const sorted = [...localidadesComparativa.value].sort((a, b) => (b.frecuencia_a || 0) - (a.frecuencia_a || 0));
  return {
    labels: sorted.map(loc => loc.localidad_nombre),
    datasets: [
      { label: 'Frecuencia Período A', backgroundColor: '#f59e0b', data: sorted.map(l => l.frecuencia_a) },
      ...(isComparisonMode.value ? [{ label: 'Frecuencia Período B', backgroundColor: '#fde68a', data: sorted.map(l => l.frecuencia_b) }] : [])
    ]
  };
});

function formatPercentage(value) {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

async function exportarAnalisisExcel() {
  if (isExportingAnalisis.value) return;
  if (!analisisData.value || localidadesComparativa.value.length === 0) {
    showNotification('Sin datos', 'No hay datos de análisis para exportar.', 'error');
    return;
  }
  isExportingAnalisis.value = true;
  try {
    const dataToExport = {
      kpisA: kpisPeriodoA.value,
      kpisB: kpisPeriodoB.value,
      localidades: localidadesComparativa.value,
      filtros: {
        fechaExportacion: new Date().toLocaleString('es-AR'),
        modoComparacion: isComparisonMode.value,
        periodoA: `${fechaInicioA.value} al ${fechaFinA.value}`,
        periodoB: isComparisonMode.value ? `${fechaInicioB.value} al ${fechaFinB.value}` : 'N/A',
        transportes: selectedAnalisisTransportes.value.length > 0 ? selectedAnalisisTransportes.value.map(t => t.label || t.nombre).join(', ') : 'Todos',
        provincia: selectedAnalisisProvinciaId.value ? provinciasOptions.value.find(p => p.id === selectedAnalisisProvinciaId.value)?.label : 'Todas',
        localidades: selectedAnalisisLocalidades.value.length > 0 ? selectedAnalisisLocalidades.value.map(l => l.label || l.nombre).join(', ') : 'Todas'
      }
    };
    
    const sheets = [];
    sheets.push({
      name: 'Filtros Aplicados',
      data: [
        { Filtro: 'Fecha de Exportación', Valor: dataToExport.filtros.fechaExportacion },
        { Filtro: 'Modo Comparación', Valor: dataToExport.filtros.modoComparacion ? 'Activado' : 'Desactivado' },
        { Filtro: 'Período A', Valor: dataToExport.filtros.periodoA },
        { Filtro: 'Período B', Valor: dataToExport.filtros.periodoB },
        { Filtro: 'Transportes', Valor: dataToExport.filtros.transportes },
        { Filtro: 'Provincia', Valor: dataToExport.filtros.provincia },
        { Filtro: 'Localidades', Valor: dataToExport.filtros.localidades },
      ]
    });
    sheets.push({
      name: 'Resumen Comparativo',
      data: [
        { Criterio: 'Gasto Total', 'Período A': dataToExport.kpisA.gasto_total, ...(dataToExport.filtros.modoComparacion && { 'Período B': dataToExport.kpisB.gasto_total }) },
        { Criterio: 'Nº de Gastos', 'Período A': dataToExport.kpisA.total_gastos, ...(dataToExport.filtros.modoComparacion && { 'Período B': dataToExport.kpisB.total_gastos }) },
        { Criterio: 'Costo Promedio / Gasto', 'Período A': dataToExport.kpisA.costo_promedio_gasto, ...(dataToExport.filtros.modoComparacion && { 'Período B': dataToExport.kpisB.costo_promedio_gasto }) },
        { Criterio: 'Localidades Únicas', 'Período A': dataToExport.kpisA.localidades_unicas, ...(dataToExport.filtros.modoComparacion && { 'Período B': dataToExport.kpisB.localidades_unicas }) },
      ]
    });
    sheets.push({
      name: 'Desglose por Localidad',
      data: dataToExport.localidades.map(loc => ({
        'Localidad': loc.localidad_nombre,
        'Provincia': loc.provincia_nombre,
        'Gasto Total (A)': loc.gasto_total_a,
        'Frecuencia (A)': loc.frecuencia_a,
        ...(dataToExport.filtros.modoComparacion && {
          'Gasto Total (B)': loc.gasto_total_b,
          'Frecuencia (B)': loc.frecuencia_b,
          'Variación Gasto ($)': loc.variacion_gasto,
          'Variación Gasto (%)': loc.variacion_gasto_porc,
        })
      }))
    });
    
    exportToExcel(sheets, `Analisis_Geografico_Transportes_${todayStr}`);
    showNotification('Exportación Exitosa', 'Se descargó el reporte de análisis geográfico.', 'success');
  } catch (e) {
    console.error('Error al exportar análisis:', e);
    showNotification('Error', 'No se pudo exportar el análisis a Excel.', 'error');
  } finally {
    isExportingAnalisis.value = false;
  }
}

// Conteo de Filtros Activos
const activeFiltersCount = computed(() => {
  let count = 0;
  if (filters.searchQuery) count++;
  if (filters.fechaDesde !== firstDayMonthStr) count++;
  if (filters.fechaHasta !== todayStr) count++;
  if (filters.transporteId) count++;
  if (filters.tipoMovimiento) count++;
  if (filters.tipoLogistica) count++;
  if (filters.sentido) count++;
  if (filters.clienteId) count++;
  if (filters.paciente) count++;
  if (filters.proveedorId) count++;
  if (filters.provinciaId) count++;
  if (filters.localidadId) count++;
  if (filters.numeroGuia) count++;
  if (filters.conBultos !== 'todos') count++;
  if (filters.usuarioId) count++;
  return count;
});

function limpiarFiltros() {
  filters.searchQuery = '';
  filters.fechaDesde = firstDayMonthStr;
  filters.fechaHasta = todayStr;
  filters.transporteId = null;
  filters.tipoMovimiento = null;
  filters.tipoLogistica = null;
  filters.sentido = null;
  filters.clienteId = null;
  filters.paciente = '';
  filters.proveedorId = null;
  filters.provinciaId = null;
  filters.localidadId = null;
  filters.numeroGuia = '';
  filters.conBultos = 'todos';
  filters.usuarioId = null;
  currentPage.value = 1;
}

// Búsqueda y Filtrado Completo de Movimientos
const movimientosFiltrados = computed(() => {
  const q = filters.searchQuery.toLowerCase().trim();

  return gastosLogistica.value.filter(g => {
    const extra = g.datos_adicionales || {};
    const fechaGasto = g.fecha_gasto ? g.fecha_gasto.split('T')[0] : '';
    const clienteName = g.clientes?.nombre_cliente || '';
    const pacienteName = g.paciente_referido || '';
    const transporteName = g.transportes?.nombre || '';
    const proveedorName = g.proveedores?.nombre || '';
    const provinciaName = g.provincias?.nombre || '';
    const destinoText = extra.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || g.provincia?.nombre || '';
    const descText = g.descripcion_general || '';
    const obsText = extra.observacion_logistica || '';
    const guiaText = g.numero_factura || extra.numero_guia || '';

    // Búsqueda global
    const matchesSearch = !q || (
      String(g.id).includes(q) ||
      clienteName.toLowerCase().includes(q) ||
      pacienteName.toLowerCase().includes(q) ||
      transporteName.toLowerCase().includes(q) ||
      proveedorName.toLowerCase().includes(q) ||
      provinciaName.toLowerCase().includes(q) ||
      destinoText.toLowerCase().includes(q) ||
      descText.toLowerCase().includes(q) ||
      obsText.toLowerCase().includes(q) ||
      guiaText.toLowerCase().includes(q)
    );

    // Filtros de fecha
    const matchesFechaDesde = !filters.fechaDesde || (fechaGasto && fechaGasto >= filters.fechaDesde);
    const matchesFechaHasta = !filters.fechaHasta || (fechaGasto && fechaGasto <= filters.fechaHasta);

    // Filtros específicos
    const matchesTransporte = !filters.transporteId || String(g.transporte_id) === String(filters.transporteId);
    const matchesTipoMov = !filters.tipoMovimiento || extra.tipo_movimiento_encomienda === filters.tipoMovimiento;
    const matchesTipoLog = !filters.tipoLogistica || extra.tipo_logistica === filters.tipoLogistica;
    const matchesSentido = !filters.sentido || extra.sentido_movimiento === filters.sentido;
    const matchesCliente = !filters.clienteId || String(g.cliente_id) === String(filters.clienteId);
    const matchesPaciente = !filters.paciente || pacienteName.toLowerCase().includes(filters.paciente.toLowerCase().trim());
    const isCirugiaFilter = String(filters.proveedorId) === 'logistica_cirugia' || Number(filters.proveedorId) === 14;

    let matchesProveedor = true;
    if (filters.proveedorId) {
      if (isCirugiaFilter) {
        matchesProveedor = isLogisticaCirugia(g);
      } else {
        matchesProveedor = String(g.proveedor_id) === String(filters.proveedorId);
      }
    }
    const matchesProvincia = !filters.provinciaId || String(g.provincia_id) === String(filters.provinciaId);
    const matchesLocalidad = !filters.localidadId || String(g.localidad_destino_id) === String(filters.localidadId);
    const matchesGuia = !filters.numeroGuia || guiaText.toLowerCase().includes(filters.numeroGuia.toLowerCase().trim());

    // Bultos (Diferencia sin asumir 1 bulto por defecto)
    const hasBultosField = extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '';
    const cantBultos = hasBultosField ? Number(extra.cantidad_bultos) : 0;
    const matchesBultos = filters.conBultos === 'todos'
      || (filters.conBultos === 'con_bultos' && hasBultosField && cantBultos > 0)
      || (filters.conBultos === 'sin_bultos' && (!hasBultosField || cantBultos === 0));

    const matchesSoloInconsistentes = !filters.soloInconsistentes || (() => {
      if (targetGastoIdsRef.value && targetGastoIdsRef.value.length > 0) {
        return targetGastoIdsRef.value.some(id => String(id) === String(g.id));
      }
      const provId = g.provincia_id;
      const locId = g.localidad_destino_id;
      if (!provId && !locId) return false;
      if (provId && !locId) return false;
      if (!provId && locId) return true;
      const locObj = localidadesMapRef.value.get(Number(locId)) || localidadesMapRef.value.get(String(locId));
      return !locObj || String(locObj.provincia_id) !== String(provId);
    })();

    const matchesSoloSinDestino = !filters.soloSinDestino || (() => {
      if (targetGastoIdsRef.value && targetGastoIdsRef.value.length > 0) {
        return targetGastoIdsRef.value.some(id => String(id) === String(g.id));
      }
      const provId = g.provincia_id || g.provincia_destino_id || g.datos_adicionales?.provincia_destino_id;
      const locId = g.localidad_destino_id || g.datos_adicionales?.localidad_destino_id;
      return !provId && !locId;
    })();

    const matchesUsuario = !filters.usuarioId || g.cargado_por === filters.usuarioId || String(g.usuario_id) === String(filters.usuarioId) || String(g.user_id) === String(filters.usuarioId);

    return matchesSearch && matchesFechaDesde && matchesFechaHasta && matchesTransporte
      && matchesTipoMov && matchesTipoLog && matchesSentido && matchesCliente
      && matchesPaciente && matchesProveedor && matchesProvincia && matchesLocalidad
      && matchesGuia && matchesBultos && matchesSoloInconsistentes && matchesSoloSinDestino && matchesUsuario;
  });
});

// Reiniciar a página 1 si cambian los filtros
watch([filters, pageSize], () => {
  currentPage.value = 1;
}, { deep: true });

// Paginación de Movimientos
const totalMovimientos = computed(() => movimientosFiltrados.value.length);
const totalPages = computed(() => Math.ceil(totalMovimientos.value / pageSize.value) || 1);
const resultFrom = computed(() => totalMovimientos.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1);
const resultTo = computed(() => Math.min(currentPage.value * pageSize.value, totalMovimientos.value));

const movimientosPaginados = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return movimientosFiltrados.value.slice(start, start + pageSize.value);
});

// Ayudante para mostrar referencia de Cliente / Paciente sin repetir "Proveedor / otros"
function getClientePacienteDisplay(g) {
  const cliente = g.clientes?.nombre_cliente;
  const proveedor = g.proveedores?.nombre;
  const paciente = g.paciente_referido;

  if (cliente) {
    return { principal: cliente, secundario: paciente ? `Pte: ${paciente}` : null };
  }
  if (proveedor) {
    return { principal: `Prov: ${proveedor}`, secundario: paciente ? `Pte: ${paciente}` : null };
  }
  if (paciente) {
    return { principal: `Pte: ${paciente}`, secundario: null };
  }
  return { principal: 'Sin cliente asignado', secundario: null };
}

// Respuestas textuales claras para Franco sin asumir bultos = 1 ni falsos proveedores
const respuestasFranco = computed(() => {
  const totalMovs = movimientosFiltrados.value.length;
  if (totalMovs === 0) return 'No hay movimientos registrados para los filtros seleccionados.';

  let bultosInformadosTotal = 0;
  let movsConBultosCount = 0;
  let movsSinBultosCount = 0;
  const porClienteNombrado = {};

  movimientosFiltrados.value.forEach(g => {
    const extra = g.datos_adicionales || {};
    if (extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '') {
      bultosInformadosTotal += Number(extra.cantidad_bultos) || 0;
      movsConBultosCount++;
    } else {
      movsSinBultosCount++;
    }

    if (g.clientes?.nombre_cliente) {
      const cName = g.clientes.nombre_cliente;
      porClienteNombrado[cName] = (porClienteNombrado[cName] || 0) + 1;
    }
  });

  const clienteTop = Object.entries(porClienteNombrado).sort((a, b) => b[1] - a[1])[0];

  let bultosText = '';
  if (movsConBultosCount > 0 && movsSinBultosCount > 0) {
    bultosText = `(${movsConBultosCount} con ${bultosInformadosTotal} bultos informados, ${movsSinBultosCount} sin bultos especificados en el registro histórico)`;
  } else if (movsConBultosCount > 0) {
    bultosText = `(${bultosInformadosTotal} bultos informados)`;
  } else {
    bultosText = `(sin bultos informados en registros históricos)`;
  }

  let clienteText = '';
  if (clienteTop) {
    clienteText = ` ${clienteTop[0]} concentró el mayor volumen de envíos a clientes con ${clienteTop[1]} movimientos.`;
  } else {
    clienteText = ` Corresponden a despachos generales, compras de proveedores o movimientos sin cliente directo asignado.`;
  }

  return `Se registran ${totalMovs} movimientos operacionales ${bultosText}.${clienteText}`;
});

// Tab 2: Resumen por Empresa de Transporte (Antonio)
const resumenTransportesAntonio = computed(() => {
  const mapa = {};
  const qTrans = searchTransporte.value.toLowerCase().trim();

  movimientosFiltrados.value.forEach(g => {
    const tName = g.transportes?.nombre || 'Sin Transporte Asignado';
    const tId = g.transporte_id;
    if (qTrans && !tName.toLowerCase().includes(qTrans)) return;

    if (!mapa[tName]) {
      mapa[tName] = {
        id: tId,
        nombre: tName,
        movimientos: 0,
        bultosInformados: 0,
        movsConBultos: 0,
        montoTotal: 0,
        provincias: new Set(),
      };
    }

    mapa[tName].movimientos += 1;
    const extra = g.datos_adicionales || {};
    if (extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '') {
      mapa[tName].bultosInformados += Number(extra.cantidad_bultos) || 0;
      mapa[tName].movsConBultos++;
    }
    mapa[tName].montoTotal += Number(g.monto_total) || 0;
    if (g.provincias?.nombre) mapa[tName].provincias.add(g.provincias.nombre);
  });

  return Object.values(mapa).map(t => {
    const opt = transportesOptions.value.find(o => (o.nombre || o.label || '').toLowerCase().trim() === t.nombre.toLowerCase().trim());
    return {
      ...t,
      id: opt ? opt.id : null,
      tarifa_por_bulto: opt ? Number(opt.tarifa_por_bulto || 0) : 0,
      promedio: t.movimientos > 0 ? t.montoTotal / t.movimientos : 0,
      zonas: Array.from(t.provincias).join(', ') || 'Sin zona especificada',
    };
  }).sort((a, b) => b.montoTotal - a.montoTotal);
});

// Lógica para proyección mensual validada
function getProyeccionTexto(t) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  const fDesde = filters.fechaDesde ? new Date(filters.fechaDesde) : null;

  // Si se está filtrando el mes en curso completo
  if (fDesde && fDesde.getFullYear() === currentYear && (fDesde.getMonth() + 1) === currentMonth) {
    const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    if (currentDay > 0 && currentDay < totalDaysInMonth) {
      const proj = (t.montoTotal / currentDay) * totalDaysInMonth;
      return { label: 'Proyección mes en curso:', val: formatCurrency(proj) };
    } else {
      return { label: 'Total final del mes:', val: formatCurrency(t.montoTotal) };
    }
  }

  // Si es un período histórico o personalizado
  return { label: 'Total acumulado en período:', val: formatCurrency(t.montoTotal) };
}

// Clickeabilidad en Tarjeta de Transporte
function filtrarPorTransporte(tName) {
  filters.searchQuery = tName;
  activeTab.value = 'movimientos';
  showNotification('Filtro Aplicado', `Mostrando movimientos del transporte: ${tName}`, 'info');
}

// Paginación de tarjetas de Transportes
const totalTransportesPage = computed(() => Math.ceil(resumenTransportesAntonio.value.length / transportesPageSize.value) || 1);
const transportesPaginados = computed(() => {
  const start = (currentTransportePage.value - 1) * transportesPageSize.value;
  return resumenTransportesAntonio.value.slice(start, start + transportesPageSize.value);
});

const fraseDestacadaAntonio = computed(() => {
  if (resumenTransportesAntonio.value.length === 0) return 'No hay datos de transportes acumulados.';
  const top = resumenTransportesAntonio.value[0];
  const gastoTotal = resumenTransportesAntonio.value.reduce((acc, curr) => acc + curr.montoTotal, 0);
  const porcentaje = gastoTotal > 0 ? ((top.montoTotal / gastoTotal) * 100).toFixed(0) : 0;

  const bultosStr = top.movsConBultos > 0 ? `${top.bultosInformados} bultos informados` : 'bultos sin especificar';

  return `${top.nombre} representa el ${porcentaje}% del gasto logístico acumulado (${formatCurrency(top.montoTotal)}) en ${top.movimientos} envíos (${bultosStr}).`;
});

const totalResumenAntonio = computed(() => {
  const list = resumenTransportesAntonio.value;
  const totalGasto = list.reduce((acc, t) => acc + t.montoTotal, 0);
  const totalMovs = list.reduce((acc, t) => acc + t.movimientos, 0);
  const totalBultos = list.reduce((acc, t) => acc + t.bultosInformados, 0);
  const promedioGlobal = totalMovs > 0 ? totalGasto / totalMovs : 0;
  return {
    cant: list.length,
    totalGasto,
    totalMovs,
    totalBultos,
    promedioGlobal
  };
});

// Tab 3: Control Semanal por Transporte (con rangos reales de fechas y nombres de meses en español)
const controlSemanalData = computed(() => {
  const selectedM = Number(controlMes.value);
  const selectedY = Number(controlAnio.value);

  const primerDia = new Date(selectedY, selectedM - 1, 1);
  const ultimoDia = new Date(selectedY, selectedM, 0);

  const semanas = [];
  let start = new Date(primerDia);
  let weekNum = 1;

  while (start <= ultimoDia) {
    let end = new Date(start);
    // Fin de semana (Domingo)
    end.setDate(start.getDate() + (6 - ((start.getDay() + 6) % 7)));
    if (end > ultimoDia) end = new Date(ultimoDia);

    const startDay = start.getDate();
    const endDay = end.getDate();
    const monthShort = NOMBRES_MESES[selectedM - 1].substring(0, 3).toLowerCase();

    semanas.push({
      numero: weekNum,
      inicioStr: start.toISOString().split('T')[0],
      finStr: end.toISOString().split('T')[0],
      label: `Sem. ${weekNum} (${startDay} ${monthShort} - ${endDay} ${monthShort})`
    });

    start = new Date(end);
    start.setDate(start.getDate() + 1);
    weekNum++;
  }

  const mapaTransportes = {};

  gastosLogistica.value.forEach(g => {
    if (!g.fecha_gasto) return;
    const f = new Date(g.fecha_gasto);
    if (f.getFullYear() !== selectedY || (f.getMonth() + 1) !== selectedM) return;

    const tName = g.transportes?.nombre || 'Sin Transporte';
    const tId = g.transporte_id;
    const pId = g.provincia_id;

    if (controlTransporteId.value && String(tId) !== String(controlTransporteId.value)) return;
    if (controlProvinciaId.value && String(pId) !== String(controlProvinciaId.value)) return;

    if (!mapaTransportes[tName]) {
      mapaTransportes[tName] = {
        nombre: tName,
        montoMes: 0,
        movimientosMes: 0,
        bultosInformadosMes: 0,
        semanas: semanas.map(s => ({ ...s, monto: 0, movimientos: 0, bultos: 0 }))
      };
    }

    const item = mapaTransportes[tName];
    const fechaStr = g.fecha_gasto.split('T')[0];
    const monto = Number(g.monto_total) || 0;
    const extra = g.datos_adicionales || {};
    const bultos = (extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '')
      ? Number(extra.cantidad_bultos)
      : 0;

    item.montoMes += monto;
    item.movimientosMes += 1;
    item.bultosInformadosMes += bultos;

    const sem = item.semanas.find(s => fechaStr >= s.inicioStr && fechaStr <= s.finStr);
    if (sem) {
      sem.monto += monto;
      sem.movimientos += 1;
      sem.bultos += bultos;
    }
  });

  return Object.values(mapaTransportes).map(t => ({
    ...t,
    promedio: t.movimientosMes > 0 ? t.montoMes / t.movimientosMes : 0
  })).sort((a, b) => b.montoMes - a.montoMes);
});

// Modales y Detalles
function abrirEdicion(gasto) {
  gastoEnEdicion.value = gasto;
  isEditarModalOpen.value = true;
}

function verDetalleGasto(gasto) {
  gastoSeleccionadoDetalle.value = gasto;
  isDetalleModalOpen.value = true;
}

async function eliminarGasto(gasto) {
  const desc = gasto.descripcion_general || gasto.transportes?.nombre || 'este movimiento';
  const montoStr = formatCurrency(gasto.monto_total);
  if (!window.confirm(`¿Estás seguro de que deseas eliminar ${desc} (${montoStr})?\nEsta acción no se puede deshacer.`)) {
    return;
  }

  try {
    const { error } = await supabase
      .from('gastos')
      .delete()
      .eq('id', gasto.id);

    if (error) throw error;

    showNotification('Movimiento Eliminado', 'El registro se eliminó correctamente.', 'success');
    await fetchDatosLogistica();
  } catch (e) {
    console.error('Error al eliminar gasto:', e);
    showNotification('Error', `No se pudo eliminar el movimiento: ${e.message}`, 'error');
  }
}

function onMovimientoSaved(data) {
  isNuevoMovimientoOpen.value = false;
  fetchDatosLogistica();
  showNotification('Movimiento Registrado', 'Se guardó el movimiento logístico correctamente.', 'success');
}

// Cálculo y estado para el Detalle Expandido de Transporte
const movimientosTransporteExpandido = computed(() => {
  if (!transporteExpandido.value) return [];
  return movimientosFiltrados.value.filter(g => (g.transportes?.nombre || 'Sin Transporte') === transporteExpandido.value);
});

const resumenPieTransporteExpandido = computed(() => {
  const movs = movimientosTransporteExpandido.value;
  const count = movs.length;
  let bultosTotal = 0;
  let sinBultos = 0;
  let totalImporte = 0;

  movs.forEach(g => {
    const extra = g.datos_adicionales || {};
    const b = extra.cantidad_bultos;
    if (b !== undefined && b !== null && b !== '') {
      bultosTotal += Number(b) || 0;
    } else {
      sinBultos += 1;
    }
    totalImporte += Number(g.monto_total) || 0;
  });

  return {
    count,
    bultosTotal,
    sinBultos,
    totalImporte
  };
});

function toggleExpandirTransporte(nombre) {
  transporteExpandido.value = (transporteExpandido.value === nombre) ? null : nombre;
}

// Handlers de Exportar PDF
function getPdfContext() {
  return {
    fechaDesde: filters.fechaDesde ? formatDate(filters.fechaDesde) : 'Inicio',
    fechaHasta: filters.fechaHasta ? formatDate(filters.fechaHasta) : 'Hoy',
    filterText: filters.searchQuery ? `Búsqueda: "${filters.searchQuery}"` : 'Filtros activos del período'
  };
}

function generarPdfGeneralCompacto() {
  isPdfMenuOpen.value = false;
  exportarPdfMovimientosPeriodo(movimientosFiltrados.value, getPdfContext(), 'compacto');
  showNotification('PDF Generado', 'Se descargó el reporte general de movimientos (Compacto - máx 2 pág).', 'success');
}

function generarPdfGeneralCompleto() {
  isPdfMenuOpen.value = false;
  exportarPdfMovimientosPeriodo(movimientosFiltrados.value, getPdfContext(), 'completo');
  showNotification('PDF Generado', 'Se descargó el reporte general de movimientos (Auditoría completa).', 'success');
}

function generarPdfTony() {
  isPdfMenuOpen.value = false;
  exportarPdfResumenTransportes(resumenTransportesAntonio.value, movimientosFiltrados.value, getPdfContext());
  showNotification('PDF Generado', 'Se descargó el resumen por transporte (Tony).', 'success');
}

function generarPdfFranco() {
  isPdfMenuOpen.value = false;
  exportarPdfMovimientosClientePaciente(movimientosFiltrados.value, getPdfContext());
  showNotification('PDF Generado', 'Se descargó el reporte de movimientos por cliente y paciente (Franco).', 'success');
}

// Exportación a Excel según pestaña activa
function exportarExcelActivo() {
  if (activeTab.value === 'movimientos') {
    const rows = movimientosFiltrados.value.map(g => ({
      Fecha: formatDate(g.fecha_gasto),
      Transporte: g.transportes?.nombre || 'N/A',
      Tipo_Movimiento: g.datos_adicionales?.tipo_movimiento_encomienda || 'Envío',
      Cliente: g.clientes?.nombre_cliente || 'Proveedor / otros',
      Paciente: g.paciente_referido || 'N/A',
      Proveedor: g.proveedores?.nombre || 'N/A',
      Bultos: g.datos_adicionales?.cantidad_bultos ?? 'Sin datos',
      Sentido: g.datos_adicionales?.sentido_movimiento || 'ida',
      Provincia: g.provincias?.nombre || 'N/A',
      Destino: g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || g.provincia?.nombre || 'N/A',
      Importe: Number(g.monto_total) || 0,
      Guia_Remito: g.numero_factura || 'N/A',
      Observaciones: g.datos_adicionales?.observacion_logistica || ''
    }));

    exportToExcel([{ name: 'Movimientos', data: rows }], `Movimientos_Logistica_${todayStr}`);
    showNotification('Exportación Excel', 'Se exportó la lista de movimientos filtrados correctamente.', 'success');
  } else if (activeTab.value === 'transportes') {
    const rows = resumenTransportesAntonio.value.map(t => ({
      Transporte: t.nombre,
      Total_Acumulado: t.montoTotal,
      Movimientos: t.movimientos,
      Bultos_Informados: t.bultosInformados,
      Promedio_Envio: t.promedio,
      Zonas: t.zonas,
    }));

    exportToExcel([{ name: 'Resumen_Transportes', data: rows }], `Resumen_Transportes_${todayStr}`);
    showNotification('Exportación Excel', 'Se exportó el resumen de transportes correctamente.', 'success');
  } else if (activeTab.value === 'control_semanal') {
    const rows = controlSemanalData.value.map(t => {
      const rowObj = {
        Transporte: t.nombre,
        Total_Mes: t.montoMes,
        Movimientos_Mes: t.movimientosMes,
        Bultos_Informados: t.bultosInformadosMes,
        Promedio: t.promedio,
      };
      t.semanas.forEach(s => {
        rowObj[`${s.label}_Monto`] = s.monto;
        rowObj[`${s.label}_Envios`] = s.movimientos;
        rowObj[`${s.label}_Bultos`] = s.bultos;
      });
      return rowObj;
    });

    exportToExcel([{ name: 'Control_Semanal', data: rows }], `Control_Semanal_Logistica_${todayStr}`);
    showNotification('Exportación Excel', 'Se exportó el desglose de control semanal a Excel.', 'success');
  } else {
    showNotification('Exportación', 'Abre el Libro Mayor para exportar las Cuentas Corrientes.', 'info');
  }
}

// Exportación a PDF (Impresión contextual)
function exportarPdfActivo() {
  window.print();
}

onMounted(fetchDatosLogistica);
</script>

<template>
  <div class="space-y-6 p-4 md:p-6 bg-slate-50 min-h-screen">
    <ToastNotification :notification="notification" />

    <!-- ENCABEZADO PRINCIPAL CON ACCIONES COMPLETAS -->
    <div class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <TruckIcon class="h-6 w-6 text-indigo-600" />
            <h1 class="text-xl font-bold text-slate-900">Transportes y Movimientos</h1>
          </div>
          <p class="mt-0.5 text-xs font-medium text-slate-500">
            Seguimiento operativo de encomiendas, movimientos y cuentas corrientes.
          </p>
        </div>

        <!-- Indicador/Resumen de Estado y Filtros -->
        <div class="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
          <span>Movimientos activos: <strong class="text-indigo-700 font-extrabold">{{ movimientosFiltrados.length }}</strong></span>
        </div>
      </div>

      <!-- Barra de Botones de Acción Alineados -->
      <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button type="button" class="btn-action-primary !py-1.5 !px-3 !text-xs" @click="isNuevoMovimientoOpen = true">
          <PlusIcon class="h-4 w-4" />
          <span>+ Registrar movimiento</span>
        </button>

        <button type="button" class="btn-action-primary !bg-indigo-700 hover:!bg-indigo-800 !py-1.5 !px-3 !text-xs" @click="router.push({ name: 'CargaBultos' })">
          <span>📦 Cargar bultos</span>
        </button>

        <button type="button" class="btn-action-secondary !py-1.5 !px-3 !text-xs" @click="abrirCrearEmpresa">
          <BuildingOffice2Icon class="h-4 w-4 text-indigo-600" />
          <span>+ Nueva empresa</span>
        </button>

        <button type="button" class="btn-action-secondary !py-1.5 !px-3 !text-xs" @click="isCargaMasivaOpen = true">
          <DocumentDuplicateIcon class="h-4 w-4 text-slate-600" />
          <span>Carga masiva</span>
        </button>

        <button type="button" class="btn-action-secondary !py-1.5 !px-3 !text-xs" @click="isCtaCteModalOpen = true">
          <BanknotesIcon class="h-4 w-4 text-slate-600" />
          <span>Vencimientos Cta. Cte.</span>
        </button>

        <button type="button" class="btn-action-emerald !py-1.5 !px-3 !text-xs" @click="exportarExcelActivo">
          <ArrowDownTrayIcon class="h-4 w-4" />
          <span>Exportar Excel</span>
        </button>

        <!-- Menú Desplegable de Exportar PDF -->
        <div class="relative inline-block text-left">
          <button
            type="button"
            class="btn-action-rose inline-flex items-center gap-1.5 !py-1.5 !px-3 !text-xs"
            @click="isPdfMenuOpen = !isPdfMenuOpen"
          >
            <PrinterIcon class="h-4 w-4" />
            <span>Exportar PDF</span>
            <ChevronDownIcon class="h-3.5 w-3.5 ml-0.5" />
          </button>

          <div
            v-if="isPdfMenuOpen"
            class="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl text-xs space-y-1"
          >
            <button
              type="button"
              class="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-950 transition-colors cursor-pointer border-b border-slate-100 pb-2.5"
              @click="isReporteConsolidadoOpen = true; isPdfMenuOpen = false;"
            >
              <SparklesIcon class="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <strong class="block font-bold text-purple-900">📦 Reporte Consolidado (Estadísticas)</strong>
                <span class="text-[11px] text-purple-600 font-normal">Métricas KPI, empresas líderes y descarga PDF</span>
              </div>
            </button>
            <button
              type="button"
              class="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-950 transition-colors cursor-pointer"
              @click="generarPdfGeneralCompacto"
            >
              <PrinterIcon class="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong class="block font-bold text-slate-900">1. Reporte general (Compacto)</strong>
                <span class="text-[11px] text-slate-500">Máximo 2 páginas — Referencia unificada</span>
              </div>
            </button>

            <button
              type="button"
              class="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-950 transition-colors cursor-pointer"
              @click="generarPdfGeneralCompleto"
            >
              <DocumentDuplicateIcon class="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
              <div>
                <strong class="block font-bold text-slate-900">2. Reporte general (Auditoría)</strong>
                <span class="text-[11px] text-slate-500">Todas las columnas detalladas</span>
              </div>
            </button>

            <button
              type="button"
              class="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-950 transition-colors cursor-pointer"
              @click="generarPdfTony"
            >
              <TruckIcon class="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong class="block font-bold text-slate-900">3. Resumen por transporte (Tony)</strong>
                <span class="text-[11px] text-slate-500">Máximo 1 página — Métricas clave</span>
              </div>
            </button>

            <button
              type="button"
              class="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-950 transition-colors cursor-pointer"
              @click="generarPdfFranco"
            >
              <UserIcon class="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <strong class="block font-bold text-slate-900">4. Clientes y pacientes (Franco)</strong>
                <span class="text-[11px] text-slate-500">Máximo 2 páginas — 3 grupos operativos</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- PANEL DE FILTROS GLOBALES COMPACTO Y ELEGANTE -->
    <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2.5">
      <!-- Fila Unificada: Período Inline + Selector Usuario + Botón Filtros Avanzados -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <!-- 1. Período Compacto Inline -->
        <div class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]">
          <CalendarDaysIcon class="h-3.5 w-3.5 text-indigo-600 shrink-0" />
          <span class="font-bold text-slate-700">Período:</span>
          <input v-model="filters.fechaDesde" type="date" class="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 h-6" />
          <span class="text-slate-400 font-bold">a</span>
          <input v-model="filters.fechaHasta" type="date" class="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 h-6" />

          <div class="inline-flex items-center gap-1 border-l border-slate-200 pl-1.5 ml-1">
            <button
              type="button"
              @click="verMesActual"
              :class="[
                'px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer',
                (filters.fechaDesde === firstDayMonthStr && filters.fechaHasta === todayStr) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              ]"
            >
              Mes actual
            </button>
            <button
              type="button"
              @click="verUltimos3Meses"
              class="px-2 py-0.5 text-[10px] font-bold rounded bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              3 Meses
            </button>
            <button
              type="button"
              @click="verTodoElHistorico"
              :class="[
                'px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer',
                (!filters.fechaDesde && !filters.fechaHasta) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              ]"
            >
              Historial
            </button>
          </div>
        </div>

        <!-- 2. Controles de Usuario + Filtros Avanzados -->
        <div class="inline-flex items-center gap-2">
          <!-- Filtro Rápido de Cargado Por / Usuario -->
          <div class="w-44 sm:w-52">
            <v-select
              v-model="filters.usuarioId"
              :options="usuariosOptions"
              :reduce="o => o.id"
              placeholder="👤 Cargado Por (Todos)..."
              class="v-select-filter text-[11px]"
            />
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
            @click="showFilters = !showFilters"
          >
            <FunnelIcon class="h-3.5 w-3.5 text-indigo-600" />
            <span>{{ showFilters ? 'Ocultar filtros' : 'Filtros avanzados' }}</span>
            <span v-if="activeFiltersCount > 0" class="ml-0.5 rounded-full bg-indigo-600 px-1.5 py-0.2 text-[9px] font-extrabold text-white">
              {{ activeFiltersCount }}
            </span>
          </button>

          <button 
            v-if="activeFiltersCount > 0" 
            type="button" 
            class="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline px-1.5 py-0.5 cursor-pointer" 
            @click="limpiarFiltros"
          >
            Limpiar ({{ activeFiltersCount }})
          </button>
        </div>
      </div>

      <!-- Panel Desplegable Completo de Filtros Avanzados (Compact Grid) -->
      <div v-if="showFilters" class="pt-2 border-t border-slate-100 space-y-2">
        <div class="flex items-center justify-between pb-0.5">
          <h4 class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Filtros de Búsqueda Avanzada</h4>
          <button type="button" class="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer" @click="limpiarFiltros">Limpiar todos</button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Búsqueda General</label>
            <input v-model="filters.searchQuery" type="text" class="form-input text-xs h-7 py-0.5 px-2 rounded-lg" placeholder="Paciente, Guía..." />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Cargado Por / Usuario</label>
            <v-select v-model="filters.usuarioId" :options="usuariosOptions" :reduce="o => o.id" placeholder="Todos los usuarios" class="v-select-filter text-xs" />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Transporte</label>
            <v-select v-model="filters.transporteId" :options="transportesOptions" :reduce="o => o.id" placeholder="Todos" class="v-select-filter text-xs" />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Tipo Movimiento</label>
            <select v-model="filters.tipoMovimiento" class="form-input text-xs h-7 py-0.5 px-2 rounded-lg">
              <option :value="null">Todos</option>
              <option value="Envío">Envío</option>
              <option value="Recepción">Recepción</option>
              <option value="Devolución">Devolución</option>
              <option value="Reposición">Reposición</option>
              <option value="Retiro">Retiro</option>
            </select>
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Tipo Logística</label>
            <select v-model="filters.tipoLogistica" class="form-input text-xs h-7 py-0.5 px-2 rounded-lg">
              <option :value="null">Todos</option>
              <option value="cirugia">Cirugía</option>
              <option value="proveedor_otros">Proveedor / Otros</option>
            </select>
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Sentido</label>
            <select v-model="filters.sentido" class="form-input text-xs h-7 py-0.5 px-2 rounded-lg">
              <option :value="null">Todos</option>
              <option value="ida">Ida</option>
              <option value="vuelta">Vuelta</option>
              <option value="ida_y_vuelta">Ida y Vuelta</option>
            </select>
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Cliente / Obra Social</label>
            <v-select v-model="filters.clienteId" :options="clientesOptions" :reduce="o => o.id" placeholder="Todos" class="v-select-filter text-xs" />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Paciente Referido</label>
            <input v-model="filters.paciente" type="text" class="form-input text-xs h-7 py-0.5 px-2 rounded-lg" placeholder="Nombre paciente" />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Proveedor</label>
            <v-select v-model="filters.proveedorId" :options="proveedoresOptions" :reduce="o => o.id" placeholder="Todos" class="v-select-filter text-xs" />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Provincia Destino</label>
            <v-select v-model="filters.provinciaId" :options="provinciasOptions" :reduce="o => o.id" placeholder="Todas" class="v-select-filter text-xs" />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Localidad Destino</label>
            <v-select v-model="filters.localidadId" :options="localidadesOptions" :reduce="o => o.id" placeholder="Todas" class="v-select-filter text-xs" />
          </div>

          <div>
            <label class="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">N° Guía / Remito</label>
            <input v-model="filters.numeroGuia" type="text" class="form-input text-xs h-7 py-0.5 px-2 rounded-lg" placeholder="N° Guía" />
          </div>
        </div>
      </div>
    </div>

    <!-- NAVEGACIÓN DE PESTAÑAS PRINCIPALES -->
    <div class="border-b border-slate-200 bg-white rounded-xl shadow-xs">
      <nav class="-mb-px flex flex-wrap space-x-2 md:space-x-6 px-4" aria-label="Tabs">
        <button
          type="button"
          class="tab-button"
          :class="activeTab === 'movimientos' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'movimientos'"
        >
          <ArrowsRightLeftIcon class="h-5 w-5" />
          <span>Movimientos</span>
        </button>

        <button
          type="button"
          class="tab-button"
          :class="activeTab === 'conciliacion' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'conciliacion'"
        >
          <ScaleIcon class="h-5 w-5 text-indigo-600" />
          <span>⚖️ Conciliación de Fletes</span>
        </button>

        <button
          type="button"
          class="tab-button"
          :class="activeTab === 'transportes' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'transportes'"
        >
          <TruckIcon class="h-5 w-5" />
          <span>Resumen por Transporte</span>
        </button>

        <button
          type="button"
          class="tab-button"
          :class="activeTab === 'control_semanal' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'control_semanal'"
        >
          <CalendarDaysIcon class="h-5 w-5" />
          <span>Control semanal</span>
        </button>

        <button
          type="button"
          class="tab-button"
          :class="activeTab === 'ctacte' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'ctacte'"
        >
          <BanknotesIcon class="h-5 w-5" />
          <span>Cuenta corriente</span>
        </button>

        <button
          type="button"
          class="tab-button"
          :class="activeTab === 'gestion' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'gestion'"
        >
          <BuildingOffice2Icon class="h-5 w-5" />
          <span>Empresas (ABM)</span>
        </button>

        <button
          type="button"
          class="tab-button"
          :class="activeTab === 'analisis' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'analisis'"
        >
          <ChartBarIcon class="h-5 w-5" />
          <span>Análisis Geográfico</span>
        </button>
      </nav>
    </div>

    <!-- PESTAÑA 1: MOVIMIENTOS -->
    <div v-if="activeTab === 'movimientos'" class="space-y-5">
      
      <!-- BANNER ALERTA REDIRECCIÓN DE INCONSISTENCIAS GEOGRÁFICAS -->
      <div v-if="filters.soloInconsistentes" class="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div class="flex items-center gap-2.5">
          <div class="p-2 bg-rose-100 rounded-lg text-rose-700 font-extrabold text-base">⚠️</div>
          <div>
            <h5 class="text-xs font-bold text-rose-900">
              Modo Revisión: Filtrando Operaciones con Destino Inconsistente ({{ movimientosFiltrados.length }} halladas)
            </h5>
            <p class="text-[11px] text-rose-700 mt-0.5">
              Hacé clic en el botón <strong>"Editar"</strong> (ícono de lápiz) en la fila correspondiente para corregir la provincia o localidad. Al guardar los cambios, volvé a abrir el reporte para imprimirlo actualizado.
            </p>
          </div>
        </div>
        <button 
          type="button" 
          class="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
          @click="filters.soloInconsistentes = false; targetGastoIdsRef = null; filters.provinciaId = null; filters.searchQuery = '';"
        >
          ✕ Quitar Filtro
        </button>
      </div>

      <!-- BANNER ALERTA REDIRECCIÓN DE OPERACIONES SIN DESTINO -->
      <div v-if="filters.soloSinDestino" class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div class="flex items-center gap-2.5">
          <div class="p-2 bg-amber-100 rounded-lg text-amber-800 font-extrabold text-base">❓</div>
          <div>
            <h5 class="text-xs font-bold text-amber-900">
              Modo Revisión: Filtrando Operaciones Sin Destino Asignado ({{ movimientosFiltrados.length }} halladas)
            </h5>
            <p class="text-[11px] text-amber-800 mt-0.5">
              Hacé clic en el botón <strong>"Editar"</strong> (ícono de lápiz) en la fila para asignar la provincia y localidad correspondientes.
            </p>
          </div>
        </div>
        <button 
          type="button" 
          class="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
          @click="filters.soloSinDestino = false; targetGastoIdsRef = null; filters.searchQuery = '';"
        >
          ✕ Quitar Filtro
        </button>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs font-medium text-slate-500">Consultá para qué se realizó cada movimiento.</p>

        <div class="flex items-center gap-2">
          <!-- Selector de Modo de Vista: Tabla (Default) vs Bloques -->
          <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer"
              :class="vistaModoMovimientos === 'tabla' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
              @click="vistaModoMovimientos = 'tabla'"
            >
              ☰ Tabla
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer"
              :class="vistaModoMovimientos === 'bloques' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
              @click="vistaModoMovimientos = 'bloques'"
            >
              🌁 Bloques
            </button>
          </div>
        </div>
      </div>

      <!-- Banner de Respuesta Textual Clara -->
      <div class="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs md:text-sm font-semibold text-indigo-900 shadow-xs">
        🚚 {{ respuestasFranco }}
      </div>

      <!-- LISTADO: MODO TABLA (PREDETERMINADO) -->
      <div v-if="vistaModoMovimientos === 'tabla'" class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 uppercase text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="px-4 py-3">Fecha</th>
                <th class="px-4 py-3">Transporte</th>
                <th class="px-4 py-3">Tipo / Motivo</th>
                <th class="px-4 py-3">Cliente / Referencia</th>
                <th class="px-4 py-3">Proveedor</th>
                <th class="px-4 py-3 text-center">Bultos</th>
                <th class="px-4 py-3">Sentido</th>
                <th class="px-4 py-3">Destino</th>
                <th class="px-4 py-3 text-right">Importe</th>
                <th class="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white font-medium text-slate-700">
              <tr v-if="loading">
                <td colspan="10" class="px-4 py-8 text-center text-slate-500">Cargando movimientos...</td>
              </tr>
              <tr v-else-if="movimientosPaginados.length === 0">
                <td colspan="10" class="px-4 py-8 text-center text-slate-500">No se encontraron movimientos registrados para los criterios seleccionados.</td>
              </tr>
              <tr
                v-for="g in movimientosPaginados"
                :key="g.id"
                class="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                @click="verDetalleGasto(g)"
              >
                <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{{ formatDate(g.fecha_gasto) }}</td>
                <td class="px-4 py-3 font-bold">
                  <span class="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full border" :class="getProveedorBadgeColor(g.transportes?.nombre || g.proveedores?.nombre)">
                    {{ normalizeProveedor(g.transportes?.nombre || g.proveedores?.nombre) }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-800">
                    {{ g.datos_adicionales?.tipo_movimiento_encomienda || 'Envío' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-col">
                    <span class="font-bold text-slate-900">{{ getClientePacienteDisplay(g).principal }}</span>
                    <span v-if="getClientePacienteDisplay(g).secundario" class="text-[11px] text-indigo-600 font-semibold">
                      {{ getClientePacienteDisplay(g).secundario }}
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3 font-bold">
                  <span class="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full border" :class="getProveedorBadgeColor(g.proveedores?.nombre)">
                    {{ normalizeProveedor(g.proveedores?.nombre) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-center font-bold text-indigo-700">
                  <span v-if="g.datos_adicionales?.cantidad_bultos !== undefined && g.datos_adicionales?.cantidad_bultos !== null && g.datos_adicionales?.cantidad_bultos !== ''">
                    {{ g.datos_adicionales.cantidad_bultos }}
                  </span>
                  <span v-else class="text-slate-400 font-normal">-</span>
                </td>
                <td class="px-4 py-3 capitalize text-slate-600">{{ g.datos_adicionales?.sentido_movimiento || 'ida' }}</td>
                <td class="px-4 py-3 text-slate-600">{{ g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || g.provincia?.nombre || 'Sin destino' }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-right font-bold">
                  <span v-if="!g.monto_total || Number(g.monto_total) === 0" class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 text-xs font-extrabold" title="Movimiento sin importe cargado. Hacé clic en editar para ingresar el monto.">
                    ⚠️ $ 0,00
                  </span>
                  <span v-else class="text-slate-900">{{ formatCurrency(g.monto_total) }}</span>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-center" @click.stop>
                  <div class="flex items-center justify-center gap-1.5">
                    <button type="button" class="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer" title="Ver detalle completo" @click.stop="verDetalleGasto(g)">
                      <EyeIcon class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded p-1 text-indigo-600 hover:bg-indigo-100 cursor-pointer" title="Editar movimiento" @click.stop="abrirEdicion(g)">
                      <PencilSquareIcon class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded p-1 text-rose-600 hover:bg-rose-100 hover:text-rose-700 cursor-pointer" title="Eliminar movimiento" @click.stop="eliminarGasto(g)">
                      <TrashIcon class="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- LISTADO: MODO BLOQUES (TARJETAS EN GRID) -->
      <div v-else-if="vistaModoMovimientos === 'bloques'" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-if="loading" class="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          Cargando movimientos...
        </div>
        <div v-else-if="movimientosPaginados.length === 0" class="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          No se encontraron movimientos registrados para los criterios seleccionados.
        </div>
        <div
          v-for="g in movimientosPaginados"
          :key="g.id"
          class="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
          @click="verDetalleGasto(g)"
        >
          <div>
            <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span class="text-xs text-slate-500 font-bold">{{ formatDate(g.fecha_gasto) }}</span>
              <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-800">
                {{ g.datos_adicionales?.tipo_movimiento_encomienda || 'Envío' }}
              </span>
            </div>

            <div class="mt-3 space-y-2 text-xs">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Transporte</span>
                <strong class="text-slate-900 font-bold text-sm">{{ g.transportes?.nombre || 'Sin Transporte' }}</strong>
              </div>

              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Cliente / Referencia</span>
                <strong class="text-slate-900 font-semibold block text-xs">{{ getClientePacienteDisplay(g).principal }}</strong>
                <span v-if="getClientePacienteDisplay(g).secundario" class="text-[11px] text-indigo-600 font-semibold block">
                  {{ getClientePacienteDisplay(g).secundario }}
                </span>
              </div>

              <div class="flex justify-between text-slate-600 pt-1 border-t border-slate-100">
                <span>Proveedor / Tipo:</span>
                <strong class="text-slate-800">{{ getProveedorLabel(g) }}</strong>
              </div>

              <div class="flex justify-between text-slate-600">
                <span>Bultos: <strong class="text-indigo-700">{{ (g.datos_adicionales?.cantidad_bultos !== undefined && g.datos_adicionales?.cantidad_bultos !== null && g.datos_adicionales?.cantidad_bultos !== '') ? g.datos_adicionales.cantidad_bultos : '-' }}</strong></span>
                <span>Sentido: <strong class="capitalize">{{ g.datos_adicionales?.sentido_movimiento || 'ida' }}</strong></span>
              </div>

              <div class="flex justify-between text-slate-600">
                <span>Destino:</span>
                <strong class="text-slate-800 truncate max-w-[150px]">{{ g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || g.provincia?.nombre || 'Sin destino' }}</strong>
              </div>
            </div>
          </div>

          <div class="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between">
            <div>
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Importe</span>
              <span v-if="!g.monto_total || Number(g.monto_total) === 0" class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 text-xs font-extrabold">
                ⚠️ $ 0,00
              </span>
              <strong v-else class="text-base font-bold text-slate-900">{{ formatCurrency(g.monto_total) }}</strong>
            </div>

            <div class="flex items-center gap-1">
              <button type="button" class="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Ver detalle completo" @click="verDetalleGasto(g)">
                <EyeIcon class="h-4 w-4" />
              </button>
              <button type="button" class="rounded p-1.5 text-indigo-600 hover:bg-indigo-50" title="Editar movimiento" @click="abrirEdicion(g)">
                <PencilSquareIcon class="h-4 w-4" />
              </button>
              <button type="button" class="rounded p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700" title="Eliminar movimiento" @click="eliminarGasto(g)">
                <TrashIcon class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- BARRA DE PAGINACIÓN COMPLETA -->
        <div class="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-3 text-xs text-slate-600">
            <span>
              Mostrando <strong class="text-slate-900">{{ resultFrom }}</strong> a <strong class="text-slate-900">{{ resultTo }}</strong> de <strong class="text-slate-900">{{ totalMovimientos }}</strong> movimientos
            </span>

            <div class="flex items-center gap-1">
              <span class="text-slate-400">| Filas:</span>
              <select v-model.number="pageSize" class="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
                <option :value="250">250</option>
                <option :value="1000">Todos</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="btn-pagination"
              :disabled="currentPage === 1"
              @click="currentPage--"
            >
              Anterior
            </button>

            <div class="flex items-center gap-1">
              <button
                v-for="p in totalPages"
                :key="p"
                type="button"
                class="btn-page-num"
                :class="currentPage === p ? 'bg-indigo-600 text-white font-bold' : 'bg-white text-slate-700 hover:bg-slate-100'"
                @click="currentPage = p"
              >
                {{ p }}
              </button>
            </div>

            <button
              type="button"
              class="btn-pagination"
              :disabled="currentPage >= totalPages"
              @click="currentPage++"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

    <!-- PESTAÑA 2: TRANSPORTES (TARJETAS CLICKEABLES CON PROYECCIÓN VALIDADA) -->
    <div v-else-if="activeTab === 'transportes'" class="space-y-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs font-medium text-slate-500">Revisá quién movió, cuánto costó y qué zonas cubrió.</p>

        <div class="flex items-center gap-2">
          <!-- Selector de Modo de Vista: Bloques (Default) vs Tabla -->
          <div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer"
              :class="vistaModoTransportes === 'bloques' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
              @click="vistaModoTransportes = 'bloques'"
            >
              🌁 Bloques
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-bold transition-all cursor-pointer"
              :class="vistaModoTransportes === 'tabla' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
              @click="vistaModoTransportes = 'tabla'"
            >
              ☰ Tabla
            </button>
          </div>

          <div class="relative w-full sm:w-64">
            <MagnifyingGlassIcon class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input v-model="searchTransporte" type="text" class="form-input pl-9 text-xs" placeholder="Buscar transporte..." />
          </div>
        </div>
      </div>

      <!-- Banner Textual -->
      <div class="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs md:text-sm font-semibold text-indigo-900 shadow-xs">
        🚚 {{ fraseDestacadaAntonio }}
      </div>

      <!-- VISTA MODO BLOQUES (TARJETAS DE TRANSPORTE) -->
      <div v-if="vistaModoTransportes === 'bloques'" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="t in transportesPaginados"
          :key="t.nombre"
          class="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-indigo-400 hover:shadow-md cursor-pointer"
          @click="filtrarPorTransporte(t.nombre)"
        >
          <div>
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 class="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{{ t.nombre }}</h3>
              <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{{ t.movimientos }} mov.</span>
            </div>

            <div class="mt-4 space-y-2 text-xs">
              <div class="flex justify-between items-center text-slate-600">
                <span>Tarifa / bulto:</span>
                <strong class="text-indigo-700 font-extrabold bg-indigo-50 px-2 py-0.5 rounded">
                  {{ t.tarifa_por_bulto > 0 ? formatCurrency(t.tarifa_por_bulto) : '$0 (Sin fija)' }}
                </strong>
              </div>
              <div class="flex justify-between text-slate-600">
                <span>Bultos informados:</span>
                <strong class="text-slate-900">{{ t.movsConBultos > 0 ? `${t.bultosInformados} bultos` : 'Sin datos' }}</strong>
              </div>
              <div class="flex justify-between text-slate-600">
                <span>Promedio por envío:</span>
                <strong class="text-slate-900">{{ formatCurrency(t.promedio) }}</strong>
              </div>
              <div class="flex justify-between text-slate-600">
                <span>Zonas cubiertas:</span>
                <span class="max-w-[160px] truncate text-right font-semibold text-slate-800">{{ t.zonas }}</span>
              </div>
              <div class="flex justify-between text-slate-600 pt-1 border-t border-slate-100">
                <span>{{ getProyeccionTexto(t).label }}</span>
                <strong class="text-indigo-600">{{ getProyeccionTexto(t).val }}</strong>
              </div>
              <div class="pt-2 flex justify-end">
                <button
                  type="button"
                  class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                  @click.stop="abrirEditarEmpresa(t)"
                >
                  <PencilSquareIcon class="h-3.5 w-3.5" />
                  <span>Editar Tarifa</span>
                </button>
              </div>
            </div>
          </div>

          <div class="mt-5 border-t border-slate-100 pt-3 flex items-center justify-between">
            <span
              class="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
              @click.stop="toggleExpandirTransporte(t.nombre)"
            >
              <span>{{ transporteExpandido === t.nombre ? 'Ocultar movimientos' : 'Ver movimientos' }}</span>
              <ArrowRightIcon class="h-3.5 w-3.5" />
            </span>
            <div class="text-right">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Acumulado</span>
              <strong class="text-base font-bold text-slate-900">{{ formatCurrency(t.montoTotal) }}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- VISTA MODO TABLA (LISTADO CONSOLIDADO DE TRANSPORTES) -->
      <div v-else-if="vistaModoTransportes === 'tabla'" class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 uppercase text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="px-4 py-3">Empresa de Transporte</th>
                <th class="px-4 py-3 text-center">Movimientos</th>
                <th class="px-4 py-3 text-center">Bultos Informados</th>
                <th class="px-4 py-3 text-right">Promedio por Envío</th>
                <th class="px-4 py-3 text-center">Participación</th>
                <th class="px-4 py-3">Zonas Cubiertas</th>
                <th class="px-4 py-3 text-right">Total Acumulado</th>
                <th class="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white font-medium text-slate-700">
              <tr v-if="transportesPaginados.length === 0">
                <td colspan="8" class="px-4 py-8 text-center text-slate-500">No se encontraron transportes para los criterios ingresados.</td>
              </tr>
              <tr v-for="t in transportesPaginados" :key="t.nombre" class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-bold text-slate-900">{{ t.nombre }}</td>
                <td class="px-4 py-3 text-center">
                  <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                    {{ t.movimientos }} mov.
                  </span>
                </td>
                <td class="px-4 py-3 text-center font-bold text-slate-800">
                  {{ t.movsConBultos > 0 ? `${t.bultosInformados} bultos` : 'Sin datos' }}
                </td>
                <td class="px-4 py-3 text-right font-semibold text-slate-900">{{ formatCurrency(t.promedio) }}</td>
                <td class="px-4 py-3 text-center font-bold text-indigo-700">
                  {{ totalResumenAntonio.totalGasto > 0 ? ((t.montoTotal / totalResumenAntonio.totalGasto) * 100).toFixed(1) + '%' : '0%' }}
                </td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[200px]">{{ t.zonas }}</td>
                <td class="px-4 py-3 text-right font-bold text-indigo-700">{{ formatCurrency(t.montoTotal) }}</td>
                <td class="px-4 py-3 text-center">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                    @click.stop="toggleExpandirTransporte(t.nombre)"
                  >
                    <span>{{ transporteExpandido === t.nombre ? 'Ocultar' : 'Ver movimientos' }}</span>
                    <ArrowRightIcon class="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot v-if="resumenTransportesAntonio.length > 0" class="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
              <tr>
                <td class="px-4 py-3.5">TOTAL LOGÍSTICA ({{ totalResumenAntonio.cant }} empresas)</td>
                <td class="px-4 py-3.5 text-center text-indigo-800">{{ totalResumenAntonio.totalMovs }} mov.</td>
                <td class="px-4 py-3.5 text-center">{{ totalResumenAntonio.totalBultos > 0 ? `${totalResumenAntonio.totalBultos} bultos` : '—' }}</td>
                <td class="px-4 py-3.5 text-right">{{ formatCurrency(totalResumenAntonio.promedioGlobal) }}</td>
                <td class="px-4 py-3.5 text-center text-indigo-700">100.0%</td>
                <td class="px-4 py-3.5 text-slate-500">—</td>
                <td class="px-4 py-3.5 text-right text-indigo-900 text-sm font-extrabold">{{ formatCurrency(totalResumenAntonio.totalGasto) }}</td>
                <td class="px-4 py-3.5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Detalle Expandido Simplificado de Transporte -->
      <div v-if="transporteExpandido" class="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <TruckIcon class="h-5 w-5 text-indigo-600" />
            <h3 class="text-base font-bold text-slate-900">Detalle de Movimientos: {{ transporteExpandido }}</h3>
            <span class="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
              {{ resumenPieTransporteExpandido.count }} movimientos
            </span>
          </div>
          <button type="button" class="rounded px-2.5 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 text-xs font-bold transition-colors cursor-pointer" @click="transporteExpandido = null">
            ✕ Cerrar detalle
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-4 py-2.5">Fecha</th>
                <th class="px-4 py-2.5">Proveedor</th>
                <th class="px-4 py-2.5">Cliente / Referencia</th>
                <th class="px-4 py-2.5">Destino</th>
                <th class="px-4 py-2.5 text-center">Bultos</th>
                <th class="px-4 py-2.5 text-right">Importe</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="g in movimientosTransporteExpandido" :key="g.id" class="hover:bg-slate-50">
                <td class="whitespace-nowrap px-4 py-2.5 text-slate-600">{{ formatDate(g.fecha_gasto) }}</td>
                <td class="px-4 py-2.5 text-slate-700">{{ getProveedorLabel(g) }}</td>
                <td class="px-4 py-2.5 font-semibold text-slate-900">{{ getClientePacienteDisplay(g).principal }}</td>
                <td class="px-4 py-2.5 text-slate-600">{{ g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || g.provincia?.nombre || 'Sin destino' }}</td>
                <td class="px-4 py-2.5 text-center font-bold text-indigo-700">
                  <span v-if="g.datos_adicionales?.cantidad_bultos !== undefined && g.datos_adicionales?.cantidad_bultos !== null && g.datos_adicionales?.cantidad_bultos !== ''">
                    {{ g.datos_adicionales.cantidad_bultos }}
                  </span>
                  <span v-else class="text-slate-400 font-normal">-</span>
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-bold text-slate-900">{{ formatCurrency(g.monto_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pie Unificado de Resumen de una Línea -->
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-800 flex items-center justify-between">
          <span>
            {{ resumenPieTransporteExpandido.count }} movimientos · {{ resumenPieTransporteExpandido.bultosTotal }} bultos informados · Total: {{ formatCurrency(resumenPieTransporteExpandido.totalImporte) }}
            <span v-if="resumenPieTransporteExpandido.sinBultos > 0" class="text-slate-500 font-normal ml-2">
              ({{ resumenPieTransporteExpandido.sinBultos }} movimientos sin bultos informados)
            </span>
          </span>
          <button type="button" class="text-indigo-600 hover:underline text-[11px] cursor-pointer" @click="transporteExpandido = null">
            Ocultar detalle
          </button>
        </div>
      </div>

      <!-- BARRA DE PAGINACIÓN COMPLETA DE TRANSPORTES -->
      <div class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div class="flex items-center gap-3 text-xs text-slate-600">
          <span>
            Mostrando <strong class="text-slate-900">{{ resumenTransportesAntonio.length === 0 ? 0 : (currentTransportePage - 1) * transportesPageSize + 1 }}</strong> a <strong class="text-slate-900">{{ Math.min(currentTransportePage * transportesPageSize, resumenTransportesAntonio.length) }}</strong> de <strong class="text-slate-900">{{ resumenTransportesAntonio.length }}</strong> transportes
          </span>

          <div class="flex items-center gap-1">
            <span class="text-slate-400">| Filas:</span>
            <select v-model.number="transportesPageSize" class="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
              <option :value="6">6</option>
              <option :value="15">15</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="1000">Todos</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="btn-pagination"
            :disabled="currentTransportePage === 1"
            @click="currentTransportePage--"
          >
            Anterior
          </button>

          <span class="text-xs font-bold text-slate-700 px-2">
            Página {{ currentTransportePage }} de {{ totalTransportesPage }}
          </span>

          <button
            type="button"
            class="btn-pagination"
            :disabled="currentTransportePage >= totalTransportesPage"
            @click="currentTransportePage++"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>

    <!-- PESTAÑA 3: CONTROL SEMANAL (CON MESES EN ESPAÑOL Y RANGOS REALES) -->
    <div v-else-if="activeTab === 'control_semanal'" class="space-y-5">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p class="text-xs font-medium text-slate-500">Revisá cómo evolucionan semanalmente los movimientos y gastos de cada transporte.</p>
        
        <div class="flex flex-wrap items-center gap-2">
          <select v-model.number="controlMes" class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
            <option v-for="(mName, idx) in NOMBRES_MESES" :key="idx + 1" :value="idx + 1">{{ mName }}</option>
          </select>
          <select v-model.number="controlAnio" class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
            <option :value="2025">2025</option>
            <option :value="2026">2026</option>
          </select>
        </div>
      </div>

      <!-- TABLA ACORDEÓN DE CONTROL SEMANAL POR TRANSPORTE -->
      <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 uppercase text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="px-4 py-3">Transporte</th>
                <th class="px-4 py-3 text-right">Total del Mes ($)</th>
                <th class="px-4 py-3 text-center">Movimientos</th>
                <th class="px-4 py-3 text-center">Bultos Informados</th>
                <th class="px-4 py-3 text-right">Promedio ($)</th>
                <th class="px-4 py-3 text-center">Desglose Semanal</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white font-medium text-slate-700">
              <tr v-if="controlSemanalData.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">No hay movimientos registrados para el mes seleccionado.</td>
              </tr>
              <template v-for="item in controlSemanalData" :key="item.nombre">
                <!-- Fila Principal del Transporte -->
                <tr class="hover:bg-slate-50 cursor-pointer transition-colors" @click="toggleExpandTransporte(item.nombre)">
                  <td class="px-4 py-3 font-bold text-slate-900">{{ item.nombre }}</td>
                  <td class="px-4 py-3 text-right font-extrabold text-slate-900">{{ formatCurrency(item.montoMes) }}</td>
                  <td class="px-4 py-3 text-center font-bold text-indigo-600">{{ item.movimientosMes }}</td>
                  <td class="px-4 py-3 text-center font-bold text-slate-700">{{ item.bultosInformadosMes > 0 ? item.bultosInformadosMes : '-' }}</td>
                  <td class="px-4 py-3 text-right font-semibold text-slate-700">{{ formatCurrency(item.promedio) }}</td>
                  <td class="px-4 py-3 text-center">
                    <button type="button" class="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">
                      <span>Ver semanas</span>
                      <ChevronUpIcon v-if="expandedTransportes[item.nombre]" class="h-3.5 w-3.5" />
                      <ChevronDownIcon v-else class="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>

                <!-- Fila Expandida Semanal con Rangos Reales -->
                <tr v-if="expandedTransportes[item.nombre]" class="bg-slate-50/70">
                  <td colspan="6" class="p-4">
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                      <div
                        v-for="sem in item.semanas"
                        :key="sem.numero"
                        class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
                      >
                        <span class="block text-[11px] font-bold uppercase text-slate-500">{{ sem.label }}</span>
                        <strong class="block text-sm font-extrabold text-slate-900 mt-1">{{ formatCurrency(sem.monto) }}</strong>
                        <div class="mt-2 flex justify-between text-[11px] text-slate-600">
                          <span>Mov: <strong>{{ sem.movimientos }}</strong></span>
                          <span>Bultos: <strong>{{ sem.bultos > 0 ? sem.bultos : '-' }}</strong></span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PESTAÑA 4: CUENTA CORRIENTE -->
    <div v-else-if="activeTab === 'ctacte'" class="space-y-5">
      <div class="flex items-center justify-between">
        <p class="text-xs font-medium text-slate-500">Libro mayor de vencimientos y estado de cuentas corrientes por transportista.</p>
        <button type="button" class="btn-action-primary" @click="isCtaCteModalOpen = true">
          <BanknotesIcon class="h-4 w-4" />
          <span>Abrir Libro Mayor de Vencimientos</span>
        </button>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <BanknotesIcon class="h-12 w-12 text-indigo-600 mx-auto mb-3" />
        <h3 class="text-base font-bold text-slate-900">Libro Mayor y Cuentas Corrientes</h3>
        <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
          Consultá los saldos acumulados por proveedor de transporte, facturas pendientes de pago y vencimientos vigentes.
        </p>
        <button type="button" class="btn-action-primary mx-auto" @click="isCtaCteModalOpen = true">
          Ver Libro Mayor de Vencimientos
        </button>
      </div>
    </div>

    <!-- MODAL DETALLE COMPLETO -->
    <div v-if="isDetalleModalOpen && gastoSeleccionadoDetalle" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="isDetalleModalOpen = false">
      <div class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <h3 class="text-base font-bold text-slate-900">Detalle del Movimiento Logístico</h3>
          <button type="button" class="text-slate-400 hover:text-slate-700" @click="isDetalleModalOpen = false">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          <div class="grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
            <div><span class="text-slate-500 font-semibold block">Fecha:</span><strong class="text-slate-900">{{ formatDate(gastoSeleccionadoDetalle.fecha_gasto) }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Importe Total:</span><strong class="text-slate-900 text-sm font-bold">{{ formatCurrency(gastoSeleccionadoDetalle.monto_total) }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Transporte:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.transportes?.nombre || 'N/A' }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Tipo Movimiento:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.datos_adicionales?.tipo_movimiento_encomienda || 'Envío' }}</strong></div>
          </div>
          <div class="grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
            <div><span class="text-slate-500 font-semibold block">Cliente:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.clientes?.nombre_cliente || 'Sin cliente asignado' }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Paciente Referido:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.paciente_referido || 'N/A' }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Proveedor Vinculado:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.proveedores?.nombre || 'N/A' }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Sentido:</span><strong class="text-slate-900 capitalize">{{ gastoSeleccionadoDetalle.datos_adicionales?.sentido_movimiento || 'ida' }}</strong></div>
          </div>
          <div class="grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
            <div><span class="text-slate-500 font-semibold block">Bultos:</span><strong class="text-slate-900 font-bold text-indigo-600">{{ gastoSeleccionadoDetalle.datos_adicionales?.cantidad_bultos ?? 'Sin datos' }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Guía / Remito:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.numero_factura || 'N/A' }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Provincia:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.provincias?.nombre || 'N/A' }}</strong></div>
            <div><span class="text-slate-500 font-semibold block">Destino:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.datos_adicionales?.destino_texto || gastoSeleccionadoDetalle.localidad_destino?.nombre || gastoSeleccionadoDetalle.provincias?.nombre || gastoSeleccionadoDetalle.provincia?.nombre || 'N/A' }}</strong></div>
          </div>
          <div><span class="text-slate-500 font-semibold block">Descripción General:</span><p class="text-slate-800 bg-slate-50 p-2 rounded mt-1">{{ gastoSeleccionadoDetalle.descripcion_general || 'Sin descripción' }}</p></div>
          <div v-if="gastoSeleccionadoDetalle.datos_adicionales?.observacion_logistica"><span class="text-slate-500 font-semibold block">Observación Logística:</span><p class="text-slate-800 bg-slate-50 p-2 rounded mt-1">{{ gastoSeleccionadoDetalle.datos_adicionales.observacion_logistica }}</p></div>
        </div>
        <div class="border-t border-slate-200 px-6 py-3 bg-slate-50 flex justify-end">
          <button type="button" class="btn-secondary text-xs" @click="isDetalleModalOpen = false">Cerrar</button>
        </div>
      </div>
    </div>

    <!-- MODALES STANDALONE DE ACCIÓN -->
    <MovimientoLogisticoForm
      v-model="isNuevoMovimientoOpen"
      mode="standalone"
      @saved="onMovimientoSaved"
      @show-notification="showNotification"
    />

    <EncomiendasBulkPaymentsModal
      v-model="isCargaMasivaOpen"
      @saved="fetchDatosLogistica"
      @show-notification="showNotification"
    />

    <AdminEditarGastoCuentaCorrienteModal
      v-model="isEditarModalOpen"
      :gasto="gastoEnEdicion"
      @saved="fetchDatosLogistica"
    />

    <AdminCtaCteVencimientosModal
      v-model="isCtaCteModalOpen"
      @show-notification="showNotification"
      @ir-a-corregir="handleIrACorregir"
    />

    <!-- PESTAÑA 5: GESTIÓN DE EMPRESAS DE TRANSPORTE (ABM) -->
    <div v-if="activeTab === 'gestion'" class="space-y-5">
      <div class="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <BuildingOffice2Icon class="h-5 w-5 text-indigo-600" />
            <span>Gestión de Empresas de Transporte</span>
          </h3>
          <p class="text-xs text-slate-500">Creá, editá y administrá el catálogo de transportes disponibles.</p>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div class="relative w-full sm:w-64">
            <MagnifyingGlassIcon class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input v-model="searchEmpresaTransporte" type="text" class="form-input pl-9 text-xs" placeholder="Buscar empresa..." />
          </div>

          <button type="button" class="btn-action-primary shrink-0" @click="abrirCrearEmpresa">
            <PlusIcon class="h-4 w-4" />
            <span>+ Nueva empresa</span>
          </button>
        </div>
      </div>

      <!-- TABLA DE EMPRESAS DE TRANSPORTE -->
      <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 uppercase text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="px-4 py-3"># ID</th>
                <th class="px-4 py-3">Empresa de Transporte</th>
                <th class="px-4 py-3 text-center">Registrado en</th>
                <th class="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white font-medium text-slate-700">
              <tr v-if="empresasTransporteFiltradas.length === 0">
                <td colspan="4" class="px-4 py-8 text-center text-slate-500">No se encontraron empresas de transporte.</td>
              </tr>
              <tr v-for="t in empresasTransporteFiltradas" :key="t.id" class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-mono text-slate-400">#{{ t.id }}</td>
                <td class="px-4 py-3 font-bold text-slate-900 text-sm">{{ t.label }}</td>
                <td class="px-4 py-3 text-center text-slate-500">{{ t.created_at ? formatDate(t.created_at) : 'Sin fecha' }}</td>
                <td class="px-4 py-3 text-right space-x-2">
                  <button type="button" class="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 transition-colors cursor-pointer" @click="abrirEditarEmpresa(t)">
                    <PencilSquareIcon class="h-3.5 w-3.5 text-indigo-600" />
                    <span>Editar</span>
                  </button>
                  <button type="button" class="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 shadow-2xs hover:bg-red-100 transition-colors cursor-pointer" @click="eliminarEmpresaTransporte(t)">
                    <TrashIcon class="h-3.5 w-3.5 text-red-600" />
                    <span>Eliminar</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PESTAÑA 6: ANÁLISIS GEOGRÁFICO DE TRANSPORTES -->
    <div v-if="activeTab === 'analisis'" class="space-y-4">
      <!-- Barra Superior Estilizada de Control y Comparación -->
      <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <ChartBarIcon class="h-4 w-4 text-indigo-600" />
              <span>Análisis Geográfico y Mapa de Destinos</span>
            </h4>
            <p class="text-[11px] text-slate-500 mt-0.5">
              Visualización geográfica vinculada automáticamente al Período y Filtros superiores.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <!-- Toggle Modo Comparación -->
            <label class="flex items-center cursor-pointer gap-2 text-xs font-semibold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span>Modo Comparación (B)</span>
              <input type="checkbox" v-model="isComparisonMode" class="sr-only peer" />
              <span class="w-8 h-4 bg-slate-300 rounded-full peer peer-checked:bg-indigo-600 flex items-center p-0.5 transition-colors">
                <span class="w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4"></span>
              </span>
            </label>

            <!-- Inputs Período B (Sólo si Comparación activa) -->
            <div v-if="isComparisonMode" class="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1 text-xs">
              <span class="font-bold text-indigo-900 text-[11px]">Período B:</span>
              <input type="date" v-model="fechaInicioB" class="rounded border border-indigo-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-800 focus:ring-1 focus:ring-indigo-500 h-6" />
              <span class="text-indigo-400 font-bold">a</span>
              <input type="date" v-model="fechaFinB" class="rounded border border-indigo-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-800 focus:ring-1 focus:ring-indigo-500 h-6" />
            </div>

            <button type="button" class="btn-action-emerald !py-1 !px-3 !text-xs" :disabled="isExportingAnalisis" @click="exportarAnalisisExcel">
              <ArrowDownTrayIcon class="h-3.5 w-3.5" />
              <span>{{ isExportingAnalisis ? 'Exportando...' : 'Exportar a Excel' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- CONTENIDO DEL ANÁLISIS GEOGRÁFICO -->
      <div v-if="analisisLoading" class="py-12 text-center text-slate-500">
        <svg class="animate-spin h-8 w-8 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        <p class="mt-2 text-xs font-semibold">Cargando datos del mapa y estadísticas...</p>
      </div>

      <div v-else-if="analisisError" class="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
        {{ analisisError }}
      </div>

      <div v-else-if="analisisData" class="space-y-4">
        <!-- KPIs Comparativos Modernos -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:shadow-sm transition-all">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gasto Total</span>
              <div class="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <BanknotesIcon class="h-4 w-4" />
              </div>
            </div>
            <p class="text-xl font-extrabold text-slate-900 mt-1.5">{{ formatCurrency(kpisPeriodoA.gasto_total) }}</p>
            <div v-if="isComparisonMode" class="mt-1 text-[11px] text-slate-500">
              vs {{ formatCurrency(kpisPeriodoB.gasto_total) }}
              <span :class="(kpisPeriodoA.gasto_total || 0) >= (kpisPeriodoB.gasto_total || 0) ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'">
                ({{ formatPercentage(((kpisPeriodoA.gasto_total || 0) - (kpisPeriodoB.gasto_total || 0)) / (kpisPeriodoB.gasto_total || 1) * 100) }})
              </span>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:shadow-sm transition-all">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nº de Movimientos</span>
              <div class="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <TruckIcon class="h-4 w-4" />
              </div>
            </div>
            <p class="text-xl font-extrabold text-indigo-600 mt-1.5">{{ kpisPeriodoA.total_gastos || 0 }}</p>
            <div v-if="isComparisonMode" class="mt-1 text-[11px] text-slate-500">
              vs {{ kpisPeriodoB.total_gastos || 0 }}
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:shadow-sm transition-all">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Localidades Únicas</span>
              <div class="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                <MapPinIcon class="h-4 w-4" />
              </div>
            </div>
            <p class="text-xl font-extrabold text-slate-900 mt-1.5">{{ kpisPeriodoA.localidades_unicas || 0 }}</p>
            <div v-if="isComparisonMode" class="mt-1 text-[11px] text-slate-500">
              vs {{ kpisPeriodoB.localidades_unicas || 0 }}
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:shadow-sm transition-all">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Costo Promedio / Envío</span>
              <div class="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <ScaleIcon class="h-4 w-4" />
              </div>
            </div>
            <p class="text-xl font-extrabold text-slate-900 mt-1.5">{{ formatCurrency(kpisPeriodoA.costo_promedio_gasto) }}</p>
            <div v-if="isComparisonMode" class="mt-1 text-[11px] text-slate-500">
              vs {{ formatCurrency(kpisPeriodoB.costo_promedio_gasto) }}
            </div>
          </div>
        </div>

        <!-- GRÁFICO Y MAPA EN GRID DE 2 COLUMNAS -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <!-- Desglose por Localidad Tabla -->
          <div class="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden flex flex-col">
            <div class="border-b border-slate-100 p-3 bg-slate-50/50 flex items-center justify-between">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800">Desglose por Localidad</h4>
              <span class="text-[10px] font-bold text-slate-400">{{ localidadesComparativa.length }} Destinos</span>
            </div>
            <div class="overflow-y-auto max-h-[440px] flex-1">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th class="px-3 py-2">Localidad</th>
                    <th class="px-3 py-2 text-right">Total (A)</th>
                    <th v-if="isComparisonMode" class="px-3 py-2 text-right">Total (B)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 font-medium">
                  <tr v-if="localidadesComparativa.length === 0">
                    <td :colspan="isComparisonMode ? 3 : 2" class="px-4 py-6 text-center text-slate-500 text-xs">No hay datos para los filtros aplicados.</td>
                  </tr>
                  <tr v-for="loc in localidadesComparativa" :key="loc.localidad_nombre" class="hover:bg-slate-50 transition-colors">
                    <td class="px-3 py-2 text-slate-900 font-semibold">
                      {{ loc.localidad_nombre }}
                      <span class="block text-[10px] font-normal text-slate-400">{{ loc.provincia_nombre }}</span>
                    </td>
                    <td class="px-3 py-2 text-right font-bold text-indigo-700">{{ formatCurrency(loc.gasto_total_a) }}</td>
                    <td v-if="isComparisonMode" class="px-3 py-2 text-right font-semibold text-slate-600">{{ formatCurrency(loc.gasto_total_b) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Mapa de Puntos por Localidad -->
          <div class="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2.5 flex items-center gap-1.5">
              <MapPinIcon class="h-4 w-4 text-rose-500" />
              <span>Mapa Interactivo de Destinos</span>
            </h4>
            <div class="h-[400px] w-full rounded-xl overflow-hidden z-0 border border-slate-200">
              <l-map ref="map" :zoom="5.5" :center="mapCenter" :key="mapKey">
                <l-tile-layer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" layer-type="base" name="OpenStreetMap"></l-tile-layer>
                <l-marker v-for="loc in localidadesComparativa" :key="loc.localidad_nombre" :lat-lng="getMarkerLatLng(loc)" :icon="getMarkerIcon(loc.gasto_total_a)">
                  <l-tooltip :options="{ sticky: true }">
                    <strong class="text-xs font-bold text-slate-900">{{ loc.localidad_nombre }}</strong>
                    <div class="text-[11px] text-slate-500">{{ loc.provincia_nombre }}</div>
                    <hr class="my-1 border-slate-200">
                    <div class="text-xs"><strong>Gasto (A):</strong> {{ formatCurrency(loc.gasto_total_a) }}</div>
                    <div v-if="isComparisonMode" class="text-xs"><strong>Gasto (B):</strong> {{ formatCurrency(loc.gasto_total_b) }}</div>
                  </l-tooltip>
                </l-marker>
              </l-map>
            </div>
          </div>
        </div>

        <!-- GRÁFICOS DE BARRAS COMPARATIVOS -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Gasto por Localidad ($)</h4>
            <div class="h-72">
              <Bar :data="chartGastosData" :options="chartAnalisisOptions" v-if="chartGastosData.labels.length > 0" />
              <p v-else class="text-center text-slate-400 py-16 text-xs">No hay datos para graficar.</p>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Frecuencia de Envíos por Localidad</h4>
            <div class="h-72">
              <Bar :data="chartFrecuenciaData" :options="chartAnalisisOptions" v-if="chartFrecuenciaData.labels.length > 0" />
              <p v-else class="text-center text-slate-400 py-16 text-xs">No hay datos para graficar.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- PESTAÑA DE CONCILIACIÓN DE FLETES -->
    <div v-if="activeTab === 'conciliacion'" class="space-y-6">
        
        <!-- TARJETAS KPI EN LA CABECERA DE CONCILIACIÓN -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Total Gastado en Fletes</span>
              <div class="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                <BanknotesIcon class="h-6 w-6" />
              </div>
            </div>
            <p class="mt-3 text-2xl font-black text-slate-900">
              {{ formatCurrency(summaryConciliacion.totalCost) }}
            </p>
            <p class="mt-1 text-xs text-slate-500 font-medium">Acumulado en el período seleccionado</p>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Guías / Remitos Procesados</span>
              <div class="rounded-xl bg-sky-50 p-2.5 text-sky-600">
                <ArrowsRightLeftIcon class="h-6 w-6" />
              </div>
            </div>
            <p class="mt-3 text-2xl font-black text-slate-900">
              {{ summaryConciliacion.totalGuias }}
            </p>
            <p class="mt-1 text-xs text-slate-500 font-medium">Envíos registrados en el sistema</p>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Bultos Despachados</span>
              <div class="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                <TruckIcon class="h-6 w-6" />
              </div>
            </div>
            <p class="mt-3 text-2xl font-black text-slate-900">
              {{ summaryConciliacion.totalBultos }}
            </p>
            <p class="mt-1 text-xs text-slate-500 font-medium">Total bultos informados</p>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Transporte Líder</span>
              <div class="rounded-xl bg-purple-50 p-2.5 text-purple-600">
                <SparklesIcon class="h-6 w-6" />
              </div>
            </div>
            <p class="mt-3 text-xl font-extrabold text-slate-900 truncate" :title="summaryConciliacion.transporteLider">
              {{ summaryConciliacion.transporteLider }}
            </p>
            <p class="mt-1 text-xs text-slate-500 font-medium">Mayor volumen operado</p>
          </div>
        </div>

        <!-- NAVEGACIÓN DE SUB-PESTAÑAS Y ACCIONES DE EXPORTACIÓN -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer"
              :class="conciliacionSubTab === 'resumen' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
              @click="conciliacionSubTab = 'resumen'"
            >
              📊 Resumen Consolidado
            </button>

            <button
              type="button"
              class="px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer"
              :class="conciliacionSubTab === 'detalle' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
              @click="conciliacionSubTab = 'detalle'"
            >
              📋 Detalle Guía por Guía ({{ guiasConciliacionFiltradasDetalle.length }})
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="exportarExcelConciliacionFletes"
              class="btn-action-emerald text-xs"
            >
              <ArrowDownTrayIcon class="h-4 w-4" />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              @click="generarPdfConciliacionFletes"
              class="btn-action-rose text-xs"
            >
              <PrinterIcon class="h-4 w-4" />
              <span>Exportar PDF Conciliación</span>
            </button>
          </div>
        </div>

        <!-- SUB-PESTAÑA 1: RESUMEN CONSOLIDADO -->
        <div v-if="conciliacionSubTab === 'resumen'" class="space-y-6">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <!-- TABLA 1: DESGLOSE POR CLIENTE / OBRA SOCIAL -->
            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <BuildingOffice2Icon class="h-5 w-5 text-indigo-600" />
                  <span>Desglose por Cliente / Obra Social</span>
                </h3>
                <span class="text-[11px] text-slate-400 font-medium">Hacé clic para filtrar detalle</span>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase">
                      <th class="py-2.5 px-3">Cliente / Obra Social</th>
                      <th class="py-2.5 px-3 text-center">Guías</th>
                      <th class="py-2.5 px-3 text-center">Bultos</th>
                      <th class="py-2.5 px-3 text-right">Total Gastado</th>
                      <th class="py-2.5 px-3 text-right">% Part.</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
                    <tr
                      v-for="item in summaryConciliacion.byCliente"
                      :key="item.nombre"
                      @click="filtrarConciliacionPorItem(item.nombre)"
                      class="hover:bg-indigo-50/60 cursor-pointer transition-colors"
                    >
                      <td class="py-3 px-3 font-bold text-slate-900">
                        {{ item.nombre }}
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{{ item.totalGuias }}</span>
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{{ item.totalBultos }}</span>
                      </td>
                      <td class="py-3 px-3 text-right font-bold text-indigo-600">
                        {{ formatCurrency(item.totalCost) }}
                      </td>
                      <td class="py-3 px-3 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <span class="font-bold text-slate-700">{{ formatPercent(item.porcentaje) }}</span>
                          <div class="h-2 w-16 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full bg-indigo-600" :style="{ width: `${Math.min(item.porcentaje, 100)}%` }"></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="summaryConciliacion.byCliente.length === 0">
                      <td colspan="5" class="py-6 text-center text-slate-400 italic">No hay registros para mostrar.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TABLA 2: DESGLOSE POR MÉDICO CIRUJANO / REFERENTE -->
            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <UserIcon class="h-5 w-5 text-indigo-600" />
                  <span>Desglose por Médico Cirujano / Referente</span>
                </h3>
                <span class="text-[11px] text-slate-400 font-medium">Hacé clic para filtrar detalle</span>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase">
                      <th class="py-2.5 px-3">Médico / Referente</th>
                      <th class="py-2.5 px-3 text-center">Guías</th>
                      <th class="py-2.5 px-3 text-center">Bultos</th>
                      <th class="py-2.5 px-3 text-right">Total Gastado</th>
                      <th class="py-2.5 px-3 text-right">% Part.</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
                    <tr
                      v-for="item in summaryConciliacion.byMedico"
                      :key="item.nombre"
                      @click="filtrarConciliacionPorItem(item.nombre)"
                      class="hover:bg-indigo-50/60 cursor-pointer transition-colors"
                    >
                      <td class="py-3 px-3 font-bold text-slate-900">
                        {{ item.nombre }}
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{{ item.totalGuias }}</span>
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{{ item.totalBultos }}</span>
                      </td>
                      <td class="py-3 px-3 text-right font-bold text-indigo-600">
                        {{ formatCurrency(item.totalCost) }}
                      </td>
                      <td class="py-3 px-3 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <span class="font-bold text-slate-700">{{ formatPercent(item.porcentaje) }}</span>
                          <div class="h-2 w-16 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full bg-indigo-600" :style="{ width: `${Math.min(item.porcentaje, 100)}%` }"></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="summaryConciliacion.byMedico.length === 0">
                      <td colspan="5" class="py-6 text-center text-slate-400 italic">No hay registros para mostrar.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- TARJETAS SECUNDARIAS: DESGLOSE POR COURIER / TRANSPORTE -->
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <TruckIcon class="h-5 w-5 text-purple-600" />
              <span>Desglose por Empresa de Transporte / Courier</span>
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div
                v-for="t in summaryConciliacion.byTransporte"
                :key="t.nombre"
                class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <span
                    class="px-2.5 py-0.5 text-xs font-bold rounded-full border"
                    :class="getProveedorBadgeColor(t.nombre)"
                  >
                    {{ t.nombre }}
                  </span>
                  <span class="text-xs font-bold text-indigo-600">{{ formatPercent(t.porcentaje) }}</span>
                </div>

                <p class="text-lg font-extrabold text-slate-900">
                  {{ formatCurrency(t.totalCost) }}
                </p>

                <div class="flex items-center justify-between text-xs text-slate-500 border-t border-slate-200/80 pt-2">
                  <span>Guías: <strong>{{ t.totalGuias }}</strong></span>
                  <span>Bultos: <strong>{{ t.totalBultos }}</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SUB-PESTAÑA 2: DETALLE GUÍA POR GUÍA -->
        <div v-if="conciliacionSubTab === 'detalle'" class="space-y-4">
          
          <!-- BARRA DE FILTROS DEL DETALLE -->
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            
            <div class="relative flex-1">
              <MagnifyingGlassIcon class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                v-model="conciliacionSearch"
                type="text"
                placeholder="Buscar por cliente, médico, paciente, número de guía o transporte..."
                class="w-full rounded-xl border border-slate-300 pl-9 pr-4 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-600">Estado:</span>
              <select
                v-model="conciliacionFiltroEstado"
                class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              >
                <option value="TODOS">TODOS LOS ESTADOS</option>
                <option value="CONCILIADO">✅ CONCILIADO</option>
                <option value="PENDIENTE">⏳ PENDIENTE</option>
                <option value="EN_REVISION">🔍 EN REVISIÓN</option>
              </select>
            </div>

            <div v-if="conciliacionFiltroClienteMedico" class="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 text-xs text-indigo-800">
              <span>Filtro activo: <strong>"{{ conciliacionFiltroClienteMedico }}"</strong></span>
              <button @click="limpiarFiltroClienteMedico" class="font-bold text-indigo-600 hover:text-indigo-900 cursor-pointer">✕</button>
            </div>
          </div>

          <!-- TABLA DE DETALLE GUÍA POR GUÍA -->
          <div class="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                    <th class="py-3 px-4">Fecha</th>
                    <th class="py-3 px-4">Nº Guía / Factura</th>
                    <th class="py-3 px-4">Transporte</th>
                    <th class="py-3 px-4">Cliente / Obra Social</th>
                    <th class="py-3 px-4">Médico / Referente</th>
                    <th class="py-3 px-4">Destino</th>
                    <th class="py-3 px-4 text-center">Bultos</th>
                    <th class="py-3 px-4 text-right">Monto ($)</th>
                    <th class="py-3 px-4 text-center">Estado Conciliación</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
                  <tr
                    v-for="g in guiasConciliacionFiltradasDetalle"
                    :key="g.id"
                    class="hover:bg-slate-50 transition-colors"
                  >
                    <td class="py-3 px-4 font-bold text-slate-800">
                      {{ formatDate(g.fecha_gasto) }}
                    </td>
                    <td class="py-3 px-4 font-mono font-bold text-slate-900">
                      <div>{{ g.numero_factura || g.datos_adicionales?.numero_guia || 'Sin Guía' }}</div>
                      <span
                        v-if="g.datos_adicionales?.origen_carga === 'carga_rapida_bultos' || g.datos_adicionales?.observacion_logistica?.includes('Bultos')"
                        class="mt-1 inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-800 border border-purple-200"
                      >
                        📦 Carga Directa Bultos
                      </span>
                    </td>
                    <td class="py-3 px-4">
                      <span
                        class="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full border"
                        :class="getProveedorBadgeColor(g.transportes?.nombre || g.proveedores?.nombre)"
                      >
                        {{ normalizeProveedor(g.transportes?.nombre || g.proveedores?.nombre) }}
                      </span>
                    </td>
                    <td class="py-3 px-4 font-semibold text-slate-900">
                      {{ getConciliacionClienteNombre(g) }}
                    </td>
                    <td class="py-3 px-4 text-slate-600">
                      {{ getConciliacionMedicoNombre(g) }}
                    </td>
                    <td class="py-3 px-4 text-slate-500">
                      {{ g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || '-' }}
                    </td>
                    <td class="py-3 px-4 text-center font-bold text-slate-800">
                      {{ g.datos_adicionales?.cantidad_bultos ?? 0 }}
                    </td>
                    <td class="py-3 px-4 text-right font-black text-slate-900">
                      {{ formatCurrency(g.monto_total) }}
                    </td>
                    <td class="py-3 px-4 text-center">
                      <select
                        :value="g.datos_adicionales?.estado_conciliacion || 'PENDIENTE'"
                        @change="e => cambiarEstadoConciliacion(g, e.target.value)"
                        class="rounded-lg border px-2.5 py-1 text-xs font-bold transition-all cursor-pointer"
                        :class="{
                          'bg-emerald-50 text-emerald-800 border-emerald-300': (g.datos_adicionales?.estado_conciliacion === 'CONCILIADO'),
                          'bg-amber-50 text-amber-800 border-amber-300': (!g.datos_adicionales?.estado_conciliacion || g.datos_adicionales?.estado_conciliacion === 'PENDIENTE'),
                          'bg-purple-50 text-purple-800 border-purple-300': (g.datos_adicionales?.estado_conciliacion === 'EN_REVISION')
                        }"
                      >
                        <option value="CONCILIADO">✅ CONCILIADO</option>
                        <option value="PENDIENTE">⏳ PENDIENTE</option>
                        <option value="EN_REVISION">🔍 EN REVISIÓN</option>
                      </select>
                    </td>
                  </tr>

                  <tr v-if="guiasConciliacionFiltradasDetalle.length === 0">
                    <td colspan="9" class="py-8 text-center text-slate-400 italic">
                      No se encontraron guías/remitos para los filtros seleccionados.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

    <!-- MODAL DE REPORTE CONSOLIDADO -->
    <ReporteConsolidadoModal
      :is-open="isReporteConsolidadoOpen"
      :movimientos="movimientosFiltrados"
      @close="isReporteConsolidadoOpen = false"
    />

    <!-- MODAL DE CREACIÓN / EDICIÓN DE EMPRESA DE TRANSPORTE -->
    <div v-if="isEmpresaModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="isEmpresaModalOpen = false">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-bold text-slate-900">{{ isEmpresaEdicion ? 'Editar Empresa de Transporte' : 'Nueva Empresa de Transporte' }}</h3>
          <button type="button" class="text-slate-400 hover:text-slate-700" @click="isEmpresaModalOpen = false">✕</button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Nombre de la Empresa <span class="text-rose-500">*</span></label>
            <input v-model="empresaForm.nombre" type="text" class="form-input text-xs" placeholder="Ej: Vía Cargo, OCA, Expreso Ledesma..." @keyup.enter="guardarEmpresaTransporte" />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Tarifa Automática por Bulto ($)</label>
            <input v-model.number="empresaForm.tarifa_por_bulto" type="number" min="0" step="1000" class="form-input text-xs font-extrabold text-indigo-700" placeholder="Ej: 30000" />
            <p class="text-[11px] text-slate-500 mt-1">Valor utilizado para auto-calcular el importe en Cargar Bultos. Usar 0 si no posee tarifa fija.</p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" class="btn-secondary" :disabled="savingEmpresa" @click="isEmpresaModalOpen = false">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="savingEmpresa" @click="guardarEmpresaTransporte">
            {{ savingEmpresa ? 'Guardando...' : (isEmpresaEdicion ? 'Guardar Cambios' : 'Crear Empresa') }}
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL DE DETALLE COMPLETO DE MOVIMIENTO LOGÍSTICO -->
    <div v-if="isDetalleModalOpen && gastoSeleccionadoDetalle" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" @click.self="isDetalleModalOpen = false">
      <div class="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl space-y-5 border border-slate-200 animate-fade-in">
        
        <!-- Encabezado Modal -->
        <div class="flex items-start justify-between border-b border-slate-100 pb-4">
          <div class="flex items-center gap-3.5">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold border border-indigo-100 shadow-inner shrink-0">
              <TruckIcon class="h-6 w-6" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-extrabold text-indigo-800">
                  {{ gastoSeleccionadoDetalle.datos_adicionales?.tipo_movimiento_encomienda || 'Envío' }}
                </span>
                <span class="text-xs text-slate-400 font-mono">#ID {{ gastoSeleccionadoDetalle.id }}</span>
              </div>
              <h3 class="text-lg font-extrabold text-slate-900 mt-0.5">
                {{ gastoSeleccionadoDetalle.transportes?.nombre || 'Sin Transporte' }}
              </h3>
              <p class="text-xs text-slate-500 font-medium">
                Fecha del Movimiento: {{ formatDate(gastoSeleccionadoDetalle.fecha_gasto) }}
              </p>
            </div>
          </div>

          <div class="text-right">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Importe Total</span>
            <span class="text-2xl font-black text-indigo-700">{{ formatCurrency(gastoSeleccionadoDetalle.monto_total) }}</span>
          </div>
        </div>

        <!-- Grilla de Detalles -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          
          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">📦 Bultos Informados</span>
            <span class="text-sm font-extrabold text-slate-900 block">
              {{ gastoSeleccionadoDetalle.datos_adicionales?.cantidad_bultos ? `${gastoSeleccionadoDetalle.datos_adicionales.cantidad_bultos} bulto(s)` : 'No especificado' }}
            </span>
            <span v-if="gastoSeleccionadoDetalle.datos_adicionales?.precio_unitario_prefijado" class="text-[11px] text-indigo-600 font-semibold block">
              Tarifa: {{ formatCurrency(gastoSeleccionadoDetalle.datos_adicionales.precio_unitario_prefijado) }} / bulto
            </span>
          </div>

          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">🔄 Sentido del Movimiento</span>
            <span class="text-sm font-extrabold text-slate-900 capitalize block">
              {{ gastoSeleccionadoDetalle.datos_adicionales?.sentido_movimiento || 'Ida' }}
            </span>
          </div>

          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">📍 Destino del Envío</span>
            <span class="text-sm font-bold text-slate-900 block">
              {{ gastoSeleccionadoDetalle.datos_adicionales?.destino_texto || gastoSeleccionadoDetalle.localidad_destino?.nombre || gastoSeleccionadoDetalle.provincias?.nombre || gastoSeleccionadoDetalle.provincia?.nombre || 'Sin destino especificado' }}
            </span>
          </div>

          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">📄 N° de Guía / Remito</span>
            <span class="text-sm font-bold text-slate-900 block font-mono">
              {{ gastoSeleccionadoDetalle.numero_factura || 'Sin número registrado' }}
            </span>
          </div>

          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">🏥 Cliente / Obra Social</span>
            <span class="text-sm font-bold text-indigo-900 block">
              {{ gastoSeleccionadoDetalle.clientes?.nombre_cliente || 'No especificado' }}
            </span>
          </div>

          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">👤 Paciente Referido</span>
            <span class="text-sm font-bold text-slate-900 block">
              {{ gastoSeleccionadoDetalle.paciente_referido || 'No aplica / Sin paciente' }}
            </span>
          </div>

          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1 sm:col-span-2">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">🏢 Proveedor Vinculado</span>
            <span class="text-sm font-bold text-slate-900 block">
              {{ getProveedorLabel(gastoSeleccionadoDetalle) }}
            </span>
          </div>

          <div v-if="gastoSeleccionadoDetalle.descripcion_general" class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1 sm:col-span-2">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">📝 Descripción Operativa</span>
            <p class="text-xs font-semibold text-slate-800 leading-relaxed">
              {{ gastoSeleccionadoDetalle.descripcion_general }}
            </p>
          </div>

          <div v-if="gastoSeleccionadoDetalle.datos_adicionales?.observacion_logistica" class="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 space-y-1 sm:col-span-2">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block">💬 Observación Logística</span>
            <p class="text-xs font-semibold text-amber-950 leading-relaxed">
              {{ gastoSeleccionadoDetalle.datos_adicionales.observacion_logistica }}
            </p>
          </div>

        </div>

        <!-- Pie del Modal -->
        <div class="flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
            @click="isDetalleModalOpen = false; abrirEdicion(gastoSeleccionadoDetalle)"
          >
            <PencilSquareIcon class="h-4 w-4" />
            <span>Editar este movimiento</span>
          </button>

          <button
            type="button"
            class="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            @click="isDetalleModalOpen = false"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>

    <AdminEditarGastoCuentaCorrienteModal
      v-model="isEditarModalOpen"
      :gasto="gastoEnEdicion"
      :proveedores="proveedoresOptions"
      :transportes="transportesOptions"
      @saved="fetchDatosLogistica"
      @show-notification="showNotification"
    />

    <AdminCtaCteVencimientosModal
      v-model="isCtaCteModalOpen"
      @show-notification="showNotification"
      @ir-a-corregir="handleIrACorregir"
    />
  </div>
</template>

<style scoped>
.form-input { @apply block w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs; }
.field-label { @apply block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1; }

.tab-button { @apply inline-flex items-center gap-2 border-b-2 py-3 px-3 text-xs md:text-sm font-bold transition-colors cursor-pointer; }
.tab-active { @apply border-indigo-600 text-indigo-600; }
.tab-inactive { @apply border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700; }

.btn-action-primary { @apply inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 cursor-pointer; }
.btn-action-secondary { @apply inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer; }
.btn-action-emerald { @apply inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 cursor-pointer; }
.btn-action-rose { @apply inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800 shadow-sm transition-colors hover:bg-rose-100 cursor-pointer; }

.btn-secondary { @apply rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer; }
.btn-pagination { @apply rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-100 cursor-pointer; }
.btn-page-num { @apply h-7 w-7 rounded-lg text-xs font-bold transition-colors cursor-pointer; }

.v-select-filter { --vs-border-radius: 0.5rem; font-size: 0.75rem; }
</style>
