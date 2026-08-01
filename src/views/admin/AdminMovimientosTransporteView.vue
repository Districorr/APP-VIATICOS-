<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { useExcelExporter } from '../../composables/useExcelExporter.js';

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
} from '@heroicons/vue/24/outline';
import { useLogisticaPdfExportVariants } from '../../composables/useLogisticaPdfExportVariants.js';

const activeTab = ref('movimientos'); // 'movimientos' | 'transportes' | 'control_semanal' | 'ctacte'
const loading = ref(true);
const gastosLogistica = ref([]);
const notification = ref({});

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
});

// Opciones de Selectores para Filtros
const clientesOptions = ref([]);
const transportesOptions = ref([]);
const proveedoresOptions = ref([]);
const provinciasOptions = ref([]);
const localidadesOptions = ref([]);

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
    const [gastosRes, clientesRes, transportesRes, proveedoresRes, provinciasRes, localidadesRes] = await Promise.all([
      supabase.from('gastos').select('*').order('fecha_gasto', { ascending: false }),
      supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
      supabase.from('transportes').select('id, nombre').order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('provincias').select('id, nombre').order('nombre'),
      supabase.from('localidades').select('id, nombre').order('nombre'),
    ]);

    if (clientesRes.data) clientesOptions.value = clientesRes.data.map(c => ({ id: c.id, label: c.nombre_cliente }));
    if (transportesRes.data) transportesOptions.value = transportesRes.data.map(t => ({ id: t.id, label: t.nombre }));
    if (proveedoresRes.data) proveedoresOptions.value = proveedoresRes.data.map(p => ({ id: p.id, label: p.nombre }));
    if (provinciasRes.data) provinciasOptions.value = provinciasRes.data.map(p => ({ id: p.id, label: p.nombre }));
    if (localidadesRes.data) localidadesOptions.value = localidadesRes.data.map(l => ({ id: l.id, label: l.nombre }));

    const gastosList = gastosRes.data || [];
    const clientesMap = new Map((clientesRes.data || []).map(c => [c.id, c]));
    const transportesMap = new Map((transportesRes.data || []).map(t => [t.id, t]));
    const proveedoresMap = new Map((proveedoresRes.data || []).map(p => [p.id, p]));
    const provinciasMap = new Map((provinciasRes.data || []).map(p => [p.id, p]));
    const localidadesMap = new Map((localidadesRes.data || []).map(l => [l.id, l]));

    const logistica = gastosList.map(g => {
      return {
        ...g,
        clientes: g.cliente_id ? clientesMap.get(g.cliente_id) : null,
        transportes: g.transporte_id ? transportesMap.get(g.transporte_id) : null,
        proveedores: g.proveedor_id ? proveedoresMap.get(g.proveedor_id) : null,
        provincias: g.provincia_id ? provinciasMap.get(g.provincia_id) : null,
        localidad_destino: g.localidad_destino_id ? localidadesMap.get(g.localidad_destino_id) : null,
      };
    }).filter(g => {
      const extra = g.datos_adicionales || {};
      return extra.modulo === 'logistica' 
        || g.origen_gasto === 'cuenta_corriente_empresa'
        || g.tipo_gasto_id === 22
        || extra.origen_carga === 'encomiendas_carga_multiple';
    });

    gastosLogistica.value = logistica;
  } catch (e) {
    console.error('Error al cargar datos logísticos:', e);
    gastosLogistica.value = [];
  } finally {
    loading.value = false;
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
    const destinoText = extra.destino_texto || g.localidad_destino?.nombre || '';
    const descText = g.descripcion_general || '';
    const obsText = extra.observacion_logistica || '';
    const guiaText = g.numero_factura || extra.numero_guia || '';

    // Búsqueda global
    const matchesSearch = !q || (
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
    const matchesProveedor = !filters.proveedorId || String(g.proveedor_id) === String(filters.proveedorId);
    const matchesProvincia = !filters.provinciaId || String(g.provincia_id) === String(filters.provinciaId);
    const matchesLocalidad = !filters.localidadId || String(g.localidad_destino_id) === String(filters.localidadId);
    const matchesGuia = !filters.numeroGuia || guiaText.toLowerCase().includes(filters.numeroGuia.toLowerCase().trim());

    // Bultos (Diferencia sin asumir 1 bulto por defecto)
    const hasBultosField = extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '';
    const cantBultos = hasBultosField ? Number(extra.cantidad_bultos) : 0;
    const matchesBultos = filters.conBultos === 'todos'
      || (filters.conBultos === 'con_bultos' && hasBultosField && cantBultos > 0)
      || (filters.conBultos === 'sin_bultos' && (!hasBultosField || cantBultos === 0));

    return matchesSearch && matchesFechaDesde && matchesFechaHasta && matchesTransporte
      && matchesTipoMov && matchesTipoLog && matchesSentido && matchesCliente
      && matchesPaciente && matchesProveedor && matchesProvincia && matchesLocalidad
      && matchesGuia && matchesBultos;
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

  return Object.values(mapa).map(t => ({
    ...t,
    promedio: t.movimientos > 0 ? t.montoTotal / t.movimientos : 0,
    zonas: Array.from(t.provincias).join(', ') || 'Sin zona especificada',
  })).sort((a, b) => b.montoTotal - a.montoTotal);
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
      Destino: g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || 'N/A',
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
    <div class="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div class="flex items-center gap-2.5">
            <TruckIcon class="h-8 w-8 text-indigo-600" />
            <h1 class="text-2xl font-bold text-slate-900">Transportes y Movimientos</h1>
          </div>
          <p class="mt-1 text-xs md:text-sm font-medium text-slate-600">
            Seguimiento operativo de encomiendas, movimientos y cuentas corrientes.
          </p>
        </div>

        <!-- Indicador/Filtro de Período Inicializado con el 1º del Mes y Fecha Actual -->
        <div class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
          <CalendarDaysIcon class="h-4 w-4 text-slate-500" />
          <span class="font-bold text-slate-600">Período:</span>
          <input v-model="filters.fechaDesde" type="date" class="rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
          <span class="text-slate-400">a</span>
          <input v-model="filters.fechaHasta" type="date" class="rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
        </div>
      </div>

      <!-- Barra de Botones de Acción Alineados -->
      <div class="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
        <button type="button" class="btn-action-primary" @click="isNuevoMovimientoOpen = true">
          <PlusIcon class="h-4 w-4" />
          <span>+ Registrar movimiento</span>
        </button>

        <button type="button" class="btn-action-secondary" @click="isCargaMasivaOpen = true">
          <DocumentDuplicateIcon class="h-4 w-4 text-slate-600" />
          <span>Carga masiva</span>
        </button>

        <button type="button" class="btn-action-secondary" @click="isCtaCteModalOpen = true">
          <BanknotesIcon class="h-4 w-4 text-slate-600" />
          <span>Vencimientos Cta. Cte.</span>
        </button>

        <button type="button" class="btn-action-emerald" @click="exportarExcelActivo">
          <ArrowDownTrayIcon class="h-4 w-4" />
          <span>Exportar Excel</span>
        </button>

        <!-- Menú Desplegable de Exportar PDF -->
        <div class="relative inline-block text-left">
          <button
            type="button"
            class="btn-action-rose inline-flex items-center gap-1.5"
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

    <!-- NAVEGACIÓN DE 4 PESTAÑAS PRINCIPALES -->
    <div class="border-b border-slate-200 bg-white rounded-xl shadow-xs">
      <nav class="-mb-px flex flex-wrap space-x-2 md:space-x-8 px-4" aria-label="Tabs">
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
          :class="activeTab === 'transportes' ? 'tab-active' : 'tab-inactive'"
          @click="activeTab = 'transportes'"
        >
          <TruckIcon class="h-5 w-5" />
          <span>Transportes</span>
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
      </nav>
    </div>

    <!-- PESTAÑA 1: MOVIMIENTOS -->
    <div v-if="activeTab === 'movimientos'" class="space-y-5">
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

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 cursor-pointer"
            @click="showFilters = !showFilters"
          >
            <FunnelIcon class="h-4 w-4 text-slate-500" />
            <span>{{ showFilters ? 'Ocultar filtros' : 'Mostrar filtros' }}</span>
            <span v-if="activeFiltersCount > 0" class="ml-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
              {{ activeFiltersCount }}
            </span>
          </button>
        </div>
      </div>

      <!-- BANNER DE FILTROS COLAPSABLE COMPLETO -->
      <div v-if="showFilters" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">Filtros de Búsqueda Avanzada</h4>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary py-1 text-xs" @click="limpiarFiltros">Limpiar filtros</button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <label class="field-label">Búsqueda General</label>
            <input v-model="filters.searchQuery" type="text" class="form-input text-xs" placeholder="Paciente, Guía, Transporte..." />
          </div>

          <div>
            <label class="field-label">Transporte</label>
            <v-select v-model="filters.transporteId" :options="transportesOptions" :reduce="o => o.id" placeholder="Todos" class="v-select-filter" />
          </div>

          <div>
            <label class="field-label">Tipo de Movimiento</label>
            <select v-model="filters.tipoMovimiento" class="form-input text-xs">
              <option :value="null">Todos</option>
              <option value="Envío">Envío</option>
              <option value="Recepción">Recepción</option>
              <option value="Devolución">Devolución</option>
              <option value="Reposición">Reposición</option>
              <option value="Retiro">Retiro</option>
            </select>
          </div>

          <div>
            <label class="field-label">Tipo de Logística</label>
            <select v-model="filters.tipoLogistica" class="form-input text-xs">
              <option :value="null">Todos</option>
              <option value="cirugia">Cirugía</option>
              <option value="proveedor_otros">Proveedor / Otros</option>
            </select>
          </div>

          <div>
            <label class="field-label">Sentido</label>
            <select v-model="filters.sentido" class="form-input text-xs">
              <option :value="null">Todos</option>
              <option value="ida">Ida</option>
              <option value="vuelta">Vuelta</option>
              <option value="ida_y_vuelta">Ida y Vuelta</option>
            </select>
          </div>

          <div>
            <label class="field-label">Cliente / Obra Social</label>
            <v-select v-model="filters.clienteId" :options="clientesOptions" :reduce="o => o.id" placeholder="Todos" class="v-select-filter" />
          </div>

          <div>
            <label class="field-label">Paciente Referido</label>
            <input v-model="filters.paciente" type="text" class="form-input text-xs" placeholder="Nombre paciente" />
          </div>

          <div>
            <label class="field-label">Proveedor</label>
            <v-select v-model="filters.proveedorId" :options="proveedoresOptions" :reduce="o => o.id" placeholder="Todos" class="v-select-filter" />
          </div>

          <div>
            <label class="field-label">Provincia Destino</label>
            <v-select v-model="filters.provinciaId" :options="provinciasOptions" :reduce="o => o.id" placeholder="Todas" class="v-select-filter" />
          </div>

          <div>
            <label class="field-label">Localidad Destino</label>
            <v-select v-model="filters.localidadId" :options="localidadesOptions" :reduce="o => o.id" placeholder="Todas" class="v-select-filter" />
          </div>

          <div>
            <label class="field-label">N° de Guía / Remito</label>
            <input v-model="filters.numeroGuia" type="text" class="form-input text-xs" placeholder="N° Guía" />
          </div>

          <div>
            <label class="field-label">Filtro Bultos</label>
            <select v-model="filters.conBultos" class="form-input text-xs">
              <option value="todos">Todos</option>
              <option value="con_bultos">Con bultos registrados</option>
              <option value="sin_bultos">Sin bultos informados</option>
            </select>
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
              <tr v-for="g in movimientosPaginados" :key="g.id" class="hover:bg-slate-50 transition-colors">
                <td class="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{{ formatDate(g.fecha_gasto) }}</td>
                <td class="px-4 py-3 font-bold text-slate-900">{{ g.transportes?.nombre || 'Sin Transporte' }}</td>
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
                <td class="px-4 py-3 text-slate-600">{{ g.proveedores?.nombre || 'Sin proveedor' }}</td>
                <td class="px-4 py-3 text-center font-bold text-indigo-700">
                  <span v-if="g.datos_adicionales?.cantidad_bultos !== undefined && g.datos_adicionales?.cantidad_bultos !== null && g.datos_adicionales?.cantidad_bultos !== ''">
                    {{ g.datos_adicionales.cantidad_bultos }}
                  </span>
                  <span v-else class="text-slate-400 font-normal">-</span>
                </td>
                <td class="px-4 py-3 capitalize text-slate-600">{{ g.datos_adicionales?.sentido_movimiento || 'ida' }}</td>
                <td class="px-4 py-3 text-slate-600">{{ g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || 'Sin destino' }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-right font-bold text-slate-900">{{ formatCurrency(g.monto_total) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <button type="button" class="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Ver detalle completo" @click="verDetalleGasto(g)">
                      <EyeIcon class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded p-1 text-indigo-600 hover:bg-indigo-50" title="Editar movimiento" @click="abrirEdicion(g)">
                      <PencilSquareIcon class="h-4 w-4" />
                    </button>
                    <button type="button" class="rounded p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700" title="Eliminar movimiento" @click="eliminarGasto(g)">
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
          class="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-indigo-300 transition-all"
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
                <span>Proveedor:</span>
                <strong class="text-slate-800">{{ g.proveedores?.nombre || 'Sin proveedor' }}</strong>
              </div>

              <div class="flex justify-between text-slate-600">
                <span>Bultos: <strong class="text-indigo-700">{{ (g.datos_adicionales?.cantidad_bultos !== undefined && g.datos_adicionales?.cantidad_bultos !== null && g.datos_adicionales?.cantidad_bultos !== '') ? g.datos_adicionales.cantidad_bultos : '-' }}</strong></span>
                <span>Sentido: <strong class="capitalize">{{ g.datos_adicionales?.sentido_movimiento || 'ida' }}</strong></span>
              </div>

              <div class="flex justify-between text-slate-600">
                <span>Destino:</span>
                <strong class="text-slate-800 truncate max-w-[150px]">{{ g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || 'Sin destino' }}</strong>
              </div>
            </div>
          </div>

          <div class="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between">
            <div>
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Importe</span>
              <strong class="text-base font-bold text-slate-900">{{ formatCurrency(g.monto_total) }}</strong>
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
                <th class="px-4 py-3">Zonas Cubiertas</th>
                <th class="px-4 py-3 text-right">Total Acumulado</th>
                <th class="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white font-medium text-slate-700">
              <tr v-if="transportesPaginados.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">No se encontraron transportes para los criterios ingresados.</td>
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
                <td class="px-4 py-2.5 text-slate-700">{{ g.proveedores?.nombre || 'Sin proveedor' }}</td>
                <td class="px-4 py-2.5 font-semibold text-slate-900">{{ getClientePacienteDisplay(g).principal }}</td>
                <td class="px-4 py-2.5 text-slate-600">{{ g.datos_adicionales?.destino_texto || g.localidad_destino?.nombre || 'Sin destino' }}</td>
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
            <div><span class="text-slate-500 font-semibold block">Destino:</span><strong class="text-slate-900">{{ gastoSeleccionadoDetalle.datos_adicionales?.destino_texto || gastoSeleccionadoDetalle.localidad_destino?.nombre || 'N/A' }}</strong></div>
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
