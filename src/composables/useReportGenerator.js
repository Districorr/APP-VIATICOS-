// src/composables/useReportGenerator.js
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import logoImg from '/districorr-logo-circular (2).png';

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

  // --- INICIO DE MI MODIFICACIÓN (Bloque 1) ---
  const formatearDescripcionCompleta = (gasto) => {
    // La descripción principal es la que el usuario escribe.
    const descripcionPrincipal = gasto.descripcion_general || '-';
    
    // Los detalles secundarios se recopilan en un array.
    let detallesSecundarios = [];
    
    // Añadimos los detalles de las relaciones (si existen)
    if (gasto.clientes && gasto.clientes.nombre_cliente) {
      detallesSecundarios.push(`Cliente: ${gasto.clientes.nombre_cliente}`);
    }
    if (gasto.transportes && gasto.transportes.nombre) {
      detallesSecundarios.push(`Transporte: ${gasto.transportes.nombre}`);
    }
    
    // Añadimos los detalles del JSONB
    if (gasto.datos_adicionales && typeof gasto.datos_adicionales === 'object') {
      const etiquetas = { paciente_referido: 'Paciente' };
      for (const key in gasto.datos_adicionales) {
        const valor = gasto.datos_adicionales[key];
        if (valor) {
          const etiqueta = etiquetas[key] || key.replace(/_/g, ' ').replace(/(^\w{1})|(\s+\w{1})/g, letra => letra.toUpperCase());
          detallesSecundarios.push(`${etiqueta}: ${valor}`);
        }
      }
    }
    
    // Unimos los detalles secundarios en una sola cadena, separados por " | "
    const detallesFormateados = detallesSecundarios.join(' | ');

    return {
      principal: descripcionPrincipal,
      secundarios: detallesFormateados
    };
  };
  // --- FIN DE MI MODIFICACIÓN (Bloque 1) ---

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

