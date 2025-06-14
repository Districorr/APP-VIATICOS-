// src/composables/useReportGenerator.js
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate, formatCurrency } from '../utils/formatters.js';

// Asume que tienes un logo en la carpeta public. Si no, puedes comentar la sección de la marca de agua.
// const logoBase64 = '...'; // El logo cargado dinámicamente es mejor.

export function useReportGenerator() {

  // --- FUNCIONES AUXILIARES ---
  const getValoresMonetariosGasto = (gasto) => {
    if (!gasto || typeof gasto !== 'object') {
        return { neto: 0, iva: 0, total: 0 };
    }
    const totalBruto = parseFloat(gasto.gasto_monto_total || gasto.monto_total) || 0;
    const iva = parseFloat(gasto.gasto_monto_iva || gasto.monto_iva) || 0;
    const neto = totalBruto - iva; 
    return { neto, iva, total: totalBruto };
  };

  // --- ¡NUEVA FUNCIÓN AUXILIAR PARA DESCRIPCIÓN COMPLETA! ---
  const formatearDescripcionCompleta = (gasto) => {
    let descripcionFinal = gasto.descripcion_general || '-';

    // Mapeo de nombres técnicos a etiquetas legibles para el PDF
    const etiquetas = {
      cliente_referido: 'Cliente',
      transporte_referido: 'Transporte',
      paciente_referido: 'Paciente',
      // Añade aquí más mapeos si creas nuevos campos opcionales
    };

    if (gasto.datos_adicionales && typeof gasto.datos_adicionales === 'object') {
      for (const key in gasto.datos_adicionales) {
        const valor = gasto.datos_adicionales[key];
        if (valor) { // Solo añadir si el campo tiene un valor
          // Usa la etiqueta del mapeo, o formatea el nombre del campo si no existe
          const etiqueta = etiquetas[key] || key.replace(/_/g, ' ').replace(/(^\w{1})|(\s+\w{1})/g, letra => letra.toUpperCase());
          descripcionFinal += `\n(${etiqueta}: ${valor})`;
        }
      }
    }
    return descripcionFinal;
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
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'ResumenDetalladoPorTipo');
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

  const generateRendicionCompletaPDF = async (gastos, viajeInfo, userInfo, totales) => {
    if (!viajeInfo || !userInfo || !totales) {
      alert("Faltan datos esenciales para generar la rendición (viaje, usuario o totales).");
      return;
    }
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let currentY = 15;

    try {
      const response = await fetch('/districorr-logo-circular.png');
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      await new Promise(resolve => reader.onload = resolve);
      const logoImgData = reader.result;
      
      const imgProps = doc.getImageProperties(logoImgData);
      const imgWidth = 120;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({opacity: 0.08}));
      doc.addImage(logoImgData, 'PNG', x, y, imgWidth, imgHeight);
      doc.restoreGraphicsState();
    } catch (e) {
      console.error("No se pudo cargar el logo para la marca de agua:", e);
    }

    doc.setFontSize(20).setFont(undefined, 'bold').setTextColor(0, 74, 153);
    doc.text("InfoGastos Districorr", pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;
    doc.setFontSize(12).setFont(undefined, 'normal').setTextColor(40, 40, 40);
    doc.text("Reporte de Rendición de Gastos", pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;
    doc.setLineWidth(0.2).line(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;
    doc.setTextColor(0, 0, 0);

    const col1X = margin;
    const col2X = pageWidth / 2 + 10;
    const labelOffset = 35;
    doc.setFontSize(9);
    const infoFields = [
      { label1: "Responsable:", value1: userInfo.nombre_completo || 'N/A', label2: "Fecha Emisión:", value2: formatDate(new Date()) },
      { label1: "Referencia:", value1: viajeInfo.nombre_viaje || 'N/A', label2: "ID:", value2: `#${viajeInfo.codigo_rendicion || viajeInfo.id}` },
      { label1: "Período:", value1: `${formatDate(viajeInfo.fecha_inicio)} al ${formatDate(viajeInfo.fecha_fin || new Date())}` },
      { label1: "Adelanto del Viaje:", value1: formatCurrency(viajeInfo.monto_adelanto), color1: [0, 100, 0] },
      { label1: "Adelantos Extras:", value1: formatCurrency(totales.adelantosExtras), color1: [0, 100, 0] },
      { label1: "Estado:", value1: viajeInfo.cerrado_en ? 'CERRADO' : 'EN CURSO', color1: viajeInfo.cerrado_en ? [200, 0, 0] : [0, 100, 0] }
    ];
    infoFields.forEach(field => {
      doc.setFont(undefined, 'bold'); doc.text(field.label1, col1X, currentY);
      doc.setFont(undefined, 'normal');
      if (field.color1) doc.setTextColor(field.color1[0], field.color1[1], field.color1[2]);
      doc.text(String(field.value1), col1X + labelOffset, currentY);
      doc.setTextColor(0,0,0);
      if (field.label2) {
        doc.setFont(undefined, 'bold'); doc.text(field.label2, col2X, currentY);
        doc.setFont(undefined, 'normal'); doc.text(String(field.value2), col2X + labelOffset, currentY);
      }
      currentY += 6;
    });
    currentY += 8;

    const head = [['Fecha', 'Tipo', 'Descripción Detallada', 'N° Fact.', 'IVA', 'Monto Total']];
    const body = gastos.map(g => {
      const v = getValoresMonetariosGasto(g);
      const descripcionCompleta = formatearDescripcionCompleta(g);
      return [
        formatDate(g.fecha_gasto),
        g.tipos_gasto_config?.nombre_tipo_gasto || 'N/A',
        descripcionCompleta,
        g.numero_factura || '-',
        formatCurrency(v.iva),
        formatCurrency(v.total)
      ];
    });
    doc.autoTable({
      head, body,
      startY: currentY,
      theme: 'striped',
      headStyles: { fillColor: [0, 74, 153], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], cellWidth: 'wrap' },
      columnStyles: { 2: { cellWidth: 65 }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    currentY = doc.lastAutoTable.finalY + 10;

    const resumenPorTipo = gastos.reduce((acc, g) => { const tipo = g.tipos_gasto_config?.nombre_tipo_gasto || 'Sin Tipo'; acc[tipo] = (acc[tipo] || 0) + (g.monto_total || 0); return acc; }, {});
    const resumenBody = Object.entries(resumenPorTipo).map(([tipo, monto]) => [tipo, formatCurrency(monto)]);
    
    let resumenTableY = currentY;
    let totalsY = currentY;
    const totalsX = pageWidth / 2 + 20;

    doc.autoTable({
      head: [['Resumen por Tipo de Gasto (Bruto)']],
      body: resumenBody,
      startY: resumenTableY,
      theme: 'plain',
      tableWidth: pageWidth / 2 - margin,
      headStyles: { fontStyle: 'bold', fontSize: 9, textColor: [0,0,0] },
      styles: { fontSize: 8, cellPadding: 1.5, textColor: [0,0,0] },
      columnStyles: { 1: { halign: 'right' } }
    });

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold'); doc.text("Total Adelantos Disponibles:", totalsX, totalsY, { align: 'right' });
    doc.setTextColor(0, 100, 0); doc.text(formatCurrency(totales.adelantosDisponibles), pageWidth - margin, totalsY, { align: 'right' });
    doc.setTextColor(0, 0, 0); totalsY += 12;
    doc.setFont(undefined, 'normal'); doc.text("Total Gastos (Bruto):", totalsX, totalsY, { align: 'right' });
    doc.text(formatCurrency(totales.gastosBruto), pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 8;
    doc.setLineWidth(0.2).line(totalsX, totalsY, pageWidth - margin, totalsY);
    totalsY += 8;
    doc.setFontSize(11).setFont(undefined, 'bold').setTextColor(200, 0, 0);
    const saldoText = totales.saldoFinal >= 0 ? 'SALDO A FAVOR:' : 'A REPONER:';
    doc.text(saldoText, totalsX, totalsY, { align: 'right' });
    doc.text(formatCurrency(Math.abs(totales.saldoFinal)), pageWidth - margin, totalsY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    
    const firmaY = doc.internal.pageSize.getHeight() - 40;
    doc.setLineWidth(0.2);
    doc.setFontSize(8);
    doc.line(margin, firmaY, margin + 60, firmaY); doc.text("Firma Responsable", margin, firmaY + 5);
    doc.line(pageWidth - margin - 60, firmaY, pageWidth - margin, firmaY); doc.text("Firma Gerencia", pageWidth - margin - 60, firmaY + 5);
    
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    doc.setFontSize(7);
    doc.text("CUIT: 30-71598290-7 | 9 DE JULIO 1251 | Districorr InfoGastos - Uso Interno", pageWidth / 2, footerY, { align: 'center' });
    doc.text(`Página 1 de 1`, pageWidth - margin, footerY, { align: 'right' });

    doc.save(`Rendicion_${viajeInfo.codigo_rendicion || viajeInfo.id}.pdf`);
  };

  return {
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
    generateRendicionCompletaPDF,
  };
}