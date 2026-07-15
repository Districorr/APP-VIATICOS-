import { computed, reactive, ref } from 'vue';
import { supabase } from '../supabaseClient';

const todayIso = () => new Date().toISOString().split('T')[0];

const firstDayOfCurrentMonth = () => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
};

const emptyDashboard = () => ({
  periodo: {},
  cupo: {},
  kpis: {},
  resumen_semanal: [],
  por_proveedor: [],
  por_transporte: [],
  por_modalidad: [],
  control_semanal_por_proveedor: [],
  semanas_catalogo: [],
  control_semanal_totales: null,
  detalle: [],
  total_count: 0,
});

const normalizeDashboard = (payload) => {
  const data = Array.isArray(payload) ? payload[0] : payload;
  return {
    ...emptyDashboard(),
    ...(data || {}),
    periodo: data?.periodo || {},
    cupo: data?.cupo || {},
    kpis: data?.kpis || {},
    resumen_semanal: data?.resumen_semanal || [],
    por_proveedor: data?.por_proveedor || [],
    por_transporte: data?.por_transporte || [],
    por_modalidad: data?.por_modalidad || [],
    control_semanal_por_proveedor: data?.control_semanal_por_proveedor || [],
    semanas_catalogo: data?.semanas_catalogo || [],
    control_semanal_totales: data?.control_semanal_totales || null,
    detalle: data?.detalle || [],
    total_count: Number(data?.total_count || data?.detalle?.length || 0),
  };
};

