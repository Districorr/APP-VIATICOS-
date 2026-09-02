import { ref, computed } from 'vue';
import { getProveedorLabel, isLogisticaCirugia } from '../utils/logisticaHelpers.js';

/**
 * Composable para calcular y analizar Costos Logísticos por Destino Geográfico en 3 Niveles.
 */
export function useCostosPorDestino() {
  const selectedLocalidadId = ref(null);
  const selectedProvinciaId = ref(null);
  const selectedPeriodo = ref('historico'); // 'mes', '3m', '6m', 'historico'
  const customMonth = ref(''); // YYYY-MM opcional cuando selectedPeriodo === 'mes'

  /**
   * Helper para obtener cantidad de bultos
   */
  const getBultos = (item) => {
    const extra = item?.datos_adicionales || {};
    const cant = extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '' 
      ? Number(extra.cantidad_bultos) 
      : 1;
    return Number.isFinite(cant) && cant > 0 ? cant : 1;
  };

  /**
   * Filtra la lista de gastos por período de fecha
   */
  const filterGastosPorFecha = (gastosList = []) => {
    const now = new Date();
    let minDate = null;

    if (selectedPeriodo.value === 'mes' && customMonth.value) {
      const [year, month] = customMonth.value.split('-').map(Number);
      const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(year, month, 0).getDate();
      const end = new Date(year, month - 1, lastDay).toISOString().split('T')[0];
      
      return gastosList.filter(item => {
        const fecha = item.fecha_gasto ? String(item.fecha_gasto).slice(0, 10) : '';
        return fecha >= start && fecha <= end;
      });
    } else if (selectedPeriodo.value === '3m') {
      const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      minDate = d.toISOString().split('T')[0];
    } else if (selectedPeriodo.value === '6m') {
      const d = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      minDate = d.toISOString().split('T')[0];
    }

    if (!minDate) return gastosList;

    return gastosList.filter(item => {
      const fecha = item.fecha_gasto ? String(item.fecha_gasto).slice(0, 10) : '';
      return fecha >= minDate;
    });
  };

  /**
   * Niveles de navegación:
   * - 'provincia': Nivel 1 (Sin selección o 'todos' -> Consolidado por Provincia)
   * - 'localidad': Nivel 2 (Provincia seleccionada -> Desglose por Localidades)
   * - 'detalle': Nivel 3 (Localidad seleccionada -> Detalle Operativo + KPIs + Transportes)
   */
  const currentNivel = computed(() => {
    if (selectedLocalidadId.value && selectedLocalidadId.value !== 'todos') {
      return 'detalle';
    }
    if (selectedProvinciaId.value && selectedProvinciaId.value !== 'todos') {
      return 'localidad';
    }
    return 'provincia';
  });

  /**
   * Auditoría Runtime de Calidad de Datos Geográficos Persistidos
   * Clasifica los gastos en 4 Estados Estrictos Reconciliables:
   * 1. Destino completo y válido: provincia_id + localidad_destino_id y coincide localidad.provincia_id === provincia_id.
   * 2. Solo provincia: provincia_id informada + localidad_destino_id = NULL.
   * 3. Destino inconsistente: provincia_id y localidad_destino_id informados pero localidad.provincia_id !== provincia_id.
   * 4. Sin destino: provincia_id = NULL y localidad_destino_id = NULL.
   */
  const calcularAuditoriaDatos = (gastosList = [], provinciasMap = new Map(), localidadesMap = new Map()) => {
    let totalItems = gastosList.length;
    let conDestinoCompleto = 0;
    let soloProvincia = 0;
    let destinoInconsistente = 0;
    let sinDestino = 0;

    const opsInconsistentesList = [];
    const opsSinDestinoList = [];
    const opsSoloProvinciaList = [];

    gastosList.forEach(g => {
      const provId = g.provincia_id || g.provincia_destino_id;
      const locId = g.localidad_destino_id || g.localidad_destino?.id;

      const hasProv = Boolean(provId);
      const hasLoc = Boolean(locId);

      const extra = g.datos_adicionales || {};
      const transpNombre = g.transporte?.nombre || g.transporte_nombre || '—';
      const provLabel = getProveedorLabel(g);

      if (!hasProv && !hasLoc) {
        sinDestino++;
        opsSinDestinoList.push({
          ...g,
          id: g.id,
          fecha_gasto: g.fecha_gasto,
          transporte_nombre: transpNombre,
          proveedor_label: provLabel,
          descripcion: g.descripcion_general || extra.comentarios || 'Sin descripción',
          monto_total: g.monto_total,
          numero_factura: g.numero_factura || extra.numero_guia || '—',
          destino_texto: extra.destino_texto || extra.localidad_destino_texto || '—'
        });
      } else if (hasProv && !hasLoc) {
        soloProvincia++;
        const provNombre = provinciasMap.get(Number(provId))?.nombre || g.provincia?.nombre || `ID ${provId}`;
        opsSoloProvinciaList.push({
          ...g,
          id: g.id,
          fecha_gasto: g.fecha_gasto,
          transporte_nombre: transpNombre,
          proveedor_label: provLabel,
          provincia_nombre: provNombre,
          monto_total: g.monto_total,
          numero_factura: g.numero_factura || extra.numero_guia || '—'
        });
      } else if (hasProv && hasLoc) {
        const locObj = localidadesMap.get(Number(locId)) || localidadesMap.get(String(locId));
        const locProvId = locObj ? locObj.provincia_id : null;
        const isMatch = locObj && String(locProvId) === String(provId);

        if (isMatch) {
          conDestinoCompleto++;
        } else {
          destinoInconsistente++;
          const provRegNombre = provinciasMap.get(Number(provId))?.nombre || g.provincia?.nombre || `ID ${provId}`;
          const locRegNombre = locObj?.nombre || g.localidad_destino?.nombre || `Localidad ID ${locId}`;
          const provRealNombre = locProvId ? (provinciasMap.get(Number(locProvId))?.nombre || `Provincia ID ${locProvId}`) : 'Desconocida';

          opsInconsistentesList.push({
            ...g,
            id: g.id,
            fecha_gasto: g.fecha_gasto,
            transporte_nombre: transpNombre,
            proveedor_label: provLabel,
            monto_total: g.monto_total,
            numero_factura: g.numero_factura || extra.numero_guia || '—',
            provincia_registrada_id: provId,
            provincia_registrada_nombre: provRegNombre,
            localidad_registrada_id: locId,
            localidad_registrada_nombre: locRegNombre,
            provincia_real_localidad_id: locProvId,
            provincia_real_localidad_nombre: provRealNombre,
            estado: 'Requiere revisión'
          });
        }
      } else {
        // !hasProv && hasLoc (Localidad informada pero provincia_id NULL) -> Destino Inconsistente
        destinoInconsistente++;
        const locObj = localidadesMap.get(Number(locId)) || localidadesMap.get(String(locId));
        const locProvId = locObj ? locObj.provincia_id : null;
        const locRegNombre = locObj?.nombre || g.localidad_destino?.nombre || `Localidad ID ${locId}`;
        const provRealNombre = locProvId ? (provinciasMap.get(Number(locProvId))?.nombre || `Provincia ID ${locProvId}`) : 'Desconocida';

        opsInconsistentesList.push({
          ...g,
          id: g.id,
          fecha_gasto: g.fecha_gasto,
          transporte_nombre: transpNombre,
          proveedor_label: provLabel,
          monto_total: g.monto_total,
          numero_factura: g.numero_factura || extra.numero_guia || '—',
          provincia_registrada_id: null,
          provincia_registrada_nombre: 'Sin Provincia (NULL)',
          localidad_registrada_id: locId,
          localidad_registrada_nombre: locRegNombre,
          provincia_real_localidad_id: locProvId,
          provincia_real_localidad_nombre: provRealNombre,
          estado: 'Requiere revisión'
        });
      }
    });

    return {
      totalItems,
      conDestinoCompleto,
      soloProvincia,
      destinoInconsistente,
      sinDestino,
      pctCompleto: totalItems > 0 ? ((conDestinoCompleto / totalItems) * 100).toFixed(1) : '0',
      opsSinDestinoList,
      opsSoloProvinciaList,
      opsInconsistentesList
    };
  };

  /**
   * NIVEL 1: Consolidado General por Provincia (Excluye cruces geográficos inconsistentes)
   */
  const calcularConsolidadoProvincias = (gastosList = [], provinciasMap = new Map(), localidadesMap = new Map()) => {
    const provsData = {};
    let totalGastadoGeneral = 0;
    let totalEnviosGeneral = 0;
    let totalBultosGeneral = 0;

    gastosList.forEach(item => {
      const provId = item.provincia_id || item.provincia_destino_id;
      if (!provId) return;

      const provNombre = (provinciasMap.get(Number(provId))?.nombre || item.provincia?.nombre || `Provincia ID ${provId}`).trim();
      const monto = Number(item.monto_total || 0);
      const bultos = getBultos(item);

      if (!provsData[provId]) {
        provsData[provId] = {
          provincia_id: provId,
          provincia_nombre: provNombre,
          envios: 0,
          bultos: 0,
          total: 0,
          promedioEnvio: 0,
          promedioBulto: 0
        };
      }

      provsData[provId].envios += 1;
      provsData[provId].bultos += bultos;
      provsData[provId].total += monto;

      totalGastadoGeneral += monto;
      totalEnviosGeneral += 1;
      totalBultosGeneral += bultos;
    });

    const lista = Object.values(provsData).map(p => ({
      ...p,
      promedioEnvio: p.envios > 0 ? p.total / p.envios : 0,
      promedioBulto: p.bultos > 0 ? p.total / p.bultos : 0
    })).sort((a, b) => b.total - a.total);

    return {
      provincias: lista,
      totalGastadoGeneral,
      totalEnviosGeneral,
      totalBultosGeneral,
      promedioEnvioGeneral: totalEnviosGeneral > 0 ? totalGastadoGeneral / totalEnviosGeneral : 0,
      promedioBultoGeneral: totalBultosGeneral > 0 ? totalGastadoGeneral / totalBultosGeneral : 0
    };
  };

  /**
   * NIVEL 2: Desglose por Localidad dentro de una Provincia Seleccionada
   */
  /**
   * NIVEL 2: Desglose por Localidad dentro de una Provincia Seleccionada
   */
  const calcularConsolidadoLocalidades = (gastosList = [], provinciaId, localidadesMap = new Map()) => {
    if (!provinciaId) return { localidades: [], totalGastado: 0, totalEnvios: 0, totalBultos: 0, resumenTransportes: [], resumenProveedores: [], resumenClientes: [] };

    const locsData = {};
    const transportesData = {};
    const proveedoresData = {};
    const clientesData = {};

    let totalGastado = 0;
    let totalEnvios = 0;
    let totalBultos = 0;

    const getProveedorOnlyLabel = (item) => {
      if (isLogisticaCirugia(item)) return 'Operación Propia (Cirugía)';
      return (item.proveedores?.nombre || item.proveedor?.nombre || 'Sin Proveedor').trim();
    };

    const getClienteOnlyLabel = (item) => {
      const extra = item.datos_adicionales || {};
      const name = (
        item.clientes?.nombre_cliente ||
        item.cliente_nombre ||
        item.cliente ||
        extra.obra_social ||
        extra.cliente ||
        (item.paciente_referido ? `Pte: ${item.paciente_referido}` : null)
      );
      return name ? name.trim() : 'Consumo Interno / Sin Cliente';
    };

    const registrarPredominantes = (targetObj, sentido, tipoMov) => {
      if (!targetObj.sentidosMap) targetObj.sentidosMap = {};
      if (!targetObj.tiposMap) targetObj.tiposMap = {};
      targetObj.sentidosMap[sentido] = (targetObj.sentidosMap[sentido] || 0) + 1;
      targetObj.tiposMap[tipoMov] = (targetObj.tiposMap[tipoMov] || 0) + 1;
    };

    const getPredominante = (mapObj) => {
      let topKey = '—';
      let maxC = 0;
      for (const [k, c] of Object.entries(mapObj || {})) {
        if (c > maxC) {
          maxC = c;
          topKey = k;
        }
      }
      return topKey;
    };

    gastosList.forEach(item => {
      const provId = item.provincia_id || item.provincia_destino_id;
      if (String(provId) !== String(provinciaId)) return;

      const monto = Number(item.monto_total || 0);
      const bultos = getBultos(item);
      const transpNombre = (item.transporte?.nombre || item.transporte_nombre || 'Sin Transporte').trim();

      const extra = item.datos_adicionales || {};
      const sentidoRaw = (extra.sentido_movimiento || 'ida').toLowerCase();
      const sentido = sentidoRaw === 'vuelta' ? 'Vuelta' : sentidoRaw === 'interno' ? 'Interno' : 'Ida';
      const tipoMov = (extra.tipo_movimiento_encomienda || (isLogisticaCirugia(item) ? 'Logística de Cirugía' : 'Envío General')).trim();

      // 1. Agrupador Transporte
      if (!transportesData[transpNombre]) {
        transportesData[transpNombre] = {
          transporte_nombre: transpNombre,
          envios: 0,
          bultos: 0,
          total: 0,
          sentidosMap: {},
          tiposMap: {}
        };
      }
      transportesData[transpNombre].envios += 1;
      transportesData[transpNombre].bultos += bultos;
      transportesData[transpNombre].total += monto;
      registrarPredominantes(transportesData[transpNombre], sentido, tipoMov);

      // 2. Agrupador Proveedor Externo (únicamente proveedores externos reales)
      const provNombre = (item.proveedores?.nombre || item.proveedor?.nombre || '').trim();
      const provUpper = provNombre.toUpperCase();
      const isProveedorExternoReal = !isLogisticaCirugia(item) && provNombre && provUpper !== 'SIN PROVEEDOR' && !provUpper.includes('DISTRICORR') && !provUpper.includes('LOGISTICA CIRUGIA');

      if (isProveedorExternoReal) {
        if (!proveedoresData[provNombre]) {
          proveedoresData[provNombre] = {
            proveedor_nombre: provNombre,
            envios: 0,
            bultos: 0,
            total: 0,
            sentidosMap: {},
            tiposMap: {}
          };
        }
        proveedoresData[provNombre].envios += 1;
        proveedoresData[provNombre].bultos += bultos;
        proveedoresData[provNombre].total += monto;
        registrarPredominantes(proveedoresData[provNombre], sentido, tipoMov);
      }

      // 3. Agrupador Cliente / Obra Social (únicamente clientes / coberturas reales)
      const rawCli = (
        item.clientes?.nombre_cliente ||
        item.cliente_nombre ||
        item.cliente ||
        extra.obra_social ||
        extra.cliente ||
        (item.paciente_referido ? `Pte: ${item.paciente_referido}` : null)
      );
      const cliNombre = rawCli ? rawCli.trim() : null;
      const isClienteReal = cliNombre && !cliNombre.toLowerCase().includes('sin cliente') && !cliNombre.toLowerCase().includes('consumo interno');

      if (isClienteReal) {
        if (!clientesData[cliNombre]) {
          clientesData[cliNombre] = {
            cliente_nombre: cliNombre,
            envios: 0,
            bultos: 0,
            total: 0,
            sentidosMap: {},
            tiposMap: {}
          };
        }
        clientesData[cliNombre].envios += 1;
        clientesData[cliNombre].bultos += bultos;
        clientesData[cliNombre].total += monto;
        registrarPredominantes(clientesData[cliNombre], sentido, tipoMov);
      }

      // 4. Agrupador Localidad
      const locId = item.localidad_destino_id || item.localidad_destino?.id;
      const key = locId ? String(locId) : 'sin_localidad';
      const locObj = locId ? (localidadesMap.get(Number(locId)) || localidadesMap.get(String(locId))) : null;
      const locProvId = locObj ? locObj.provincia_id : null;
      const isInconsistent = locId ? (!locObj || String(locProvId) !== String(provinciaId)) : false;
      const locNombre = locId ? (locObj ? locObj.nombre.trim() : (item.localidad_destino?.nombre || `Localidad ID ${locId}`)) : 'Localidad sin identificar';

      if (!locsData[key]) {
        locsData[key] = {
          localidad_id: key,
          localidad_nombre: locNombre,
          is_unidentified: !locId,
          isInconsistent: isInconsistent,
          envios: 0,
          bultos: 0,
          total: 0,
          sentidosMap: {},
          tiposMap: {}
        };
      }

      locsData[key].envios += 1;
      locsData[key].bultos += bultos;
      locsData[key].total += monto;
      registrarPredominantes(locsData[key], sentido, tipoMov);

      totalGastado += monto;
      totalEnvios += 1;
      totalBultos += bultos;
    });

    const lista = Object.values(locsData).map(l => ({
      ...l,
      promedioEnvio: l.envios > 0 ? l.total / l.envios : 0,
      promedioBulto: l.bultos > 0 ? l.total / l.bultos : 0,
      sentidoPredominante: getPredominante(l.sentidosMap),
      tipoPredominante: getPredominante(l.tiposMap)
    })).sort((a, b) => {
      if (a.is_unidentified) return 1;
      if (b.is_unidentified) return -1;
      return b.total - a.total;
    });

    const resumenTransportes = Object.values(transportesData).map(t => ({
      ...t,
      promedioEnvio: t.envios > 0 ? t.total / t.envios : 0,
      promedioBulto: t.bultos > 0 ? t.total / t.bultos : 0,
      sentidoPredominante: getPredominante(t.sentidosMap),
      tipoPredominante: getPredominante(t.tiposMap)
    })).sort((a, b) => b.total - a.total);

    const resumenProveedores = Object.values(proveedoresData).map(p => ({
      ...p,
      promedioEnvio: p.envios > 0 ? p.total / p.envios : 0,
      promedioBulto: p.bultos > 0 ? p.total / p.bultos : 0,
      sentidoPredominante: getPredominante(p.sentidosMap),
      tipoPredominante: getPredominante(p.tiposMap)
    })).sort((a, b) => b.total - a.total);

    const resumenClientes = Object.values(clientesData).map(c => ({
      ...c,
      promedioEnvio: c.envios > 0 ? c.total / c.envios : 0,
      promedioBulto: c.bultos > 0 ? c.total / c.bultos : 0,
      sentidoPredominante: getPredominante(c.sentidosMap),
      tipoPredominante: getPredominante(c.tiposMap)
    })).sort((a, b) => b.total - a.total);

    return {
      localidades: lista,
      totalGastado,
      totalEnvios,
      totalBultos,
      promedioEnvio: totalEnvios > 0 ? totalGastado / totalEnvios : 0,
      promedioBulto: totalBultos > 0 ? totalGastado / totalBultos : 0,
      resumenTransportes,
      resumenProveedores,
      resumenClientes
    };
  };

  /**
   * NIVEL 3: Estadísticas Detalladas de una Localidad Específica
   */
  const calcularEstadisticasDestino = (filteredItems = []) => {
    if (!filteredItems || filteredItems.length === 0) {
      return {
        cantEnvios: 0,
        cantBultos: 0,
        montoTotal: 0,
        costoPromedioEnvio: 0,
        costoPromedioBulto: 0,
        costoMinimo: 0,
        costoMaximo: 0,
        transporteConsolidado: [],
        detalleOps: []
      };
    }

    let cantEnvios = filteredItems.length;
    let cantBultos = 0;
    let montoTotal = 0;
    let costoMinimo = Infinity;
    let costoMaximo = -Infinity;
    let cantOpsSinTransporte = 0;

    const transportesMap = {};

    const detalleOps = filteredItems.map(item => {
      const monto = Number(item.monto_total || 0);
      const bultos = getBultos(item);
      const hasValidTransporte = Boolean(item.transporte_id || item.transporte?.id);
      const transpNombre = hasValidTransporte
        ? (item.transporte?.nombre || item.transporte_nombre || 'Transporte')
        : '—';
      const provLabel = getProveedorLabel(item);

      cantBultos += bultos;
      montoTotal += monto;
      if (monto < costoMinimo) costoMinimo = monto;
      if (monto > costoMaximo) costoMaximo = monto;

      // Comparativa por transporte: solo incluye movimientos con transporte_id real (NO grupo "Sin Transporte")
      if (hasValidTransporte) {
        if (!transportesMap[transpNombre]) {
          transportesMap[transpNombre] = {
            transporteNombre: transpNombre,
            envios: 0,
            bultos: 0,
            total: 0,
            promedioEnvio: 0,
            promedioBulto: 0
          };
        }
        transportesMap[transpNombre].envios += 1;
        transportesMap[transpNombre].bultos += bultos;
        transportesMap[transpNombre].total += monto;
      } else {
        cantOpsSinTransporte += 1;
      }

      return {
        id: item.id,
        fecha_gasto: item.fecha_gasto,
        transporte_nombre: transpNombre,
        proveedor_label: provLabel,
        is_cirugia: isLogisticaCirugia(item),
        tipo_movimiento: item.datos_adicionales?.tipo_movimiento_encomienda || 'Envío',
        bultos: bultos,
        monto_total: monto,
        numero_factura: item.numero_factura || item.datos_adicionales?.numero_guia || null,
        cliente_nombre: item.clientes?.nombre_cliente || item.cliente_nombre || null,
        paciente_referido: item.paciente_referido || null
      };
    });

    const transporteConsolidado = Object.values(transportesMap).map(t => {
      return {
        ...t,
        promedioEnvio: t.envios > 0 ? t.total / t.envios : 0,
        promedioBulto: t.bultos > 0 ? t.total / t.bultos : 0
      };
    }).sort((a, b) => b.total - a.total);

    return {
      cantEnvios,
      cantBultos,
      montoTotal,
      costoPromedioEnvio: cantEnvios > 0 ? montoTotal / cantEnvios : 0,
      costoPromedioBulto: cantBultos > 0 ? montoTotal / cantBultos : 0,
      costoMinimo: costoMinimo === Infinity ? 0 : costoMinimo,
      costoMaximo: costoMaximo === -Infinity ? 0 : costoMaximo,
      cantOpsSinTransporte,
      transporteConsolidado,
      detalleOps
    };
  };

  /**
   * Filtro general de items por destino
   */
  const matchesDestino = (item) => {
    if (!item) return false;

    const locId = selectedLocalidadId.value;
    const provId = selectedProvinciaId.value;

    const hasLocIdFilter = locId && locId !== 'todos';
    const hasProvIdFilter = provId && provId !== 'todos';

    if (hasLocIdFilter) {
      const itemLocId = item.localidad_destino_id || item.localidad_destino?.id;
      const itemProvId = item.provincia_id || item.provincia_destino_id;

      if (String(locId) === 'sin_localidad') {
        return (!itemLocId || itemLocId === 'sin_localidad') && (!hasProvIdFilter || String(itemProvId) === String(provId));
      }

      const locMatches = String(itemLocId) === String(locId);
      const provMatches = !hasProvIdFilter || String(itemProvId) === String(provId);
      return locMatches && provMatches;
    }

    if (hasProvIdFilter) {
      const itemProvId = item.provincia_id || item.provincia_destino_id;
      return String(itemProvId) === String(provId);
    }

    return true;
  };

  return {
    selectedLocalidadId,
    selectedProvinciaId,
    selectedPeriodo,
    customMonth,
    currentNivel,
    filterGastosPorFecha,
    calcularAuditoriaDatos,
    calcularConsolidadoProvincias,
    calcularConsolidadoLocalidades,
    calcularEstadisticasDestino,
    matchesDestino
  };
}
