import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatPercent } from '../utils/conciliacionHelpers.js';

export function useReporteConsolidadoPDF() {
  function exportarPdfConsolidado(stats, guias = []) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const fechaEmision = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // --- CABECERA ---
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, 210, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('DISTRICORR - Reporte Consolidado de Transporte y Envíos', 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Generado el: ${fechaEmision} | Auditoría General de Operaciones y Comprobantes`, 14, 20);

    let yPos = 34;

    // --- TARJETAS DESTACADAS DE MÉTRICAS ---
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, yPos, 88, 26, 3, 3, 'FD');
    doc.roundedRect(108, yPos, 88, 26, 3, 3, 'FD');

    // Tarjeta 1: Destino Principal
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('DESTINO / PROVINCIA PRINCIPAL', 18, yPos + 6);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(stats.zonaConcurrida ? stats.zonaConcurrida.substring(0, 32) : 'No especificada', 18, yPos + 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Volumen: ${stats.zonaConcurridaCount || 0} envíos registrados`, 18, yPos + 21);

    // Tarjeta 2: Transporte Líder
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('TRANSPORTE / COURIER LÍDER', 112, yPos + 6);
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229);
    doc.text(stats.transportePrincipal ? stats.transportePrincipal.substring(0, 32) : 'N/A', 112, yPos + 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Participación: ${formatPercent(stats.transportePrincipalPorcentaje || 0)} del volumen`, 112, yPos + 21);

    yPos += 30;

    // Tarjetas fila 2
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, yPos, 88, 26, 3, 3, 'FD');
    doc.roundedRect(108, yPos, 88, 26, 3, 3, 'FD');

    // Tarjeta 3: Comprobantes Adjuntos
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('COMPROBANTES Y FACTURAS ADJUNTAS', 18, yPos + 6);
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129); // Emerald
    doc.text(`${formatPercent(stats.porcentajeRespaldo || 0)}`, 18, yPos + 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${stats.guiasConRespaldo || 0} de ${stats.totalGuias || 0} envíos con comprobante`, 18, yPos + 21);

    // Tarjeta 4: Bultos y Gasto Acumulado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('BULTOS Y GASTO ACUMULADO', 112, yPos + 6);
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.totalBultos || 0} bultos`, 112, yPos + 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Costo acum.: ${formatCurrency(stats.totalMonto || 0)}`, 112, yPos + 21);

    yPos += 36;

    // --- DETALLE DE MOVIMIENTOS RECIENTES / RELEVANTES ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    doc.text('Muestreo Histórico de Envíos y Comprobantes Registrados', 14, yPos);
    yPos += 4;

    const rows = guias.slice(0, 40).map(g => {
      const extra = g.datos_adicionales || {};
      const tieneComp = (g.comprobante_url || extra.foto_remito_url || extra.foto_envio || extra.url_comprobante || g.comprobante || g.numero_factura) ? 'SÍ' : 'NO';
      const bultos = extra.cantidad_bultos !== undefined && extra.cantidad_bultos !== null ? extra.cantidad_bultos : '-';
      const cliente = g.clientes?.nombre_cliente || g.paciente_referido || 'Consumo interno';
      const destino = extra.destino_texto || g.localidad_destino?.nombre || g.provincias?.nombre || 'General';
      const transporte = g.transportes?.nombre || g.proveedores?.nombre || 'LOGISTICA CIRUGIA';
      const fecha = g.fecha_gasto ? g.fecha_gasto.split('T')[0] : '-';

      return [
        fecha,
        transporte,
        cliente.substring(0, 24),
        destino.substring(0, 22),
        bultos,
        tieneComp,
        formatCurrency(g.monto_total || 0)
      ];
    });

    doc.autoTable({
      startY: yPos,
      head: [['Fecha', 'Transporte', 'Cliente / Referencia', 'Destino', 'Bultos', 'Comprob.', 'Monto ($)']],
      body: rows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 32 },
        2: { cellWidth: 45 },
        3: { cellWidth: 40 },
        4: { cellWidth: 15, halign: 'center' },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 22, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });

    // --- PIE DE PÁGINA ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.line(14, 282, 196, 282);
      doc.text('DISTRICORR - Reporte Consolidado de Envíos y Comprobantes Logísticos', 14, 287);
      doc.text(`Página ${i} de ${pageCount}`, 196, 287, { align: 'right' });
    }

    doc.save(`Reporte_Consolidado_Logistica_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  return {
    exportarPdfConsolidado
  };
}
