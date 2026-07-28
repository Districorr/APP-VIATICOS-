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

  const LOGISTICA_CIRUGIA_ID = 14;

  const isSurgeryDescription = (desc) => {
    if (!desc) return false;
    const normalized = String(desc)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    return normalized.includes('cirugia') || normalized.includes('cirugía');
  };

  const buildRpcParams = ({ limit = pageSize.value, pageOffset = offset.value } = {}) => {
    const isSinProveedor = filters.proveedorId && sinProveedorId.value === filters.proveedorId;
    const isLogisticaCirugia = filters.proveedorId && filters.proveedorId === LOGISTICA_CIRUGIA_ID;
    const provId = (isSinProveedor || isLogisticaCirugia) ? null : filters.proveedorId;
    const clientSidePaging = isSinProveedor || isLogisticaCirugia;
    return {
      p_fecha_desde: filters.fechaDesde || null,
      p_fecha_hasta: filters.fechaHasta || null,
      p_proveedor_id: provId || null,
      p_transporte_id: filters.transporteId || null,
      p_tipo_movimiento: filters.tipoMovimiento || null,
      p_modalidad: filters.modalidad || null,
      p_responsable_id: filters.responsableId || null,
      p_paciente: filters.paciente?.trim() || null,
      p_limit: clientSidePaging ? null : limit,
      p_offset: clientSidePaging ? 0 : pageOffset,
    };
  };

  const postProcessDashboard = (data) => {
    const normalized = normalizeDashboard(data);

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

    // 1. RECLASIFICACIÓN DE CIRUGÍA
    // Si un registro es "SIN PROVEEDOR" pero su descripción contiene "CIRUGIA", le asignamos LOGISTICA CIRUGIA (14).
    let rowCirugia = (normalized.por_proveedor || []).find(r => Number(r.proveedor_id) === LOGISTICA_CIRUGIA_ID);
    if (!rowCirugia && normalized.por_proveedor) {
      rowCirugia = {
        proveedor_id: LOGISTICA_CIRUGIA_ID,
        proveedor_nombre: 'LOGISTICA CIRUGIA',
        gasto_total: 0,
        despachos_periodo: 0,
        promedio_por_despacho: 0
      };
      normalized.por_proveedor.push(rowCirugia);
    }

    let weeklyCirugia = (normalized.control_semanal_por_proveedor || []).find(r => Number(r.proveedor_id) === LOGISTICA_CIRUGIA_ID);
    if (!weeklyCirugia && normalized.control_semanal_por_proveedor) {
      weeklyCirugia = {
        proveedor_id: LOGISTICA_CIRUGIA_ID,
        proveedor_nombre: 'LOGISTICA CIRUGIA',
        gasto_total_periodo: 0,
        despachos_periodo: 0,
        promedio_por_despacho: 0,
        semanas: (normalized.semanas_catalogo || []).map(w => ({
          semana_numero: w.semana_numero,
          semana_inicio: w.semana_inicio,
          semana_fin: w.semana_fin,
          gasto_total: 0,
          despachos: 0
        })),
        cupo_mensual: null,
        disponible_diferencia: null,
        porcentaje_consumido: null,
        estado: 'OK'
      };
      normalized.control_semanal_por_proveedor.push(weeklyCirugia);
    }

    if (normalized.detalle && normalized.detalle.length > 0) {
      normalized.detalle = normalized.detalle.map(item => {
        const isSinProv = item.proveedor_id === null || item.proveedor_id === undefined || item.proveedor_id === sinProveedorId.value;
        const desc = item.descripcion || item.descripcion_general || item.detalle || '';
        if (isSinProv && isSurgeryDescription(desc)) {
          const montoVal = getVal(item, ['monto', 'monto_total', 'total']);

          // Sumar al proveedor LOGISTICA CIRUGIA
          if (rowCirugia) {
            rowCirugia.gasto_total += montoVal;
            rowCirugia.despachos_periodo += 1;
          }
          if (weeklyCirugia) {
            weeklyCirugia.gasto_total_periodo += montoVal;
            weeklyCirugia.despachos_periodo += 1;
          }

          // Restar del proveedor SIN PROVEEDOR
          let rowSinProv = (normalized.por_proveedor || []).find(r => r.proveedor_id === null || r.proveedor_id === undefined || r.proveedor_id === sinProveedorId.value);
          if (rowSinProv) {
            rowSinProv.gasto_total = Math.max(0, rowSinProv.gasto_total - montoVal);
            rowSinProv.despachos_periodo = Math.max(0, rowSinProv.despachos_periodo - 1);
          }
          let weeklySinProv = (normalized.control_semanal_por_proveedor || []).find(r => r.proveedor_id === null || r.proveedor_id === undefined || r.proveedor_id === sinProveedorId.value);
          if (weeklySinProv) {
            weeklySinProv.gasto_total_periodo = Math.max(0, weeklySinProv.gasto_total_periodo - montoVal);
            weeklySinProv.despachos_periodo = Math.max(0, weeklySinProv.despachos_periodo - 1);
          }

          // Buscar semana y transferir
          const fecha = item.fecha_gasto ? String(item.fecha_gasto).slice(0, 10) : '';
          if (fecha) {
            const transferWeek = (weeklyRow, add) => {
              if (!weeklyRow) return;
              const week = (weeklyRow.semanas || []).find(w => fecha >= w.semana_inicio && fecha <= w.semana_fin);
              if (week) {
                if (add) {
                  week.gasto_total = (week.gasto_total || 0) + montoVal;
                  week.despachos = (week.despachos || 0) + 1;
                } else {
                  week.gasto_total = Math.max(0, (week.gasto_total || 0) - montoVal);
                  week.despachos = Math.max(0, (week.despachos || 0) - 1);
                }
              }
            };
            transferWeek(weeklyCirugia, true);
            transferWeek(weeklySinProv, false);
          }

          return {
            ...item,
            proveedor_id: LOGISTICA_CIRUGIA_ID,
            proveedor_nombre: 'LOGISTICA CIRUGIA'
          };
        }
        return item;
      });
    }

    // Recalcular métricas de promedios y cupos
    const recalculateRowMetrics = (row) => {
      if (!row) return;
      row.promedio_por_despacho = row.despachos_periodo > 0 ? row.gasto_total_periodo / row.despachos_periodo : 0;
      if (row.cupo_mensual) {
        row.disponible_diferencia = Number(row.cupo_mensual) - row.gasto_total_periodo;
        row.porcentaje_consumido = (row.gasto_total_periodo / Number(row.cupo_mensual)) * 100;
        row.estado = row.gasto_total_periodo > Number(row.cupo_mensual) ? 'Excedido' : 'OK';
      }
    };

    if (weeklyCirugia) recalculateRowMetrics(weeklyCirugia);
    if (rowCirugia) rowCirugia.promedio_por_despacho = rowCirugia.despachos_periodo > 0 ? rowCirugia.gasto_total / rowCirugia.despachos_periodo : 0;

    let weeklySinProv = (normalized.control_semanal_por_proveedor || []).find(r => r.proveedor_id === null || r.proveedor_id === undefined || r.proveedor_id === sinProveedorId.value);
    if (weeklySinProv) recalculateRowMetrics(weeklySinProv);

    let rowSinProv = (normalized.por_proveedor || []).find(r => r.proveedor_id === null || r.proveedor_id === undefined || r.proveedor_id === sinProveedorId.value);
    if (rowSinProv) rowSinProv.promedio_por_despacho = rowSinProv.despachos_periodo > 0 ? rowSinProv.gasto_total / rowSinProv.despachos_periodo : 0;

    // 2. FILTRAR POR PROVEEDOR (si hay filtro activo)
    const isSinProveedorFilter = filters.proveedorId && sinProveedorId.value === filters.proveedorId;
    const isLogisticaCirugiaFilter = filters.proveedorId && filters.proveedorId === LOGISTICA_CIRUGIA_ID;

    if (isSinProveedorFilter || isLogisticaCirugiaFilter) {
      const matchProvider = (pId) => {
        if (isSinProveedorFilter) {
          return pId === null || pId === undefined || pId === sinProveedorId.value;
        }
        return Number(pId) === LOGISTICA_CIRUGIA_ID;
      };

      const filteredDetalle = (normalized.detalle || []).filter(item => matchProvider(item.proveedor_id));
      const filteredPorProveedor = (normalized.por_proveedor || []).filter(item => matchProvider(item.proveedor_id));
      const filteredControlSemanal = (normalized.control_semanal_por_proveedor || []).filter(item => matchProvider(item.proveedor_id));

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
    }

    return normalized;
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
