<script setup>
import { computed, ref, watch } from 'vue';
import { supabase } from '../../supabaseClient';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useLogisticaPdfExportVariants } from '../../composables/useLogisticaPdfExportVariants.js';
import { normalizeProveedor, normalizeTransporte, getDestinoPresentation, getComentarioLimpio, getProveedorBadgeColor, isLogisticaCirugia, getProveedorLabel } from '../../utils/logisticaHelpers.js';
import DestinoSelect from '../DestinoSelect.vue';
import { useCostosPorDestino } from '../../composables/useCostosPorDestino.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'show-notification', 'ir-a-corregir']);

const selectedMonth = ref(''); // Formato 'YYYY-MM' (Mes de vencimiento)
const includePagoInmediato = ref(true);
const includePieCharts = ref(true);
const activeCategory = ref('ctacte'); // 'ctacte' | 'destino'
const activeViewTab = ref('encomienda'); // 'encomienda' | 'proveedor' | 'completo' | 'detalle'
const loading = ref(false);
const items = ref([]);

// Costos por Destino State
const costosDestino = useCostosPorDestino();
const allDestinoItems = ref([]);
const loadingDestino = ref(false);

// Inicializar con el mes siguiente
const initMonth = () => {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
  selectedMonth.value = `${year}-${month}`;
};

initMonth();

