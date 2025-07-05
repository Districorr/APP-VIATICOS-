<!-- src/components/CajaReportExporter.vue -->
<script setup>
import { ref, inject } from 'vue';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const props = defineProps({
  movimientos: { type: Array, default: () => [] },
  caja: { type: Object, default: () => ({}) },
  isAdminReport: { type: Boolean, default: false }
});

const exporting = ref(false);
const userProfile = inject('userProfile');

const exportToXLS = () => {
  if (!props.movimientos || props.movimientos.length === 0) return;
  exporting.value = true;
  try {
    const dataToExport = props.movimientos.map(mov => ({
      'Fecha': formatDate(mov.created_at),
      'Tipo': mov.tipo_movimiento.charAt(0).toUpperCase() + mov.tipo_movimiento.slice(1),
      'Descripción': mov.tipo_movimiento === 'gasto' ? mov.gastos?.descripcion_general || 'N/A' : mov.descripcion || 'N/A',
      'Monto': (mov.tipo_movimiento === 'gasto' ? -1 : 1) * parseFloat(mov.monto),
      'Saldo Anterior': parseFloat(mov.saldo_anterior),
      'Saldo Posterior': parseFloat(mov.saldo_posterior),
      'Realizado Por': mov.realizado_por_id?.nombre_completo || 'Sistema',
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const fileName = `${props.caja.nombre.replace(/\s+/g, '_')}_Movimientos_${new Date().toISOString().split('T')[0]}.xlsx`;
    saveAs(blob, fileName);
  } catch (e) {
    console.error("Error al exportar a XLS:", e);
  } finally {
    exporting.value = false;
  }
};

const exportToPDF = () => {
  if (!props.movimientos || props.movimientos.length === 0) return;
  exporting.value = true;
  try {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    
    // --- 1. CÁLCULOS ---
    const totalEgresos = props.movimientos.filter(m => m.tipo_movimiento === 'gasto').reduce((sum, m) => sum + parseFloat(m.monto), 0);
    const totalIngresos = props.movimientos.filter(m => m.tipo_movimiento !== 'gasto').reduce((sum, m) => sum + parseFloat(m.monto), 0);
    const saldoFinal = props.caja?.saldo_actual;
    const nombreGenerador = userProfile.value?.nombre_completo || 'Usuario Desconocido';
    const fechaHoy = new Date();
    const codigoReporte = `${props.isAdminReport ? 'ADM' : 'USR'}-CJA-${fechaHoy.getFullYear()}${(fechaHoy.getMonth() + 1).toString().padStart(2, '0')}${fechaHoy.getDate().toString().padStart(2, '0')}-${props.caja.id}`;
    const tituloReporte = `REPORTE DE MOVIMIENTOS - ${props.caja.nombre.toUpperCase()}`;

    // --- 2. ENCABEZADO ---
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(tituloReporte, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Fecha de emisión: ${formatDate(fechaHoy, true)} | Generado por: ${nombreGenerador}`, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(14, 25, doc.internal.pageSize.getWidth() - 14, 25);

    // --- 3. TABLA DE MOVIMIENTOS ---
    const head = [['Fecha', 'Tipo', 'Descripción', 'Monto', 'Saldo Ant.', 'Saldo Post.', 'Realizado Por']];
    const body = props.movimientos.map(mov => [
        formatDate(mov.created_at),
        mov.tipo_movimiento,
        mov.tipo_movimiento === 'gasto' ? mov.gastos?.descripcion_general || 'N/A' : mov.descripcion || 'N/A',
        parseFloat(mov.monto),
        formatCurrency(mov.saldo_anterior),
        formatCurrency(mov.saldo_posterior),
        mov.realizado_por_id?.nombre_completo || 'Sistema',
    ]);

    doc.autoTable({
      head: head, body: body, startY: 30, theme: 'grid',
      headStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      columnStyles: { 
        0: { cellWidth: 18 },
        1: { cellWidth: 22 },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
      },
      didParseCell: (data) => {
        // Formateo visual ANTES de dibujar
        if (data.cell.section === 'body' && data.column.index === 1) { // Columna Tipo
            const tipo = data.cell.raw;
            data.cell.text = `[${tipo.toUpperCase()}]`;
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = tipo === 'gasto' ? [220, 53, 69] : [25, 135, 84];
        }
        if (data.cell.section === 'body' && data.column.index === 3) { // Columna Monto
            const monto = parseFloat(data.cell.raw);
            const tipo = data.row.raw[1];
            data.cell.text = (tipo === 'gasto' ? '-' : '+') + formatCurrency(monto);
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = tipo === 'gasto' ? [220, 53, 69] : [25, 135, 84];
        }
      },
    });

    // --- 4. SECCIÓN DE RESUMEN ---
    let finalTableY = doc.lastAutoTable.finalY || 40;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("RESUMEN", 14, finalTableY + 12);
    doc.setLineWidth(0.2);
    doc.line(14, finalTableY + 13, 50, finalTableY + 13);

    const resumenBody = [
        ['Total movimientos:', props.movimientos.length.toString()],
        ['Total ingresos:', `+ ${formatCurrency(totalIngresos)}`],
        ['Total egresos:', `- ${formatCurrency(totalEgresos)}`],
    ];
    if (props.isAdminReport) {
        resumenBody.push(['Umbral reposición:', `${formatCurrency(props.caja.umbral_reposicion)}`]);
    }
    resumenBody.push(['Saldo final de caja:', `${formatCurrency(saldoFinal)}`]);
    
    doc.autoTable({
        body: resumenBody,
        startY: finalTableY + 15,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 1.5 },
        columnStyles: { 
            0: { fontStyle: 'bold', halign: 'left' },
            1: { halign: 'right'}
        },
        didParseCell: (data) => {
            if (data.row.index === resumenBody.length - 1) { // Última fila (saldo final)
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    // --- 5. FIRMAS (si es reporte de admin) ---
    if (props.isAdminReport) {
        let firmasY = doc.lastAutoTable.finalY + 25;
        doc.setFontSize(9);
        doc.text("___________________________", 30, firmasY);
        doc.text("___________________________", 110, firmasY);
        firmasY += 5;
        doc.text("Responsable de Caja", 38, firmasY);
        doc.text("Supervisor / Auditor", 118, firmasY);
    }
    
    // --- 6. PIE DE PÁGINA ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Código: ${codigoReporte}`, 14, doc.internal.pageSize.height - 10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }

    // --- 7. GUARDAR ---
    const fileName = `${props.caja.nombre.replace(/\s+/g, '_')}_Reporte_${codigoReporte}.pdf`;
    doc.save(fileName);

  } catch (e) {
    console.error("Error al exportar a PDF:", e);
  } finally {
    exporting.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col sm:flex-row gap-3 items-center">
    <span class="text-sm text-gray-700">Exportar:</span>
    <button @click="exportToXLS" :disabled="exporting || !movimientos || movimientos.length === 0" class="btn-secondary">
      <span v-if="exporting">Generando XLS...</span>
      <span v-else>XLS</span>
    </button>
    <button @click="exportToPDF" :disabled="exporting || !movimientos || movimientos.length === 0" class="btn-secondary">
       <span v-if="exporting">Generando PDF...</span>
       <span v-else>PDF</span>
    </button>
  </div>
</template>

<style scoped>
.btn-secondary {
  @apply text-sm font-semibold leading-6 text-gray-900 px-4 py-2 rounded-md bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 min-h-[44px];
}
</style>