// Reemplaza la función existente con esta versión mejorada

  const generateRendicionCompletaPDF = async (gastos, viajeInfo, userInfo, totales) => {
    if (!viajeInfo || !userInfo || !totales) {
      alert("Faltan datos esenciales para generar la rendición (viaje, usuario o totales).");
      return;
    }
    
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let currentY = 0;

    // --- 1. PRE-CÁLCULO DE DATOS PARA RESÚMENES ---
    const resumenPorTipo = gastos.reduce((acc, g) => {
      const tipo = g.tipos_gasto_config?.nombre_tipo_gasto || 'Sin Tipo';
      acc[tipo] = (acc[tipo] || 0) + (g.monto_total || 0);
      return acc;
    }, {});

    const resumenPorProvincia = gastos.reduce((acc, g) => {
      const provinciaKey = g.provincia || 'Sin especificar';
      acc[provinciaKey] = (acc[provinciaKey] || 0) + (g.monto_total || 0);
      return acc;
    }, {});

    // --- 2. ENCABEZADO Y PIE DE PÁGINA (Función reutilizable) ---
    const pageContent = (data) => {
      if (data.pageNumber === 1) {
        if (logoImg) {
          try { doc.addImage(logoImg, 'PNG', margin, 12, 20, 20); } catch (e) { console.error("Error al añadir logo:", e); }
        }
        doc.setFontSize(18).setFont(undefined, 'bold');
        doc.text("Informe de Rendición de Gastos", pageWidth - margin, 20, { align: 'right' });
        doc.setFontSize(10).setFont(undefined, 'normal').setTextColor(100);
        doc.text("Sistema InfoGastos – Districorr", pageWidth - margin, 27, { align: 'right' });
        doc.setLineWidth(0.5).line(margin, 32, pageWidth - margin, 32);
      }
      
      doc.setLineWidth(0.2).line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
      doc.setFontSize(8).setTextColor(128);
      const footerText = `CUIT: 30-71598290-7 | 9 DE JULIO 1251 | Reporte generado automáticamente desde InfoGastos`;
      doc.text(footerText, margin, pageHeight - 10);
      doc.text(`Página ${data.pageNumber} de ${doc.internal.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    };
    
    pageContent({ pageNumber: 1 });
    currentY = 37;

    // --- 3. SECCIÓN DE INFORMACIÓN CLAVE ---
    const infoBody = [
      [{content: 'Responsable:', styles: {fontStyle: 'bold'}}, userInfo.nombre_completo || 'N/A', {content: 'Fecha Emisión:', styles: {fontStyle: 'bold'}}, formatDate(new Date())],
      [{content: 'Referencia:', styles: {fontStyle: 'bold'}}, viajeInfo.nombre_viaje || 'N/A', {content: 'ID:', styles: {fontStyle: 'bold'}}, `#${viajeInfo.codigo_rendicion || viajeInfo.id}`],
      [{content: 'Período:', styles: {fontStyle: 'bold'}}, `${formatDate(viajeInfo.fecha_inicio)} al ${formatDate(viajeInfo.fecha_fin || new Date())}`, {content: 'Estado:', styles: {fontStyle: 'bold'}}, {content: viajeInfo.cerrado_en ? 'CERRADO' : 'EN CURSO', styles: {textColor: viajeInfo.cerrado_en ? [200, 0, 0] : [0, 100, 0], fontStyle: 'bold'}}],
    ];
    doc.autoTable({
      body: infoBody, startY: currentY, theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1, textColor: [0,0,0] },
      columnStyles: { 0: {cellWidth: 25}, 2: {cellWidth: 30} }
    });
    currentY = doc.lastAutoTable.finalY + 8;

    // --- 4. LISTADO DE GASTOS (Tabla con jspdf-autotable) ---
    const head = [['Fecha / Tipo', 'Provincia', 'Descripción Detallada', 'Monto Total']];
    const body = gastos.map(g => {
      const desc = formatearDescripcionCompleta(g);
      // Combinamos fecha y tipo en una sola celda con salto de línea
      const fechaTipo = `${formatDate(g.fecha_gasto)}\n${g.tipos_gasto_config?.nombre_tipo_gasto || 'N/A'}`;
      // Combinamos descripción principal y secundaria en una sola celda
      const descripcionCompleta = `${desc.principal}${desc.secundarios ? '\n' + desc.secundarios : ''}`;
      
      return [
        fechaTipo,
        g.provincia || '-',
        descripcionCompleta,
        formatCurrency(g.monto_total)
      ];
    });

    doc.autoTable({
      head: head,
      body: body,
      startY: currentY,
      theme: 'grid', // Usamos 'grid' para tener todas las líneas
      headStyles: {
        fillColor: [44, 62, 80], // Azul oscuro
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 30 }, // Fecha / Tipo
        1: { cellWidth: 30 }, // Provincia
        2: { cellWidth: 'auto' }, // Descripción
        3: { halign: 'right', cellWidth: 30 } // Monto
      },
      didDrawCell: (data) => {
        // Estilo para la segunda línea (tipo de gasto y detalles secundarios)
        if (data.section === 'body') {
          const cellText = data.cell.text;
          if (Array.isArray(cellText) && cellText.length > 1) {
            // Si el texto es un array (por el \n), podemos estilizar la segunda línea
            const secondLine = cellText[1];
            if (data.column.index === 0 || data.column.index === 2) { // Aplicar solo a Fecha/Tipo y Descripción
              doc.setFont(undefined, 'italic');
              doc.setFontSize(7);
              doc.setTextColor(120, 120, 120);
            }
          }
        }
      },
      didDrawPage: pageContent
    });

    currentY = doc.lastAutoTable.finalY + 10;

    // --- 5. RESÚMENES FINALES ---
    if (currentY > pageHeight - 80) { doc.addPage(); pageContent({ pageNumber: doc.internal.getNumberOfPages() }); currentY = 37; }

    const resumenTipoBody = Object.entries(resumenPorTipo).map(([tipo, monto]) => [tipo, formatCurrency(monto)]);
    const resumenProvinciaBody = Object.entries(resumenPorProvincia).map(([prov, monto]) => [prov, formatCurrency(monto)]);
    
    const resumenHeadStyles = { fontStyle: 'bold', fontSize: 9, fillColor: [230, 230, 230], textColor: [40,40,40] };
    const resumenStyles = { fontSize: 8, cellPadding: 2, lineColor: [150, 150, 150] };

    doc.autoTable({
      head: [['Gastos por Tipo', 'Monto']], body: resumenTipoBody, startY: currentY, theme: 'grid',
      tableWidth: (pageWidth / 2) - margin - 2.5, margin: { left: margin },
      headStyles: resumenHeadStyles, styles: resumenStyles, columnStyles: { 1: { halign: 'right' } }
    });

    doc.autoTable({
      head: [['Gastos por Provincia', 'Monto']], body: resumenProvinciaBody, startY: currentY, theme: 'grid',
      tableWidth: (pageWidth / 2) - margin - 2.5, margin: { left: (pageWidth / 2) + 2.5 },
      headStyles: resumenHeadStyles, styles: resumenStyles, columnStyles: { 1: { halign: 'right' } }
    });
    currentY = doc.lastAutoTable.finalY + 5;

    const resumenFinancieroBody = [
      [{ content: 'Total Adelantos Disponibles:', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totales.adelantosDisponibles), styles: { textColor: [0, 100, 0] } }],
      [{ content: 'Total Gastos (Bruto):', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totales.gastosBruto), styles: { textColor: [200, 0, 0] } }],
      [{ content: totales.saldoFinal >= 0 ? 'SALDO A FAVOR' : 'A REPONER', styles: { fontStyle: 'bold', fillColor: [255, 243, 205] } }, { content: formatCurrency(Math.abs(totales.saldoFinal)), styles: { fontStyle: 'bold', textColor: [200, 0, 0], fillColor: [255, 243, 205] } }]
    ];
    doc.autoTable({
      body: resumenFinancieroBody, startY: currentY, theme: 'grid',
      margin: { left: (pageWidth / 2) + 2.5 },
      styles: { fontSize: 9, cellPadding: 3, lineColor: [150, 150, 150] }, columnStyles: { 1: { halign: 'right' } }
    });

    // --- 6. FIRMAS ---
    const firmaY = pageHeight - 40;
    doc.setLineWidth(0.4).setDrawColor(0,0,0);
    doc.setFontSize(9);
    doc.line(margin, firmaY, margin + 70, firmaY);
    doc.text(userInfo.nombre_completo || 'Nombre de Usuario', margin, firmaY + 5);
    doc.setFontSize(8).setTextColor(0);
    doc.text("Responsable", margin, firmaY + 10);
    doc.setLineWidth(0.4).setFontSize(9).setTextColor(0);
    doc.line(pageWidth - margin - 70, firmaY, pageWidth - margin, firmaY);
    doc.text("Gerencia", pageWidth - margin - 70, firmaY + 5);
    doc.setFontSize(8).setTextColor(0);
    doc.text("Firma Gerencia", pageWidth - margin - 70, firmaY + 10);
    
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