// Calcular el período de origen (mes anterior al seleccionado)
const originPeriod = computed(() => {
  if (!selectedMonth.value) return null;
  const [year, month] = selectedMonth.value.split('-').map(Number);
  const originDate = new Date(year, month - 2, 1);
  const startYear = originDate.getFullYear();
  const startMonth = String(originDate.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(startYear, originDate.getMonth() + 1, 0).getDate();
  
  return {
    start: `${startYear}-${startMonth}-01`,
    end: `${startYear}-${startMonth}-${String(lastDay).padStart(2, '0')}`,
    label: originDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    vencimientoLabel: new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
  };
});

const loadCtaCteExpenses = async () => {
  if (!originPeriod.value) return;
  loading.value = true;
  try {
    let query = supabase
      .from('gastos')
      .select('*')
      .gte('fecha_gasto', originPeriod.value.start)
      .lte('fecha_gasto', originPeriod.value.end)
      .order('fecha_gasto', { ascending: true });

    if (!includePagoInmediato.value) {
      query = query.eq('origen_gasto', 'cuenta_corriente_empresa');
    }

    const [gastosRes, transportesRes, proveedoresRes, provinciasRes, localidadesRes, tiposRes] = await Promise.all([
      query,
      supabase.from('transportes').select('id, nombre'),
      supabase.from('proveedores').select('id, nombre'),
      supabase.from('provincias').select('id, nombre'),
      supabase.from('localidades').select('id, nombre, provincia_id'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto')
    ]);

    if (gastosRes.error) throw gastosRes.error;
    const data = gastosRes.data || [];
    const transportesList = transportesRes.data || [];
    const proveedoresList = proveedoresRes.data || [];
    const provinciasList = provinciasRes.data || [];
    const localidadesList = localidadesRes.data || [];
    const tiposList = tiposRes.data || [];

    const transportesMap = new Map(transportesList.map(t => [t.id, t]));
    const proveedoresMap = new Map(proveedoresList.map(p => [p.id, p]));
    const provinciasMap = new Map(provinciasList.map(p => [p.id, p]));
    const localidadesMap = new Map(localidadesList.map(l => [l.id, l]));
    const tiposMap = new Map(tiposList.map(t => [t.id, t.nombre_tipo_gasto]));

    // Filtrar estrictamente para incluir solo gastos que correspondan al módulo de Logística (Envíos | Devoluciones)
    const filteredData = data.filter(item => {
      const extra = item.datos_adicionales || {};
      const tipoNombre = (tiposMap.get(item.tipo_gasto_id) || '').toLowerCase();

      const isLogistica = (
        item.transporte_id != null ||
        item.tipo_gasto_id === 22 ||
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

      if (!isLogistica) return false;

      if (!includePagoInmediato.value) {
        return item.origen_gasto === 'cuenta_corriente_empresa';
      }

      return true;
    });

    // Mapear utilizando únicamente las fuentes de verdad relacionales de la BD
    items.value = filteredData.map(item => {
      let t = item.transporte_id ? transportesMap.get(item.transporte_id) : null;
      let p = item.proveedor_id ? proveedoresMap.get(item.proveedor_id) : null;
      let prov = item.provincia_id ? provinciasMap.get(item.provincia_id) : null;
      let loc = item.localidad_destino_id ? localidadesMap.get(item.localidad_destino_id) : null;

      return {
        ...item,
        transporte: t,
        proveedor: p,
        provincias: prov,
        localidad_destino: loc
      };
    });
  } catch (e) {
    console.error('Error cargando vencimientos de cuenta corriente:', e);
    emit('show-notification', 'Error', 'No se pudieron cargar los datos de vencimientos.', 'error');
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const totalAmount = computed(() => {
  return items.value.reduce((total, item) => total + Number(item.monto_total || 0), 0);
});

const totalCtaCte = computed(() => {
  return items.value.reduce((acc, item) => {
    return acc + (item.origen_gasto === 'cuenta_corriente_empresa' ? Number(item.monto_total || 0) : 0);
  }, 0);
});

const totalPagoDirecto = computed(() => {
  return items.value.reduce((acc, item) => {
    return acc + (item.origen_gasto !== 'cuenta_corriente_empresa' ? Number(item.monto_total || 0) : 0);
  }, 0);
});

const getBultosCount = (item) => {
  const extra = item.datos_adicionales || {};
  const b = extra.cantidad_bultos;
  if (b !== undefined && b !== null && b !== '') {
    const num = Number(b);
    if (!isNaN(num) && num > 0) return num;
  }
  return 1;
};

const totalBultos = computed(() => {
  return items.value.reduce((acc, item) => acc + getBultosCount(item), 0);
});

const resumenPorEncomienda = computed(() => {
  const map = {};
  items.value.forEach(item => {
    const name = normalizeTransporte(item.transporte?.nombre);
    if (!map[name]) {
      map[name] = { nombre: name, cantOps: 0, bultos: 0, ctaCte: 0, pagoDirecto: 0, total: 0, zonasMap: {} };
    }
    const val = Number(item.monto_total || 0);
    const bCount = getBultosCount(item);
    map[name].cantOps += 1;
    map[name].bultos += bCount;
    if (item.origen_gasto === 'cuenta_corriente_empresa') {
      map[name].ctaCte += val;
    } else {
      map[name].pagoDirecto += val;
    }
    map[name].total += val;

    const dest = getDestinoPresentation(item);
    if (dest && dest !== '—') {
      map[name].zonasMap[dest] = (map[name].zonasMap[dest] || 0) + 1;
    }
  });

  return Object.values(map).map(e => {
    let topZ = '—';
    let maxC = 0;
    for (const [z, count] of Object.entries(e.zonasMap || {})) {
      if (count > maxC) {
        maxC = count;
        topZ = z;
      }
    }
    return { ...e, zonaConcurrida: topZ };
  }).sort((a, b) => b.total - a.total);
});

const operacionPropiaCirugia = computed(() => {
  const op = { nombre: 'Logística de Cirugía', cantOps: 0, bultos: 0, ctaCte: 0, pagoDirecto: 0, total: 0 };
  items.value.forEach(item => {
    if (isLogisticaCirugia(item)) {
      const val = Number(item.monto_total || 0);
      const bCount = getBultosCount(item);
      op.cantOps += 1;
      op.bultos += bCount;
      if (item.origen_gasto === 'cuenta_corriente_empresa') {
        op.ctaCte += val;
      } else {
        op.pagoDirecto += val;
      }
      op.total += val;
    }
  });
  return op;
});

const proveedoresExternos = computed(() => {
  const map = {};
  items.value.forEach(item => {
    if (!isLogisticaCirugia(item)) {
      const name = getProveedorLabel(item);
      if (name !== 'Sin Proveedor') {
        if (!map[name]) {
          map[name] = { nombre: name, cantOps: 0, bultos: 0, ctaCte: 0, pagoDirecto: 0, total: 0 };
        }
        const val = Number(item.monto_total || 0);
        const bCount = getBultosCount(item);
        map[name].cantOps += 1;
        map[name].bultos += bCount;
        if (item.origen_gasto === 'cuenta_corriente_empresa') {
          map[name].ctaCte += val;
        } else {
          map[name].pagoDirecto += val;
        }
        map[name].total += val;
      }
    }
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
});

const totalProveedoresExternos = computed(() => {
  return proveedoresExternos.value.reduce((acc, p) => acc + p.total, 0);
});

const totalBultosExternos = computed(() => {
  return proveedoresExternos.value.reduce((acc, p) => acc + p.bultos, 0);
});

const resumenPorProveedor = computed(() => proveedoresExternos.value);

const getOrigenBadge = (item) => {
  if (item.origen_gasto === 'cuenta_corriente_empresa') {
    return { text: 'Cta. Corriente', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
  if (item.origen_gasto === 'rendicion' || item.viaje_id) {
    return { text: 'Rendición Viaje', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  return { text: 'Caja Chica / Pago Dir.', class: 'bg-amber-50 text-amber-700 border-amber-200' };
};

const closeModal = () => {
  emit('update:modelValue', false);
};

const provinciasMapRef = ref(new Map());
const localidadesMapRef = ref(new Map());

const {
  exportarPdfCtaCteVencimientos,
  exportarPdfCostosPorDestino,
  exportarPdfConsolidadoProvincias,
  exportarPdfConsolidadoLocalidades
} = useLogisticaPdfExportVariants();

const filteredDestinoByDate = computed(() => {
  return costosDestino.filterGastosPorFecha(allDestinoItems.value);
});

const showOpsSinDestinoModal = ref(false);
const showOpsInconsistentesModal = ref(false);
const auditSearchQuery = ref('');

function irACorregirEnMovimientos(op = null) {
  showOpsInconsistentesModal.value = false;
  showOpsSinDestinoModal.value = false;
  emit('update:modelValue', false);
  const ids = op?.id ? [op.id] : opsInconsistentesList.value.map(o => o.id);
  emit('ir-a-corregir', {
    gastoId: op?.id || null,
    gastoIds: ids,
    provinciaNombre: op?.provincia_registrada_nombre || (selectedProvinciaNombre.value !== 'Todas las Provincias' ? selectedProvinciaNombre.value : null),
    localidadNombre: op?.localidad_registrada_nombre || null,
    tipo: 'inconsistentes'
  });
}

function irACorregirSinDestino(op = null) {
  showOpsSinDestinoModal.value = false;
  emit('update:modelValue', false);
  const ids = op?.id ? [op.id] : opsSinDestinoList.value.map(o => o.id);
  emit('ir-a-corregir', {
    gastoId: op?.id || null,
    gastoIds: ids,
    tipo: 'sin_destino'
  });
}

const auditoriaDestinoData = computed(() => {
  return costosDestino.calcularAuditoriaDatos(
    filteredDestinoByDate.value,
    provinciasMapRef.value,
    localidadesMapRef.value
  );
});

const opsSinDestinoList = computed(() => {
  return auditoriaDestinoData.value.opsSinDestinoList || [];
});

const opsInconsistentesList = computed(() => {
  return auditoriaDestinoData.value.opsInconsistentesList || [];
});

const opsInconsistentesFiltradas = computed(() => {
  const query = auditSearchQuery.value.trim().toLowerCase();
  const list = opsInconsistentesList.value;
  if (!query) return list;
  return list.filter(op => {
    const provReg = (op.provincia_registrada_nombre || '').toLowerCase();
    const locReg = (op.localidad_registrada_nombre || '').toLowerCase();
    const provReal = (op.provincia_real_localidad_nombre || '').toLowerCase();
    const transp = (op.transporte_nombre || '').toLowerCase();
    const provLabel = (op.proveedor_label || '').toLowerCase();
    const numFact = (op.numero_factura || '').toLowerCase();
    const idStr = String(op.id || '');
    return (
      provReg.includes(query) ||
      locReg.includes(query) ||
      provReal.includes(query) ||
      transp.includes(query) ||
      provLabel.includes(query) ||
      numFact.includes(query) ||
      idStr.includes(query)
    );
  });
});

const inconsistenciasDeProvinciaSeleccionada = computed(() => {
  const pId = costosDestino.selectedProvinciaId.value;
  if (!pId || pId === 'todos') return opsInconsistentesList.value;
  return opsInconsistentesList.value.filter(op => String(op.provincia_registrada_id) === String(pId));
});

const consolidadoProvincias = computed(() => {
  return costosDestino.calcularConsolidadoProvincias(
    filteredDestinoByDate.value,
    provinciasMapRef.value,
    localidadesMapRef.value
  );
});

const consolidadoLocalidades = computed(() => {
  return costosDestino.calcularConsolidadoLocalidades(
    filteredDestinoByDate.value,
    costosDestino.selectedProvinciaId.value,
    localidadesMapRef.value
  );
});

const selectedProvinciaNombre = computed(() => {
  const pId = costosDestino.selectedProvinciaId.value;
  if (!pId || pId === 'todos') return 'Todas las Provincias';
  const numId = Number(pId);
  return provinciasMapRef.value.get(numId)?.nombre || `Provincia ${pId}`;
});

const selectedLocalidadNombre = computed(() => {
  const lId = costosDestino.selectedLocalidadId.value;
  if (!lId || lId === 'todos') return 'Todas las Localidades';
  const numId = Number(lId);
  return localidadesMapRef.value.get(numId)?.nombre || `Localidad ${lId}`;
});

const itemsDestinoLocalidad = computed(() => {
  return filteredDestinoByDate.value.filter(item => costosDestino.matchesDestino(item));
});

const statsDestino = computed(() => {
  return costosDestino.calcularEstadisticasDestino(itemsDestinoLocalidad.value);
});

const showQuickSearch = ref(false);

const availableProvinciasList = computed(() => {
  const list = Array.from(provinciasMapRef.value.values());
  return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
});

const availableLocalidadesForSelectedProvincia = computed(() => {
  const pId = costosDestino.selectedProvinciaId.value;
  if (!pId || pId === 'todos') return [];
  
  // Preferir localidades que registraron operaciones en la provincia seleccionada (según consolidado)
  const activeLocs = consolidadoLocalidades.value.localidades.filter(l => l.localidad_id);
  if (activeLocs.length > 0) {
    return activeLocs;
  }

  // Fallback: todas las localidades registradas para esa provincia en la BD
  const numPId = Number(pId);
  const allLocs = Array.from(localidadesMapRef.value.values()).filter(l => l.provincia_id === numPId);
  return allLocs.map(l => ({
    localidad_id: l.id,
    localidad_nombre: l.nombre,
    envios: 0,
    bultos: 0,
    total: 0
  })).sort((a, b) => a.localidad_nombre.localeCompare(b.localidad_nombre));
});

const handleProvinciaSelectChange = (e) => {
  const val = e.target.value;
  if (val === 'todos') {
    costosDestino.selectedProvinciaId.value = 'todos';
    costosDestino.selectedLocalidadId.value = 'todos';
  } else {
    costosDestino.selectedProvinciaId.value = Number(val);
    costosDestino.selectedLocalidadId.value = 'todos';
  }
};

const handleLocalidadSelectChange = (e) => {
  const val = e.target.value;
  if (val === 'todos') {
    costosDestino.selectedLocalidadId.value = 'todos';
  } else {
    costosDestino.selectedLocalidadId.value = Number(val);
  }
};

const selectedDestinoNombre = computed(() => {
  if (costosDestino.selectedLocalidadId.value && costosDestino.selectedLocalidadId.value !== 'todos') {
    return selectedLocalidadNombre.value;
  }
  if (costosDestino.selectedProvinciaId.value && costosDestino.selectedProvinciaId.value !== 'todos') {
    return selectedProvinciaNombre.value;
  }
  return 'Todas las Localidades (General)';
});

const exportDestinoPdf = () => {
  try {
    const nivel = costosDestino.currentNivel.value;
    if (nivel === 'provincia') {
      if (!consolidadoProvincias.value || consolidadoProvincias.value.provincias.length === 0) return;
      exportarPdfConsolidadoProvincias(consolidadoProvincias.value, {
        selectedPeriodo: costosDestino.selectedPeriodo.value
      });
      emit('show-notification', 'PDF descargado', 'El reporte consolidado de Provincias fue generado y descargado.', 'success');
    } else if (nivel === 'localidad') {
      if (!consolidadoLocalidades.value || consolidadoLocalidades.value.localidades.length === 0) return;
      exportarPdfConsolidadoLocalidades(consolidadoLocalidades.value, {
        provinciaNombre: selectedProvinciaNombre.value,
        selectedPeriodo: costosDestino.selectedPeriodo.value
      });
      emit('show-notification', 'PDF descargado', `El desglose por localidades de ${selectedProvinciaNombre.value} fue generado y descargado.`, 'success');
    } else {
      if (!statsDestino.value || statsDestino.value.cantEnvios === 0) return;
      exportarPdfCostosPorDestino(statsDestino.value, {
        destinoNombre: selectedDestinoNombre.value,
        selectedPeriodo: costosDestino.selectedPeriodo.value
      });
      emit('show-notification', 'PDF descargado', `El reporte PDF de costos para ${selectedDestinoNombre.value} fue generado y descargado.`, 'success');
    }
  } catch (e) {
    console.error('Error generando PDF de costos por destino:', e);
    emit('show-notification', 'Error', 'No se pudo generar el reporte en PDF por destino.', 'error');
  }
};

const exportDestinoExcel = () => {
  const nivel = costosDestino.currentNivel.value;
  if (nivel === 'provincia') {
    if (!consolidadoProvincias.value || consolidadoProvincias.value.provincias.length === 0) return;
    const exportData = consolidadoProvincias.value.provincias.map((p, idx) => ({
      'N°': idx + 1,
      'Provincia Destino': p.provincia_nombre,
      'Envíos / Despachos': p.envios,
      'Bultos Totales': p.bultos,
      'Total Acumulado ($)': p.total,
      'Promedio por Envío ($)': p.promedioEnvio,
      'Promedio por Bulto ($)': p.promedioBulto
    }));
    exportToExcel(exportData, `Consolidado_Provincias_${new Date().toISOString().split('T')[0]}`);
    emit('show-notification', 'Excel descargado', 'Ficha consolidada de Provincias exportada.', 'success');
  } else if (nivel === 'localidad') {
    if (!consolidadoLocalidades.value || consolidadoLocalidades.value.localidades.length === 0) return;
    const exportData = consolidadoLocalidades.value.localidades.map((l, idx) => ({
      'N°': idx + 1,
      'Localidad Destino': l.localidad_nombre,
      'Envíos / Despachos': l.envios,
      'Bultos Totales': l.bultos,
      'Total Acumulado ($)': l.total,
      'Promedio por Envío ($)': l.promedioEnvio,
      'Promedio por Bulto ($)': l.promedioBulto
    }));
    exportToExcel(exportData, `Costos_Localidades_${selectedProvinciaNombre.value}_${new Date().toISOString().split('T')[0]}`);
    emit('show-notification', 'Excel descargado', `Desglose de localidades de ${selectedProvinciaNombre.value} exportado.`, 'success');
  } else {
    if (!statsDestino.value || statsDestino.value.cantEnvios === 0) return;
    const exportData = statsDestino.value.detalleOps.map((op, idx) => ({
      'N°': idx + 1,
      'Fecha': formatDate(op.fecha_gasto),
      'Transporte': op.transporte_nombre,
      'Proveedor / Origen': op.proveedor_label,
      'Tipo Movimiento': op.tipo_movimiento,
      'Bultos': op.bultos,
      'Importe ($)': op.monto_total,
      'Guía / Remito': op.numero_factura || ''
    }));
    exportToExcel(exportData, `Ficha_Destino_${selectedDestinoNombre.value}_${new Date().toISOString().split('T')[0]}`);
    emit('show-notification', 'Excel descargado', `Ficha operativa de ${selectedDestinoNombre.value} exportada.`, 'success');
  }
};

const downloadPDF = (modoOverride = null) => {
  if (items.value.length === 0) return;
  
  const targetMode = modoOverride || activeViewTab.value;
  try {
    exportarPdfCtaCteVencimientos(items.value, {
      vencimientoLabel: originPeriod.value?.vencimientoLabel,
      originLabel: originPeriod.value?.label,
      selectedMonth: selectedMonth.value,
      includePagoInmediato: includePagoInmediato.value,
      includePieCharts: includePieCharts.value,
      modoReporte: targetMode
    });
    
    let modeLabel = 'consolidado';
    if (targetMode === 'encomienda') modeLabel = 'por encomiendas';
    else if (targetMode === 'proveedor') modeLabel = 'por proveedores';
    else if (targetMode === 'completo') modeLabel = 'consolidado completo';
    
    emit('show-notification', 'PDF descargado', `El reporte ${modeLabel} fue generado y descargado.`, 'success');
  } catch (e) {
    console.error('Error generando PDF de vencimientos:', e);
    emit('show-notification', 'Error', 'No se pudo generar el reporte en PDF.', 'error');
  }
};

const loadAllDestinoExpenses = async (force = false) => {
  if (!force && allDestinoItems.value.length > 0 && !loadingDestino.value) return;
  loadingDestino.value = true;
  try {
    const [gastosRes, transportesRes, proveedoresRes, provinciasRes, localidadesRes, tiposRes, clientesRes] = await Promise.all([
      supabase.from('gastos').select('*').order('fecha_gasto', { ascending: false }),
      supabase.from('transportes').select('id, nombre'),
      supabase.from('proveedores').select('id, nombre'),
      supabase.from('provincias').select('id, nombre'),
      supabase.from('localidades').select('id, nombre'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto'),
      supabase.from('clientes').select('id, nombre_cliente')
    ]);

    const data = gastosRes.data || [];
    const transportesMap = new Map((transportesRes.data || []).map(t => [t.id, t]));
    const proveedoresMap = new Map((proveedoresRes.data || []).map(p => [p.id, p]));
    const provinciasMap = new Map((provinciasRes.data || []).map(p => [p.id, p]));
    const localidadesMap = new Map((localidadesRes.data || []).map(l => [l.id, l]));
    const tiposMap = new Map((tiposRes.data || []).map(t => [t.id, t.nombre_tipo_gasto]));
    const clientesMap = new Map((clientesRes.data || []).map(c => [c.id, c]));

    const LOGISTICA_TIPO_GASTO_ID = 22; // Tipo de gasto: Logística | Envíos y Devoluciones

    const filtered = data.filter(item => {
      const extra = item.datos_adicionales || {};
      const tipoNombre = (tiposMap.get(item.tipo_gasto_id) || '').toLowerCase();

      // Universo de datos: Exclusivamente tipo de gasto "Logística | Envíos y Devoluciones" (ID 22)
      return (
        item.tipo_gasto_id === LOGISTICA_TIPO_GASTO_ID ||
        extra.modulo === 'logistica' ||
        extra.tipo_logistica != null ||
        extra.origen_carga === 'encomiendas_carga_multiple' ||
        tipoNombre.includes('envio') ||
        tipoNombre.includes('envío') ||
        tipoNombre.includes('devolucion') ||
        tipoNombre.includes('devolución') ||
        tipoNombre.includes('logistica') ||
        tipoNombre.includes('logística') ||
        tipoNombre.includes('encomienda')
      );
    });

    provinciasMapRef.value = provinciasMap;
    localidadesMapRef.value = localidadesMap;

    allDestinoItems.value = filtered.map(item => {
      let t = item.transporte_id ? transportesMap.get(item.transporte_id) : null;
      let p = item.proveedor_id ? proveedoresMap.get(item.proveedor_id) : null;
      let prov = item.provincia_id ? provinciasMap.get(item.provincia_id) : null;
      let loc = item.localidad_destino_id ? localidadesMap.get(item.localidad_destino_id) : null;
      let cli = item.cliente_id ? clientesMap.get(item.cliente_id) : null;

      return {
        ...item,
        transporte: t ? { id: t.id, nombre: t.nombre } : null,
        proveedor: p ? { id: p.id, nombre: p.nombre } : null,
        proveedores: p ? { id: p.id, nombre: p.nombre } : null,
        provincia: prov ? { id: prov.id, nombre: prov.nombre } : null,
        localidad_destino: loc ? { id: loc.id, nombre: loc.nombre } : null,
        cliente: cli ? { id: cli.id, nombre_cliente: cli.nombre_cliente } : null,
        clientes: cli ? { id: cli.id, nombre_cliente: cli.nombre_cliente } : null,
      };
    });
  } catch (err) {
    console.error('Error cargando gastos por destino:', err);
  } finally {
    loadingDestino.value = false;
  }
};

watch(activeCategory, (newCat) => {
  if (newCat === 'destino') {
    if (!costosDestino.selectedLocalidadId.value && !costosDestino.selectedProvinciaId.value) {
      costosDestino.selectedLocalidadId.value = 'todos';
      costosDestino.selectedProvinciaId.value = 'todos';
    }
    loadAllDestinoExpenses(true);
  }
});

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    initMonth();
    loadCtaCteExpenses();
    loadAllDestinoExpenses(true);
  }
});





watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    initMonth();
    loadCtaCteExpenses();
    if (activeCategory.value === 'destino') {
      loadAllDestinoExpenses();
    }
  }
});

watch([selectedMonth, includePagoInmediato], () => {
  loadCtaCteExpenses();
});
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="modelValue" class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-3 sm:p-6" @click.self="closeModal">
      <div class="flex max-h-[94vh] w-full max-w-[94vw] xl:max-w-7xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        <!-- Header -->
        <div class="flex items-start justify-between border-b border-slate-200 p-5 bg-slate-50">
          <div>
            <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
              <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Libro Mayor de Cuenta Corriente y Análisis Logístico
            </h3>
            <p class="mt-1 text-xs font-medium text-slate-500">
              Visualizá el consolidado financiero de cuenta corriente o consultá el reporte de costos logísticos por destino geográfico.
            </p>
          </div>
          <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors" @click="closeModal">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Selector de Categoría Escalable de Reporte -->
        <div class="flex items-center gap-2 border-b border-slate-200 bg-slate-100/70 p-2.5 px-6">
          <button
            type="button"
            @click="activeCategory = 'ctacte'"
            :class="[
              'px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2',
              activeCategory === 'ctacte' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200 ring-2 ring-indigo-500/20' : 'text-slate-600 hover:bg-slate-200/60'
            ]"
          >
            <span>📦 Consolidación Financiera / Cta Cte</span>
          </button>

          <button
            type="button"
            @click="activeCategory = 'destino'"
            :class="[
              'px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2',
              activeCategory === 'destino' ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20' : 'text-slate-600 hover:bg-slate-200/60'
            ]"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>📍 Costos Logísticos por Destino</span>
          </button>
        </div>

        <!-- Contenido principal -->
        <div class="flex-grow overflow-y-auto p-6 space-y-6">

          <!-- CATEGORÍA 1: CONSOLIDACIÓN FINANCIERA / CTA CTE -->
          <div v-if="activeCategory === 'ctacte'" class="space-y-6">
          
          <!-- Filtro de mes y Checkbox Consolidación & Gráficos -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-slate-50/80 p-4 border border-slate-200 rounded-xl">
            <div class="lg:col-span-3">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Mes de Vencimiento</label>
              <input v-model="selectedMonth" type="month" class="form-input" />
            </div>
            
            <div class="lg:col-span-6 flex flex-wrap items-center gap-4 pt-2 lg:pt-5">
              <label class="relative flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  v-model="includePagoInmediato"
                  class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span class="text-xs font-semibold text-slate-700">
                  Consolidar pagos inmediatos <span class="text-slate-500 font-normal">(Rend./Cajas)</span>
                </span>
              </label>

              <label class="relative flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  v-model="includePieCharts"
                  class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span class="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                  Incluir Gráficos Torta en PDF
                </span>
              </label>
            </div>

            <div class="lg:col-span-3 lg:text-right pt-2 lg:pt-5" v-if="originPeriod">
              <p class="text-xs font-medium text-slate-500">
                Origen de gastos: <span class="text-indigo-600 font-bold capitalize">{{ originPeriod.label }}</span>
              </p>
            </div>
          </div>

          <!-- Spinner o vacío -->
          <div v-if="loading" class="flex flex-col items-center justify-center py-12">
            <svg class="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="mt-3 text-sm text-slate-500">Cargando vencimientos de cuenta corriente y operaciones...</span>
          </div>

          <div v-else-if="items.length === 0" class="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
            <p class="text-sm font-semibold text-slate-500">Sin operaciones registradas en el período seleccionado.</p>
          </div>

          <!-- Panel de datos -->
          <div v-else class="space-y-5">
            
            <!-- Resumen de tarjetas KPI -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Consolidado</span>
                <strong class="mt-1 block text-lg font-extrabold text-indigo-700">{{ formatCurrency(totalAmount) }}</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">En Cuenta Corriente</span>
                <strong class="mt-1 block text-lg font-bold text-slate-800">{{ formatCurrency(totalCtaCte) }}</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">En Pago Directo</span>
                <strong class="mt-1 block text-lg font-bold text-emerald-600">{{ formatCurrency(totalPagoDirecto) }}</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Bultos</span>
                <strong class="mt-1 block text-lg font-bold text-slate-900">{{ totalBultos }} bultos <span class="text-xs font-normal text-slate-500">({{ items.length }} despachos)</span></strong>
              </div>
            </div>

            <!-- Selector de Vistas / Pestañas internas -->
            <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
              <button 
                type="button" 
                @click="activeViewTab = 'encomienda'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'encomienda' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Por Encomienda / Transporte</span>
                <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono" v-if="activeViewTab === 'encomienda'">{{ resumenPorEncomienda.length }}</span>
              </button>

              <button 
                type="button" 
                @click="activeViewTab = 'proveedor'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'proveedor' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Por Proveedor (Externos)</span>
                <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono" v-if="activeViewTab === 'proveedor'">{{ proveedoresExternos.length }}</span>
              </button>

              <button 
                type="button" 
                @click="activeViewTab = 'completo'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'completo' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Consolidado Completo (Ambos)</span>
              </button>

              <button 
                type="button" 
                @click="activeViewTab = 'detalle'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'detalle' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Detalle Completo</span>
                <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono" v-if="activeViewTab === 'detalle'">{{ items.length }}</span>
              </button>
            </div>

            <!-- VISTA 1: TABLA RESUMEN POR ENCOMIENDA -->
            <div v-if="activeViewTab === 'encomienda'" class="rounded-xl border border-slate-200 overflow-hidden">
              <div class="overflow-x-auto max-h-[50vh]">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50 sticky top-0">
                    <tr>
                      <th class="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Encomienda / Empresa Logística</th>
                      <th class="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Zona Concurrida</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100 text-xs">
                    <tr v-for="(enc, idx) in resumenPorEncomienda" :key="enc.nombre" class="hover:bg-slate-50">
                      <td class="px-3 py-2.5 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                      <td class="px-4 py-2.5 font-bold">
                        <span class="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full border" :class="getProveedorBadgeColor(enc.nombre)">
                          {{ enc.nombre }}
                        </span>
                      </td>
                      <td class="px-3 py-2.5 text-slate-600 font-medium truncate max-w-[130px]">{{ enc.zonaConcurrida }}</td>
                      <td class="px-4 py-2.5 text-center font-mono text-slate-900 font-bold">{{ enc.bultos }}</td>
                      <td class="px-4 py-2.5 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((enc.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                      <td class="px-4 py-2.5 text-right font-medium text-slate-700">{{ formatCurrency(enc.ctaCte) }}</td>
                      <td class="px-4 py-2.5 text-right font-medium text-emerald-600">{{ formatCurrency(enc.pagoDirecto) }}</td>
                      <td class="px-4 py-2.5 text-right font-extrabold text-slate-900">{{ formatCurrency(enc.total) }}</td>
                    </tr>
                  </tbody>
                  <tfoot class="bg-slate-100 font-bold text-xs text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td class="px-4 py-3" colspan="3">TOTAL CONSOLIDADO ({{ resumenPorEncomienda.length }} empresas)</td>
                      <td class="px-4 py-3 text-center font-mono font-extrabold text-indigo-700">{{ totalBultos }} bultos</td>
                      <td class="px-4 py-3 text-center font-mono text-indigo-700">100.0%</td>
                      <td class="px-4 py-3 text-right text-slate-800">{{ formatCurrency(totalCtaCte) }}</td>
                      <td class="px-4 py-3 text-right text-emerald-700">{{ formatCurrency(totalPagoDirecto) }}</td>
                      <td class="px-4 py-3 text-right text-indigo-700 text-sm font-extrabold">{{ formatCurrency(totalAmount) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- VISTA 2: TABLA RESUMEN POR PROVEEDOR -->
            <div v-else-if="activeViewTab === 'proveedor'" class="space-y-4">
              <!-- Card KPI Operación Propia - Logística de Cirugía -->
              <div class="p-4 rounded-xl bg-slate-900 text-white shadow-sm flex flex-wrap items-center justify-between gap-4 border border-slate-800">
                <div class="flex items-center gap-3">
                  <div class="p-2.5 bg-indigo-500/20 rounded-lg border border-indigo-400/30">
                    <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Operación propia — Logística de Cirugía</span>
                    <h4 class="text-sm font-bold text-white">Gestión Interna / Consumos Propios Districorr</h4>
                    <p class="text-[11px] text-slate-300">Movimientos logísticos de insumos internos y cuenta corriente de la empresa sin proveedor externo.</p>
                  </div>
                </div>
                <div class="flex items-center gap-6 text-right">
                  <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400">Bultos</span>
                    <div class="text-sm font-extrabold font-mono text-white">{{ operacionPropiaCirugia.bultos }} bultos</div>
                  </div>
                  <div>
                    <span class="text-[10px] uppercase font-bold text-indigo-300">Total Operación Propia</span>
                    <div class="text-base font-extrabold font-mono text-emerald-400">{{ formatCurrency(operacionPropiaCirugia.total) }}</div>
                  </div>
                </div>
              </div>

              <!-- Tabla Proveedores Externos Reales -->
              <div class="rounded-xl border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto max-h-[50vh]">
                  <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-50 sticky top-0">
                      <tr>
                        <th class="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                        <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor / Empresa (Externo)</th>
                        <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                        <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                        <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                        <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                        <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                      </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-100 text-xs">
                      <tr v-for="(prov, idx) in proveedoresExternos" :key="prov.nombre" class="hover:bg-slate-50">
                        <td class="px-3 py-2.5 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                        <td class="px-4 py-2.5 font-bold text-slate-800">{{ prov.nombre }}</td>
                        <td class="px-4 py-2.5 text-center font-mono text-slate-900 font-bold">{{ prov.bultos }}</td>
                        <td class="px-4 py-2.5 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((prov.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                        <td class="px-4 py-2.5 text-right font-medium text-slate-700">{{ formatCurrency(prov.ctaCte) }}</td>
                        <td class="px-4 py-2.5 text-right font-medium text-emerald-600">{{ formatCurrency(prov.pagoDirecto) }}</td>
                        <td class="px-4 py-2.5 text-right font-extrabold text-slate-900">{{ formatCurrency(prov.total) }}</td>
                      </tr>
                    </tbody>
                    <tfoot class="bg-slate-100 font-bold text-xs text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td class="px-4 py-2 text-slate-600 font-semibold" colspan="2">Subtotal Proveedores Externos ({{ proveedoresExternos.length }} empresas)</td>
                        <td class="px-4 py-2 text-center font-mono text-slate-800">{{ totalBultosExternos }} bultos</td>
                        <td class="px-4 py-2 text-center font-mono text-slate-600">{{ totalAmount > 0 ? ((totalProveedoresExternos / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                        <td class="px-4 py-2 text-right" colspan="2"></td>
                        <td class="px-4 py-2 text-right font-bold text-slate-800">{{ formatCurrency(totalProveedoresExternos) }}</td>
                      </tr>
                      <tr class="bg-indigo-50/70 border-t border-indigo-100">
                        <td class="px-4 py-2 text-indigo-900 font-bold" colspan="2">Operación propia — Logística de Cirugía</td>
                        <td class="px-4 py-2 text-center font-mono text-indigo-900 font-bold">{{ operacionPropiaCirugia.bultos }} bultos</td>
                        <td class="px-4 py-2 text-center font-mono text-indigo-700 font-bold">{{ totalAmount > 0 ? ((operacionPropiaCirugia.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                        <td class="px-4 py-2 text-right font-medium text-slate-700">{{ formatCurrency(operacionPropiaCirugia.ctaCte) }}</td>
                        <td class="px-4 py-2 text-right font-medium text-emerald-600">{{ formatCurrency(operacionPropiaCirugia.pagoDirecto) }}</td>
                        <td class="px-4 py-2 text-right font-extrabold text-indigo-950">{{ formatCurrency(operacionPropiaCirugia.total) }}</td>
                      </tr>
                      <tr class="border-t-2 border-slate-400 bg-slate-200/80">
                        <td class="px-4 py-2.5 text-slate-900 font-extrabold" colspan="2">TOTAL CONSOLIDADO GENERAL</td>
                        <td class="px-4 py-2.5 text-center font-mono font-extrabold text-indigo-900">{{ totalBultos }} bultos</td>
                        <td class="px-4 py-2.5 text-center font-mono text-indigo-900 font-bold">100.0%</td>
                        <td class="px-4 py-2.5 text-right font-bold text-slate-800">{{ formatCurrency(totalCtaCte) }}</td>
                        <td class="px-4 py-2.5 text-right font-bold text-emerald-800">{{ formatCurrency(totalPagoDirecto) }}</td>
                        <td class="px-4 py-2.5 text-right text-indigo-900 text-sm font-black">{{ formatCurrency(totalAmount) }}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <!-- VISTA 3: VISTA COMPLETA (AMBOS RESÚMENES) -->
            <div v-else-if="activeViewTab === 'completo'" class="space-y-6">
              
              <!-- Resumen 1: Encomiendas -->
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-indigo-600"></span>
                  1. Resumen por Encomienda / Operador Logístico
                </h4>
                <div class="rounded-xl border border-slate-200 overflow-hidden">
                  <div class="overflow-x-auto max-h-[25vh]">
                    <table class="min-w-full divide-y divide-slate-200">
                      <thead class="bg-slate-50 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                          <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Encomienda</th>
                          <th class="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Zona Concurrida</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-slate-100 text-xs">
                        <tr v-for="(enc, idx) in resumenPorEncomienda" :key="enc.nombre" class="hover:bg-slate-50">
                          <td class="px-3 py-2 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                          <td class="px-4 py-2 font-bold text-slate-800">{{ enc.nombre }}</td>
                          <td class="px-3 py-2 text-slate-600 font-medium truncate max-w-[130px]">{{ enc.zonaConcurrida }}</td>
                          <td class="px-4 py-2 text-center font-mono text-slate-900 font-bold">{{ enc.bultos }}</td>
                          <td class="px-4 py-2 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((enc.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                          <td class="px-4 py-2 text-right font-medium text-slate-700">{{ formatCurrency(enc.ctaCte) }}</td>
                          <td class="px-4 py-2 text-right font-medium text-emerald-600">{{ formatCurrency(enc.pagoDirecto) }}</td>
                          <td class="px-4 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(enc.total) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- Resumen 2: Proveedores -->
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-indigo-600"></span>
                  2. Resumen por Proveedor Externo & Operación Propia
                </h4>
                
                <!-- Sub-Card Operación Propia en Vista Completa -->
                <div class="p-3 mb-2 rounded-lg bg-slate-900 text-white flex items-center justify-between text-xs">
                  <div>
                    <span class="font-bold text-indigo-300">Operación propia — Logística de Cirugía:</span>
                    <span class="ml-2 text-slate-300">Consumos y gestión interna de la empresa</span>
                  </div>
                  <div class="font-mono font-bold text-emerald-400">
                    {{ operacionPropiaCirugia.bultos }} bultos | {{ formatCurrency(operacionPropiaCirugia.total) }}
                  </div>
                </div>

                <div class="rounded-xl border border-slate-200 overflow-hidden">
                  <div class="overflow-x-auto max-h-[25vh]">
                    <table class="min-w-full divide-y divide-slate-200">
                      <thead class="bg-slate-50 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                          <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor Externo</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-slate-100 text-xs">
                        <tr v-for="(prov, idx) in proveedoresExternos" :key="prov.nombre" class="hover:bg-slate-50">
                          <td class="px-3 py-2 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                          <td class="px-4 py-2 font-bold text-slate-800">{{ prov.nombre }}</td>
                          <td class="px-4 py-2 text-center font-mono text-slate-900 font-bold">{{ prov.bultos }}</td>
                          <td class="px-4 py-2 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((prov.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                          <td class="px-4 py-2 text-right font-medium text-slate-700">{{ formatCurrency(prov.ctaCte) }}</td>
                          <td class="px-4 py-2 text-right font-medium text-emerald-600">{{ formatCurrency(prov.pagoDirecto) }}</td>
                          <td class="px-4 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(prov.total) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>

            <!-- VISTA 4: TABLA DETALLE COMPLETO -->
            <div v-else class="rounded-xl border border-slate-200 overflow-hidden">
              <div class="overflow-x-auto max-h-[50vh]">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50 sticky top-0">
                    <tr>
                      <th class="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Fecha</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Encomienda</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Destino / Localidad</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Comentario</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Factura</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Origen</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Monto</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100 text-xs">
                    <tr v-for="(item, idx) in items" :key="item.id" class="hover:bg-slate-50">
                      <td class="px-3 py-2.5 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                      <td class="px-4 py-2.5 whitespace-nowrap text-slate-600">{{ formatDate(item.fecha_gasto) }}</td>
                      <td class="px-4 py-2.5 font-semibold text-slate-800">{{ normalizeTransporte(item.transporte?.nombre) }}</td>
                      <td class="px-4 py-2.5 text-slate-700">{{ normalizeProveedor(item.proveedor?.nombre) }}</td>
                      <td class="px-4 py-2.5 text-slate-700 font-medium">{{ getDestinoPresentation(item) }}</td>
                      <td class="px-4 py-2.5 text-slate-500 truncate max-w-xs">{{ getComentarioLimpio(item) }}</td>
                      <td class="px-4 py-2.5 text-center font-mono font-bold text-indigo-700">{{ getBultosCount(item) }}</td>
                      <td class="px-4 py-2.5 text-center text-slate-600 font-mono">{{ item.numero_factura || '—' }}</td>
                      <td class="px-4 py-2.5 text-center">
                        <span :class="['px-2 py-0.5 rounded-md text-[10px] font-bold border', getOrigenBadge(item).class]">
                          {{ getOrigenBadge(item).text }}
                        </span>
                      </td>
                      <td class="px-4 py-2.5 text-right font-bold text-slate-900">{{ formatCurrency(item.monto_total) }}</td>
                    </tr>
                  </tbody>
                  <tfoot class="bg-slate-100 font-bold text-xs text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td class="px-4 py-3" colspan="2">TOTAL DETALLE ({{ items.length }} registros)</td>
                      <td class="px-4 py-3" colspan="3"></td>
                      <td class="px-4 py-3 text-center font-mono font-extrabold text-indigo-700">{{ totalBultos }} bultos</td>
                      <td class="px-4 py-3" colspan="2"></td>
                      <td class="px-4 py-3 text-right text-indigo-700 text-sm font-extrabold">{{ formatCurrency(totalAmount) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
          </div> <!-- Fin div activeCategory === 'ctacte' -->

          <!-- CATEGORÍA 2: COSTOS LOGÍSTICOS POR DESTINO (Estructura Analítica de 3 Niveles) -->
          <div v-if="activeCategory === 'destino'" class="space-y-4">

            <!-- BARRA DE FILTROS SEPARADOS Y FLUJO DE NAVEGACIÓN (Mes → Provincia → Localidades → Detalle & Transportes) -->
            <div class="space-y-3 bg-slate-50 p-4 border border-slate-200 rounded-xl shadow-xs">
              
              <!-- Fila Superior: Período → Provincia (Principal) → Localidad (Dependiente) → Buscador Rápido -->
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                
                <!-- 1. Período de Análisis -->
                <div class="sm:col-span-4 lg:col-span-3">
                  <label class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    📅 1. Período / Mes
                  </label>
                  <div class="flex items-center gap-1.5">
                    <select v-model="costosDestino.selectedPeriodo.value" class="form-input text-xs font-semibold">
                      <option value="historico">Histórico Completo</option>
                      <option value="mes">Mes Específico</option>
                      <option value="3m">Últimos 3 Meses</option>
                      <option value="6m">Últimos 6 Meses</option>
                    </select>
                    <input 
                      v-if="costosDestino.selectedPeriodo.value === 'mes'" 
                      v-model="costosDestino.customMonth.value" 
                      type="month" 
                      class="form-input text-xs w-32" 
                    />
                  </div>
                </div>

                <!-- 2. Provincia (Filtro Principal) -->
                <div class="sm:col-span-4 lg:col-span-4">
                  <label class="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 mb-1">
                    📍 2. Provincia Destino (Filtro Principal)
                  </label>
                  <select 
                    :value="costosDestino.selectedProvinciaId.value || 'todos'"
                    @change="handleProvinciaSelectChange"
                    class="form-input text-xs font-bold text-slate-800 bg-white border-indigo-200 focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option value="todos">🇦🇷 Todas las Provincias (Consolidado Nacional)</option>
                    <option v-for="p in availableProvinciasList" :key="p.id" :value="p.id">
                      📍 {{ p.nombre }}
                    </option>
                  </select>
                </div>

                <!-- 3. Localidad (Filtro Opcional Dependiente) -->
                <div class="sm:col-span-4 lg:col-span-4">
                  <label class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    🏙️ 3. Localidad (Opcional)
                  </label>
                  <select 
                    :value="costosDestino.selectedLocalidadId.value || 'todos'"
                    @change="handleLocalidadSelectChange"
                    :disabled="!costosDestino.selectedProvinciaId.value || costosDestino.selectedProvinciaId.value === 'todos'"
                    class="form-input text-xs font-semibold text-slate-800 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <option value="todos">
                      {{ costosDestino.selectedProvinciaId.value && costosDestino.selectedProvinciaId.value !== 'todos' ? '🏙️ Todas las Localidades de ' + selectedProvinciaNombre : '🏙️ Todas las Localidades' }}
                    </option>
                    <option v-for="l in availableLocalidadesForSelectedProvincia" :key="l.localidad_id" :value="l.localidad_id">
                      🏙️ {{ l.localidad_nombre }} {{ l.envios > 0 ? `(${l.envios} envíos)` : '' }}
                    </option>
                  </select>
                </div>

                <!-- Toggle Buscador Rápido por Texto -->
                <div class="sm:col-span-12 lg:col-span-1 text-right">
                  <button 
                    type="button"
                    @click="showQuickSearch = !showQuickSearch"
                    :class="[
                      'px-2 py-1.5 text-[11px] font-bold rounded-lg border transition-all flex items-center justify-center gap-1 w-full',
                      showQuickSearch ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    ]"
                    title="Acceso directo por texto"
                  >
                    <span>🔍 Búsqueda</span>
                  </button>
                </div>

              </div>

              <!-- Buscador Rápido Directo (DestinoSelect) desplegable -->
              <div v-if="showQuickSearch" class="p-3 bg-white border border-indigo-100 rounded-lg shadow-xs space-y-1">
                <span class="text-[10px] font-bold uppercase text-indigo-600 block">🔍 Acceso Rápido por Texto (Buscar Provincia o Localidad directamente)</span>
                <DestinoSelect
                  v-model:provinciaId="costosDestino.selectedProvinciaId.value"
                  v-model:localidadId="costosDestino.selectedLocalidadId.value"
                  :includeAllOption="true"
                />
              </div>

              <!-- Fila Inferior: Breadcrumbs de Navegación + Calidad de Datos Discreta -->
              <div class="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <!-- Breadcrumbs -->
                <div class="flex items-center gap-1.5 font-medium text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  <button 
                    type="button" 
                    class="hover:text-indigo-600 flex items-center gap-1 transition-colors"
                    :class="costosDestino.currentNivel.value === 'provincia' ? 'text-indigo-700 font-extrabold' : 'text-slate-500'"
                    @click="costosDestino.selectedProvinciaId.value = null; costosDestino.selectedLocalidadId.value = null;"
                  >
                    🇦🇷 Todas las Provincias
                  </button>
                  
                  <span v-if="costosDestino.selectedProvinciaId.value" class="text-slate-300">/</span>
                  
                  <button 
                    v-if="costosDestino.selectedProvinciaId.value" 
                    type="button" 
                    class="hover:text-indigo-600 flex items-center gap-1 transition-colors"
                    :class="costosDestino.currentNivel.value === 'localidad' ? 'text-indigo-700 font-extrabold' : 'text-slate-500'"
                    @click="costosDestino.selectedLocalidadId.value = null;"
                  >
                    📍 {{ selectedProvinciaNombre }}
                  </button>
                  
                  <span v-if="costosDestino.selectedLocalidadId.value" class="text-slate-300">/</span>
                  
                  <span v-if="costosDestino.selectedLocalidadId.value" class="text-indigo-700 font-extrabold flex items-center gap-1">
                    🏙️ {{ selectedLocalidadNombre }}
                  </span>
                </div>

                <!-- Indicador Discreto de Calidad de Datos Geográficos (4 Estados Reconciliables) -->
                <div class="text-[11px] text-slate-600 flex flex-wrap items-center gap-2 bg-white/90 px-3 py-1 rounded-lg border border-slate-200 shadow-xs">
                  <div class="flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    <span>Calidad de datos: <strong class="text-emerald-700 font-extrabold">{{ auditoriaDestinoData.pctCompleto }}%</strong> válidos</span>
                    <span class="text-slate-400 font-mono">({{ auditoriaDestinoData.conDestinoCompleto }}/{{ auditoriaDestinoData.totalItems }})</span>
                  </div>
                  <span class="text-slate-300">|</span>
                  <span class="text-slate-500 font-medium" title="Provincia informada sin ciudad">
                    🏙️ {{ auditoriaDestinoData.soloProvincia }} solo prov.
                  </span>
                  <span class="text-slate-300">|</span>
                  <button 
                    v-if="auditoriaDestinoData.destinoInconsistente > 0"
                    type="button" 
                    class="text-rose-700 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"
                    @click="showOpsInconsistentesModal = true"
                    title="Localidad pertenece a otra provincia"
                  >
                    ⚠️ {{ auditoriaDestinoData.destinoInconsistente }} inconsistentes (ver)
                  </button>
                  <span v-else class="text-slate-400">0 inconsistentes</span>
                  <span class="text-slate-300">|</span>
                  <button 
                    v-if="auditoriaDestinoData.sinDestino > 0" 
                    type="button" 
                    class="text-amber-700 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                    @click="showOpsSinDestinoModal = true"
                    title="Sin provincia ni localidad registrada"
                  >
                    ❓ {{ auditoriaDestinoData.sinDestino }} sin destino (ver)
                  </button>
                  <span v-else class="text-slate-400">0 sin destino</span>
                </div>
              </div>

            </div>

            <!-- Loader -->
            <div v-if="loadingDestino" class="flex flex-col items-center justify-center py-12">
              <svg class="animate-spin h-7 w-7 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span class="mt-2.5 text-xs text-slate-500 font-medium">Analizando datos logísticos por destino...</span>
            </div>

            <!-- Empty State Compacto -->
            <div v-else-if="filteredDestinoByDate.length === 0" class="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
              <svg class="mx-auto h-7 w-7 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p class="text-xs font-extrabold text-slate-700">Sin operaciones registradas para el período o provincia seleccionados.</p>
              <p class="text-[11px] text-slate-500 mt-1">Ajustá el período de análisis en la barra superior o seleccioná otro destino.</p>
            </div>

            <!-- VISTAS DE LOS 3 NIVELES -->
            <div v-else class="space-y-4">

              <!-- ========================================================================= -->
              <!-- NIVEL 1: VISTA GENERAL POR PROVINCIA (Sin provincia ni localidad específica) -->
              <!-- ========================================================================= -->
              <div v-if="costosDestino.currentNivel.value === 'provincia'" class="space-y-4">
                
                <!-- KPIs Nacionales -->
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">Total Gastado en Logística</span>
                    <strong class="mt-1 block text-xl font-extrabold text-indigo-900">{{ formatCurrency(consolidadoProvincias.totalGastadoGeneral) }}</strong>
                    <span class="text-[10px] text-indigo-600 font-semibold block mt-0.5"><strong class="font-mono">{{ consolidadoProvincias.totalEnviosGeneral }}</strong> envíos totales en el país</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Bultos Movidos</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-800">{{ consolidadoProvincias.totalBultosGeneral }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5">Acumulado nacional de bultos</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Promedio Nacional / Envío</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-900">{{ formatCurrency(consolidadoProvincias.promedioEnvioGeneral) }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5">Referencia global por despacho</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Promedio Nacional / Bulto</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-900">{{ formatCurrency(consolidadoProvincias.promedioBultoGeneral) }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5">Referencia global por bulto</span>
                  </div>
                </div>

                <!-- Tabla Nivel 1: Provincias -->
                <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                  <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      🇦🇷 Consolidado de Costos por Provincia Destino
                    </h4>
                    <span class="text-[11px] font-semibold text-slate-500 font-mono">{{ consolidadoProvincias.provincias.length }} provincias con envíos</span>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200 text-xs">
                      <thead class="bg-slate-100">
                        <tr>
                          <th class="px-3 py-2.5 text-left font-bold text-slate-600">Provincia Destino</th>
                          <th class="px-3 py-2.5 text-center font-bold text-slate-600">Despachos / Envíos</th>
                          <th class="px-3 py-2.5 text-center font-bold text-slate-600">Bultos Totales</th>
                          <th class="px-3 py-2.5 text-right font-bold text-slate-600">Total Acumulado ($)</th>
                          <th class="px-3 py-2.5 text-right font-bold text-indigo-700 bg-indigo-50/50">Promedio por Envío</th>
                          <th class="px-3 py-2.5 text-right font-bold text-slate-600">Promedio por Bulto</th>
                          <th class="px-3 py-2.5 text-center font-bold text-slate-600">Acción</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 bg-white">
                        <tr 
                          v-for="p in consolidadoProvincias.provincias" 
                          :key="p.provincia_id" 
                          class="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                          @click="costosDestino.selectedProvinciaId.value = p.provincia_id; costosDestino.selectedLocalidadId.value = null;"
                        >
                          <td class="px-3 py-2.5 font-extrabold text-slate-800 flex items-center gap-2">
                            <span>📍</span>
                            <span>{{ p.provincia_nombre }}</span>
                          </td>
                          <td class="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{{ p.envios }}</td>
                          <td class="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{{ p.bultos }}</td>
                          <td class="px-3 py-2.5 text-right font-extrabold text-slate-900">{{ formatCurrency(p.total) }}</td>
                          <td class="px-3 py-2.5 text-right font-extrabold text-indigo-700 bg-indigo-50/30">{{ formatCurrency(p.promedioEnvio) }}</td>
                          <td class="px-3 py-2.5 text-right text-slate-600 font-medium font-mono">{{ formatCurrency(p.promedioBulto) }}</td>
                          <td class="px-3 py-2.5 text-center">
                            <span class="inline-flex items-center text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
                              Ver Localidades →
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              <!-- ========================================================================= -->
              <!-- NIVEL 2: VISTA POR LOCALIDADES (Provincia Seleccionada) -->
              <!-- ========================================================================= -->
              <div v-else-if="costosDestino.currentNivel.value === 'localidad'" class="space-y-4">
                
                <div class="flex items-center justify-between">
                  <button 
                    type="button" 
                    class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200"
                    @click="costosDestino.selectedProvinciaId.value = null;"
                  >
                    ← Volver a Provincias
                  </button>
                  <span class="text-xs text-slate-500 font-medium">Hacé clic en una localidad para ver su detalle operativo</span>
                </div>

                <!-- KPIs Provinciales -->
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">Total en {{ selectedProvinciaNombre }}</span>
                    <strong class="mt-1 block text-xl font-extrabold text-indigo-900">{{ formatCurrency(consolidadoLocalidades.totalGastado) }}</strong>
                    <span class="text-[10px] text-indigo-600 font-semibold block mt-0.5"><strong class="font-mono">{{ consolidadoLocalidades.totalEnvios }}</strong> envíos a esta provincia</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Bultos Recibidos</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-800">{{ consolidadoLocalidades.totalBultos }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5">Total bultos en la provincia</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Promedio Provincial / Envío</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-900">{{ formatCurrency(consolidadoLocalidades.promedioEnvio) }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5">Costo medio por despacho</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Promedio Provincial / Bulto</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-900">{{ formatCurrency(consolidadoLocalidades.promedioBulto) }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5">Costo medio por bulto</span>
                  </div>
                </div>

                <!-- Banner Alerta de Inconsistencia Geográfica para la Provincia Seleccionada (ej. Corrientes con localidad BUENOS AIRES) -->
                <div v-if="inconsistenciasDeProvinciaSeleccionada.length > 0" class="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
                  <div class="flex items-center gap-2.5">
                    <div class="p-2 bg-rose-100 rounded-lg text-rose-700 font-extrabold text-base">⚠️</div>
                    <div>
                      <h5 class="text-xs font-bold text-rose-900">
                        Se detectaron {{ inconsistenciasDeProvinciaSeleccionada.length }} operaciones con localidad inconsistente registradas en {{ selectedProvinciaNombre }}
                      </h5>
                      <p class="text-[11px] text-rose-700 mt-0.5">
                        Ejemplo: Registradas como {{ selectedProvinciaNombre }}, pero asignadas a la localidad "{{ inconsistenciasDeProvinciaSeleccionada[0]?.localidad_registrada_nombre }}" (perteneciente a {{ inconsistenciasDeProvinciaSeleccionada[0]?.provincia_real_localidad_nombre }}).
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button 
                      type="button" 
                      class="bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                      @click="showOpsInconsistentesModal = true; auditSearchQuery = selectedProvinciaNombre;"
                    >
                      🔍 Auditar ({{ inconsistenciasDeProvinciaSeleccionada.length }})
                    </button>
                    <button 
                      type="button" 
                      class="bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      @click="irACorregirEnMovimientos()"
                    >
                      🔗 Ir a Conciliación para Corregir →
                    </button>
                  </div>
                </div>

                <!-- Tabla Nivel 2: Localidades -->
                <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                  <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      🏙️ Desglose de Costos por Localidad en {{ selectedProvinciaNombre }}
                    </h4>
                    <span class="text-[11px] font-semibold text-slate-500 font-mono">{{ consolidadoLocalidades.localidades.length }} localidades con envíos</span>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200 text-xs">
                      <thead class="bg-slate-100">
                        <tr>
                          <th class="px-3 py-2.5 text-left font-bold text-slate-600">Localidad Destino</th>
                          <th class="px-3 py-2.5 text-center font-bold text-slate-600">Despachos / Envíos</th>
                          <th class="px-3 py-2.5 text-center font-bold text-slate-600">Bultos Totales</th>
                          <th class="px-3 py-2.5 text-center font-bold text-amber-800 bg-amber-50/60">Sentido principal</th>
                          <th class="px-3 py-2.5 text-left font-bold text-indigo-800 bg-indigo-50/60">Operación principal</th>
                          <th class="px-3 py-2.5 text-right font-bold text-slate-600">Total Acumulado ($)</th>
                          <th class="px-3 py-2.5 text-right font-bold text-indigo-700 bg-indigo-50/50">Promedio por Envío</th>
                          <th class="px-3 py-2.5 text-center font-bold text-slate-600">Acción</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 bg-white">
                        <tr 
                          v-for="l in consolidadoLocalidades.localidades" 
                          :key="l.localidad_id || l.localidad_nombre" 
                          class="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                          @click="costosDestino.selectedLocalidadId.value = l.localidad_id;"
                        >
                          <td class="px-3 py-2.5 font-extrabold text-slate-800 flex items-center gap-2">
                            <span>🏙️</span>
                            <span>{{ l.localidad_nombre }}</span>
                            <span v-if="l.isInconsistent" class="inline-flex items-center gap-1 text-[10px] bg-rose-100 text-rose-800 font-extrabold px-1.5 py-0.5 rounded border border-rose-200" title="Localidad con inconsistencia registrada en la base de datos">
                              ⚠️ Requiere revisión
                            </span>
                          </td>
                          <td class="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{{ l.envios }}</td>
                          <td class="px-3 py-2.5 text-center font-mono font-bold text-slate-800">{{ l.bultos }}</td>
                          <td class="px-3 py-2.5 text-center font-bold">
                            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold" :class="l.sentidoPredominante === 'Vuelta' ? 'bg-purple-100 text-purple-800' : l.sentidoPredominante === 'Interno' ? 'bg-slate-100 text-slate-800' : 'bg-blue-100 text-blue-800'">
                              {{ l.sentidoPredominante || 'Ida' }}
                            </span>
                          </td>
                          <td class="px-3 py-2.5 text-left font-semibold text-slate-700 text-[11px] truncate max-w-[140px]" :title="l.tipoPredominante">
                            {{ l.tipoPredominante || 'Envío General' }}
                          </td>
                          <td class="px-3 py-2.5 text-right font-extrabold text-slate-900">{{ formatCurrency(l.total) }}</td>
                          <td class="px-3 py-2.5 text-right font-extrabold text-indigo-700 bg-indigo-50/30">{{ formatCurrency(l.promedioEnvio) }}</td>
                          <td class="px-3 py-2.5 text-center">
                            <span class="inline-flex items-center text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
                              Ver Detalle Operativo →
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Resumen Ejecutivos Nivel 2: Encomiendas, Proveedores y Clientes -->
                <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <!-- Tabla 1: Encomiendas / Transportes -->
                  <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                    <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        🚚 Empresa de Transporte
                      </h4>
                      <span class="text-[11px] font-semibold text-slate-500 font-mono">{{ consolidadoLocalidades.resumenTransportes?.length || 0 }}</span>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="min-w-full divide-y divide-slate-200 text-xs">
                        <thead class="bg-slate-100">
                          <tr>
                            <th class="px-2.5 py-2 text-left font-bold text-slate-600">Transportista</th>
                            <th class="px-2 py-2 text-center font-bold text-slate-600">Envíos</th>
                            <th class="px-2 py-2 text-center font-bold text-slate-600">Bultos</th>
                            <th class="px-2 py-2 text-center font-bold text-amber-800">Sentido principal</th>
                            <th class="px-2 py-2 text-left font-bold text-indigo-800">Operación principal</th>
                            <th class="px-2.5 py-2 text-right font-bold text-slate-600">Total ($)</th>
                            <th class="px-2.5 py-2 text-right font-bold text-indigo-700 bg-indigo-50/50">Prom/Envío</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 bg-white">
                          <tr v-for="t in consolidadoLocalidades.resumenTransportes" :key="t.transporte_nombre" class="hover:bg-slate-50">
                            <td class="px-2.5 py-2 font-extrabold text-slate-800">{{ t.transporte_nombre }}</td>
                            <td class="px-2 py-2 text-center font-mono font-bold text-slate-800">{{ t.envios }}</td>
                            <td class="px-2 py-2 text-center font-mono font-bold text-slate-800">{{ t.bultos }}</td>
                            <td class="px-2 py-2 text-center text-[10px]">
                              <span class="px-1.5 py-0.5 rounded font-extrabold" :class="t.sentidoPredominante === 'Vuelta' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'">{{ t.sentidoPredominante || 'Ida' }}</span>
                            </td>
                            <td class="px-2 py-2 text-left font-medium text-slate-700 text-[10px] truncate max-w-[110px]" :title="t.tipoPredominante">{{ t.tipoPredominante || 'Envío' }}</td>
                            <td class="px-2.5 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(t.total) }}</td>
                            <td class="px-2.5 py-2 text-right font-extrabold text-indigo-700 bg-indigo-50/30">{{ formatCurrency(t.promedioEnvio) }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Tabla 2: Proveedores Externos (Reales) -->
                  <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                    <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        🏢 Desglose por Proveedor Externo
                      </h4>
                      <span class="text-[11px] font-semibold text-slate-500 font-mono">{{ consolidadoLocalidades.resumenProveedores?.length || 0 }}</span>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="min-w-full divide-y divide-slate-200 text-xs">
                        <thead class="bg-slate-100">
                          <tr>
                            <th class="px-2.5 py-2 text-left font-bold text-slate-600">Proveedor Externo</th>
                            <th class="px-2 py-2 text-center font-bold text-slate-600">Envíos</th>
                            <th class="px-2 py-2 text-center font-bold text-slate-600">Bultos</th>
                            <th class="px-2 py-2 text-center font-bold text-amber-800">Sentido principal</th>
                            <th class="px-2 py-2 text-left font-bold text-indigo-800">Operación principal</th>
                            <th class="px-2.5 py-2 text-right font-bold text-slate-600">Total ($)</th>
                            <th class="px-2.5 py-2 text-right font-bold text-emerald-700 bg-emerald-50/50">Prom/Envío</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 bg-white">
                          <tr v-for="p in consolidadoLocalidades.resumenProveedores" :key="p.proveedor_nombre" class="hover:bg-slate-50">
                            <td class="px-2.5 py-2 font-extrabold text-slate-800">{{ p.proveedor_nombre }}</td>
                            <td class="px-2 py-2 text-center font-mono font-bold text-slate-800">{{ p.envios }}</td>
                            <td class="px-2 py-2 text-center font-mono font-bold text-slate-800">{{ p.bultos }}</td>
                            <td class="px-2 py-2 text-center text-[10px]">
                              <span class="px-1.5 py-0.5 rounded font-extrabold" :class="p.sentidoPredominante === 'Vuelta' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'">{{ p.sentidoPredominante || 'Ida' }}</span>
                            </td>
                            <td class="px-2 py-2 text-left font-medium text-slate-700 text-[10px] truncate max-w-[110px]" :title="p.tipoPredominante">{{ p.tipoPredominante || 'Envío' }}</td>
                            <td class="px-2.5 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(p.total) }}</td>
                            <td class="px-2.5 py-2 text-right font-extrabold text-emerald-700 bg-emerald-50/30">{{ formatCurrency(p.promedioEnvio) }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Tabla 3: Clientes / Obras Sociales -->
                  <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                    <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        🏥 Desglose por Cliente / Obra Social
                      </h4>
                      <span class="text-[11px] font-semibold text-slate-500 font-mono">{{ consolidadoLocalidades.resumenClientes?.length || 0 }}</span>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="min-w-full divide-y divide-slate-200 text-xs">
                        <thead class="bg-slate-100">
                          <tr>
                            <th class="px-2.5 py-2 text-left font-bold text-slate-600">Cliente / Obra Social</th>
                            <th class="px-2 py-2 text-center font-bold text-slate-600">Envíos</th>
                            <th class="px-2 py-2 text-center font-bold text-slate-600">Bultos</th>
                            <th class="px-2 py-2 text-center font-bold text-amber-800">Sentido principal</th>
                            <th class="px-2 py-2 text-left font-bold text-indigo-800">Operación principal</th>
                            <th class="px-2.5 py-2 text-right font-bold text-slate-600">Total ($)</th>
                            <th class="px-2.5 py-2 text-right font-bold text-sky-700 bg-sky-50/50">Prom/Envío</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 bg-white">
                          <tr v-for="c in consolidadoLocalidades.resumenClientes" :key="c.cliente_nombre" class="hover:bg-slate-50">
                            <td class="px-2.5 py-2 font-extrabold text-slate-800">{{ c.cliente_nombre }}</td>
                            <td class="px-2 py-2 text-center font-mono font-bold text-slate-800">{{ c.envios }}</td>
                            <td class="px-2 py-2 text-center font-mono font-bold text-slate-800">{{ c.bultos }}</td>
                            <td class="px-2 py-2 text-center text-[10px]">
                              <span class="px-1.5 py-0.5 rounded font-extrabold" :class="c.sentidoPredominante === 'Vuelta' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'">{{ c.sentidoPredominante || 'Ida' }}</span>
                            </td>
                            <td class="px-2 py-2 text-left font-medium text-slate-700 text-[10px] truncate max-w-[110px]" :title="c.tipoPredominante">{{ c.tipoPredominante || 'Envío' }}</td>
                            <td class="px-2.5 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(c.total) }}</td>
                            <td class="px-2.5 py-2 text-right font-extrabold text-sky-700 bg-sky-50/30">{{ formatCurrency(c.promedioEnvio) }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>

              <!-- ========================================================================= -->
              <!-- NIVEL 3: DETALLE OPERATIVO DE LOCALIDAD (Localidad Seleccionada) -->
              <!-- ========================================================================= -->
              <div v-else-if="costosDestino.currentNivel.value === 'detalle'" class="space-y-4">
                
                <div class="flex items-center justify-between">
                  <button 
                    type="button" 
                    class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200"
                    @click="costosDestino.selectedLocalidadId.value = null;"
                  >
                    ← Volver a Localidades de {{ selectedProvinciaNombre }}
                  </button>
                  <span class="text-xs text-slate-500 font-medium">Análisis detallado de despachos hacia {{ selectedLocalidadNombre }}</span>
                </div>

                <!-- TARJETAS KPI Nivel 3 -->
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">Costo Promedio por Envío</span>
                    <strong class="mt-1 block text-xl font-extrabold text-indigo-900">{{ formatCurrency(statsDestino.costoPromedioEnvio) }}</strong>
                    <span class="text-[10px] text-indigo-600 font-semibold block mt-0.5">KPI Principal / Referencia</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Costo Promedio por Bulto</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-800">{{ formatCurrency(statsDestino.costoPromedioBulto) }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5">Total: <strong class="text-slate-700 font-mono">{{ statsDestino.cantBultos }}</strong> bultos</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Acumulado ($)</span>
                    <strong class="mt-1 block text-xl font-extrabold text-slate-900">{{ formatCurrency(statsDestino.montoTotal) }}</strong>
                    <span class="text-[11px] text-slate-500 block mt-0.5"><strong class="text-slate-700 font-mono">{{ statsDestino.cantEnvios }}</strong> envíos registrados</span>
                  </div>

                  <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <span class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Rango Mín. / Máx.</span>
                    <div class="mt-1 flex items-baseline justify-between text-xs">
                      <span>Mín: <strong class="text-emerald-700 font-bold font-mono">{{ formatCurrency(statsDestino.costoMinimo) }}</strong></span>
                      <span>Máx: <strong class="text-rose-700 font-bold font-mono">{{ formatCurrency(statsDestino.costoMaximo) }}</strong></span>
                    </div>
                    <span class="text-[10px] text-slate-400 block mt-0.5">Por despacho individual</span>
                  </div>
                </div>

                <!-- 1. TABLA DETALLE OPERATIVO DE ENVÍOS AL DESTINO -->
                <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                  <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      📋 Detalle Operativo de Envíos a {{ selectedLocalidadNombre }} ({{ selectedProvinciaNombre }})
                    </h4>
                    <span class="text-[11px] font-semibold text-slate-500 font-mono">{{ statsDestino.cantEnvios }} registros</span>
                  </div>
                  <div class="overflow-x-auto max-h-[35vh]">
                    <table class="min-w-full divide-y divide-slate-200 text-xs">
                      <thead class="bg-slate-100 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-left font-bold text-slate-600">Fecha</th>
                          <th class="px-3 py-2 text-left font-bold text-slate-600">Transporte</th>
                          <th class="px-3 py-2 text-left font-bold text-slate-600">Proveedor / Tipo</th>
                          <th class="px-3 py-2 text-center font-bold text-slate-600">Movimiento</th>
                          <th class="px-3 py-2 text-center font-bold text-slate-600">Bultos</th>
                          <th class="px-3 py-2 text-right font-bold text-slate-600">Importe ($)</th>
                          <th class="px-3 py-2 text-center font-bold text-slate-600">Guía / Remito</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 bg-white">
                        <tr v-for="op in statsDestino.detalleOps" :key="op.id" class="hover:bg-slate-50">
                          <td class="px-3 py-2 whitespace-nowrap text-slate-600 font-medium">{{ formatDate(op.fecha_gasto) }}</td>
                          <td class="px-3 py-2 font-bold text-slate-800">
                            <span class="inline-block px-2 py-0.5 text-[11px] font-bold rounded-md border" :class="getProveedorBadgeColor(op.transporte_nombre)">
                              {{ op.transporte_nombre }}
                            </span>
                          </td>
                          <td class="px-3 py-2 font-semibold" :class="op.is_cirugia ? 'text-indigo-700' : 'text-slate-700'">
                            {{ op.proveedor_label }}
                            <span v-if="op.cliente_nombre" class="text-[10px] text-slate-400 block font-normal">{{ op.cliente_nombre }}</span>
                          </td>
                          <td class="px-3 py-2 text-center text-slate-600">{{ op.tipo_movimiento }}</td>
                          <td class="px-3 py-2 text-center font-mono font-bold text-indigo-700">{{ op.bultos }}</td>
                          <td class="px-3 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(op.monto_total) }}</td>
                          <td class="px-3 py-2 text-center font-mono text-slate-500">{{ op.numero_factura || '—' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- 2. CONSOLIDADO SECUNDARIO: COSTO POR TRANSPORTE -->
                <div class="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                  <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      🚚 Comparativa por Empresa de Transporte
                    </h4>
                    <span v-if="statsDestino.cantOpsSinTransporte > 0" class="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
                      ⚠️ {{ statsDestino.cantOpsSinTransporte }} {{ statsDestino.cantOpsSinTransporte === 1 ? 'operación sin transporte asignado' : 'operaciones sin transporte asignado' }} (excluidas de esta comparativa)
                    </span>
                    <span v-else class="text-[11px] text-slate-500">Evaluación de conveniencia hacia {{ selectedLocalidadNombre }}</span>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200 text-xs">
                      <thead class="bg-slate-100">
                        <tr>
                          <th class="px-3 py-2 text-left font-bold text-slate-600">Empresa de Transporte</th>
                          <th class="px-3 py-2 text-center font-bold text-slate-600">Envíos</th>
                          <th class="px-3 py-2 text-center font-bold text-slate-600">Bultos Totales</th>
                          <th class="px-3 py-2 text-right font-bold text-slate-600">Total Acumulado ($)</th>
                          <th class="px-3 py-2 text-right font-bold text-indigo-700 bg-indigo-50/50">Promedio por Envío</th>
                          <th class="px-3 py-2 text-right font-bold text-slate-600">Promedio por Bulto</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 bg-white">
                        <tr v-for="t in statsDestino.transporteConsolidado" :key="t.transporteNombre" class="hover:bg-slate-50">
                          <td class="px-3 py-2 font-bold">
                            <span class="inline-block px-2 py-0.5 text-[11px] font-bold rounded-md border" :class="getProveedorBadgeColor(t.transporteNombre)">
                              {{ t.transporteNombre }}
                            </span>
                          </td>
                          <td class="px-3 py-2 text-center font-mono font-bold text-slate-800">{{ t.envios }}</td>
                          <td class="px-3 py-2 text-center font-mono font-bold text-slate-800">{{ t.bultos }}</td>
                          <td class="px-3 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(t.total) }}</td>
                          <td class="px-3 py-2 text-right font-extrabold text-indigo-700 bg-indigo-50/30">{{ formatCurrency(t.promedioEnvio) }}</td>
                          <td class="px-3 py-2 text-right text-slate-600 font-medium font-mono">{{ formatCurrency(t.promedioBulto) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>

          </div> <!-- Fin div activeCategory === 'destino' -->

        </div>

        <!-- Footer con Botones de Exportación Dinámica -->
        <div class="border-t border-slate-200 p-4 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div v-if="activeCategory === 'ctacte'" class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-500">Descargas Rápidas:</span>
            <button 
              type="button" 
              class="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
              @click="downloadPDF('encomienda')"
              :disabled="items.length === 0 || loading"
            >
              PDF Solo Encomiendas
            </button>
            <button 
              type="button" 
              class="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
              @click="downloadPDF('proveedor')"
              :disabled="items.length === 0 || loading"
            >
              PDF Solo Proveedores
            </button>
            <button 
              type="button" 
              class="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
              @click="downloadPDF('completo')"
              :disabled="items.length === 0 || loading"
            >
              PDF Consolidado Completo (Ambos)
            </button>
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-500">Exportar Ficha de Destino:</span>
            <button 
              type="button" 
              class="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 flex items-center gap-1.5 transition-colors"
              @click="exportDestinoExcel"
              :disabled="statsDestino.cantEnvios === 0 || loadingDestino"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Excel Destino</span>
            </button>
          </div>

          <div class="flex items-center gap-3">
            <button type="button" class="btn-secondary" @click="closeModal">Cerrar</button>
            <button 
              v-if="activeCategory === 'ctacte'"
              type="button" 
              class="btn-primary flex items-center justify-center gap-2" 
              :disabled="items.length === 0 || loading"
              @click="downloadPDF(null)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>
                {{ activeViewTab === 'encomienda' ? 'Descargar PDF (Solo Encomiendas)' : activeViewTab === 'proveedor' ? 'Descargar PDF (Solo Proveedores)' : activeViewTab === 'completo' ? 'Descargar PDF (Consolidado Completo)' : 'Descargar PDF (Detalle)' }}
              </span>
            </button>
            <button 
              v-else
              type="button" 
              class="btn-primary flex items-center justify-center gap-2" 
              :disabled="filteredDestinoByDate.length === 0 || loadingDestino"
              @click="exportDestinoPdf"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>
                {{ costosDestino.currentNivel.value === 'provincia' ? 'Descargar PDF (Consolidado Provincias)' : costosDestino.currentNivel.value === 'localidad' ? 'Descargar PDF (Localidades)' : 'Descargar PDF (Ficha Operativa)' }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- MODAL DE OPERACIONES SIN DESTINO NORMALIZADO (AUDITORÍA) -->
  <Transition name="modal-fade">
    <div v-if="showOpsSinDestinoModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div class="bg-white rounded-2xl shadow-2xl max-w-6xl w-full overflow-hidden border border-slate-200">
        
        <!-- Header -->
        <div class="bg-amber-500 px-5 py-3.5 flex items-center justify-between text-white">
          <div class="flex items-center gap-2">
            <span class="text-lg">⚠️</span>
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider">Operaciones Logísticas sin ID de Destino</h3>
              <p class="text-[11px] text-amber-100 font-medium">Registros históricos del circuito logístico que no poseen provincia_id ni localidad_destino_id asignados</p>
            </div>
          </div>
          <button type="button" class="text-amber-100 hover:text-white text-xl font-bold px-2 cursor-pointer" @click="showOpsSinDestinoModal = false">✕</button>
        </div>

        <!-- Content Table -->
        <div class="p-4 space-y-3">
          <div class="overflow-x-auto max-h-[55vh]">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
              <thead class="bg-slate-100 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left font-bold text-slate-600">ID / Fecha</th>
                  <th class="px-3 py-2 text-left font-bold text-slate-600">Transporte</th>
                  <th class="px-3 py-2 text-left font-bold text-slate-600">Proveedor / Tipo</th>
                  <th class="px-3 py-2 text-left font-bold text-slate-600">Descripción / Referencia</th>
                  <th class="px-3 py-2 text-left font-bold text-slate-600">Texto Lib. Destino</th>
                  <th class="px-3 py-2 text-right font-bold text-slate-600">Importe ($)</th>
                  <th class="px-3 py-2 text-center font-bold text-slate-600">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr v-for="op in opsSinDestinoList" :key="op.id" class="hover:bg-amber-50/40 transition-colors">
                  <td class="px-3 py-2 whitespace-nowrap">
                    <span class="font-mono font-bold text-slate-700 block">#{{ op.id }}</span>
                    <span class="text-[11px] text-slate-500">{{ formatDate(op.fecha_gasto) }}</span>
                  </td>
                  <td class="px-3 py-2 font-bold text-slate-800">{{ op.transporte_nombre }}</td>
                  <td class="px-3 py-2 font-semibold text-slate-700">{{ op.proveedor_label }}</td>
                  <td class="px-3 py-2 text-slate-600 max-w-[220px] truncate" :title="op.descripcion || op.descripcion_general">{{ op.descripcion || op.descripcion_general || '—' }}</td>
                  <td class="px-3 py-2 text-slate-500 font-mono italic">{{ op.datos_adicionales?.destino_texto || op.destino_texto || '—' }}</td>
                  <td class="px-3 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(op.monto_total) }}</td>
                  <td class="px-3 py-2 text-center whitespace-nowrap">
                    <button 
                      type="button" 
                      class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-lg transition whitespace-nowrap cursor-pointer shadow-2xs"
                      @click="irACorregirSinDestino(op)"
                    >
                      <span>🔗 Corregir</span>
                      <span>→</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer -->
        <div class="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <span class="text-slate-600 font-medium">Total: <strong class="text-amber-700">{{ opsSinDestinoList.length }}</strong> operaciones sin vincular</span>
          <div class="flex items-center gap-2">
            <button 
              type="button" 
              class="btn-primary text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
              @click="irACorregirSinDestino()"
            >
              🚀 Redirigir a Conciliación / Movimientos para Corregir →
            </button>
            <button type="button" class="btn-secondary text-xs" @click="showOpsSinDestinoModal = false">Cerrar</button>
          </div>
        </div>

      </div>
    </div>
  </Transition>

  <!-- MODAL DE OPERACIONES CON DESTINO INCONSISTENTE (AUDITORÍA) -->
  <Transition name="modal-fade">
    <div v-if="showOpsInconsistentesModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div class="bg-white rounded-2xl shadow-2xl max-w-6xl w-full overflow-hidden border border-slate-200">
        
        <!-- Header -->
        <div class="bg-rose-600 px-5 py-3.5 flex items-center justify-between text-white">
          <div class="flex items-center gap-2">
            <span class="text-lg">⚠️</span>
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider">Operaciones con Destino Inconsistente</h3>
              <p class="text-[11px] text-rose-100 font-medium">Registros donde la localidad asignada no pertenece a la provincia registrada (Requiere revisión manual)</p>
            </div>
          </div>
          <button type="button" class="text-rose-100 hover:text-white text-xl font-bold px-2 cursor-pointer" @click="showOpsInconsistentesModal = false">✕</button>
        </div>

        <!-- Content Table -->
        <div class="p-4 space-y-3">
          
          <!-- Buscador por Texto -->
          <div class="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div class="flex-1 max-w-md relative">
              <input 
                v-model="auditSearchQuery" 
                type="text" 
                placeholder="🔍 Buscar por ciudad, provincia, ID o texto (ej. Buenos Aires, Corrientes)..." 
                class="form-input text-xs w-full pl-3 pr-8 py-1.5 font-medium bg-white"
              />
              <button 
                v-if="auditSearchQuery" 
                type="button" 
                class="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold" 
                @click="auditSearchQuery = ''"
              >
                ✕
              </button>
            </div>

            <span class="text-xs text-slate-500 font-semibold font-mono">
              Mostrando {{ opsInconsistentesFiltradas.length }} de {{ opsInconsistentesList.length }} inconsistencias
            </span>
          </div>

          <div class="overflow-x-auto max-h-[55vh]">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
              <thead class="bg-slate-100 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left font-bold text-slate-600">ID / Fecha</th>
                  <th class="px-3 py-2 text-left font-bold text-slate-600">Transporte / Prov.</th>
                  <th class="px-3 py-2 text-left font-bold text-rose-700 bg-rose-50">Provincia Registrada</th>
                  <th class="px-3 py-2 text-left font-bold text-amber-800 bg-amber-50">Localidad Registrada</th>
                  <th class="px-3 py-2 text-left font-bold text-indigo-700 bg-indigo-50">Provincia Real (de la ciudad)</th>
                  <th class="px-3 py-2 text-center font-bold text-slate-600">Estado</th>
                  <th class="px-3 py-2 text-right font-bold text-slate-600">Importe ($)</th>
                  <th class="px-3 py-2 text-center font-bold text-slate-600">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr v-for="op in opsInconsistentesFiltradas" :key="op.id" class="hover:bg-rose-50/30 transition-colors">
                  <td class="px-3 py-2 whitespace-nowrap">
                    <span class="font-mono font-bold text-slate-700 block">#{{ op.id }}</span>
                    <span class="text-[11px] text-slate-500">{{ formatDate(op.fecha_gasto) }}</span>
                  </td>
                  <td class="px-3 py-2">
                    <span class="font-bold text-slate-800 block">{{ op.transporte_nombre }}</span>
                    <span class="text-[11px] text-slate-500">{{ op.proveedor_label }}</span>
                  </td>
                  <td class="px-3 py-2 font-bold text-rose-800 bg-rose-50/50">
                    📍 {{ op.provincia_registrada_nombre }}
                  </td>
                  <td class="px-3 py-2 font-bold text-amber-900 bg-amber-50/50">
                    🏙️ {{ op.localidad_registrada_nombre }}
                  </td>
                  <td class="px-3 py-2 font-bold text-indigo-900 bg-indigo-50/50">
                    🇦🇷 {{ op.provincia_real_localidad_nombre }}
                  </td>
                  <td class="px-3 py-2 text-center">
                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                      {{ op.estado }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(op.monto_total) }}</td>
                  <td class="px-3 py-2 text-center whitespace-nowrap">
                    <button 
                      type="button" 
                      class="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition whitespace-nowrap cursor-pointer shadow-2xs"
                      @click="irACorregirEnMovimientos(op)"
                    >
                      🔗 Corregir en Movimientos →
                    </button>
                  </td>
                </tr>
                <tr v-if="opsInconsistentesFiltradas.length === 0" class="text-center py-6 text-slate-400">
                  <td colspan="8" class="py-6">Sin resultados que coincidan con la búsqueda "{{ auditSearchQuery }}"</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer -->
        <div class="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <span class="text-slate-600 font-medium">Total: <strong class="text-rose-700">{{ opsInconsistentesFiltradas.length }}</strong> operaciones halladas</span>
          <div class="flex items-center gap-2">
            <button 
              type="button" 
              class="btn-primary text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
              @click="irACorregirEnMovimientos()"
            >
              🚀 Redirigir a Conciliación / Movimientos para Corregir →
            </button>
            <button type="button" class="btn-secondary text-xs" @click="showOpsInconsistentesModal = false">Cerrar</button>
          </div>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
.form-input { @apply block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50; }
.btn-secondary { @apply rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50; }
.z-60 { z-index: 60; }
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
