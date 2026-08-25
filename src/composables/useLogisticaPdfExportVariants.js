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
    if (dest && !dest.toLowerCase().includes('sin destino')) return dest;

    const prov = (g.provincias?.nombre || g.provincia?.nombre || g.provincia_destino?.nombre || g.provincia_nombre || '').trim();
    if (prov && !prov.toLowerCase().includes('sin provincia')) return prov;

    return '—';
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
  // HELPER DE RENDERIZADO DE GRÁFICOS DE TORTA EN HTML5 CANVAS (THEME-FACTORY)
  // =========================================================================
  function renderPieChartCanvas(data = [], title = '', width = 830, height = 96) {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Fondo blanco con borde redondeado
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, width, height, 6) : ctx.rect(0, 0, width, height);
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#cbd5e1';
    ctx.stroke();

    // Título de la tarjeta de gráfico
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 9.5px sans-serif';
    ctx.fillText(title.toUpperCase(), 10, 14);

    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
    if (total === 0) return canvas.toDataURL('image/png');

    // Paleta de colores ejecutiva (Theme-Factory / Data-Visualization)
    const colors = [
      '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#06b6d4', '#ec4899', '#64748b', '#3b82f6', '#14b8a6'
    ];

    // Ajustar posiciones según el ancho disponible (panorámico vs mitad)
    const isWide = width > 500;
    const centerX = isWide ? 65 : 45;
    const centerY = 52;
    const radius = 34;
    let startAngle = -Math.PI / 2;

    // Dibujar sectores de la dona
    data.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const color = colors[index % colors.length];

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      startAngle = endAngle;
    });

    // Hueco interno (Formato Dona Ejecutivo)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.48, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Texto central de la dona
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.length.toString(), centerX, centerY - 4);
    ctx.fillStyle = '#64748b';
    ctx.font = '7px sans-serif';
    ctx.fillText('Items', centerX, centerY + 5);

    // Leyenda lateral derecha
    const legendX = isWide ? 130 : 95;
    let legendY = 24;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const maxLegendItems = 5;
    const legendData = data.slice(0, maxLegendItems);
    if (data.length > maxLegendItems) {
      const otrosVal = data.slice(maxLegendItems).reduce((s, d) => s + d.value, 0);
      legendData.push({ label: 'Otros acumulados', value: otrosVal });
    }

    legendData.forEach((item, index) => {
      const color = colors[index % colors.length];
      const pct = ((item.value / total) * 100).toFixed(1) + '%';

      // Círculo de color
      ctx.beginPath();
      ctx.arc(legendX + 3, legendY, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Texto etiqueta
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 8px sans-serif';
      const maxChars = isWide ? 38 : 22;
      const truncatedLabel = item.label.length > maxChars ? item.label.substring(0, maxChars - 1) + '…' : item.label;
      ctx.fillText(truncatedLabel, legendX + 11, legendY);

      // Porcentaje
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 8px monospace';
      const pctOffset = isWide ? 230 : 135;
      ctx.fillText(pct, legendX + pctOffset, legendY);

      legendY += 13;
    });

    return canvas.toDataURL('image/png');
  }

  // =========================================================================
  // EXPORTACIÓN 4: LIBRO MAYOR Y CONSOLIDACIÓN — MODOS ENCOMIENDA / PROVEEDOR / AMBOS (PDF EJECUTIVO)
  // =========================================================================
  function exportarPdfCtaCteVencimientos(items = [], context = {}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const vencimientoLabel = context.vencimientoLabel || 'Mes en curso';
    const originLabel = context.originLabel || 'Período anterior';
    const isConsolidado = !!context.includePagoInmediato;
    const includePieCharts = !!context.includePieCharts;
    const modo = context.modoReporte || 'encomienda'; // 'encomienda' | 'proveedor' | 'completo' | 'detalle'
    
    const getBultosCount = (item) => {
      const extra = item.datos_adicionales || {};
      const b = extra.cantidad_bultos;
      if (b !== undefined && b !== null && b !== '') {
        const num = Number(b);
        if (!isNaN(num) && num > 0) return num;
      }
      return 1;
    };

    const periodText = `Mes Vencimiento: ${vencimientoLabel.toUpperCase()}  |  Origen de gastos: ${originLabel}`;
    const filterText = isConsolidado
      ? 'Consolidación de Cuenta Corriente + Pagos Inmediatos (Rendiciones de Viaje / Cajas Chicas)'
      : 'Gastos en Cuenta Corriente de Empresa';

    let mainTitle = 'LIBRO MAYOR Y MOVIMIENTOS CONSOLIDADOS';
    if (modo === 'encomienda') mainTitle = 'REPORTE CONSOLIDADO POR ENCOMIENDA (OPERADORES LOGÍSTICOS)';
    else if (modo === 'proveedor') mainTitle = 'REPORTE CONSOLIDADO POR PROVEEDOR';
    else if (modo === 'completo') mainTitle = 'REPORTE CONSOLIDADO COMPLETO (ENCOMIENDAS, PROVEEDORES Y DETALLE)';
    else if (modo === 'detalle') mainTitle = 'DETALLE AUDITABLE COMPLETO DE OPERACIONES LOGÍSTICAS';

    let currentY = renderHeaderCompact(doc, mainTitle, periodText, filterText);

    // 1. Totales y Métricas globales
    let totalCtaCte = 0;
    let totalPagoDirecto = 0;
    let totalBultos = 0;

    items.forEach(item => {
      const val = Number(item.monto_total || 0);
      const bCount = getBultosCount(item);
      totalBultos += bCount;
      if (item.origen_gasto === 'cuenta_corriente_empresa') {
        totalCtaCte += val;
      } else {
        totalPagoDirecto += val;
      }
    });

    const totalConsolidado = totalCtaCte + totalPagoDirecto;
    const cantOps = items.length;
    const pctCtaCte = totalConsolidado > 0 ? ((totalCtaCte / totalConsolidado) * 100).toFixed(1) + '%' : '0%';
    const pctPagoDirecto = totalConsolidado > 0 ? ((totalPagoDirecto / totalConsolidado) * 100).toFixed(1) + '%' : '0%';

    // Agrupaciones preparadas para tablas y gráficos
    const encGroups = {};
    const provGroups = {};

    items.forEach(item => {
      const encName = item.transporte?.nombre || 'SIN ENCOMIENDA / N/A';
      const provName = item.proveedor?.nombre || 'SIN PROVEEDOR';
      const val = Number(item.monto_total || 0);
      const bCount = getBultosCount(item);

      // Encomiendas
      if (!encGroups[encName]) encGroups[encName] = { nombre: encName, cant: 0, bultos: 0, ctaCte: 0, pagoDirecto: 0, total: 0 };
      encGroups[encName].cant += 1;
      encGroups[encName].bultos += bCount;
      if (item.origen_gasto === 'cuenta_corriente_empresa') encGroups[encName].ctaCte += val;
      else encGroups[encName].pagoDirecto += val;
      encGroups[encName].total += val;

      // Proveedores
      if (!provGroups[provName]) provGroups[provName] = { nombre: provName, cant: 0, bultos: 0, ctaCte: 0, pagoDirecto: 0, total: 0 };
      provGroups[provName].cant += 1;
      provGroups[provName].bultos += bCount;
      if (item.origen_gasto === 'cuenta_corriente_empresa') provGroups[provName].ctaCte += val;
      else provGroups[provName].pagoDirecto += val;
      provGroups[provName].total += val;
    });

    const sortedEncomiendas = Object.values(encGroups).sort((a, b) => b.total - a.total);
    const sortedProvs = Object.values(provGroups).sort((a, b) => b.total - a.total);

    let topEncName = sortedEncomiendas.length > 0 ? sortedEncomiendas[0].nombre : '—';
    let maxEncVal = sortedEncomiendas.length > 0 ? sortedEncomiendas[0].total : 0;
    const topEncPct = totalConsolidado > 0 ? ((maxEncVal / totalConsolidado) * 100).toFixed(1) + '%' : '0%';

    // 2. 4 KPI Cards Ejecutivos con Diseño Premium
    const kpiCards = [
      { label: 'TOTAL CONSOLIDADO', val: formatCurrency(totalConsolidado), sub: `${totalBultos} bultos (${cantOps} despachos)`, color: [79, 70, 229] },
      { label: 'EN CUENTA CORRIENTE', val: formatCurrency(totalCtaCte), sub: `${pctCtaCte} del acumulado`, color: [30, 41, 59] },
      { label: 'EN PAGO DIRECTO', val: formatCurrency(totalPagoDirecto), sub: `${pctPagoDirecto} (Rend./Cajas)`, color: [16, 185, 129] },
      { label: 'MAYOR ENCOMIENDA', val: topEncName, sub: `${topEncPct} del total (${formatCurrency(maxEncVal)})`, color: [99, 102, 241] }
    ];

    const cardMargin = 10;
    const cardGap = 3;
    const totalCardWidth = 277; // 297 - 20 mm
    const cardWidth = (totalCardWidth - (kpiCards.length - 1) * cardGap) / kpiCards.length;
    const cardHeight = 11;

    kpiCards.forEach((c, idx) => {
      const x = cardMargin + idx * (cardWidth + cardGap);
      
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      doc.setFillColor(...c.color);
      doc.rect(x, currentY, 1.2, cardHeight, 'F');

      doc.setFontSize(5.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(c.label, x + 3.5, currentY + 3.8);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(c.val, x + 3.5, currentY + 7.5);

      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(c.sub, x + 3.5, currentY + 10.2);
    });

    currentY += cardHeight + 5;

    // --- SECCIÓN 2.5: GRÁFICOS DE TORTA / DONA (SI includePieCharts ES TRUE) ---
    if (includePieCharts) {
      if (currentY > 135) {
        doc.addPage();
        currentY = 15;
      }

      const encChartData = sortedEncomiendas.map(e => ({ label: e.nombre, value: e.total }));
      const provChartData = sortedProvs.map(p => ({ label: p.nombre, value: p.total }));

      if (modo === 'encomienda' && encChartData.length > 0) {
        const imgData = renderPieChartCanvas(encChartData, 'Distribución de Gasto por Encomienda / Transporte', 830, 96);
        doc.addImage(imgData, 'PNG', 10, currentY, 277, 32);
        currentY += 37;
      } else if (modo === 'proveedor' && provChartData.length > 0) {
        const imgData = renderPieChartCanvas(provChartData, 'Distribución de Gasto por Proveedor', 830, 96);
        doc.addImage(imgData, 'PNG', 10, currentY, 277, 32);
        currentY += 37;
      } else if ((modo === 'completo' || modo === 'detalle') && (encChartData.length > 0 || provChartData.length > 0)) {
        const imgEnc = renderPieChartCanvas(encChartData, 'Distribución por Encomienda', 408, 96);
        const imgProv = renderPieChartCanvas(provChartData, 'Distribución por Proveedor', 408, 96);
        doc.addImage(imgEnc, 'PNG', 10, currentY, 136, 32);
        doc.addImage(imgProv, 'PNG', 151, currentY, 136, 32);
        currentY += 37;
      }
    }

    let secNum = 1;

    // --- TABLA RESUMEN POR ENCOMIENDA (Si modo es 'encomienda' o 'completo') ---
    if (modo === 'encomienda' || modo === 'completo') {
      if (currentY > 160) {
        doc.addPage();
        currentY = 15;
      }

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(`${secNum}. RESUMEN CONSOLIDADO POR ENCOMIENDA (OPERADOR LOGÍSTICO)`, 10, currentY);
      secNum++;
      currentY += 3;

      const encHeaders = [['N°', 'Encomienda / Empresa Logística', 'Bultos', 'Participación', 'Cuenta Corriente ($)', 'Pago Directo ($)', 'Total Consolidado ($)']];
      const encRows = sortedEncomiendas.map((e, idx) => {
        const sharePct = totalConsolidado > 0 ? ((e.total / totalConsolidado) * 100).toFixed(1) + '%' : '0%';
        return [
          String(idx + 1),
          e.nombre,
          String(e.bultos),
          sharePct,
          formatCurrency(e.ctaCte),
          formatCurrency(e.pagoDirecto),
          formatCurrency(e.total)
        ];
      });

      const encFoot = [[
        '#',
        `TOTAL CONSOLIDADO POR ENCOMIENDA (${sortedEncomiendas.length} empresas)`,
        `${totalBultos} bultos`,
        '100.0%',
        formatCurrency(totalCtaCte),
        formatCurrency(totalPagoDirecto),
        formatCurrency(totalConsolidado)
      ]];

      doc.autoTable({
        startY: currentY,
        head: encHeaders,
        body: encRows,
        foot: encFoot,
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.1, textColor: [30, 41, 59] },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, lineWidth: { top: 0.4 }, lineColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 95, fontStyle: 'bold' },
          2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: 27, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 40, halign: 'right' },
          5: { cellWidth: 40, halign: 'right' },
          6: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 10, right: 10 }
      });

      currentY = doc.lastAutoTable.finalY + 6;

      if (currentY > 155 && modo === 'completo') {
        doc.addPage();
        currentY = 15;
      }
    }

    // --- TABLA RESUMEN POR PROVEEDOR (Si modo es 'proveedor' o 'completo') ---
    if (modo === 'proveedor' || modo === 'completo') {
      if (currentY > 160) {
        doc.addPage();
        currentY = 15;
      }

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(`${secNum}. RESUMEN CONSOLIDADO POR PROVEEDOR`, 10, currentY);
      secNum++;
      currentY += 3;

      const provHeaders = [['N°', 'Proveedor / Empresa', 'Bultos', 'Participación', 'Cuenta Corriente ($)', 'Pago Directo ($)', 'Total Consolidado ($)']];
      const provRows = sortedProvs.map((p, idx) => {
        const sharePct = totalConsolidado > 0 ? ((p.total / totalConsolidado) * 100).toFixed(1) + '%' : '0%';
        return [
          String(idx + 1),
          p.nombre,
          String(p.bultos),
          sharePct,
          formatCurrency(p.ctaCte),
          formatCurrency(p.pagoDirecto),
          formatCurrency(p.total)
        ];
      });

      const provFoot = [[
        '#',
        `TOTAL CONSOLIDADO POR PROVEEDOR (${sortedProvs.length} proveedores)`,
        `${totalBultos} bultos`,
        '100.0%',
        formatCurrency(totalCtaCte),
        formatCurrency(totalPagoDirecto),
        formatCurrency(totalConsolidado)
      ]];

      doc.autoTable({
        startY: currentY,
        head: provHeaders,
        body: provRows,
        foot: provFoot,
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.1, textColor: [30, 41, 59] },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, lineWidth: { top: 0.4 }, lineColor: [79, 70, 229] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 95, fontStyle: 'bold' },
          2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: 27, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 40, halign: 'right' },
          5: { cellWidth: 40, halign: 'right' },
          6: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 10, right: 10 }
      });

      currentY = doc.lastAutoTable.finalY + 6;

      if (currentY > 155 && modo === 'completo') {
        doc.addPage();
        currentY = 15;
      }
    }

    // --- TABLA DETALLE COMPLETO DE OPERACIONES ---
    if (modo === 'encomienda' || modo === 'proveedor' || modo === 'completo' || modo === 'detalle') {
      if (currentY > 160) {
        doc.addPage();
        currentY = 15;
      }

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(`${secNum}. DETALLE AUDITABLE DE OPERACIONES (${modo === 'proveedor' ? 'POR PROVEEDOR' : 'POR ENCOMIENDA'})`, 10, currentY);
      currentY += 3;

      // Ordenar detalle según modo seleccionado
      const sortedItems = [...items].sort((a, b) => {
        if (modo === 'proveedor') {
          const provA = a.proveedor?.nombre || '';
          const provB = b.proveedor?.nombre || '';
          if (provA !== provB) return provA.localeCompare(provB);
        } else {
          const encA = a.transporte?.nombre || '';
          const encB = b.transporte?.nombre || '';
          if (encA !== encB) return encA.localeCompare(encB);
        }
        return new Date(a.fecha_gasto) - new Date(b.fecha_gasto);
      });

      const getOrigenLabel = (item) => {
        if (item.origen_gasto === 'cuenta_corriente_empresa') return 'Cta. Corriente';
        if (item.origen_gasto === 'rendicion' || item.viaje_id) return 'Rend. Viaje';
        if (item.origen_gasto === 'caja_chica' || item.caja_id || item.origen_gasto === 'pago_directo') return 'Caja / Pago Dir.';
        return 'Pago Directo';
      };

      const detailHeaders = [['N°', 'Fecha', 'Encomienda / Transporte', 'Proveedor', 'Detalle / Concepto', 'Bultos', 'N° Factura', 'Origen', 'Importe ($)']];
      const detailRows = sortedItems.map((item, index) => [
        String(index + 1),
        formatDate(item.fecha_gasto),
        item.transporte?.nombre || 'N/A',
        item.proveedor?.nombre || 'SIN PROVEEDOR',
        item.descripcion_general || 'Pago de encomienda',
        String(getBultosCount(item)),
        item.numero_factura || '—',
        getOrigenLabel(item),
        formatCurrency(item.monto_total)
      ]);

      const detailFoot = [[
        '#',
        `TOTAL DETALLE CONSOLIDADO (${cantOps} registros)`,
        '—',
        '—',
        '—',
        `${totalBultos} bultos`,
        '—',
        '—',
        formatCurrency(totalConsolidado)
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
          1: { cellWidth: 16 },
          2: { cellWidth: 38, fontStyle: 'bold' },
          3: { cellWidth: 38 },
          4: { cellWidth: 77 },
          5: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
          6: { cellWidth: 24, halign: 'center' },
          7: { cellWidth: 24, halign: 'center' },
          8: { cellWidth: 34, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 10, right: 10 }
      });
    }

    applyFootersCompact(doc);
    const monthStr = context.selectedMonth || new Date().toISOString().split('T')[0];
    let filePrefix = 'Reporte_Encomiendas';
    if (modo === 'proveedor') filePrefix = 'Reporte_Proveedores';
    else if (modo === 'completo') filePrefix = 'Reporte_Consolidado_Ambos';
    else if (modo === 'detalle') filePrefix = 'Reporte_Detalle_Operaciones';

    doc.save(`${filePrefix}_${monthStr}.pdf`);
  }

  return {
    exportarPdfMovimientosPeriodo,
    exportarPdfResumenTransportes,
    exportarPdfMovimientosClientePaciente,
    exportarPdfCtaCteVencimientos
  };
}
