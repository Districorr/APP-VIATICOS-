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

  const offset = computed(() => (currentPage.value - 1) * pageSize.value);
  const totalCount = computed(() => Number(dashboard.value?.total_count || 0));
  const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)));
  const hasResults = computed(() => (dashboard.value?.detalle || []).length > 0);
  const resultFrom = computed(() => totalCount.value === 0 ? 0 : offset.value + 1);
  const resultTo = computed(() => Math.min(offset.value + pageSize.value, totalCount.value));

  const buildRpcParams = ({ limit = pageSize.value, pageOffset = offset.value } = {}) => ({
    p_fecha_desde: filters.fechaDesde || null,
    p_fecha_hasta: filters.fechaHasta || null,
    p_proveedor_id: filters.proveedorId || null,
    p_transporte_id: filters.transporteId || null,
    p_tipo_movimiento: filters.tipoMovimiento || null,
    p_modalidad: filters.modalidad || null,
    p_responsable_id: filters.responsableId || null,
    p_paciente: filters.paciente?.trim() || null,
    p_limit: limit,
    p_offset: pageOffset,
  });

  const fetchDashboard = async () => {
    loading.value = true;
    error.value = '';

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_admin_encomiendas_dashboard_v2',
        buildRpcParams()
      );

      if (rpcError) throw rpcError;
      dashboard.value = normalizeDashboard(data);
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
    return normalizeDashboard(data);
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
