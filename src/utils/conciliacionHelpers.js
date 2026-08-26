/**
 * Motor y Lógica de Conciliación de Fletes
 */
import { normalizeProveedor } from './logisticaHelpers.js';

/**
 * Formatea un número como pesos argentinos: $ X.XXX,XX
 * @param {number} val 
 * @returns {string}
 */
export function formatCurrency(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Formatea un número como porcentaje: % X.X
 * @param {number} val 
 * @returns {string}
 */
export function formatPercent(val) {
  const num = Number(val) || 0;
  return `${num.toFixed(1)}%`;
}

/**
 * Recibe un array de guías/gastos de envíos y calcula:
 * - Totales generales (totalCost, totalBultos, totalGuias)
 * - Desglose por Cliente / Obra Social (byCliente)
 * - Desglose por Médico Cirujano (byMedico)
 * - Desglose por Empresa de Transporte (byTransporte)
 * Ordena automáticamente los resultados de mayor a menor costo.
 * 
 * @param {Array} guias 
 * @returns {Object} { totalCost, totalBultos, totalGuias, byCliente, byMedico, byTransporte, transporteLider }
 */
export function calculateConciliacionSummary(guias = []) {
  let totalCost = 0;
  let totalBultos = 0;
  let totalGuias = guias.length;

  const clienteMap = {};
  const medicoMap = {};
  const transporteMap = {};

  guias.forEach(g => {
    const cost = Number(g.monto_total) || Number(g.costo) || Number(g.monto) || 0;
    const extra = g.datos_adicionales || {};
    
    // Obtención de bultos
    const bultosVal = extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== ''
      ? Number(extra.cantidad_bultos) || 0
      : (Number(g.bultos) || 0);

    totalCost += cost;
    totalBultos += bultosVal;

    // Cliente / Obra Social
    const clienteNombre = (
      g.clientes?.nombre_cliente || 
      g.cliente_nombre || 
      g.cliente || 
      extra.obra_social || 
      extra.cliente || 
      (g.paciente_referido ? `Pte: ${g.paciente_referido}` : 'Consumo Interno / Sin Cliente')
    ).trim();
    if (!clienteMap[clienteNombre]) {
      clienteMap[clienteNombre] = { nombre: clienteNombre, totalCost: 0, totalBultos: 0, totalGuias: 0 };
    }
    clienteMap[clienteNombre].totalCost += cost;
    clienteMap[clienteNombre].totalBultos += bultosVal;
    clienteMap[clienteNombre].totalGuias += 1;

    // Médico Cirujano / Referente / Paciente
    const medicoNombre = (
      g.paciente_referido || 
      extra.medico_cirujano || 
      extra.medico || 
      extra.referente || 
      g.medico || 
      'General / Sin Referente'
    ).trim();
    if (!medicoMap[medicoNombre]) {
      medicoMap[medicoNombre] = { nombre: medicoNombre, totalCost: 0, totalBultos: 0, totalGuias: 0 };
    }
    medicoMap[medicoNombre].totalCost += cost;
    medicoMap[medicoNombre].totalBultos += bultosVal;
    medicoMap[medicoNombre].totalGuias += 1;

    // Transporte / Courier
    const rawTransporte = (
      g.transportes?.nombre || 
      g.transporte_nombre || 
      g.transporte || 
      g.proveedores?.nombre || 
      g.proveedor?.nombre || 
      'LOGISTICA CIRUGIA'
    );
    const transporteNorm = normalizeProveedor(rawTransporte);
    if (!transporteMap[transporteNorm]) {
      transporteMap[transporteNorm] = { nombre: transporteNorm, totalCost: 0, totalBultos: 0, totalGuias: 0 };
    }
    transporteMap[transporteNorm].totalCost += cost;
    transporteMap[transporteNorm].totalBultos += bultosVal;
    transporteMap[transporteNorm].totalGuias += 1;
  });

  // Calcular porcentajes relativos y ordenar de mayor a menor costo
  const processBreakdown = (map) => {
    return Object.values(map)
      .map(item => ({
        ...item,
        porcentaje: totalCost > 0 ? (item.totalCost / totalCost) * 100 : 0
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
  };

  const byCliente = processBreakdown(clienteMap);
  const byMedico = processBreakdown(medicoMap);
  const byTransporte = processBreakdown(transporteMap);

  const transporteLider = byTransporte.length > 0 ? byTransporte[0].nombre : 'N/A';

  return {
    totalCost,
    totalBultos,
    totalGuias,
    byCliente,
    byMedico,
    byTransporte,
    transporteLider
  };
}
