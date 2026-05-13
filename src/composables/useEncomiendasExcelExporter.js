import * as XLSX from 'xlsx';
import { formatDate } from '../utils/formatters';

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

const getModalidadValue = (item) => getValue(item, ['modalidad_imputacion', 'modalidad']);

const modalidadLabel = (value) => {
  const labels = {
    cuenta_corriente_empresa: 'Cuenta corriente empresa',
    rendicion: 'Rendición',
    caja_chica: 'Caja chica',
    otro: 'Otro',
  };
  return labels[value] || value || 'Sin modalidad';
};

const titleStyle = { font: { bold: true, sz: 16, color: { rgb: '1E293B' } }, fill: { fgColor: { rgb: 'E2E8F0' } } };
const sectionStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '334155' } } };
const headerStyle = { font: { bold: true, color: { rgb: '1E293B' } }, fill: { fgColor: { rgb: 'CBD5E1' } }, alignment: { horizontal: 'center' } };
const valueStyle = { border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } } };
const moneyStyle = { ...valueStyle, numFmt: '"$"#,##0.00', alignment: { horizontal: 'right' } };
const integerStyle = { ...valueStyle, numFmt: '#,##0', alignment: { horizontal: 'right' } };
const percentageStyle = { ...valueStyle, numFmt: '0.0%', alignment: { horizontal: 'right' } };

const setCellStyle = (worksheet, address, style) => {
  if (worksheet[address]) worksheet[address].s = style;
};

const setRangeStyle = (worksheet, rowNumber, fromCol, toCol, style) => {
  for (let col = fromCol; col <= toCol; col += 1) {
    setCellStyle(worksheet, XLSX.utils.encode_cell({ r: rowNumber - 1, c: col }), style);
  }
};

const addSection = (rows, title) => {
  if (rows.length > 0) rows.push([]);
  rows.push([title]);
  return rows.length;
};

const addTable = (rows, title, headers, dataRows) => {
  const sectionRow = addSection(rows, title);
  rows.push(headers);
  const headerRow = rows.length;
  dataRows.forEach((row) => rows.push(row));
  return { sectionRow, headerRow, firstDataRow: headerRow + 1, lastDataRow: rows.length, lastCol: headers.length - 1 };
};

const applyTableStyles = (worksheet, tableMeta, moneyCols = [], integerCols = [], percentCols = []) => {
  setRangeStyle(worksheet, tableMeta.sectionRow, 0, tableMeta.lastCol, sectionStyle);
  setRangeStyle(worksheet, tableMeta.headerRow, 0, tableMeta.lastCol, headerStyle);
  for (let row = tableMeta.firstDataRow; row <= tableMeta.lastDataRow; row += 1) {
    setRangeStyle(worksheet, row, 0, tableMeta.lastCol, valueStyle);
    moneyCols.forEach((col) => setCellStyle(worksheet, XLSX.utils.encode_cell({ r: row - 1, c: col }), moneyStyle));
    integerCols.forEach((col) => setCellStyle(worksheet, XLSX.utils.encode_cell({ r: row - 1, c: col }), integerStyle));
    percentCols.forEach((col) => setCellStyle(worksheet, XLSX.utils.encode_cell({ r: row - 1, c: col }), percentageStyle));
  }
};

const filterRows = (context = {}) => {
  const filters = context.filters || {};
  const labels = context.labels || {};
  return [
    ['Fecha desde', formatDate(filters.fechaDesde), 'Fecha hasta', formatDate(filters.fechaHasta)],
    ['Semana', labels.semana || 'Todas', 'Proveedor', labels.proveedor || 'Todos'],
    ['Operador logístico', labels.transporte || 'Todos', 'Movimiento', labels.tipoMovimiento || 'Todos'],
    ['Modalidad', labels.modalidad || 'Todas', 'Responsable', labels.responsable || 'Todos'],
    ['Búsqueda', filters.paciente || 'Sin texto', '', ''],
  ];
};

