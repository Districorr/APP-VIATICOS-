// src/composables/useReportGenerator.js

// --- IMPORTS PARA EL MÉTODO MODERNO (VUE + HTML2PDF) ---
import { createApp, h, nextTick } from 'vue'; 
import html2pdf from 'html2pdf.js';
import { supabase } from '../supabaseClient.js';
import ReporteRendicion from '../components/ReporteRendicion.vue';

// --- IMPORTS EXISTENTES ---
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import logoImg from '/districorr-logo-circular (2).png';

function addPageFooter(doc, pageNumber, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  doc.setLineWidth(0.2).setDrawColor(150, 150, 150);
  doc.line(margin, doc.internal.pageSize.getHeight() - 15, pageWidth - margin, doc.internal.pageSize.getHeight() - 15);
  doc.setFontSize(8).setTextColor(128, 128, 128);
  doc.text("CUIT: 30-71598290-7 | 9 DE JULIO 1251 | Reporte generado automáticamente desde InfoGastos", margin, doc.internal.pageSize.getHeight() - 10);
  doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
}


export function useReportGenerator() {
  // ===================================================================================
  // VERSIÓN ADAPTADA PARA MOSTRAR GASTOS DELEGADOS
  // ===================================================================================
  const generateCanvaStylePDF = async (viajeId) => {
    if (!viajeId) {
        alert("Error: No se ha proporcionado un ID de rendición.");
        return;
    }

    try {
        const { data: reporte, error } = await supabase.rpc('get_reporte_rendicion_completa', { p_viaje_id: viajeId });
        if (error) throw error;
        if (!reporte) {
            alert("No se encontraron datos para generar el reporte.");
            return;
        }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        let lastY = margin;

        const addPageHeaderAndFooter = (doc, pageNum, totalPages) => {
            // Footer en todas las páginas
            doc.setFontSize(7).setTextColor(150, 150, 150);
            doc.text(`CUIT: 30-71598290-7 | 9 DE JULIO 1251 | Reporte generado automáticamente desde InfoGastos`, margin, pageHeight - 7);
            doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
        };

        // --- ENCABEZADO Y METADATA (Solo en la primera página) ---
        if (logoImg) doc.addImage(logoImg, 'PNG', margin, margin - 6, 16, 16);
        doc.setFontSize(20).setFont(undefined, 'bold').setTextColor(40, 56, 104);
        doc.text("INFORME RENDICIÓN DE GASTOS", pageWidth / 2, margin + 2, { align: 'center' });
        doc.setFontSize(8).setFont(undefined, 'normal').setTextColor(100, 100, 100);
        doc.text("SISTEMA INFOGASTOS – DISTRICORR", pageWidth / 2, margin + 7, { align: 'center' });
        
        const metadataBody = [
            ['Responsable:', reporte.metadata.responsable, 'Fecha Emisión:', reporte.metadata.fecha_emision],
            ['Referencia:', reporte.metadata.referencia, 'ID:', `#${reporte.metadata.id}`],
            ['Período:', reporte.metadata.periodo, 'Estado:', reporte.metadata.estado?.toUpperCase()],
        ];
        if (reporte.metadata.costo_promedio_diario) {
            metadataBody.push([{content: 'Costo Promedio Diario:', styles: {fontStyle: 'bold'}}, {content: formatCurrency(reporte.metadata.costo_promedio_diario), styles: {fontStyle: 'bold', textColor: '#005a9c'}}, '', '']);
        }
        
        doc.autoTable({
            startY: margin + 12,
            body: metadataBody,
            theme: 'plain',
            styles: { fontSize: 7.5, cellPadding: {top: 0.2, bottom: 0.2} },
            columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } }
        });
        lastY = doc.lastAutoTable.finalY + 4;
        
        // --- BUCLE PRINCIPAL: UNA TABLA POR GRUPO ---
        for (const grupo of reporte.grupos) {
            const groupTitleHeight = 7;
            const tableHeadHeight = 7;

            if (lastY + groupTitleHeight + tableHeadHeight + 10 > pageHeight - margin) {
                doc.addPage();
                lastY = margin;
            }

            doc.setFillColor(40, 56, 104);
            doc.rect(margin, lastY, pageWidth - margin * 2, groupTitleHeight, 'F');
            doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(255, 255, 255);
            doc.text(grupo.group_name || 'Grupo sin nombre', margin + 2, lastY + 5);
            lastY += groupTitleHeight;
            
            const bodyData = [];
            grupo.gastos.forEach(gasto => {
                const detalles = [];
                const add = (key, val) => { if (val) detalles.push(`${key}: ${val}`) };
                
                // *** INICIO DE LA MODIFICACIÓN ***
                // Añadimos la información de delegación si existe
                if (gasto.delegado_por_nombre) {
                    add('Delegado por', gasto.delegado_por_nombre);
                }
                // *** FIN DE LA MODIFICACIÓN ***

                add('Provincia', gasto.detalles_adicionales?.provincia);
                add('Nº Factura', gasto.detalles_adicionales?.numero_factura);
                
                const detallesString = detalles.join(' | ');

                bodyData.push([
                    { content: gasto.tipo_gasto || 'Gasto General', styles: { fontStyle: 'bold', fontSize: 8, valign: 'middle' } },
                    { content: gasto.descripcion || 'Sin descripción', styles: { fontStyle: 'bold', fontSize: 8, valign: 'middle' } },
                    { content: formatCurrency(gasto.monto), styles: { fontStyle: 'bold', fontSize: 9, halign: 'right', valign: 'middle' } }
                ]);

                const fullDetailsString = `Fecha: ${gasto.fecha || '--/--/----'}${detallesString ? ' | ' + detallesString : ''}`;
                bodyData.push([
                    { content: fullDetailsString, colSpan: 3, styles: { fontSize: 7, textColor: [100, 100, 100], fillColor: [248, 249, 250] } }
                ]);
            });

            doc.autoTable({
                startY: lastY,
                head: [["Tipo de Gasto", "Descripción", "Monto"]],
                body: bodyData,
                theme: 'grid',
                rowPageBreak: 'avoid',
                headStyles: { fillColor: [224, 224, 224], textColor: [40, 40, 40], fontStyle: 'bold', fontSize: 8, cellPadding: 1.5 },
                columnStyles: { 
                    0: { cellWidth: 45 }, 
                    1: { cellWidth: 'auto' }, 
                    2: { cellWidth: 35 }
                },
            });
            lastY = doc.lastAutoTable.finalY;
        }

        // --- SECCIÓN DE RESÚMENES ---
        const requiredHeightForSummaries = 40;
        if (lastY + requiredHeightForSummaries > pageHeight - margin) {
            doc.addPage();
            lastY = margin;
        } else {
            lastY += 5;
        }
        
        const summaryTableConfig = { startY: lastY, theme: 'grid', headStyles: { fillColor: [40, 56, 104], fontSize: 8 }, styles: { fontSize: 7, cellPadding: 1.2 } };
        const columnWidth = (pageWidth - margin * 2) / 3 - 3;
        let finalY = lastY;

        if (reporte.estadisticas.por_tipo?.length > 0) {
            doc.autoTable({ ...summaryTableConfig, tableWidth: columnWidth, head: [['Gastos por Tipo', 'Monto', '%']], body: reporte.estadisticas.por_tipo.map(item => [item.tipo || 'Sin Tipo', formatCurrency(item.monto), `${item.porcentaje}%`]), margin: { left: margin } });
            finalY = Math.max(finalY, doc.lastAutoTable.finalY);
        }

        if (reporte.estadisticas.por_provincia?.length > 0) {
            doc.autoTable({ ...summaryTableConfig, startY: lastY, tableWidth: columnWidth, head: [['Gastos por Provincia', 'Monto']], body: reporte.estadisticas.por_provincia.map(item => [item.provincia, formatCurrency(item.monto)]), margin: { left: margin + columnWidth + 4.5 } });
             finalY = Math.max(finalY, doc.lastAutoTable.finalY);
        }
        
        doc.autoTable({ ...summaryTableConfig, startY: lastY, tableWidth: columnWidth, head: [['Resumen de Totales', '']], body: [
            ['Total Adelantos:', { content: formatCurrency(reporte.resumen_financiero.total_adelantos), styles: { textColor: [0, 100, 0] } }],
            ['Total Gastos (Bruto):', { content: formatCurrency(reporte.resumen_financiero.total_gastos_bruto), styles: { textColor: [192, 0, 0] } }],
            [{ content: reporte.resumen_financiero.etiqueta_saldo, styles: { fontStyle: 'bold', fillColor: '#fef9c3' } },
             { content: formatCurrency(Math.abs(reporte.resumen_financiero.saldo)), styles: { fontStyle: 'bold', fillColor: '#fef9c3' } }],
        ], margin: { left: margin + (columnWidth + 4.5) * 2 }});
        finalY = Math.max(finalY, doc.lastAutoTable.finalY);

        lastY = finalY + 12;
        if (lastY > pageHeight - margin) { doc.addPage(); lastY = margin + 10; }
        doc.setFontSize(8).setTextColor(0,0,0);
        doc.text("Firma Responsable", margin + 35, lastY, {align: 'center'});
        doc.line(margin, lastY - 2, margin + 70, lastY - 2);
        doc.text("Firma Gerencia", margin + 125, lastY, {align: 'center'});
        doc.line(margin + 90, lastY - 2, margin + 160, lastY - 2);
        
        // --- PAGINACIÓN FINAL ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            addPageHeaderAndFooter(doc, i, totalPages);
        }

        doc.save(`Rendicion_${reporte.metadata.id}_${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (e) {
        console.error("Error al generar el PDF:", e);
        alert(`No se pudo generar el PDF: ${e.message}`);
    }
  };
  // --- FUNCIONES AUXILIARES Y OTRAS FUNCIONES DE REPORTE (INTACTAS DEL ORIGINAL) ---
  const formatearDetallesAdicionales = (gasto) => {
    const datos = gasto.datos_adicionales;
    if (!datos) return '';
    try {
      const objDatos = typeof datos === 'string' ? JSON.parse(datos) : datos;
      if (typeof objDatos !== 'object' || objDatos === null) return '';
      const formattedLines = Object.entries(objDatos)
        .filter(([key, value]) => {
            const stringValue = String(value || '').trim();
            return stringValue !== '' && stringValue.toLowerCase() !== 'null';
        })
        .map(([key, value]) => {
          const formattedKey = key.replace(/([A-Z])/g, ' $1').trim().replace(/_/g, ' ');
          const capitalizedKey = formattedKey.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          const formattedValue = typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value;
          return `${capitalizedKey}: ${String(formattedValue)}`;
        });
      return formattedLines.length > 0 ? formattedLines.join('\n') : '';
    } catch (e) {
      console.error("Error al formatear datos adicionales:", e, datos);
      return 'Error al mostrar detalles';
    }
  };

  const getValoresMonetariosGasto = (gasto) => {
    if (!gasto || typeof gasto !== 'object') {
        return { neto: 0, iva: 0, total: 0 };
    }
    const totalBruto = parseFloat(gasto.monto_total) || 0;
    const iva = parseFloat(gasto.monto_iva) || 0;
    const neto = totalBruto - iva;
    return { neto, iva, total: totalBruto };
  };

  const formatearDescripcionCompleta = (gasto) => {
    const descripcionPrincipal = gasto.descripcion_general || '-';
    let detallesSecundarios = [];
    if (gasto.clientes && gasto.clientes.nombre_cliente) {
      detallesSecundarios.push(`Cliente: ${gasto.clientes.nombre_cliente}`);
    }
    if (gasto.transportes && gasto.transportes.nombre) {
      detallesSecundarios.push(`Transporte: ${gasto.transportes.nombre}`);
    }
    if (gasto.datos_adicionales && typeof gasto.datos_adicionales === 'object') {
      const etiquetas = { paciente_referido: 'Paciente' };
      for (const key in gasto.datos_adicionales) {
        const valor = gasto.datos_adicionales[key];
        if (valor !== null && valor !== undefined && String(valor).trim() !== '' && String(valor).toLowerCase() !== 'null') {
          const etiqueta = etiquetas[key] || key.replace(/_/g, ' ').replace(/(^\w{1})|(\s+\w{1})/g, letra => letra.toUpperCase());
          detallesSecundarios.push(`${etiqueta}: ${valor}`);
        }
      }
    }
    const detallesFormateados = detallesSecundarios.join(' | ');
    return {
      principal: descripcionPrincipal,
      secundarios: detallesFormateados
    };
  };

  const getFechaMinMaxGastos = (gastos) => {
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        return { min: null, max: null };
    }
    let minDateObj = null;
    let maxDateObj = null;
    try {
      const gastosConFechaValida = gastos.filter(gasto => gasto && gasto.fecha_gasto);
      if (gastosConFechaValida.length === 0) {
          return { min: null, max: null };
      }
      for (const gasto of gastosConFechaValida) {
        const currentDate = new Date(gasto.fecha_gasto);
        if (!isNaN(currentDate.getTime())) {
          if (minDateObj === null || currentDate < minDateObj) minDateObj = currentDate;
          if (maxDateObj === null || currentDate > maxDateObj) maxDateObj = currentDate;
        }
      }
      return {
        min: minDateObj ? formatDate(minDateObj) : null,
        max: maxDateObj ? formatDate(maxDateObj) : null
      };
    } catch (e) {
      console.error("Error procesando fechas en getFechaMinMaxGastos:", e);
      return { min: null, max: null };
    }
  };
    const calculateResponsableConMasGasto = (gastos) => {
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        return { nombre: 'N/A', total: 0, moneda: 'ARS' };
    }
    const gastosPorResponsableARS = {};
    const MONEDA_REPORTE = 'ARS';
    gastos.forEach(gasto => {
      if (!gasto || typeof gasto !== 'object') return;
      const monedaGasto = (gasto.gasto_moneda || gasto.moneda || 'ARS').toUpperCase();
      if (monedaGasto === MONEDA_REPORTE) {
        const responsableId = gasto.gasto_user_id || gasto.user_id || 'desconocido';
        const nombre = gasto.responsable_gasto_nombre || gasto.responsable_nombre || `Usuario ID ${typeof responsableId === 'string' ? responsableId.substring(0,8) : 'Inválido'}`;
        const valores = getValoresMonetariosGasto(gasto);
        if (!gastosPorResponsableARS[responsableId]) {
          gastosPorResponsableARS[responsableId] = { id: responsableId, nombre: nombre, totalGastadoBruto: 0 };
        }
        gastosPorResponsableARS[responsableId].totalGastadoBruto += valores.total;
      }
    });
    let maxGastador = { nombre: 'N/A (Sin gastos en ARS)', total: 0, moneda: MONEDA_REPORTE };
    if (Object.keys(gastosPorResponsableARS).length > 0) {
        maxGastador.nombre = 'N/A';
        let maxTotal = -1;
        for (const respId in gastosPorResponsableARS) {
          if (gastosPorResponsableARS[respId].totalGastadoBruto > maxTotal) {
            maxTotal = gastosPorResponsableARS[respId].totalGastadoBruto;
            maxGastador = {
              nombre: gastosPorResponsableARS[respId].nombre,
              total: gastosPorResponsableARS[respId].totalGastadoBruto,
              moneda: MONEDA_REPORTE
            };
          }
        }
    }
    return maxGastador;
  };

  const calculateAdminGastosPorTipo = (gastos, monedaPrincipalParaTotales = 'ARS') => {
    const resumen = {};
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        return { body: [], foot: [], rawData: [], totales: { neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales } };
    }
    gastos.forEach(gasto => {
      if (!gasto || typeof gasto !== 'object') return;
      const tipoNombre = gasto.nombre_tipo_gasto || gasto.tipo_gasto_nombre || 'Sin Tipo Especificado';
      const moneda = (gasto.gasto_moneda || gasto.moneda || 'ARS').toUpperCase();
      const key = `${tipoNombre}_${moneda}`;
      const valores = getValoresMonetariosGasto(gasto);
      if (!resumen[key]) {
        resumen[key] = { tipoGastoNombre: tipoNombre, moneda: moneda, totalNeto: 0, totalIVA: 0, totalBruto: 0 };
      }
      resumen[key].totalNeto += valores.neto;
      resumen[key].totalIVA += valores.iva;
      resumen[key].totalBruto += valores.total;
    });
    const detallesOrdenados = Object.values(resumen).sort((a,b) => a.tipoGastoNombre.localeCompare(b.tipoGastoNombre) || a.moneda.localeCompare(b.moneda));
    const totalesGenerales = { neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales };
    detallesOrdenados.forEach(item => {
        totalesGenerales.neto += item.totalNeto;
        totalesGenerales.iva += item.totalIVA;
        totalesGenerales.bruto += item.totalBruto;
    });
    const bodyForPDF = detallesOrdenados.map(item => [ item.tipoGastoNombre, item.moneda, formatCurrency(item.totalNeto, item.moneda), formatCurrency(item.totalIVA, item.moneda), formatCurrency(item.totalBruto, item.moneda) ]);
    const footForPDF = [[ { content: `TOTAL GENERAL (${monedaPrincipalParaTotales}):`, colSpan:2, styles: { halign: 'left', fontStyle: 'bold'} }, { content: formatCurrency(totalesGenerales.neto, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} }, { content: formatCurrency(totalesGenerales.iva, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} }, { content: formatCurrency(totalesGenerales.bruto, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} } ]];
    const rawDataForExcel = detallesOrdenados.map(item => ({ tipo_gasto: item.tipoGastoNombre, moneda: item.moneda, neto: item.totalNeto, iva: item.totalIVA, bruto: item.totalBruto }));
    return { body: bodyForPDF, foot: footForPDF, rawData: rawDataForExcel, totales: totalesGenerales };
  };
    const calculateResumenGerencialPorTipo = (gastos, monedaPrincipalParaTotales = 'ARS') => {
    const resumenPorTipo = {};
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        return { detalles: [], totalesGenerales: { nombre: "TOTAL GENERAL", neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales } };
    }

    gastos.forEach(gasto => {
      if (!gasto || typeof gasto !== 'object') return;
      const tipoNombre = gasto.nombre_tipo_gasto || gasto.tipo_gasto_nombre || 'Sin Tipo Especificado';
      const valores = getValoresMonetariosGasto(gasto);
      if (!resumenPorTipo[tipoNombre]) {
        resumenPorTipo[tipoNombre] = { tipoGastoNombre: tipoNombre, totalNeto: 0, totalIVA: 0, totalBruto: 0, monedas: new Set() };
      }
      resumenPorTipo[tipoNombre].totalNeto += valores.neto;
      resumenPorTipo[tipoNombre].totalIVA += valores.iva;
      resumenPorTipo[tipoNombre].totalBruto += valores.total;
      resumenPorTipo[tipoNombre].monedas.add(gasto.gasto_moneda || gasto.moneda || 'N/A');
    });

    const detalles = Object.values(resumenPorTipo).map(item => ({
        ...item,
        monedas: Array.from(item.monedas).join(', ')
    })).sort((a, b) => a.tipoGastoNombre.localeCompare(b.tipoGastoNombre));

    const totalesGenerales = { nombre: `TOTAL GENERAL (${monedaPrincipalParaTotales})`, neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales };
    detalles.forEach(item => {
        totalesGenerales.neto += item.totalNeto;
        totalesGenerales.iva += item.totalIVA;
        totalesGenerales.bruto += item.totalBruto;
    });

    return { detalles, totalesGenerales };
  };

  const prepararDetalleGastosParaLibroIVA = (gastos) => {
    let totalNetoGeneral = 0, totalIVAGeneral = 0, totalGeneralBruto = 0;
    const monedaTotales = 'ARS';
    const rawDataForExcel = [];
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        return { body: [], foot: [], totales: {neto: 0, iva: 0, bruto: 0, moneda: monedaTotales}, rawData: [] };
    }

    const bodyForPDF = gastos.map(gasto => {
      if (!gasto || typeof gasto !== 'object') return [];
      const valores = getValoresMonetariosGasto(gasto);
      const monedaGastoActual = gasto.gasto_moneda || gasto.moneda || monedaTotales;
      totalNetoGeneral += valores.neto;
      totalIVAGeneral += valores.iva;
      totalGeneralBruto += valores.total;

      rawDataForExcel.push({
        fecha: formatDate(gasto.fecha_gasto),
        n_comp: gasto.gasto_n_factura || gasto.numero_factura || 'S/N',
        descripcion: gasto.gasto_descripcion || gasto.descripcion_general || '-',
        responsable: gasto.responsable_gasto_nombre || gasto.responsable_nombre || 'N/A',
        neto: valores.neto,
        iva: valores.iva,
        total: valores.total,
        moneda: monedaGastoActual,
        viaje_rendicion: gasto.nombre_viaje || 'N/A',
        estado_viaje: gasto.viaje_cerrado_en ? `Cerrado (${formatDate(gasto.viaje_cerrado_en)})` : 'En Curso'
      });
      return [
        formatDate(gasto.fecha_gasto),
        gasto.gasto_n_factura || gasto.numero_factura || 'S/N',
        gasto.gasto_descripcion || gasto.descripcion_general || '-',
        gasto.responsable_gasto_nombre || gasto.responsable_nombre || 'N/A',
        formatCurrency(valores.neto, monedaGastoActual),
        formatCurrency(valores.iva, monedaGastoActual),
        formatCurrency(valores.total, monedaGastoActual),
      ];
    }).filter(row => row.length > 0);

    const footForPDF = [[
        { content: `TOTALES GENERALES (${monedaTotales}):`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalNetoGeneral, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalIVAGeneral, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalGeneralBruto, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
    ]];
    return { body: bodyForPDF, foot: footForPDF, totales: {neto: totalNetoGeneral, iva: totalIVAGeneral, bruto: totalGeneralBruto, moneda: monedaTotales}, rawData: rawDataForExcel };
  };

  const generateGastosPDF = (gastos, viajeSeleccionadoInfo, userInfo) => {
    if (!gastos || gastos.length === 0) { alert('No hay datos de gastos para generar el PDF.'); return; }
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = margin;
    doc.setFontSize(16).setFont(undefined, 'bold').text("Reporte de Rendición de Gastos", pageWidth / 2, currentY, { align: 'center' });
    currentY += 20;
    doc.setFontSize(10).setFont(undefined, 'normal');
    if (viajeSeleccionadoInfo) {
      doc.text(`Viaje/Período: ${viajeSeleccionadoInfo.nombre_viaje || 'N/A'} (ID: ${viajeSeleccionadoInfo.codigo_rendicion || viajeSeleccionadoInfo.id})`, margin, currentY); currentY += 12;
      doc.text(`Fechas Viaje: ${formatDate(viajeSeleccionadoInfo.fecha_inicio)} - ${viajeSeleccionadoInfo.fecha_fin ? formatDate(viajeSeleccionadoInfo.fecha_fin) : 'En curso'}`, margin, currentY); currentY += 12;
    }
    if (userInfo) { doc.text(`Responsable: ${userInfo.nombre_completo || userInfo.email || 'N/A'}`, margin, currentY); currentY += 12; }
    doc.text(`Fecha de Emisión: ${formatDate(new Date())}`, margin, currentY); currentY += 20;
    const tableColumn = ["Fecha", "N° Factura", "Descripción", "Neto", "IVA", "Total", "Moneda"];
    const tableRows = gastos.map(g => { const v = getValoresMonetariosGasto(g); return [formatDate(g.fecha_gasto), g.numero_factura || 'S/N', g.descripcion_general || '-', formatCurrency(v.neto, g.moneda), formatCurrency(v.iva, g.moneda), formatCurrency(v.total, g.moneda), g.moneda || 'ARS']; });
    let totalNetoRendicion = 0, totalIVARendicion = 0, totalBrutoRendicion = 0;
    gastos.forEach(g => { const v = getValoresMonetariosGasto(g); totalNetoRendicion += v.neto; totalIVARendicion += v.iva; totalBrutoRendicion += v.total; });
    const monedaPrincipal = viajeSeleccionadoInfo?.moneda_adelanto || 'ARS';
    const tableFoot = [[ { content: 'TOTALES DE LA RENDICIÓN:', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold'} }, { content: formatCurrency(totalNetoRendicion, monedaPrincipal), styles: { halign: 'right', fontStyle: 'bold'} }, { content: formatCurrency(totalIVARendicion, monedaPrincipal), styles: { halign: 'right', fontStyle: 'bold'} }, { content: formatCurrency(totalBrutoRendicion, monedaPrincipal), styles: { halign: 'right', fontStyle: 'bold'} }, { content: '', styles: { halign: 'right', fontStyle: 'bold'} } ]];
    doc.autoTable({ head: [tableColumn], body: tableRows, foot: tableFoot, startY: currentY, theme: 'striped', headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 }, footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' }, styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }, didDrawPage: (data) => { currentY = data.cursor.y + 15; } });
    if (viajeSeleccionadoInfo && typeof viajeSeleccionadoInfo.monto_adelanto === 'number') {
        currentY = doc.lastAutoTable.finalY + 20;
        if (currentY > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); currentY = margin; }
        doc.setFontSize(10).setFont(undefined, 'bold').text('Resumen del Adelanto:', margin, currentY); currentY += 15;
        doc.setFont(undefined, 'normal').text(`Monto del Adelanto: ${formatCurrency(viajeSeleccionadoInfo.monto_adelanto, monedaPrincipal)}`, margin + 5, currentY); currentY += 12;
        doc.text(`Total Gastado (aplicado al adelanto): ${formatCurrency(totalBrutoRendicion, monedaPrincipal)}`, margin + 5, currentY); currentY += 12;
        const saldo = (viajeSeleccionadoInfo.monto_adelanto || 0) - totalBrutoRendicion;
        doc.setFont(undefined, 'bold').text(`Saldo del Adelanto: ${formatCurrency(saldo, monedaPrincipal)} (${saldo >= 0 ? 'A favor del responsable' : 'A reintegrar por el responsable'})`, margin + 5, currentY);
    }
    doc.save(`Rendicion_${viajeSeleccionadoInfo?.codigo_rendicion || 'General'}_${new Date().toISOString().split('T')[0]}.pdf`);
  };
    const generateGastosExcel = (gastos, viajeSeleccionadoInfo, userInfo, esAdminReport = false) => {
    if (!gastos || gastos.length === 0) { alert('No hay datos de gastos para generar el archivo Excel.'); return; }
    const headers = ["Fecha Gasto", "N° Factura", "Descripción", "Proveedor", "Tipo de Gasto", "Neto", "IVA", "Total Bruto", "Moneda"];
    if (esAdminReport) { headers.unshift("Viaje/Período"); headers.unshift("Responsable"); }
    const dataRows = gastos.map(g => { const v = getValoresMonetariosGasto(g); let row = [formatDate(g.fecha_gasto), g.numero_factura || 'S/N', g.descripcion_general || '-', g.proveedor_nombre || '-', g.tipo_gasto_nombre || g.nombre_tipo_gasto || '-', v.neto, v.iva, v.total, g.moneda || 'ARS']; if (esAdminReport) { row.unshift(g.nombre_viaje || '-'); row.unshift(g.responsable_gasto_nombre || g.responsable_nombre || userInfo?.nombre_completo || 'N/A'); } return row; });
    let totalNetoGeneral = 0, totalIVAGeneral = 0, totalBrutoGeneral = 0;
    gastos.forEach(g => { const v = getValoresMonetariosGasto(g); totalNetoGeneral += v.neto; totalIVAGeneral += v.iva; totalBrutoGeneral += v.total; });
    const footerRow = ["TOTALES", "", "", "", "", totalNetoGeneral, totalIVAGeneral, totalBrutoGeneral, "ARS"];
    if (esAdminReport) { footerRow.unshift(""); footerRow.unshift(""); }
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    const colWidths = esAdminReport ? [{wch:25},{wch:25},{wch:12},{wch:15},{wch:30},{wch:20},{wch:20},{wch:12},{wch:12},{wch:12},{wch:8}] : [{wch:12},{wch:15},{wch:40},{wch:25},{wch:25},{wch:12},{wch:12},{wch:12},{wch:8}];
    worksheet['!cols'] = colWidths;
    const currencyFormat = '#,##0.00';
    const netoCol = esAdminReport ? 5 : 5;
    for (let r = 1; r <= dataRows.length + 1; ++r) { [netoCol, netoCol + 1, netoCol + 2].forEach(c => { const cellAddress = XLSX.utils.encode_cell({r,c}); if (worksheet[cellAddress] && typeof worksheet[cellAddress].v === 'number') { worksheet[cellAddress].t = 'n'; worksheet[cellAddress].z = currencyFormat; } }); }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Detalle_Gastos');
    XLSX.writeFile(workbook, `Gastos_${esAdminReport ? 'Admin_Global' : (viajeSeleccionadoInfo?.codigo_rendicion || 'General')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const generateAdminResumenTiposGastoExcel = (dataCalculada, fileNamePrefix = 'Admin_ResumenDetalladoTipo') => {
    const { rawData, totales } = dataCalculada;
    if (!rawData || rawData.length === 0) { return; }
    const headers = ["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"];
    const dataRows = rawData.map(item => [item.tipo_gasto, item.moneda, item.neto, item.iva, item.bruto]);
    const footerRow = [`TOTAL GENERAL (${totales.moneda})`, "", totales.neto, totales.iva, totales.bruto];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    worksheet['!cols'] = [{wch:30},{wch:10},{wch:20},{wch:20},{wch:20}];
    const currencyFormat = '#,##0.00';
    for (let r = 1; r <= dataRows.length + 1; ++r) { [2,3,4].forEach(c => { const cell = worksheet[XLSX.utils.encode_cell({r,c})]; if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = currencyFormat; }}); }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'ResumenGerencialPorTipo');
    XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const generateAdminResumenTiposGastoPDF = (dataCalculada, fileNamePrefix = 'Admin_ResumenDetalladoTipo') => {
    const { body, foot } = dataCalculada;
    if (!body || body.length === 0) { return; }
    const doc = new jsPDF(); const margin = 15; const pageWidth = doc.internal.pageSize.getWidth(); let currentY = margin;
    doc.setFontSize(14); doc.text("Resumen Detallado de Gastos por Tipo y Moneda", pageWidth / 2, currentY, { align: 'center' }); currentY += 10;
    const tableColumn = ["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"];
    doc.autoTable({ head: [tableColumn], body: body, foot: foot, startY: currentY, theme: 'striped', headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 }, footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' }, styles: { fontSize: 8, cellPadding: 1.5 }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    doc.save(`${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const generateResumenGerencialTiposGastoExcel = (dataResumen, fileNamePrefix = 'Admin_ResumenGerencialTipo') => {
    const { detalles, totalesGenerales } = dataResumen;
    if (!detalles || detalles.length === 0) { return; }
    const headers = ["Tipo de Gasto", "Monedas Encontradas", `Total Neto (${totalesGenerales.moneda})`, `Total IVA (${totalesGenerales.moneda})`, `Total Bruto (${totalesGenerales.moneda})`];
    const dataRows = detalles.map(item => [item.tipoGastoNombre, item.monedas, item.totalNeto, item.totalIVA, item.totalBruto]);
    const footerRow = [totalesGenerales.nombre, "", totalesGenerales.neto, totalesGenerales.iva, totalesGenerales.bruto];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    worksheet['!cols'] = [{wch:40},{wch:20},{wch:20},{wch:20},{wch:20}];
    const currencyFormat = '#,##0.00';
    for (let r = 1; r <= dataRows.length + 1; ++r) { [2,3,4].forEach(c => { const cell = worksheet[XLSX.utils.encode_cell({r,c})]; if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = currencyFormat; }}); }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'ResumenGerencialPorTipo');
    XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const generateResumenGerencialTiposGastoPDF = (dataResumen, fileNamePrefix = 'Admin_ResumenGerencialTipo') => {
    const { detalles, totalesGenerales } = dataResumen;
    if (!detalles || detalles.length === 0) { return; }
    const doc = new jsPDF(); const margin = 15; const pageWidth = doc.internal.pageSize.getWidth(); let currentY = margin;
    doc.setFontSize(14); doc.text("Resumen Gerencial de Gastos por Tipo", pageWidth / 2, currentY, { align: 'center' }); currentY += 10;
    const tableColumn = ["Tipo de Gasto", "Monedas Encontradas", `Total Neto (${totalesGenerales.moneda})`, `Total IVA (${totalesGenerales.moneda})`, `Total Bruto (${totalesGenerales.moneda})`];
    const tableRows = detalles.map(item => [item.tipoGastoNombre,item.monedas,formatCurrency(item.totalNeto,totalesGenerales.moneda),formatCurrency(item.totalIVA,totalesGenerales.moneda),formatCurrency(item.totalBruto,totalesGenerales.moneda)]);
    const tableFoot = [[{ content: totalesGenerales.nombre, colSpan:2, styles: { halign: 'left', fontStyle: 'bold'} }, formatCurrency(totalesGenerales.neto,totalesGenerales.moneda), formatCurrency(totalesGenerales.iva,totalesGenerales.moneda), formatCurrency(totalesGenerales.bruto,totalesGenerales.moneda)]];
    doc.autoTable({ head: [tableColumn], body: tableRows, foot: tableFoot, startY: currentY, theme: 'grid', headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 }, footStyles: { fillColor: [200, 200, 200], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' }, styles: { fontSize: 8, cellPadding: 1.5, overflow: 'visible' }, columnStyles: { 0: { cellWidth: pageWidth * 0.25 }, 1: { cellWidth: pageWidth * 0.15 }, 2: { halign: 'right', cellWidth: pageWidth * 0.15 }, 3: { halign: 'right', cellWidth: pageWidth * 0.15 }, 4: { halign: 'right', cellWidth: pageWidth * 0.15 } } });
    doc.save(`${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`);
  };
    const generateAdminReporteConsolidadoPDF = (gastos, filtrosAplicados = {}, fileNamePrefix = 'Reporte_Consolidado_Admin') => {
    if (!gastos || gastos.length === 0) { alert('No hay gastos para generar el reporte consolidado PDF.'); return; }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let currentY = margin;
    doc.setFontSize(18).setFont(undefined, 'bold').text("Reporte Consolidado de Gastos (Admin)", pageWidth / 2, currentY, { align: 'center' });
    currentY += 30;
    doc.setFontSize(10).setFont(undefined, 'normal');
    let filtroTexto = "Período de Gastos: Todos los gastos cargados.";
    if (filtrosAplicados.fechaDesde || filtrosAplicados.fechaHasta) { const desde = filtrosAplicados.fechaDesde ? formatDate(filtrosAplicados.fechaDesde) : 'Inicio'; const hasta = filtrosAplicados.fechaHasta ? formatDate(filtrosAplicados.fechaHasta) : 'Fin'; filtroTexto = `Período de Gastos: Desde ${desde} Hasta ${hasta}`; }
    doc.text(filtroTexto, margin, currentY); currentY += 15;
    doc.text(`Generado el: ${formatDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, currentY); currentY += 25;
    doc.setFontSize(12).setFont(undefined, 'bold').text("1. Resumen de Gastos por Tipo y Moneda", margin, currentY); currentY += 20;
    const dataResumenPorTipo = calculateAdminGastosPorTipo(gastos, 'ARS');
    if (dataResumenPorTipo.body.length > 0) { doc.autoTable({ head: [["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"]], body: dataResumenPorTipo.body, foot: dataResumenPorTipo.foot, startY: currentY, theme: 'striped', headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 }, footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' }, styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: pageWidth * 0.25 }, 1: { cellWidth: pageWidth * 0.10 }, 2: { halign: 'right', cellWidth: pageWidth * 0.18 }, 3: { halign: 'right', cellWidth: pageWidth * 0.18 }, 4: { halign: 'right', cellWidth: pageWidth * 0.18 } }, didDrawPage: (data) => { currentY = data.cursor.y + 15; } }); } else { doc.setFontSize(10).setFont(undefined, 'italic').text("No hay datos para el resumen por tipo.", margin, currentY); currentY += 20; }
    currentY = doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY + 25 : currentY + 10;
    if (currentY > pageHeight - 150) { doc.addPage(); currentY = margin; }
    doc.setFontSize(12).setFont(undefined, 'bold').text("2. Detalle Completo de Gastos", margin, currentY); currentY += 20;
    const dataDetalleGastos = prepararDetalleGastosParaLibroIVA(gastos);
    if (dataDetalleGastos.body.length > 0) { doc.autoTable({ head: [["Fecha", "N° Comp.", "Descripción", "Responsable", "Neto", "IVA", "Total"]], body: dataDetalleGastos.body, foot: dataDetalleGastos.foot, startY: currentY, theme: 'grid', headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 }, footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' }, styles: { fontSize: 7, cellPadding: 1.5, overflow: 'ellipsize' }, columnStyles: { 0: { cellWidth: pageWidth * 0.08 }, 1: { cellWidth: pageWidth * 0.10 }, 2: { cellWidth: pageWidth * 0.27 }, 3: { cellWidth: pageWidth * 0.15 }, 4: { halign: 'right', cellWidth: pageWidth * 0.12 }, 5: { halign: 'right', cellWidth: pageWidth * 0.10 }, 6: { halign: 'right', cellWidth: pageWidth * 0.12 } } }); } else { doc.setFontSize(10).setFont(undefined, 'italic').text("No hay gastos detallados para mostrar.", margin, currentY); }
    doc.save(`${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const generateAdminReporteConsolidadoExcel = (gastos, filtrosAplicados = {}, fileNamePrefix = 'Reporte_Consolidado_Admin') => {
    if (!gastos || gastos.length === 0) { alert('No hay gastos para generar el reporte consolidado Excel.'); return; }
    const workbook = XLSX.utils.book_new();
    const dataResumenPorTipo = calculateAdminGastosPorTipo(gastos, 'ARS');
    if (dataResumenPorTipo.rawData.length > 0) {
        const headersResumen = ["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"];
        const dataRowsResumen = dataResumenPorTipo.rawData.map(item => [ item.tipo_gasto, item.moneda, item.neto, item.iva, item.bruto ]);
        const footerResumen = [`TOTAL GENERAL (${dataResumenPorTipo.totales.moneda})`, "", dataResumenPorTipo.totales.neto, dataResumenPorTipo.totales.iva, dataResumenPorTipo.totales.bruto];
        const wsResumen = XLSX.utils.aoa_to_sheet([headersResumen, ...dataRowsResumen, footerResumen]);
        wsResumen['!cols'] = [{wch:35},{wch:10},{wch:18},{wch:18},{wch:18}];
        const currencyFormat = '#,##0.00';
        for (let r = 1; r <= dataRowsResumen.length + 1; ++r) { [2,3,4].forEach(c => { const cellAddress = XLSX.utils.encode_cell({r,c}); if (wsResumen[cellAddress] && typeof wsResumen[cellAddress].v === 'number') { wsResumen[cellAddress].t = 'n'; wsResumen[cellAddress].z = currencyFormat; } }); }
        XLSX.utils.book_append_sheet(workbook, wsResumen, 'ResumenPorTipo');
    }
    const dataDetalleGastos = prepararDetalleGastosParaLibroIVA(gastos);
    if (dataDetalleGastos.rawData.length > 0) {
        const headersDetalle = ["Fecha", "N° Comprobante", "Descripción", "Responsable", "Neto", "IVA", "Total", "Moneda", "Viaje/Rendición", "Estado Viaje"];
        const dataRowsDetalle = dataDetalleGastos.rawData.map(item => [ item.fecha, item.n_comp, item.descripcion, item.responsable, item.neto, item.iva, item.total, item.moneda, item.viaje_rendicion, item.estado_viaje ]);
        const footerDetalle = [`TOTALES GENERALES (${dataDetalleGastos.totales.moneda})`, "", "", "", dataDetalleGastos.totales.neto, dataDetalleGastos.totales.iva, dataDetalleGastos.totales.bruto, "", "", ""];
        const wsDetalle = XLSX.utils.aoa_to_sheet([headersDetalle, ...dataRowsDetalle, footerDetalle]);
        wsDetalle['!cols'] = [{wch:12},{wch:20},{wch:40},{wch:30},{wch:15},{wch:15},{wch:15},{wch:10},{wch:30},{wch:20}];
        const currencyFormat = '#,##0.00';
        for (let r = 1; r <= dataRowsDetalle.length + 1; ++r) { [4,5,6].forEach(c => { const cellAddress = XLSX.utils.encode_cell({r,c}); if (wsDetalle[cellAddress] && typeof wsDetalle[cellAddress].v === 'number') { wsDetalle[cellAddress].t = 'n'; wsDetalle[cellAddress].z = currencyFormat; } }); }
        XLSX.utils.book_append_sheet(workbook, wsDetalle, 'DetalleDeGastos');
    }
    let filtroTextoSheet = [["Filtros Aplicados al Reporte Consolidado"]];
    if (filtrosAplicados.fechaDesde || filtrosAplicados.fechaHasta) { const desde = filtrosAplicados.fechaDesde ? formatDate(filtrosAplicados.fechaDesde) : 'Inicio del registro'; const hasta = filtrosAplicados.fechaHasta ? formatDate(filtrosAplicados.fechaHasta) : 'Fin del registro'; filtroTextoSheet.push(["Período de Gastos:", `Desde ${desde} Hasta ${hasta}`]); } else { filtroTextoSheet.push(["Período de Gastos:", "Todos los gastos cargados."]); }
    filtroTextoSheet.push(["Generado el:", formatDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })]);
    const wsFiltros = XLSX.utils.aoa_to_sheet(filtroTextoSheet);
    wsFiltros['!cols'] = [{wch:25},{wch:50}];
    XLSX.utils.book_append_sheet(workbook, wsFiltros, 'InfoReporte');
    if (workbook.SheetNames.length > 0) { XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`); } else { alert("No se pudo generar ninguna hoja en el reporte Excel debido a la falta de datos."); }
  };

  const generateUserReportPDF = (kpis, tableData, pieChartImage, lineChartImage, filterInfo) => {
    const doc = new jsPDF({ orientation: 'p', unit: 'px', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let currentY = margin;
    doc.setFontSize(18).setFont(undefined, 'bold').text("Reporte de Gastos", pageWidth / 2, currentY, { align: 'center' });
    currentY += 25;
    doc.setFontSize(11).setFont(undefined, 'normal');
    const periodoStr = `Período del reporte: ${formatDate(filterInfo.fechaDesde)} al ${formatDate(filterInfo.fechaHasta)}`;
    doc.text(periodoStr, pageWidth / 2, currentY, { align: 'center' });
    currentY += 35;
    doc.setFontSize(12).setFont(undefined, 'bold').text("Indicadores Clave", margin, currentY);
    currentY += 20;
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(`- Total Gastado en el Período: ${formatCurrency(kpis.total_gastado_periodo, 'ARS')}`, margin + 10, currentY);
    currentY += 15;
    doc.text(`- Rendiciones Abiertas Actualmente: ${kpis.rendiciones_abiertas}`, margin + 10, currentY);
    currentY += 35;
    doc.setFontSize(12).setFont(undefined, 'bold').text("Visualización de Datos", margin, currentY);
    currentY += 20;
    const chartWidth = (pageWidth - (margin * 2) - 10) / 2;
    const chartHeight = chartWidth * 0.75;
    if (pieChartImage) doc.addImage(pieChartImage, 'PNG', margin, currentY, chartWidth, chartHeight);
    if (lineChartImage) doc.addImage(lineChartImage, 'PNG', margin + chartWidth + 10, currentY, chartWidth, chartHeight);
    currentY += chartHeight + 35;
    doc.setFontSize(12).setFont(undefined, 'bold').text("Detalle de Gastos por Tipo", margin, currentY);
    currentY += 20;
    const head = [["Tipo de Gasto", "Monto Total"]];
    const body = tableData.map(item => [item.tipo_gasto_nombre, formatCurrency(item.total_monto, 'ARS')]);
    doc.autoTable({ head, body, startY: currentY, theme: 'striped', headStyles: { fillColor: [13, 47, 91] }, styles: { cellPadding: 4 }, columnStyles: { 1: { halign: 'right' } } });
    doc.save(`Reporte_Gastos_${new Date().toISOString().split('T')[0]}.pdf`);
  };
  return {
    generateCanvaStylePDF, // Exportamos la nueva función
    // --- Resto de exportaciones existentes ---
    calculateAdminGastosPorTipo,
    calculateResumenGerencialPorTipo,
    prepararDetalleGastosParaLibroIVA,
    generateGastosPDF,
    generateGastosExcel,
    generateAdminResumenTiposGastoExcel,
    generateAdminResumenTiposGastoPDF,
    generateResumenGerencialTiposGastoExcel,
    generateResumenGerencialTiposGastoPDF,
    generateAdminReporteConsolidadoPDF,
    generateAdminReporteConsolidadoExcel,
    generateUserReportPDF,

  };
}