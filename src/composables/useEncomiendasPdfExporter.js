import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from '../utils/formatters';

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

const filterLabel = (filters = {}, labels = {}) => ([
  ['Fecha desde', formatDate(filters.fechaDesde)],
  ['Fecha hasta', formatDate(filters.fechaHasta)],
  ['Semana', labels.semana || 'Todas'],
  ['Proveedor', labels.proveedor || 'Todos'],
  ['Operador logístico', labels.transporte || 'Todos'],
  ['Movimiento', labels.tipoMovimiento || 'Todos'],
  ['Modalidad', labels.modalidad || 'Todas'],
  ['Responsable', labels.responsable || 'Todos'],
  ['Búsqueda', filters.paciente || 'Sin texto'],
]);

const controlRows = (dashboard) => {
  const weeks = dashboard?.semanas_catalogo || [];
  const body = (dashboard?.control_semanal_por_proveedor || []).map((item) => [
    getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor'),
    weeks.map((week) => {
      const match = (item.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
      return `S${week.semana_numero}: ${formatCurrency(numberValue(match?.gasto_total))}`;
    }).join('\n'),
    formatCurrency(item.gasto_total_periodo),
    numberValue(item.despachos_periodo).toLocaleString('es-AR'),
    item.cupo_mensual === null || item.cupo_mensual === undefined ? '—' : formatCurrency(item.cupo_mensual),
    item.disponible_diferencia === null || item.disponible_diferencia === undefined ? '—' : formatCurrency(item.disponible_diferencia),
    item.porcentaje_consumido === null || item.porcentaje_consumido === undefined ? '—' : `${numberValue(item.porcentaje_consumido).toFixed(2)}%`,
    item.estado || '—',
  ]);
  const totals = dashboard?.control_semanal_totales;
  if (totals) {
    body.push([
      'TOTAL',
      weeks.map((week) => {
        const match = (totals.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
        return `S${week.semana_numero}: ${formatCurrency(numberValue(match?.gasto_total))}`;
      }).join('\n'),
      formatCurrency(totals.gasto_total_periodo),
      numberValue(totals.despachos_periodo).toLocaleString('es-AR'),
      totals.cupo_mensual_total === null || totals.cupo_mensual_total === undefined ? '—' : formatCurrency(totals.cupo_mensual_total),
      totals.disponible_diferencia_total === null || totals.disponible_diferencia_total === undefined ? '—' : formatCurrency(totals.disponible_diferencia_total),
      totals.porcentaje_consumido_total === null || totals.porcentaje_consumido_total === undefined ? '—' : `${numberValue(totals.porcentaje_consumido_total).toFixed(2)}%`,
      '—',
    ]);
  }
  return body;
};

export function useEncomiendasPdfExporter() {
  const exportDashboardPdf = (dashboard, context = {}) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const periodo = dashboard?.periodo || {};
    const cupo = dashboard?.cupo || {};
    const kpis = dashboard?.kpis || {};
    const margin = 12;
    let y = 14;

    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('Control de Encomiendas y Costos Logísticos', margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Período consultado: ${formatDate(periodo.fecha_desde)} - ${formatDate(periodo.fecha_hasta)}`, margin, y);
    doc.text(`Exportado: ${formatDate(new Date().toISOString())}`, 235, y);
    y += 5;

    doc.autoTable({
      startY: y,
      head: [['Filtro', 'Valor', 'Filtro', 'Valor', 'Filtro', 'Valor']],
      body: [
        filterLabel(context.filters, context.labels).slice(0, 3).flat(),
        filterLabel(context.filters, context.labels).slice(3, 6).flat(),
        filterLabel(context.filters, context.labels).slice(6, 9).flat(),
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    });
    y = doc.lastAutoTable.finalY + 6;

    doc.autoTable({
      startY: y,
      head: [['KPI', 'Valor', 'KPI', 'Valor', 'KPI', 'Valor']],
      body: [
        ['Gasto del período', formatCurrency(kpis.gasto_total_periodo), 'Despachos', numberValue(kpis.cantidad_despachos).toLocaleString('es-AR'), 'Promedio', formatCurrency(kpis.gasto_promedio_despacho)],
        ['Cuenta corriente empresa', formatCurrency(kpis.total_cuenta_corriente), 'Rendición', formatCurrency(kpis.total_rendicion), 'Caja chica', formatCurrency(kpis.total_caja_chica)],
        ['Cupo mensual', formatCurrency(cupo.cupo_mensual), 'Consumido', formatCurrency(cupo.consumido), '% consumido', `${numberValue(cupo.porcentaje_consumido).toFixed(1)}%`],
      ],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Control semanal por proveedor', margin, y);
    y += 3;

    doc.autoTable({
      startY: y,
      head: [['Proveedor', 'Semanas', 'Total mes', 'Despachos', 'Cupo', 'Disponible / Diferencia', '% consumido', 'Estado']],
      body: controlRows(dashboard),
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: { 1: { cellWidth: 58 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });

    y = doc.lastAutoTable.finalY + 7;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(`Total filtrado: ${formatCurrency(kpis.gasto_total_periodo)} | Operaciones filtradas: ${numberValue(dashboard?.total_count).toLocaleString('es-AR')}`, margin, y);

    const today = new Date().toISOString().split('T')[0];
    doc.save(`encomiendas_costos_logisticos_${today}.pdf`);
  };

  return { exportDashboardPdf };
}