const weekAmount = (item, week) => {
  const match = (item?.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
  return numberValue(match?.gasto_total);
};

const buildProveedorSheet = (dashboard, context = {}) => {
  const periodo = dashboard?.periodo || {};
  const cupo = dashboard?.cupo || {};
  const kpis = dashboard?.kpis || {};
  const weeks = dashboard?.semanas_catalogo || [];
  const proveedores = dashboard?.control_semanal_por_proveedor || [];
  const totals = dashboard?.control_semanal_totales || null;
  const rows = [
    ['Control por Proveedor'],
    ['Período consultado', `${formatDate(periodo.fecha_desde)} - ${formatDate(periodo.fecha_hasta)}`],
    ['Fecha de exportación', formatDate(new Date().toISOString())],
  ];

  const tables = [];
  tables.push(addTable(rows, 'Filtros aplicados', ['Filtro', 'Valor', 'Filtro', 'Valor'], filterRows(context)));
  tables.push(addTable(rows, 'KPIs generales', ['Indicador', 'Valor'], [
    ['Gasto del período', numberValue(kpis.gasto_total_periodo)],
    ['Cantidad de despachos', numberValue(kpis.cantidad_despachos)],
    ['Promedio por despacho', numberValue(kpis.gasto_promedio_despacho)],
    ['Cuenta corriente empresa', numberValue(kpis.total_cuenta_corriente)],
    ['Rendición', numberValue(kpis.total_rendicion)],
    ['Caja chica', numberValue(kpis.total_caja_chica)],
  ]));
  tables.push(addTable(rows, 'Cupo mensual general', ['Indicador', 'Valor'], [
    ['Cupo mensual', numberValue(cupo.cupo_mensual)],
    ['Consumido', numberValue(cupo.consumido)],
    ['Disponible', numberValue(cupo.disponible)],
    ['Porcentaje consumido', numberValue(cupo.porcentaje_consumido) / 100],
  ]));

  const weekHeaders = weeks.map((week) => `Semana ${week.semana_numero}\n${formatDate(week.semana_inicio, { day: '2-digit', month: '2-digit' })}-${formatDate(week.semana_fin, { day: '2-digit', month: '2-digit' })}`);
  const headers = ['Proveedor', ...weekHeaders, 'Total mes', 'Despachos', 'Promedio', 'Cupo mensual', 'Disponible / Diferencia', '% consumido', 'Estado'];
  const rowsProveedor = proveedores.map((item) => [
    getValue(item, ['proveedor_nombre', 'proveedor', 'nombre_proveedor'], 'Sin proveedor'),
    ...weeks.map((week) => weekAmount(item, week)),
    numberValue(item.gasto_total_periodo),
    numberValue(item.despachos_periodo),
    numberValue(item.promedio_por_despacho),
    item.cupo_mensual ?? null,
    item.disponible_diferencia ?? null,
    item.porcentaje_consumido === null || item.porcentaje_consumido === undefined ? null : numberValue(item.porcentaje_consumido) / 100,
    item.estado || '',
  ]);
  if (totals) {
    rowsProveedor.push([
      'TOTAL',
      ...weeks.map((week) => {
        const match = (totals.semanas || []).find((semana) => Number(semana.semana_numero) === Number(week.semana_numero));
        return numberValue(match?.gasto_total);
      }),
      numberValue(totals.gasto_total_periodo),
      numberValue(totals.despachos_periodo),
      numberValue(totals.promedio_por_despacho),
      totals.cupo_mensual_total ?? null,
      totals.disponible_diferencia_total ?? null,
      totals.porcentaje_consumido_total === null || totals.porcentaje_consumido_total === undefined ? null : numberValue(totals.porcentaje_consumido_total) / 100,
      '',
    ]);
  }
  tables.push(addTable(rows, 'Control semanal por proveedor', headers, rowsProveedor));

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 28 }, ...weeks.map(() => ({ wch: 16 })), { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(headers.length - 1, 3) } }];
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  setRangeStyle(worksheet, 1, 0, Math.max(headers.length - 1, 3), titleStyle);
  setRangeStyle(worksheet, 2, 0, 1, valueStyle);
  setRangeStyle(worksheet, 3, 0, 1, valueStyle);
  applyTableStyles(worksheet, tables[0]);
  applyTableStyles(worksheet, tables[1], [1], [1]);
  for (let row = tables[1].firstDataRow; row <= tables[1].lastDataRow; row += 1) {
    const label = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: 0 })]?.v;
    setCellStyle(worksheet, XLSX.utils.encode_cell({ r: row - 1, c: 1 }), label === 'Cantidad de despachos' ? integerStyle : moneyStyle);
  }
  applyTableStyles(worksheet, tables[2], [1], [], [1]);
  for (let row = tables[2].firstDataRow; row <= tables[2].lastDataRow; row += 1) {
    const label = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: 0 })]?.v;
    setCellStyle(worksheet, XLSX.utils.encode_cell({ r: row - 1, c: 1 }), label === 'Porcentaje consumido' ? percentageStyle : moneyStyle);
  }
  const firstMoneyCol = 1;
  const weeklyMoneyCols = weeks.map((_, index) => firstMoneyCol + index);
  const totalCol = firstMoneyCol + weeks.length;
  const despachosCol = totalCol + 1;
  const promedioCol = totalCol + 2;
  const cupoCol = totalCol + 3;
  const disponibleCol = totalCol + 4;
  const porcentajeCol = totalCol + 5;
  applyTableStyles(worksheet, tables[3], [...weeklyMoneyCols, totalCol, promedioCol, cupoCol, disponibleCol], [despachosCol], [porcentajeCol]);
  return worksheet;
};

