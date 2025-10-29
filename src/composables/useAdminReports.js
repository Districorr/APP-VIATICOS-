// src/composables/useAdminReports.js

import { ref, reactive, computed, watch } from 'vue';
import { supabase } from '../supabaseClient.js';
import { formatDate } from '../utils/formatters.js';

// --- Helper Functions ---
const getPreviousDateRange = (dateRange) => {
  const diff = dateRange.to.getTime() - dateRange.from.getTime();
  const from = new Date(dateRange.from.getTime() - diff - 1);
  const to = new Date(dateRange.to.getTime() - diff - 1);
  return { from, to };
};

const groupDataByPeriod = (data, granularity) => {
  if (!data || data.length === 0) return [];
  
  const groups = data.reduce((acc, row) => {
    const date = new Date(row.fecha_gasto);
    let key;
    
    if (granularity === 'daily') {
      key = date.toISOString().split('T')[0];
    } else if (granularity === 'weekly') {
      const week = getISOWeek(date);
      const year = date.getFullYear();
      key = `${year}-W${String(week).padStart(2, '0')}`;
    } else { // monthly
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!acc[key]) {
      acc[key] = {
        periodo: key,
        cantidad_gastos: 0,
        monto_total: 0,
        gastos: []
      };
    }
    
    acc[key].cantidad_gastos += 1;
    acc[key].monto_total += row.gasto_monto_total || 0;
    acc[key].gastos.push(row);
    
    return acc;
  }, {});

  return Object.values(groups).map(g => ({
    ...g,
    ticket_promedio: g.cantidad_gastos > 0 ? g.monto_total / g.cantidad_gastos : 0
  })).sort((a, b) => a.periodo.localeCompare(b.periodo));
};