export function useEncomiendasDashboard() {
  const dashboard = ref(emptyDashboard());
  const loading = ref(false);
  const error = ref('');
  const pageSize = ref(10);
  const currentPage = ref(1);

  const filters = reactive({
    fechaDesde: firstDayOfCurrentMonth(),
    fechaHasta: todayIso(),
    proveedorId: null,
    transporteId: null,
    tipoMovimiento: null,
    modalidad: null,
    responsableId: null,
    paciente: '',
  });

  const sinProveedorId = ref(null);

  const loadSinProveedorId = async () => {
    try {
      const { data } = await supabase
        .from('proveedores')
        .select('id')
        .ilike('nombre', 'sin proveedor')
        .eq('activo', true)
        .maybeSingle();
      if (data) {
        sinProveedorId.value = data.id;
      }
    } catch (e) {
      console.error('Error cargando id de sin proveedor:', e);
    }
  };

  loadSinProveedorId();

  const offset = computed(() => (currentPage.value - 1) * pageSize.value);
  const totalCount = computed(() => Number(dashboard.value?.total_count || 0));
  const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)));
  const hasResults = computed(() => (dashboard.value?.detalle || []).length > 0);
  const resultFrom = computed(() => totalCount.value === 0 ? 0 : offset.value + 1);
  const resultTo = computed(() => Math.min(offset.value + pageSize.value, totalCount.value));

  const buildRpcParams = ({ limit = pageSize.value, pageOffset = offset.value } = {}) => {
    const isSinProveedor = filters.proveedorId && sinProveedorId.value === filters.proveedorId;
    const provId = isSinProveedor ? null : filters.proveedorId;
    return {
      p_fecha_desde: filters.fechaDesde || null,
      p_fecha_hasta: filters.fechaHasta || null,
      p_proveedor_id: provId || null,
      p_transporte_id: filters.transporteId || null,
      p_tipo_movimiento: filters.tipoMovimiento || null,
      p_modalidad: filters.modalidad || null,
      p_responsable_id: filters.responsableId || null,
      p_paciente: filters.paciente?.trim() || null,
      p_limit: isSinProveedor ? null : limit,
      p_offset: isSinProveedor ? 0 : pageOffset,
    };
  };

  const postProcessDashboard = (data) => {
    const normalized = normalizeDashboard(data);
    const isSinProveedorFilter = filters.proveedorId && sinProveedorId.value === filters.proveedorId;
    if (!isSinProveedorFilter) return normalized;

    // Filtrar detalles: proveedor_id es null o coincide con sinProveedorId
    const filteredDetalle = (normalized.detalle || []).filter(
      item => item.proveedor_id === null || item.proveedor_id === undefined || item.proveedor_id === sinProveedorId.value
    );

    // Filtrar resumen de proveedor
    const filteredPorProveedor = (normalized.por_proveedor || []).filter(
      item => item.proveedor_id === null || item.proveedor_id === undefined || item.proveedor_id === sinProveedorId.value
    );

    // Filtrar control semanal
    const filteredControlSemanal = (normalized.control_semanal_por_proveedor || []).filter(
      item => item.proveedor_id === null || item.proveedor_id === undefined || item.proveedor_id === sinProveedorId.value
    );

    // Recalcular KPIs
    const getVal = (item, keys, fallback = 0) => {
      for (const key of keys) {
        if (item?.[key] !== null && item?.[key] !== undefined && item?.[key] !== '') return Number(item[key]);
      }
      return fallback;
    };

    const getModalidad = (item) => {
      const val = item?.modalidad_imputacion || item?.modalidad || '';
      return String(val).trim().toLowerCase();
    };

    const totalGasto = filteredDetalle.reduce((sum, item) => sum + getVal(item, ['monto', 'monto_total', 'total']), 0);
    const countDespachos = filteredDetalle.length;
    const totalCC = filteredDetalle.filter(item => getModalidad(item) === 'cuenta_corriente_empresa').reduce((sum, item) => sum + getVal(item, ['monto', 'monto_total', 'total']), 0);
    const totalRend = filteredDetalle.filter(item => getModalidad(item) === 'rendicion').reduce((sum, item) => sum + getVal(item, ['monto', 'monto_total', 'total']), 0);
    const totalCaja = filteredDetalle.filter(item => getModalidad(item) === 'caja_chica').reduce((sum, item) => sum + getVal(item, ['monto', 'monto_total', 'total']), 0);

    return {
      ...normalized,
      detalle: filteredDetalle,
      por_proveedor: filteredPorProveedor,
      control_semanal_por_proveedor: filteredControlSemanal,
      total_count: countDespachos,
      kpis: {
        ...normalized.kpis,
        gasto_total_periodo: totalGasto,
        cantidad_despachos: countDespachos,
        gasto_promedio_despacho: countDespachos > 0 ? totalGasto / countDespachos : null,
        total_cuenta_corriente: totalCC,
        total_rendicion: totalRend,
        total_caja_chica: totalCaja
      }
    };
  };

  const fetchDashboard = async () => {
    loading.value = true;
    error.value = '';

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_admin_encomiendas_dashboard_v2',
        buildRpcParams()
      );

      if (rpcError) throw rpcError;
      dashboard.value = postProcessDashboard(data);
    } catch (e) {
      console.error('Error cargando dashboard de encomiendas:', e);
      error.value = e.message || 'No se pudo cargar el panel de encomiendas.';
      dashboard.value = emptyDashboard();
    } finally {
      loading.value = false;
    }
  };

  const fetchExportDashboard = async () => {
    const { data, error: rpcError } = await supabase.rpc(
      'get_admin_encomiendas_dashboard_v2',
      buildRpcParams({ limit: null, pageOffset: 0 })
    );

    if (rpcError) throw rpcError;
    return postProcessDashboard(data);
  };

  const applyFilters = async () => {
    currentPage.value = 1;
    await fetchDashboard();
  };

  const clearFilters = async () => {
    filters.fechaDesde = firstDayOfCurrentMonth();
    filters.fechaHasta = todayIso();
    filters.proveedorId = null;
    filters.transporteId = null;
    filters.tipoMovimiento = null;
    filters.modalidad = null;
    filters.responsableId = null;
    filters.paciente = '';
    currentPage.value = 1;
    await fetchDashboard();
  };

  const goToPage = async (page) => {
    const nextPage = Math.min(Math.max(1, page), totalPages.value);
    if (nextPage === currentPage.value) return;
    currentPage.value = nextPage;
    await fetchDashboard();
  };

  const changePageSize = async (size) => {
    pageSize.value = Number(size);
    currentPage.value = 1;
    await fetchDashboard();
  };

  return {
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
  };
}