const buildDetalleSheet = (dashboard) => {
  const rows = [
    ['Fecha', 'Responsable', 'Proveedor', 'Operador logístico', 'Movimiento', 'Modalidad', 'Paciente', 'Descripción', 'Monto'],
    ...(dashboard?.detalle || []).map((item) => [
      formatDate(getValue(item, ['fecha', 'fecha_gasto', 'created_at'])),
      getValue(item, ['responsable', 'responsable_nombre', 'nombre_responsable']),
      getValue(item, ['proveedor', 'proveedor_nombre', 'nombre_proveedor']),
      getValue(item, ['transporte', 'transporte_nombre', 'operador_logistico', 'nombre_transporte']),
      getValue(item, ['tipo_movimiento', 'tipo_movimiento_encomienda']),
      modalidadLabel(getModalidadValue(item)),
      getValue(item, ['paciente', 'paciente_referido', 'nombre_paciente']),
      getValue(item, ['descripcion', 'descripcion_general', 'detalle']),
      numberValue(getValue(item, ['monto', 'monto_total', 'total'])),
    ]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 28 }, { wch: 28 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 44 }, { wch: 16 }];
  worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 1), c: 8 } }) };
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  setRangeStyle(worksheet, 1, 0, 8, headerStyle);
  for (let row = 2; row <= rows.length; row += 1) {
    setRangeStyle(worksheet, row, 0, 8, valueStyle);
    setCellStyle(worksheet, XLSX.utils.encode_cell({ r: row - 1, c: 8 }), moneyStyle);
  }
  return worksheet;
};

export function useEncomiendasExcelExporter() {
  const exportDashboard = (dashboard, context = {}) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, buildProveedorSheet(dashboard, context), 'Control por Proveedor');
    XLSX.utils.book_append_sheet(workbook, buildDetalleSheet(dashboard), 'Detalle de Operaciones');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `encomiendas_costos_logisticos_${today}.xlsx`, { cellStyles: true });
  };
  return { exportDashboard };
}
