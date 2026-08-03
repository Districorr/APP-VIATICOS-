import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from '../utils/formatters';

export function useLogisticaPdfExportVariants() {
  /**
   * Helper para limpiar descripciones brutas largas de cirugía y extraer paciente/obra social
   * Ejemplo: "DEVODUCION DE MATERIAL DE CIRUGIA-PTE-FELIPE VEGA ESTIGARRIBIA (OSDE)+SOBRE..."
   * Resultado: "FELIPE VEGA ESTIGARRIBIA (OSDE)"
   */
  function parseCleanCirugiaReference(desc) {
    if (!desc) return '';
    let str = desc.trim();

    // Buscar patrón PTE- o PACIENTE-
    const pteMatch = str.match(/(?:PTE|PACIENTE)\s*[-:]\s*([^+/-]+)/i);
    if (pteMatch && pteMatch[1] && pteMatch[1].trim().length > 2) {
      return pteMatch[1].trim();
    }

    // Limpiar prefijos operacionales comunes si no viene PTE-
    str = str.replace(/^(ENVIO|DEVOLUCION|DESPACHO|REPOSICION|RETIRO)\s+(DE|A|PARA)?\s*/i, '');
    str = str.replace(/^(MATERIAL|MATERIALES|DOCUMENTACION|DOCUMENTOS|SOBRE)\s+(DE|A|PARA)?\s*/i, '');
    str = str.replace(/^CIRUGIA\s*[-:]\s*/i, '');
    str = str.replace(/[-:]\s*TRANSPORTE\s+[A-Z0-9\s]+$/i, '');

    return str.trim();
  }

  /**
   * Helper para obtener referencia operacional limpia priorizando cliente, paciente, destino o descripción real
   * Nunca muestra "Operación con proveedor — LOGISTICA CIRUGIA" ni "LOGISTICA CIRUGIA" como proveedor
   */
  function getReferenciaOperacionalLimpia(g) {
    const extra = g.datos_adicionales || {};
    const paciente = (g.paciente_referido || extra.paciente_referido || '').trim();
    const cliente = (g.clientes?.nombre_cliente || '').trim();
    const proveedor = (g.proveedores?.nombre || '').trim();
    const desc = (g.descripcion_general || '').trim();
    const tipoMov = extra.tipo_movimiento_encomienda || 'Despacho';
    const esCirugia = extra.tipo_logistica === 'cirugia' || desc.toLowerCase().includes('cirugía') || desc.toLowerCase().includes('cirugia');

    if (esCirugia) {
      if (cliente && paciente) return `${cliente} (Pte: ${paciente})`;
      if (cliente) return cliente;
      if (paciente) return `Pte: ${paciente}`;
      
      const parsedDesc = parseCleanCirugiaReference(desc);
      if (parsedDesc && !parsedDesc.toUpperCase().includes('LOGISTICA')) return parsedDesc;
      return 'Cirugía sin referencia informada';
    }

    if (cliente && paciente) {
      if (proveedor && proveedor !== cliente && !proveedor.toUpperCase().includes('LOGISTICA')) {
        return `${proveedor} / ${cliente} (Pte: ${paciente})`;
      }
      return `${cliente} (Pte: ${paciente})`;
    }

    if (cliente) return cliente;

    if (proveedor && !proveedor.toUpperCase().includes('LOGISTICA')) {
      return `${proveedor} · ${tipoMov}`;
    }

    if (paciente) return `Pte: ${paciente}`;
    
    const parsedDesc = parseCleanCirugiaReference(desc);
    if (parsedDesc) return parsedDesc;
    return '—';
  }

  /**
   * Helper para formatear destino limpio ("—" si falta)
   */
  function getDestinoLimpio(g) {
    const extra = g.datos_adicionales || {};
    const dest = (extra.destino_texto || g.localidad_destino?.nombre || '').trim();
    if (!dest || dest.toLowerCase().includes('sin destino')) return '—';
    return dest;
  }

  /**
   * Encabezado ultracompacto para minimizar uso de hojas
   */
  function renderHeaderCompact(doc, title, periodText, filterText) {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFillColor(51, 65, 85); // slate-700
    doc.rect(0, 0, pageWidth, 7, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('DISTRICORR — LOGISTICA & TRANSPORTES', 10, 5);

    const nowStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`Emision: ${nowStr}`, pageWidth - 10, 5, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, 10, 13);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Periodo: ${periodText}  |  ${filterText}`, 10, 18);

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(10, 20, pageWidth - 10, 20);

    return 22;
  }

  /**
   * Pie de página ultracompacto
   */
  function applyFootersCompact(doc) {
    const totalPages = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);

      doc.line(10, pageHeight - 7, pageWidth - 10, pageHeight - 7);
      doc.text('Districorr ERP — Modulo Logistica de Transportes', 10, pageHeight - 3.5);
      doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - 10, pageHeight - 3.5, { align: 'right' });
    }
  }

  // =========================================================================
  // EXPORTACIÓN 1: REPORTE GENERAL DE MOVIMIENTOS LOGÍSTICOS (COMPACTO / COMPLETO)
  // =========================================================================
  function exportarPdfMovimientosPeriodo(movimientos, context = {}, modo = 'compacto') {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const periodText = `${context.fechaDesde || 'Inicio'} al ${context.fechaHasta || 'Hoy'}`;
    const filterText = context.filterText || 'Todos los registros';
    const isCompleto = modo === 'completo';

    const reportTitle = isCompleto
      ? 'REPORTE GENERAL DE MOVIMIENTOS LOGISTICOS (AUDITORIA COMPLETA)'
      : 'REPORTE GENERAL DE MOVIMIENTOS LOGISTICOS';

    let currentY = renderHeaderCompact(doc, reportTitle, periodText, filterText);

    // Métricas clave simplificadas
    const totalMovs = movimientos.length;
    let totalImporte = 0;
    let tieneBultosPendientes = false;

    movimientos.forEach(g => {
      const extra = g.datos_adicionales || {};
      const b = extra.cantidad_bultos;
      if (b === undefined || b === null || b === '') {
        tieneBultosPendientes = true;
      }
      totalImporte += Number(g.monto_total) || 0;
    });

    const promedioEnvio = totalMovs > 0 ? totalImporte / totalMovs : 0;

    // Caja de Resumen KPI (Sin emojis para evitar corrupción de codificación)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(10, currentY, 277, 7.5, 1, 1, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);

    let kpiStr = `MOVIMIENTOS: ${totalMovs}    |    TOTAL ACUMULADO: ${formatCurrency(totalImporte)}    |    PROMEDIO POR ENVIO: ${formatCurrency(promedioEnvio)}`;
    if (tieneBultosPendientes) {
      kpiStr += `    |    [!] Datos de bultos pendientes de completar`;
    }

    doc.text(kpiStr, 13, currentY + 5);
    currentY += 10;

    // 1. MODALIDAD COMPACTA (PREDETERMINADO - MÁXIMO 2 PÁGINAS)
    if (!isCompleto) {
      const tableHeaders = [['Fecha', 'Transporte', 'Referencia Operativa', 'Destino', 'Importe']];
      const tableRows = movimientos.map(g => [
        formatDate(g.fecha_gasto),
        g.transportes?.nombre || '—',
        getReferenciaOperacionalLimpia(g),
        getDestinoLimpio(g),
        formatCurrency(g.monto_total)
      ]);

      doc.autoTable({
        startY: currentY,
        head: tableHeaders,
        body: tableRows,
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.0, textColor: [30, 41, 59] },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 45, fontStyle: 'bold' },
          2: { cellWidth: 115 },
          3: { cellWidth: 60 },
          4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 10, right: 10 },
      });
    } 
    // 2. MODALIDAD COMPLETA (AUDITORÍA)
    else {
      const tableHeaders = [['Fecha', 'Transporte', 'Proveedor', 'Cliente / Paciente', 'Tipo', 'Destino', 'Bultos', 'Importe']];
      const tableRows = movimientos.map(g => {
        const extra = g.datos_adicionales || {};
        const bultosStr = (extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '')
          ? String(extra.cantidad_bultos)
          : '—';

        const cliente = (g.clientes?.nombre_cliente || '').trim();
        const paciente = (g.paciente_referido || extra.paciente_referido || '').trim();
        const cpStr = cliente && paciente ? `${cliente} (Pte: ${paciente})` : (cliente || (paciente ? `Pte: ${paciente}` : '—'));
        const provStr = (g.proveedores?.nombre || '').toUpperCase().includes('LOGISTICA') ? '—' : (g.proveedores?.nombre || '—');

        return [
          formatDate(g.fecha_gasto),
          g.transportes?.nombre || '—',
          provStr,
          cpStr,
          extra.tipo_movimiento_encomienda || 'Envio',
          getDestinoLimpio(g),
          bultosStr,
          formatCurrency(g.monto_total)
        ];
      });

      doc.autoTable({
        startY: currentY,
        head: tableHeaders,
        body: tableRows,
        theme: 'striped',
        styles: { fontSize: 6.5, cellPadding: 0.9, textColor: [30, 41, 59] },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 42, fontStyle: 'bold' },
          2: { cellWidth: 45 },
          3: { cellWidth: 60 },
          4: { cellWidth: 28 },
          5: { cellWidth: 40 },
          6: { cellWidth: 15, halign: 'center' },
          7: { cellWidth: 27, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 10, right: 10 },
      });
    }

    applyFootersCompact(doc);
    const modeName = isCompleto ? 'Auditoria' : 'Compacto';
    doc.save(`Movimientos_Logistica_${modeName}_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // =========================================================================
  // =========================================================================
  // EXPORTACIÓN 2: RESUMEN POR TRANSPORTE — TONY (ESTRICTO MÁXIMO 1 PÁGINA)
  // =========================================================================
  function exportarPdfResumenTransportes(resumenTransportes, todosMovimientos, context = {}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const periodText = `${context.fechaDesde || 'Inicio'} al ${context.fechaHasta || 'Hoy'}`;
    const filterText = context.filterText || 'Resumen consolidado por empresa';

    let currentY = renderHeaderCompact(doc, 'RESUMEN POR TRANSPORTE — TONY', periodText, filterText);

    // Métricas clave
    const totalGasto = resumenTransportes.reduce((acc, t) => acc + (t.montoTotal || 0), 0);
    const totalMovs = resumenTransportes.reduce((acc, t) => acc + (t.movimientos || 0), 0);
    const cantTransportes = resumenTransportes.length;
    const topTransObj = resumenTransportes.length > 0 ? resumenTransportes[0] : null;
    const topTrans = topTransObj ? topTransObj.nombre : '—';
    const topTransPct = (topTransObj && totalGasto > 0) ? ((topTransObj.montoTotal / totalGasto) * 100).toFixed(1) + '%' : '0%';
    const globalPromedio = totalMovs > 0 ? totalGasto / totalMovs : 0;

    // KPI Cards dibujados con estética ejecutiva elegante (4 tarjetas)
    const kpiCards = [
      { label: 'TOTAL LOGÍSTICA', val: formatCurrency(totalGasto) },
      { label: 'MOVIMIENTOS TOTALES', val: `${totalMovs} envíos` },
      { label: 'TRANSPORTES ACTIVOS', val: `${cantTransportes} empresas` },
      { label: 'MAYOR PARTICIPACIÓN', val: `${topTrans} (${topTransPct})` }
    ];

    const cardMargin = 10;
    const cardGap = 3;
    const totalCardWidth = 277; // 297 - 20
    const cardWidth = (totalCardWidth - (kpiCards.length - 1) * cardGap) / kpiCards.length;
    const cardHeight = 10.5;

    kpiCards.forEach((c, idx) => {
      const x = cardMargin + idx * (cardWidth + cardGap);
      
      // Fondo y borde suave
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, currentY, cardWidth, cardHeight, 1, 1, 'FD');

      // Línea superior de acento
      doc.setFillColor(51, 65, 85);
      doc.rect(x, currentY, cardWidth, 0.8, 'F');

      // Label mini
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(c.label, x + 3, currentY + 4);

      // Valor grande
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(c.val, x + 3, currentY + 8.5);
    });

    currentY += cardHeight + 4;

    // Cálculo de rango de días y proyección / gasto diario
    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    let numDays = 0;
    if (context.fechaDesde && context.fechaHasta) {
      const partsD = context.fechaDesde.split('/');
      const partsH = context.fechaHasta.split('/');
      if (partsD.length === 3 && partsH.length === 3) {
        const d1 = new Date(partsD[2], partsD[1] - 1, partsD[0]);
        const d2 = new Date(partsH[2], partsH[1] - 1, partsH[0]);
        const diffMs = d2 - d1;
        if (!isNaN(diffMs)) {
          numDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
        }
      }
    }

    const isCurrentMonthQuery = context.fechaDesde && context.fechaDesde.includes(String(now.getMonth() + 1).padStart(2, '0'));
    const colHeader7 = isCurrentMonthQuery ? 'Proyección Mes' : (numDays > 0 ? 'Gasto / Día' : 'Variación');

    const mainHeaders = [['Transporte', 'Movimientos', 'Zonas Cubiertas', 'Total ($)', 'Promedio', 'Participación', colHeader7]];

    const mainRows = resumenTransportes.map(t => {
      const part = totalGasto > 0 ? ((t.montoTotal / totalGasto) * 100).toFixed(1) + '%' : '0%';
      const zonasStr = t.zonas && t.zonas !== 'Sin zona especificada' ? t.zonas : '—';

      let valCol7 = '—';
      if (isCurrentMonthQuery && currentDay > 0) {
        const proj = (t.montoTotal / currentDay) * daysInMonth;
        valCol7 = formatCurrency(proj);
      } else if (numDays > 0) {
        valCol7 = formatCurrency(t.montoTotal / numDays);
      }

      return [
        t.nombre,
        String(t.movimientos || 0),
        zonasStr,
        formatCurrency(t.montoTotal || 0),
        formatCurrency(t.promedio || 0),
        part,
        valCol7
      ];
    });

    let footCol7 = '—';
    if (isCurrentMonthQuery && currentDay > 0) {
      footCol7 = formatCurrency((totalGasto / currentDay) * daysInMonth);
    } else if (numDays > 0) {
      footCol7 = formatCurrency(totalGasto / numDays);
    }

    const mainFoot = [[
      `TOTAL LOGÍSTICA (${cantTransportes} empresas)`,
      String(totalMovs),
      '—',
      formatCurrency(totalGasto),
      formatCurrency(globalPromedio),
      '100.0%',
      footCol7
    ]];

    doc.autoTable({
      startY: currentY,
      head: mainHeaders,
      body: mainRows,
      foot: mainFoot,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, lineWidth: { top: 0.4 }, lineColor: [51, 65, 85] },
      columnStyles: {
        0: { cellWidth: 65, fontStyle: 'bold' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 65 },
        3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: 10, right: 10, top: 10, bottom: 10 },
    });

    applyFootersCompact(doc);
    doc.save(`Resumen_Transportes_Tony_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // =========================================================================
  // EXPORTACIÓN 3: CLIENTES Y PACIENTES — FRANCO (MÁXIMO 2 PÁGINAS)
  // =========================================================================
  function exportarPdfMovimientosClientePaciente(todosMovimientos, context = {}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const periodText = `${context.fechaDesde || 'Inicio'} al ${context.fechaHasta || 'Hoy'}`;
    const filterText = context.filterText || 'Resumen por Cirugías, Proveedores/Stock y Referencias Operativas';

    let currentY = renderHeaderCompact(doc, 'MOVIMIENTOS POR CLIENTE Y PACIENTE — FRANCO', periodText, filterText);

    const grupos = {
      cirugia: { titulo: '1. CIRUGIAS Y CLIENTES VINCULADOS', items: {} },
      proveedor: { titulo: '2. PROVEEDORES Y REPOSICION DE STOCK', items: {} },
      general: { titulo: '3. OTRAS OPERACIONES Y SIN REFERENCIA COMPLETA', items: {} }
    };

    todosMovimientos.forEach(g => {
      const extra = g.datos_adicionales || {};
      const desc = (g.descripcion_general || '').toLowerCase();
      const tipoLog = extra.tipo_logistica || (desc.includes('cirugía') || desc.includes('cirugia') ? 'cirugia' : '');
      const refName = getReferenciaOperacionalLimpia(g);

      let targetGrupo = 'general';
      let tipoTag = 'General';

      if (tipoLog === 'cirugia' || desc.includes('cirugía') || desc.includes('cirugia')) {
        targetGrupo = 'cirugia';
        tipoTag = 'Cirugía';
      } else if (g.proveedores?.nombre || desc.includes('stock') || desc.includes('proveedor')) {
        targetGrupo = 'proveedor';
        tipoTag = 'Proveedor / Stock';
      }

      const mapRef = grupos[targetGrupo].items;

      if (!mapRef[refName]) {
        mapRef[refName] = {
          referencia: refName,
          tipo: tipoTag,
          movimientos: 0,
          bultosTotal: 0,
          bultosInformadosCount: 0,
          transportesMap: {},
          montoTotal: 0
        };
      }

      const item = mapRef[refName];
      item.movimientos += 1;
      item.montoTotal += Number(g.monto_total) || 0;

      const b = extra.cantidad_bultos;
      if (b !== undefined && b !== null && b !== '') {
        item.bultosTotal += Number(b) || 0;
        item.bultosInformadosCount++;
      }

      const tName = g.transportes?.nombre || '—';
      item.transportesMap[tName] = (item.transportesMap[tName] || 0) + 1;
    });

    const summaryHeaders = [['Referencia / Operación', 'Tipo', 'Movimientos', 'Bultos Informados', 'Transporte Principal', 'Total Acumulado ($)']];
    const summaryRows = [];

    Object.values(grupos).forEach(grp => {
      const entries = Object.values(grp.items);
      if (entries.length === 0) return;

      summaryRows.push([
        { content: grp.titulo, colSpan: 6, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', textColor: [79, 70, 229] } }
      ]);

      entries.forEach(item => {
        let topTrans = '—';
        let maxCount = 0;
        Object.entries(item.transportesMap).forEach(([tName, count]) => {
          if (count > maxCount) { maxCount = count; topTrans = tName; }
        });

        const bultosStr = item.bultosInformadosCount > 0 ? String(item.bultosTotal) : '—';

        summaryRows.push([
          item.referencia,
          item.tipo,
          String(item.movimientos),
          bultosStr,
          topTrans,
          formatCurrency(item.montoTotal)
        ]);
      });
    });

    doc.autoTable({
      startY: currentY,
      head: summaryHeaders,
      body: summaryRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.0, textColor: [15, 23, 42] },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 100, fontStyle: 'bold' },
        1: { cellWidth: 32 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 28, halign: 'center' },
        4: { cellWidth: 50 },
        5: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 10, right: 10 },
    });

    currentY = doc.lastAutoTable.finalY + 5;

    if (currentY > 175) {
      doc.addPage();
      currentY = 15;
    }

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('DETALLE CONTINUO DE MOVIMIENTOS', 10, currentY);
    currentY += 3;

    const detailHeaders = [['Fecha', 'Referencia / Destinatario', 'Paciente', 'Transporte', 'Motivo', 'Destino', 'Bultos', 'Importe ($)']];
    const detailRows = todosMovimientos.map(g => {
      const extra = g.datos_adicionales || {};
      const bultosStr = (extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null && extra.cantidad_bultos !== '')
        ? String(extra.cantidad_bultos)
        : '—';

      const pac = (g.paciente_referido || extra.paciente_referido || '').trim();
      const pacStr = (!pac || pac.toLowerCase().includes('sin paciente')) ? '—' : pac;

      return [
        formatDate(g.fecha_gasto),
        getReferenciaOperacionalLimpia(g),
        pacStr,
        g.transportes?.nombre || '—',
        extra.tipo_movimiento_encomienda || 'Envio',
        getDestinoLimpio(g),
        bultosStr,
        formatCurrency(g.monto_total)
      ];
    });

    doc.autoTable({
      startY: currentY,
      head: detailHeaders,
      body: detailRows,
      theme: 'striped',
      styles: { fontSize: 6.5, cellPadding: 0.9, textColor: [30, 41, 59] },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 65, fontStyle: 'bold' },
        2: { cellWidth: 40 },
        3: { cellWidth: 38 },
        4: { cellWidth: 28 },
        5: { cellWidth: 40 },
        6: { cellWidth: 14, halign: 'center' },
        7: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 10, right: 10 },
    });

    applyFootersCompact(doc);
    doc.save(`Movimientos_Cliente_Paciente_Franco_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // =========================================================================
  // EXPORTACIÓN 4: LIBRO MAYOR DE CUENTA CORRIENTE — VENCIMIENTOS (CTA CTE)
  // =========================================================================
  function exportarPdfCtaCteVencimientos(items = [], context = {}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const vencimientoLabel = context.vencimientoLabel || 'Mes en curso';
    const originLabel = context.originLabel || 'Período anterior';
    const periodText = `Mes Vencimiento: ${vencimientoLabel.toUpperCase()}  |  Origen de gastos: ${originLabel}`;
    const filterText = 'Gastos en Cuenta Corriente de Empresa';

    let currentY = renderHeaderCompact(doc, 'LIBRO MAYOR DE CUENTA CORRIENTE — VENCIMIENTOS', periodText, filterText);

    const totalAmount = items.reduce((sum, item) => sum + Number(item.monto_total || 0), 0);
    const cantOps = items.length;
    const promedioOp = cantOps > 0 ? totalAmount / cantOps : 0;

    // Agrupación por proveedor para ranking / KPI
    const provGroups = items.reduce((acc, item) => {
      const name = item.proveedor?.nombre || 'SIN PROVEEDOR';
      if (!acc[name]) acc[name] = { nombre: name, total: 0, cant: 0 };
      acc[name].total += Number(item.monto_total || 0);
      acc[name].cant += 1;
      return acc;
    }, {});

    const sortedProvs = Object.values(provGroups).sort((a, b) => b.total - a.total);
    const topProv = sortedProvs.length > 0 ? sortedProvs[0] : null;
    const topProvName = topProv ? topProv.nombre : '—';
    const topProvPct = (topProv && totalAmount > 0) ? ((topProv.total / totalAmount) * 100).toFixed(1) + '%' : '0%';

    // 4 KPI Cards Ejecutivos
    const kpiCards = [
      { label: 'MONTO TOTAL A VENCER', val: formatCurrency(totalAmount) },
      { label: 'OPERACIONES EN CTA CTE', val: `${cantOps} despachos` },
      { label: 'PROMEDIO POR DESPACHO', val: formatCurrency(promedioOp) },
      { label: 'MAYOR VENCIMIENTO PROVEEDOR', val: `${topProvName} (${topProvPct})` }
    ];

    const cardMargin = 10;
    const cardGap = 3;
    const totalCardWidth = 277; // 297 - 20 mm
    const cardWidth = (totalCardWidth - (kpiCards.length - 1) * cardGap) / kpiCards.length;
    const cardHeight = 10.5;

    kpiCards.forEach((c, idx) => {
      const x = cardMargin + idx * (cardWidth + cardGap);
      
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, currentY, cardWidth, cardHeight, 1, 1, 'FD');

      doc.setFillColor(79, 70, 229);
      doc.rect(x, currentY, cardWidth, 0.8, 'F');

      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(c.label, x + 3, currentY + 4);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(c.val, x + 3, currentY + 8.5);
    });

    currentY += cardHeight + 4;

    // TABLA 1: RESUMEN DE VENCIMIENTOS POR PROVEEDOR
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('1. RESUMEN CONSOLIDADO DE VENCIMIENTOS POR PROVEEDOR', 10, currentY);
    currentY += 2.5;

    const provHeaders = [['Proveedor / Empresa', 'Operaciones', 'Participación', 'Total Vencimiento ($)']];
    const provRows = sortedProvs.map(p => [
      p.nombre,
      String(p.cant),
      totalAmount > 0 ? ((p.total / totalAmount) * 100).toFixed(1) + '%' : '0%',
      formatCurrency(p.total)
    ]);

    const provFoot = [[
      `TOTAL VENCIMIENTOS (${sortedProvs.length} proveedores)`,
      String(cantOps),
      '100.0%',
      formatCurrency(totalAmount)
    ]];

    doc.autoTable({
      startY: currentY,
      head: provHeaders,
      body: provRows,
      foot: provFoot,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.0, textColor: [30, 41, 59] },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, lineWidth: { top: 0.4 }, lineColor: [79, 70, 229] },
      columnStyles: {
        0: { cellWidth: 120, fontStyle: 'bold' },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 82, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 10, right: 10 }
    });

    currentY = doc.lastAutoTable.finalY + 5;

    if (currentY > 170) {
      doc.addPage();
      currentY = 15;
    }

    // TABLA 2: DETALLE CONTINUO DE OPERACIONES
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('2. DETALLE DE OPERACIONES EN CUENTA CORRIENTE', 10, currentY);
    currentY += 2.5;

    const detailHeaders = [['N°', 'Fecha', 'Proveedor', 'Operador Log.', 'Detalle / Concepto', 'N° Factura', 'Importe ($)']];
    const detailRows = items.map((item, index) => [
      String(index + 1),
      formatDate(item.fecha_gasto),
      item.proveedor?.nombre || 'SIN PROVEEDOR',
      item.transporte?.nombre || 'N/A',
      item.descripcion_general || 'Pago de encomienda',
      item.numero_factura || '—',
      formatCurrency(item.monto_total)
    ]);

    const detailFoot = [[
      '#',
      `TOTAL DETALLE (${cantOps} registros)`,
      '—',
      '—',
      '—',
      '—',
      formatCurrency(totalAmount)
    ]];

    doc.autoTable({
      startY: currentY,
      head: detailHeaders,
      body: detailRows,
      foot: detailFoot,
      theme: 'striped',
      styles: { fontSize: 6.5, cellPadding: 0.9, textColor: [30, 41, 59] },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, lineWidth: { top: 0.4 }, lineColor: [51, 65, 85] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 20 },
        2: { cellWidth: 50, fontStyle: 'bold' },
        3: { cellWidth: 42 },
        4: { cellWidth: 95 },
        5: { cellWidth: 25, halign: 'center' },
        6: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 10, right: 10 }
    });

    applyFootersCompact(doc);
    const monthStr = context.selectedMonth || new Date().toISOString().split('T')[0];
    doc.save(`Vencimientos_CtaCte_${monthStr}.pdf`);
  }

  return {
    exportarPdfMovimientosPeriodo,
    exportarPdfResumenTransportes,
    exportarPdfMovimientosClientePaciente,
    exportarPdfCtaCteVencimientos
  };
}