function getISOWeek(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

// La exportación debe estar aquí
export function useAdminReports(initialOptions = {}) {
  const loading = ref(false);
  const error = ref(null);
  const rawData = ref([]);
  const previousPeriodRawData = ref([]);

  const filters = reactive({
    dateRange: initialOptions.initialDateRange || {
      from: new Date(new Date().setDate(new Date().getDate() - 30)),
      to: new Date(),
    },
    granularity: initialOptions.initialGranularity || 'daily',
    ...initialOptions.initialFilters
  });

  const fetchData = async (range, appliedFilters) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('filtrar_gastos_admin', {
        p_fecha_desde: formatDate(range.from, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'),
        p_fecha_hasta: formatDate(range.to, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'),
        p_tipo_gasto_id: appliedFilters.tipo_gasto_id || null,
        p_user_id: appliedFilters.responsable_id || null,
        p_cliente_id: appliedFilters.cliente_id || null,
        p_provincia_id: appliedFilters.provincia_id || null,
        p_transporte_id: appliedFilters.transporte_id || null,
        p_limit: 10000, 
        p_offset: 0,
      });
      if (rpcError) throw rpcError;
      return data?.gastos || [];
    } catch (e) {
      console.error("Error fetching admin report data:", e);
      throw e;
    }
  };

  const executeReportGeneration = async () => {
    loading.value = true;
    error.value = null;
    try {
      const currentRange = filters.dateRange;
      const previousRange = getPreviousDateRange(currentRange);

      const [currentData, previousData] = await Promise.all([
        fetchData(currentRange, filters),
        fetchData(previousRange, filters)
      ]);
      
      rawData.value = currentData;
      previousPeriodRawData.value = previousData;

    } catch (e) {
      error.value = "No se pudieron cargar los datos del reporte. Intenta de nuevo.";
      rawData.value = [];
      previousPeriodRawData.value = [];
    } finally {
      loading.value = false;
    }
  };

  const kpis = computed(() => {
    const totalGasto = rawData.value.reduce((sum, item) => sum + item.gasto_monto_total, 0);
    const prevTotalGasto = previousPeriodRawData.value.reduce((sum, item) => sum + item.gasto_monto_total, 0);
    const variacion = prevTotalGasto > 0 ? ((totalGasto - prevTotalGasto) / prevTotalGasto) * 100 : (totalGasto > 0 ? 100 : 0);
    const topTipoGasto = calculateTop(rawData.value, 'nombre_tipo_gasto', totalGasto);
    const topCliente = calculateTop(rawData.value, 'nombre_cliente', totalGasto);
    const daysInPeriod = (filters.dateRange.to - filters.dateRange.from) / (1000 * 3600 * 24) + 1;
    const gastoPromedioDiario = totalGasto / (daysInPeriod > 0 ? daysInPeriod : 1);

    return {
      gastoTotal: totalGasto,
      gastoPromedioDiario,
      variacionVsPeriodoAnterior: prevTotalGasto > 0 ? variacion : null,
      topTipoGasto,
      topCliente,
    };
  });
  
  const calculateTop = (data, key, total) => {
    if (!data || data.length === 0) return { nombre: 'N/A', monto: 0, porcentaje: 0 };
    const aggregation = data.reduce((acc, item) => {
        const name = item[key] || 'No especificado';
        acc[name] = (acc[name] || 0) + item.gasto_monto_total;
        return acc;
    }, {});
    const top = Object.entries(aggregation).sort(([, a], [, b]) => b - a)[0];
    if (!top) return { nombre: 'N/A', monto: 0, porcentaje: 0 };
    return {
        nombre: top[0],
        monto: top[1],
        porcentaje: total > 0 ? (top[1] / total) * 100 : 0
    };
  };

  const tables = computed(() => {
    const totalGasto = kpis.value.gastoTotal;
    const totalesPorPeriodo = groupDataByPeriod(rawData.value, filters.granularity);
    const porTipoGasto = aggregateByKey(rawData.value, 'nombre_tipo_gasto', totalGasto, 'Tipo');
    const porResponsable = aggregateByKey(rawData.value, 'responsable_gasto_nombre', totalGasto, 'Responsable');
    const porCliente = aggregateByKey(rawData.value, 'nombre_cliente', totalGasto, 'Cliente');
    const porProvincia = aggregateByKey(rawData.value, 'provincia_nombre', totalGasto, 'Provincia');

    return {
      totalesPorPeriodo,
      porTipoGasto,
      porResponsable,
      porCliente,
      porProvincia,
    };
  });
  
  const aggregateByKey = (data, key, total, colName) => {
    const aggregation = data.reduce((acc, item) => {
        const name = item[key] || 'No especificado';
        if (!acc[name]) {
            acc[name] = { cantidad: 0, monto: 0 };
        }
        acc[name].cantidad += 1;
        acc[name].monto += item.gasto_monto_total;
        return acc;
    }, {});

    return Object.entries(aggregation).map(([name, values]) => ({
        [colName]: name,
        ...values,
        porcentaje: total > 0 ? (values.monto / total) * 100 : 0
    })).sort((a, b) => b.monto - a.monto);
  };
  
  const sendEmail = async ({ to, subject, note }) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-report', {
        body: { 
          to, 
          subject, 
          note,
          filters: { 
            p_fecha_desde: formatDate(filters.dateRange.from, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'),
            p_fecha_hasta: formatDate(filters.dateRange.to, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'),
            p_user_id: filters.responsable_id,
            p_cliente_id: filters.cliente_id,
          }
        },
      });
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Error al invocar la función de envío:", e);
      const errorMessage = e.context?.error_description || e.message || "Error desconocido del servidor.";
      throw new Error(errorMessage);
    }
  };
  
  const saveSchedule = async (config) => {
    console.log("Saving schedule config:", config);
    await new Promise(res => setTimeout(res, 1000));
    return { ...config, id: config.id || `sim_${Date.now()}` };
  };
  
  watch(filters, executeReportGeneration, { deep: true, immediate: true });
  
  return {
    loading,
    error,
    filters,
    rawData,
    kpis,
    tables,
    executeReportGeneration,
    sendEmail,
    saveSchedule,
  };
}