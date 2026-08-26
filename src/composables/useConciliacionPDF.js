import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { calculateConciliacionSummary, formatCurrency, formatPercent } from '../utils/conciliacionHelpers.js';

export function useConciliacionPDF() {
  function exportarPdfConciliacion(guias, metadata = {}) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const summary = calculateConciliacionSummary(guias);
    const fechaEmision = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const primaryColor = [79, 70, 229]; // Indigo-600 #4F46E5
    const darkSlate = [15, 23, 42];

    // --- ENCABEZADO EJECUTIVO ---
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('DISTRICORR - Conciliación de Fletes y Envíos Logísticos', 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Fecha de Emisión: ${fechaEmision}`, 14, 19);

    // --- BLOQUE DE KPI SUMMARY ---
    let yPos = 32;

    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, yPos, 182, 28, 3, 3, 'FD');

    doc.setTextColor(...darkSlate);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RESUMEN DE INDICADORES CLAVE (KPI)', 18, yPos + 7);

    // Sub-bloques KPI
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    // Gasto Total
    doc.text('Gasto Total Fletes:', 18, yPos + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229);
    doc.text(formatCurrency(summary.totalCost), 18, yPos + 22);

    // Total Guías
    doc.setTextColor(...darkSlate);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Guías / Remitos:', 70, yPos + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${summary.totalGuias}`, 70, yPos + 22);

    // Total Bultos
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Bultos Despachados:', 115, yPos + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${summary.totalBultos}`, 115, yPos + 22);

    // Courier Líder
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Transporte Líder:', 160, yPos + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(summary.transporteLider.substring(0, 16), 160, yPos + 22);

    yPos += 36;

    if (metadata.periodoText) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Filtro aplicado: ${metadata.periodoText}`, 14, yPos);
      yPos += 6;
    }

    // --- TABLA TOP CLIENTES / OBRAS SOCIALES ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkSlate);
    doc.text('Desglose por Cliente / Obra Social', 14, yPos);
    yPos += 3;

    const clienteRows = summary.byCliente.map((c, i) => [
      i + 1,
      c.nombre,
      c.totalGuias,
      c.totalBultos,
      formatCurrency(c.totalCost),
      formatPercent(c.porcentaje)
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['#', 'Cliente / Obra Social', 'Guías', 'Bultos', 'Total Gastado ($)', '% Part.']],
      body: clienteRows,
      theme: 'striped',
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });

    yPos = doc.lastAutoTable.finalY + 10;

    // --- TABLA TOP MÉDICOS / CIRUJANOS ---
    if (yPos + 40 > 270) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkSlate);
    doc.text('Desglose por Médico Cirujano / Referente', 14, yPos);
    yPos += 3;

    const medicoRows = summary.byMedico.map((m, i) => [
      i + 1,
      m.nombre,
      m.totalGuias,
      m.totalBultos,
      formatCurrency(m.totalCost),
      formatPercent(m.porcentaje)
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['#', 'Médico / Referente', 'Guías', 'Bultos', 'Total Gastado ($)', '% Part.']],
      body: medicoRows,
      theme: 'striped',
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });

    // --- PIE DE PÁGINA FORMAL CON NUMERACIÓN ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.line(14, 282, 196, 282);
      doc.text('DISTRICORR - Reporte Oficial de Conciliación de Fletes', 14, 287);
      doc.text(`Página ${i} de ${pageCount}`, 196, 287, { align: 'right' });
    }

    const filename = `Conciliacion_Fletes_Districorr_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  }

  return {
    exportarPdfConciliacion
  };
}
