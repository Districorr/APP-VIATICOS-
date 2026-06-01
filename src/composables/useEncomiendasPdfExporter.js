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

const nullableCurrency = (value) => (
  value === null || value === undefined ? '-' : formatCurrency(value)
);

const formatPercent = (value, decimals = 1) => (
  value === null || value === undefined ? '-' : `${numberValue(value).toFixed(decimals)}%`
);

const formatExportDateTime = () => {
  const date = new Date();
  return `${date.toLocaleDateString('es-AR')} ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs`;
};

const parseDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDate = (date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return copy.toISOString().split('T')[0];
};

const compactDate = (value) => formatDate(value, { day: '2-digit', month: '2-digit' });

const buildWeekColumns = (dashboard) => {
  const backendWeeks = dashboard?.semanas_catalogo || [];
  const periodo = dashboard?.periodo || {};
  const start = parseDateOnly(periodo.fecha_desde);
  const end = parseDateOnly(periodo.fecha_hasta);

  if (!start || !end || start > end) return backendWeeks;

  const weeks = [];
  let current = new Date(start);
  let index = 1;

  while (current <= end) {
    const weekEnd = new Date(current);
    const daysUntilSunday = weekEnd.getDay() === 0 ? 0 : 7 - weekEnd.getDay();
    weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);
    if (weekEnd > end) weekEnd.setTime(end.getTime());

    const backendWeek = backendWeeks.find((week) => Number(week.semana_numero) === index) || {};
    weeks.push({
      ...backendWeek,
      semana_numero: Number(backendWeek.semana_numero || index),
      semana_inicio: toIsoDate(current),
      semana_fin: toIsoDate(weekEnd),
    });

    current = new Date(weekEnd);
    current.setDate(current.getDate() + 1);
    index += 1;
  }

  return weeks;
};

const weekHeaderLabel = (week) => [
  `S${week.semana_numero}`,
  `${compactDate(week.semana_inicio)}-${compactDate(week.semana_fin)}`,
].join('\n');

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const normalizeStatus = (value, percentValue = null) => {
  const normalized = normalizeText(value).replace(/_/g, ' ');
  if (normalized.includes('sin proveedor')) return 'Sin proveedor';
  if (normalized.includes('sin cupo')) return 'Sin cupo';
  if (normalized.includes('exced')) return 'Excedido';
  if (normalized.includes('alert') || normalized.includes('alto')) return 'Consumo alto';
  if (percentValue !== null && percentValue !== undefined && numberValue(percentValue) >= 90) return 'Consumo alto';
  if (normalized.includes('ok') || normalized.includes('normal')) return 'Normal';
  return value ? String(value).replace(/_/g, ' ') : '-';
};

const statusStyles = (status) => {
  const normalized = normalizeText(status);
  if (normalized.includes('exced')) return { fillColor: [252, 232, 232], textColor: [127, 29, 29] };
  if (normalized.includes('sin cupo')) return { fillColor: [245, 241, 226], textColor: [92, 75, 24] };
  if (normalized.includes('alto')) return { fillColor: [255, 237, 213], textColor: [124, 45, 18] };
  if (normalized.includes('sin proveedor')) return { fillColor: [241, 245, 249], textColor: [71, 85, 105] };
  return { fillColor: [248, 250, 252], textColor: [30, 41, 59] };
};

const movementLabel = (value) => {
  const normalized = normalizeText(value);
  if (normalized.includes('env')) return 'Envíos';
  if (normalized.includes('recep')) return 'Recepciones';
  return value || 'Sin movimiento';
};

const classifyModalidad = (item) => {
  const origen = normalizeText(getValue(item, ['origen_gasto', 'modalidad_imputacion', 'modalidad'], '')).replace(/ /g, '_');
  const viajeId = getValue(item, ['viaje_id'], null);
  const cajaId = getValue(item, ['caja_id'], null);

  if (origen === 'cuenta_corriente_empresa') return 'cuenta_corriente_empresa';
  if (origen === 'rendicion' || viajeId !== null) return 'rendicion';
  if (origen === 'caja_chica' || cajaId !== null) return 'caja_chica';
  return 'sin_clasificar';
};

const buildImputacionSummary = (dashboard) => {
  const summary = {
    cuenta_corriente_empresa: { amount: 0, count: 0 },
    rendicion: { amount: 0, count: 0 },
    caja_chica: { amount: 0, count: 0 },
    sin_clasificar: { amount: 0, count: 0 },
  };

  for (const item of dashboard?.detalle || []) {
    const modalidadKey = classifyModalidad(item);
    const amount = numberValue(getValue(item, ['monto', 'monto_total', 'total'], 0));
    summary[modalidadKey].amount += amount;
    summary[modalidadKey].count += 1;
  }

  return summary;
};

const weekAmount = (item, week) => {
  const match = (item?.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
  return numberValue(match?.gasto_total);
};

const buildControlRows = (dashboard) => {
  const weeks = buildWeekColumns(dashboard);
  const rows = (dashboard?.control_semanal_por_proveedor || []).map((item) => {
    const percent = item.porcentaje_consumido;
    return [
      getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor'),
      ...weeks.map((week) => formatCurrency(weekAmount(item, week))),
      formatCurrency(item.gasto_total_periodo),
      numberValue(item.despachos_periodo).toLocaleString('es-AR'),
      nullableCurrency(item.cupo_mensual),
      nullableCurrency(item.disponible_diferencia),
      formatPercent(percent, 1),
      normalizeStatus(item.estado, percent),
    ];
  });

  const totals = dashboard?.control_semanal_totales;
  if (totals) {
    rows.push([
      'TOTAL',
      ...weeks.map((week) => {
        const match = (totals.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
        return formatCurrency(numberValue(match?.gasto_total));
      }),
      formatCurrency(totals.gasto_total_periodo),
      numberValue(totals.despachos_periodo).toLocaleString('es-AR'),
      nullableCurrency(totals.cupo_mensual_total),
      nullableCurrency(totals.disponible_diferencia_total),
      formatPercent(totals.porcentaje_consumido_total, 1),
      '-',
    ]);
  }

  return rows;
};

const summarizeOperations = (dashboard) => {
  const movements = {
    Envíos: { count: 0, amount: 0 },
    Recepciones: { count: 0, amount: 0 },
  };
  const providersMap = new Map();

  for (const item of dashboard?.detalle || []) {
    const amount = numberValue(getValue(item, ['monto', 'monto_total', 'total'], 0));
    const movement = movementLabel(getValue(item, ['tipo_movimiento', 'tipo_movimiento_encomienda']));
    const movementKey = movement === 'Recepciones' ? 'Recepciones' : 'Envíos';
    const provider = getValue(item, ['proveedor', 'proveedor_nombre', 'nombre_proveedor'], 'Sin proveedor');

    movements[movementKey].count += 1;
    movements[movementKey].amount += amount;

    const current = providersMap.get(provider) || { proveedor: provider, despachos: 0, total: 0 };
    current.despachos += 1;
    current.total += amount;
    providersMap.set(provider, current);
  }

  const providerRows = [...providersMap.values()]
    .sort((a, b) => b.total - a.total || b.despachos - a.despachos);

  return { movements, providerRows };
};

const drawSummaryBlock = (doc, { x, y, width, title, rows }) => {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(x, y, width, 30, 1.5, 1.5, 'FD');

  doc.setFontSize(7.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(title, x + 3, y + 5);

  let rowY = y + 11;
  rows.forEach((row, index) => {
    doc.setFontSize(index === 0 ? 9 : 7.2);
    doc.setFont(undefined, index === 0 ? 'bold' : 'normal');
    doc.setTextColor(index === 0 ? 15 : 51, index === 0 ? 23 : 65, index === 0 ? 42 : 85);
    doc.text(row.label, x + 3, rowY);
    doc.setFont(undefined, 'bold');
    doc.text(String(row.value), x + width - 3, rowY, { align: 'right' });
    rowY += index === 0 ? 7 : 6;
  });
};

const addFooter = (doc) => {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Gestión IQ / InfoGastos - Página ${page} de ${pageCount}`, pageWidth - 10, pageHeight - 5, { align: 'right' });
  }
};

export function useEncomiendasPdfExporter() {
  const exportDashboardPdf = (dashboard) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const periodo = dashboard?.periodo || {};
    const cupo = dashboard?.cupo || {};
    const kpis = dashboard?.kpis || {};
    const imputacionSummary = buildImputacionSummary(dashboard);
    const weeks = buildWeekColumns(dashboard);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 9;
    const contentWidth = pageWidth - (margin * 2);
    let y = 11;

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Control de Encomiendas y Costos Logísticos', margin, y);
    y += 6;

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Período: ${formatDate(periodo.fecha_desde)} al ${formatDate(periodo.fecha_hasta)}`, margin, y);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Exportado: ${formatExportDateTime()}`, pageWidth - margin, y, { align: 'right' });
    y += 7;

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Resumen del período', margin, y);
    y += 3;

    const gap = 3;
    const blockWidth = (contentWidth - (gap * 2)) / 3;
    const cupoDifference = cupo.disponible ?? cupo.disponible_diferencia;
    const differenceLabel = numberValue(cupoDifference) < 0 ? 'Excedido' : 'Disponible';
    drawSummaryBlock(doc, {
      x: margin,
      y,
      width: blockWidth,
      title: 'Gasto del período',
      rows: [
        { label: 'Gasto total', value: formatCurrency(kpis.gasto_total_periodo) },
        { label: 'Operaciones registradas', value: numberValue(kpis.cantidad_despachos || dashboard?.total_count).toLocaleString('es-AR') },
        { label: 'Promedio por operación', value: formatCurrency(kpis.gasto_promedio_despacho) },
      ],
    });
    drawSummaryBlock(doc, {
      x: margin + blockWidth + gap,
      y,
      width: blockWidth,
      title: 'Imputación del gasto',
      rows: [
        { label: 'Cuenta corriente empresa', value: `${formatCurrency(imputacionSummary.cuenta_corriente_empresa.amount)} | ${imputacionSummary.cuenta_corriente_empresa.count.toLocaleString('es-AR')} operaciones` },
        { label: 'Rendiciones', value: `${formatCurrency(imputacionSummary.rendicion.amount)} | ${imputacionSummary.rendicion.count.toLocaleString('es-AR')} operaciones` },
        { label: 'Caja chica', value: `${formatCurrency(imputacionSummary.caja_chica.amount)} | ${imputacionSummary.caja_chica.count.toLocaleString('es-AR')} operaciones` },
      ],
    });
    drawSummaryBlock(doc, {
      x: margin + (blockWidth + gap) * 2,
      y,
      width: blockWidth,
      title: 'Control del cupo',
      rows: [
        { label: 'Cupo mensual', value: nullableCurrency(cupo.cupo_mensual) },
        { label: `Monto consumido | ${differenceLabel}`, value: `${formatCurrency(cupo.consumido)} | ${nullableCurrency(cupoDifference)}` },
        { label: '% consumo del cupo', value: formatPercent(cupo.porcentaje_consumido, 1) },
      ],
    });
    y += 37;

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Control semanal por proveedor', margin, y);
    y += 3;

    const head = [[
      'Proveedor',
      ...weeks.map((week) => weekHeaderLabel(week)),
      'Total mes',
      'Despachos',
      'Cupo',
      'Disponible/Dif.',
      '% consumido',
      'Estado',
    ]];
    const baseFixedWidth = 38 + 24 + 18 + 24 + 28 + 19 + 22;
    const weekWidth = Math.max(15, Math.min(20, (contentWidth - baseFixedWidth) / Math.max(weeks.length, 1)));
    const columnStyles = {
      0: { cellWidth: 38, fontStyle: 'bold', halign: 'left' },
      [weeks.length + 1]: { cellWidth: 24, halign: 'right' },
      [weeks.length + 2]: { cellWidth: 18, halign: 'right' },
      [weeks.length + 3]: { cellWidth: 24, halign: 'right' },
      [weeks.length + 4]: { cellWidth: 28, halign: 'right' },
      [weeks.length + 5]: { cellWidth: 19, halign: 'center' },
      [weeks.length + 6]: { cellWidth: 22, halign: 'center' },
    };
    weeks.forEach((_, index) => {
      columnStyles[index + 1] = { cellWidth: weekWidth, halign: 'right' };
    });

    doc.autoTable({
      startY: y,
      head,
      body: buildControlRows(dashboard),
      theme: 'grid',
      margin: { left: margin, right: margin },
      showHead: 'firstPage',
      rowPageBreak: 'avoid',
      styles: {
        fontSize: 6.4,
        cellPadding: { top: 1.2, right: 1.4, bottom: 1.2, left: 1.4 },
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      didParseCell: (data) => {
        const isTotalRow = data.row.raw?.[0] === 'TOTAL';
        if (isTotalRow) {
          data.cell.styles.fillColor = [226, 232, 240];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [15, 23, 42];
        }
        if (data.section === 'body' && data.column.index === weeks.length + 6 && !isTotalRow) {
          Object.assign(data.cell.styles, statusStyles(data.cell.raw));
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = doc.lastAutoTable.finalY + 6;
    const { movements, providerRows } = summarizeOperations(dashboard);
    const totalOperations = movements.Envíos.count + movements.Recepciones.count;
    const totalAmount = movements.Envíos.amount + movements.Recepciones.amount;

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Resumen operativo del período', margin, y);
    y += 3;

    doc.autoTable({
      startY: y,
      head: [['Tipo de movimiento', 'Cantidad', 'Importe total']],
      body: [
        ['Envíos', movements.Envíos.count.toLocaleString('es-AR'), formatCurrency(movements.Envíos.amount)],
        ['Recepciones', movements.Recepciones.count.toLocaleString('es-AR'), formatCurrency(movements.Recepciones.amount)],
        ['Total general', totalOperations.toLocaleString('es-AR'), formatCurrency(totalAmount || kpis.gasto_total_periodo)],
      ],
      theme: 'grid',
      margin: { left: margin, right: pageWidth - margin - 92 },
      styles: { fontSize: 7, cellPadding: 1.4, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 2) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    const providersStartY = y;
    doc.autoTable({
      startY: providersStartY,
      head: [['Proveedor', 'Despachos', 'Importe total']],
      body: providerRows.map((item) => [
        item.proveedor,
        item.despachos.toLocaleString('es-AR'),
        formatCurrency(item.total),
      ]),
      theme: 'grid',
      margin: { left: margin + 98, right: margin },
      showHead: 'firstPage',
      rowPageBreak: 'avoid',
      styles: { fontSize: 7, cellPadding: 1.4, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', fontStyle: 'bold', cellWidth: 32 } },
    });

    y = Math.max(doc.lastAutoTable.finalY, y + 24) + 5;
    const topProviders = providerRows.slice(0, 3).map((item) => item.proveedor).join(', ') || 'sin proveedores destacados';
    const text = `Durante el período consultado se registraron ${totalOperations.toLocaleString('es-AR')} operaciones logísticas por un total de ${formatCurrency(totalAmount || kpis.gasto_total_periodo)}. Los proveedores con mayor volumen operativo fueron ${topProviders}.`;
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'FD');
    doc.setFontSize(7.4);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(doc.splitTextToSize(text, contentWidth - 6), margin + 3, y + 5);

    addFooter(doc);

    const today = new Date().toISOString().split('T')[0];
    doc.save(`encomiendas_costos_logisticos_${today}.pdf`);
  };

  return { exportDashboardPdf };
}
