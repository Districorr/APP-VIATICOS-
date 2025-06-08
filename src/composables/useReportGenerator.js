// src/composables/useReportGenerator.js - Bloque 1
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // Importante para que .autoTable esté disponible
import * as XLSX from 'xlsx';
import { formatDate, formatCurrency } from '../utils/formatters.js'; // Ajusta la ruta si es necesario

export function useReportGenerator() {

  // --- BLOQUE 1: FUNCIONES AUXILIARES GENERALES ---

  /**
   * Extrae y calcula los valores monetarios (neto, iva, total) de un objeto gasto.
   * Prioriza campos con prefijo 'gasto_' de vistas consolidadas,
   * luego campos sin prefijo para compatibilidad.
   * @param {object} gasto - El objeto gasto.
   * @returns {object} - { neto, iva, total }
   */
  const getValoresMonetariosGasto = (gasto) => {
    if (!gasto || typeof gasto !== 'object') { // Verificación adicional
        console.warn("getValoresMonetariosGasto: Se recibió un gasto inválido:", gasto);
        return { neto: 0, iva: 0, total: 0 };
    }
    const totalBruto = parseFloat(gasto.gasto_monto_total || gasto.monto_total) || 0;
    const iva = parseFloat(gasto.gasto_monto_iva || gasto.monto_iva) || 0;
    // El neto se calcula como total - iva. Si el IVA no está, el neto es igual al total.
    // Esto asume que si el IVA es 0 o no está, el total es el neto.
    const neto = totalBruto - iva; 
    return { neto, iva, total: totalBruto };
  };

  /**
   * Obtiene las fechas mínima y máxima de una lista de gastos.
   * @param {Array<Object>} gastos - Lista de objetos gasto, cada uno con 'fecha_gasto'.
   * @returns {object} - { min: string | null, max: string | null }
   */
  const getFechaMinMaxGastos = (gastos) => {
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        console.warn("getFechaMinMaxGastos: Se recibió una entrada inválida o vacía para 'gastos'.");
        return { min: null, max: null };
    }
    let minDateObj = null;
    let maxDateObj = null;
    try {
      const gastosConFechaValida = gastos.filter(gasto => gasto && gasto.fecha_gasto);
      if (gastosConFechaValida.length === 0) {
          console.warn("getFechaMinMaxGastos: Ningún gasto con fecha válida encontrado.");
          return { min: null, max: null };
      }

      for (const gasto of gastosConFechaValida) {
        const currentDate = new Date(gasto.fecha_gasto);
        if (!isNaN(currentDate.getTime())) {
          if (minDateObj === null || currentDate < minDateObj) minDateObj = currentDate;
          if (maxDateObj === null || currentDate > maxDateObj) maxDateObj = currentDate;
        } else {
          console.warn("getFechaMinMaxGastos: Fecha inválida encontrada y omitida durante el loop:", gasto.fecha_gasto);
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
  // src/composables/useReportGenerator.js - Bloque 2
  
  /**
   * Calcula el responsable con el mayor gasto total en ARS.
   * @param {Array<Object>} gastos - Lista de objetos gasto.
   * @returns {object} - { nombre: string, total: number, moneda: string }
   */
  const calculateResponsableConMasGasto = (gastos) => {
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        console.warn("calculateResponsableConMasGasto: Se recibió una entrada inválida o vacía para 'gastos'.");
        return { nombre: 'N/A', total: 0, moneda: 'ARS' };
    }
    const gastosPorResponsableARS = {};
    const MONEDA_REPORTE = 'ARS';

    gastos.forEach(gasto => {
      if (!gasto || typeof gasto !== 'object') return; 

      const monedaGasto = (gasto.gasto_moneda || gasto.moneda || 'ARS').toUpperCase();
      if (monedaGasto === MONEDA_REPORTE) { // Solo considerar gastos en ARS para este cálculo específico
        const responsableId = gasto.gasto_user_id || gasto.user_id || 'desconocido'; // Añadir user_id como fallback
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

  // --- FIN DEL BLOQUE 1 ---

  // --- BLOQUE 2: FUNCIONES DE CÁLCULO Y PREPARACIÓN DE DATOS PARA REPORTES ESPECÍFICOS ---

  const calculateAdminGastosPorTipo = (gastos, monedaPrincipalParaTotales = 'ARS') => {
    const resumen = {};
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        console.warn("calculateAdminGastosPorTipo: Entrada 'gastos' inválida o vacía.");
        return { body: [], foot: [], rawData: [], totales: { neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales } };
    }

    gastos.forEach(gasto => {
      if (!gasto || typeof gasto !== 'object') return;
      const tipoNombre = gasto.nombre_tipo_gasto || gasto.tipo_gasto_nombre || 'Sin Tipo Especificado'; // Fallback
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
    // Para los totales generales, si queremos sumarizar todo a ARS, necesitaríamos tasas de conversión.
    // Por ahora, sumaremos los valores brutos tal cual, asumiendo que la moneda principal es para display.
    detallesOrdenados.forEach(item => {
        // Aquí se podría implementar lógica de conversión si fuera necesario antes de sumar a totalesGenerales
        totalesGenerales.neto += item.totalNeto; // Esto suma valores de diferentes monedas sin convertir
        totalesGenerales.iva += item.totalIVA;
        totalesGenerales.bruto += item.totalBruto;
    });

    const bodyForPDF = detallesOrdenados.map(item => [ 
        item.tipoGastoNombre,
        item.moneda, 
        formatCurrency(item.totalNeto, item.moneda),
        formatCurrency(item.totalIVA, item.moneda),
        formatCurrency(item.totalBruto, item.moneda),
    ]);
    
    const footForPDF = [[ 
      { content: `TOTAL GENERAL (${monedaPrincipalParaTotales}):`, colSpan:2, styles: { halign: 'left', fontStyle: 'bold'} },
      { content: formatCurrency(totalesGenerales.neto, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
      { content: formatCurrency(totalesGenerales.iva, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
      { content: formatCurrency(totalesGenerales.bruto, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
    ]];

    const rawDataForExcel = detallesOrdenados.map(item => ({
        tipo_gasto: item.tipoGastoNombre,
        moneda: item.moneda,
        neto: item.totalNeto,
        iva: item.totalIVA,
        bruto: item.totalBruto
    }));

    return { 
        body: bodyForPDF, 
        foot: footForPDF, 
        rawData: rawDataForExcel,
        totales: totalesGenerales
    };
  };// src/composables/useReportGenerator.js - Bloque 3

  const calculateResumenGerencialPorTipo = (gastos, monedaPrincipalParaTotales = 'ARS') => {
    const resumenPorTipo = {}; 
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        console.warn("calculateResumenGerencialPorTipo: Entrada 'gastos' inválida o vacía.");
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
    const monedaTotales = 'ARS'; // Asumimos que los totales generales se expresan en ARS
    const rawDataForExcel = [];
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        return { body: [], foot: [], totales: {neto: 0, iva: 0, bruto: 0, moneda: monedaTotales}, rawData: [] };
    }

    const bodyForPDF = gastos.map(gasto => {
      if (!gasto || typeof gasto !== 'object') return [];
      const valores = getValoresMonetariosGasto(gasto);
      const monedaGastoActual = gasto.gasto_moneda || gasto.moneda || monedaTotales;
      // Para los totales generales, si queremos sumarizar todo a ARS, necesitaríamos tasas de conversión.
      // Por ahora, sumaremos los valores brutos tal cual.
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
        viaje_rendicion: gasto.nombre_viaje || 'N/A', // Añadido
        estado_viaje: gasto.viaje_cerrado_en ? `Cerrado (${formatDate(gasto.viaje_cerrado_en)})` : 'En Curso' // Añadido
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
    }).filter(row => row.length > 0); // Filtrar filas vacías si algún gasto era inválido

    const footForPDF = [[
        { content: `TOTALES GENERALES (${monedaTotales}):`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalNetoGeneral, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalIVAGeneral, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalGeneralBruto, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
    ]];
    return { body: bodyForPDF, foot: footForPDF, totales: {neto: totalNetoGeneral, iva: totalIVAGeneral, bruto: totalGeneralBruto, moneda: monedaTotales}, rawData: rawDataForExcel };
  };
  // --- FIN DEL BLOQUE 2 ---
  // src/composables/useReportGenerator.js - Bloque 4

  // --- BLOQUE 3: FUNCIONES DE GENERACIÓN DE REPORTES Y EXPORTACIÓN FINAL ---

  const generateGastosPDF = (gastos, viajeSeleccionadoInfo, userInfo) => {
    console.log("useReportGenerator: generateGastosPDF (individual) - Iniciando con", gastos?.length, "gastos.");
    if (!gastos || gastos.length === 0) { 
      alert('No hay datos de gastos para generar el PDF de rendición individual.'); 
      console.warn("generateGastosPDF: No hay gastos.");
      return; 
    }
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = margin;

    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("Reporte de Rendición de Gastos", pageWidth / 2, currentY, { align: 'center' });
    currentY += 20;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    if (viajeSeleccionadoInfo) {
      doc.text(`Viaje/Período: ${viajeSeleccionadoInfo.nombre_viaje || 'N/A'} (ID: ${viajeSeleccionadoInfo.codigo_rendicion || viajeSeleccionadoInfo.id})`, margin, currentY); currentY += 12;
      doc.text(`Fechas Viaje: ${formatDate(viajeSeleccionadoInfo.fecha_inicio)} - ${viajeSeleccionadoInfo.fecha_fin ? formatDate(viajeSeleccionadoInfo.fecha_fin) : 'En curso'}`, margin, currentY); currentY += 12;
    }
    if (userInfo) {
      doc.text(`Responsable: ${userInfo.nombre_completo || userInfo.email || 'N/A'}`, margin, currentY); currentY += 12;
    }
    doc.text(`Fecha de Emisión: ${formatDate(new Date())}`, margin, currentY); currentY += 20;
    
    const tableColumn = ["Fecha", "N° Factura", "Descripción", "Neto", "IVA", "Total", "Moneda"];
    const tableRows = gastos.map(g => {
      const valores = getValoresMonetariosGasto(g);
      return [
        formatDate(g.fecha_gasto), 
        g.numero_factura || 'S/N', 
        g.descripcion_general || '-', 
        formatCurrency(valores.neto, g.moneda),
        formatCurrency(valores.iva, g.moneda),
        formatCurrency(valores.total, g.moneda),
        g.moneda || 'ARS'
      ];
    });

    let totalNetoRendicion = 0, totalIVARendicion = 0, totalBrutoRendicion = 0;
    gastos.forEach(g => {
        const valores = getValoresMonetariosGasto(g);
        totalNetoRendicion += valores.neto;
        totalIVARendicion += valores.iva;
        totalBrutoRendicion += valores.total;
    });
    const monedaPrincipal = viajeSeleccionadoInfo?.moneda_adelanto || 'ARS';

    const tableFoot = [[
        { content: 'TOTALES DE LA RENDICIÓN:', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalNetoRendicion, monedaPrincipal), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalIVARendicion, monedaPrincipal), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalBrutoRendicion, monedaPrincipal), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: '', styles: { halign: 'right', fontStyle: 'bold'} }, // Celda vacía para columna Moneda
    ]];

    doc.autoTable({ 
      head: [tableColumn], 
      body: tableRows, 
      foot: tableFoot,
      startY: currentY,
      theme: 'striped',
      headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' },
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      columnStyles: { 
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }
      },
      didDrawPage: (data) => { currentY = data.cursor.y + 15; }
    });
    
    // Información del Adelanto y Saldo (si aplica)
    if (viajeSeleccionadoInfo && typeof viajeSeleccionadoInfo.monto_adelanto === 'number') {
        currentY = doc.lastAutoTable.finalY + 20; // Posición después de la tabla
        if (currentY > doc.internal.pageSize.getHeight() - 60) { // Si no hay espacio, nueva página
            doc.addPage();
            currentY = margin;
        }
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Resumen del Adelanto:', margin, currentY); currentY += 15;
        doc.setFont(undefined, 'normal');
        doc.text(`Monto del Adelanto: ${formatCurrency(viajeSeleccionadoInfo.monto_adelanto, monedaPrincipal)}`, margin + 5, currentY); currentY += 12;
        doc.text(`Total Gastado (aplicado al adelanto): ${formatCurrency(totalBrutoRendicion, monedaPrincipal)}`, margin + 5, currentY); currentY += 12;
        const saldo = (viajeSeleccionadoInfo.monto_adelanto || 0) - totalBrutoRendicion;
        doc.setFont(undefined, 'bold');
        doc.text(`Saldo del Adelanto: ${formatCurrency(saldo, monedaPrincipal)} (${saldo >= 0 ? 'A favor del responsable' : 'A reintegrar por el responsable'})`, margin + 5, currentY);
    }

    doc.save(`Rendicion_${viajeSeleccionadoInfo?.codigo_rendicion || 'General'}_${new Date().toISOString().split('T')[0]}.pdf`);
    console.log("useReportGenerator: PDF de rendición individual generado.");
  };
  // src/composables/useReportGenerator.js - Bloque 5

  const generateGastosExcel = (gastos, viajeSeleccionadoInfo, userInfo, esAdminReport = false) => {
    console.log("useReportGenerator: generateGastosExcel - Iniciando con", gastos?.length, "gastos. Es Admin:", esAdminReport);
    if (!gastos || gastos.length === 0) { 
      alert('No hay datos de gastos para generar el archivo Excel.'); 
      console.warn("generateGastosExcel: No hay gastos.");
      return; 
    }
    
    const headers = ["Fecha Gasto", "N° Factura", "Descripción", "Proveedor", "Tipo de Gasto", "Neto", "IVA", "Total Bruto", "Moneda"];
    if (esAdminReport) { // Si es reporte de admin, añadir columnas de responsable y viaje
        headers.unshift("Viaje/Período");
        headers.unshift("Responsable");
    }

    const dataRows = gastos.map(g => {
      const valores = getValoresMonetariosGasto(g);
      let row = [
        formatDate(g.fecha_gasto), 
        g.numero_factura || 'S/N', 
        g.descripcion_general || '-',
        g.proveedor_nombre || '-', // Asumiendo que tienes este campo
        g.tipo_gasto_nombre || g.nombre_tipo_gasto || '-', // Asumiendo que tienes este campo
        valores.neto,
        valores.iva,
        valores.total,
        g.moneda || 'ARS'
      ];
      if (esAdminReport) {
        row.unshift(g.nombre_viaje || '-'); // Nombre del viaje/período
        row.unshift(g.responsable_gasto_nombre || g.responsable_nombre || userInfo?.nombre_completo || 'N/A');
      }
      return row;
    });

    // Calcular totales
    let totalNetoGeneral = 0, totalIVAGeneral = 0, totalBrutoGeneral = 0;
    gastos.forEach(g => {
        const valores = getValoresMonetariosGasto(g);
        totalNetoGeneral += valores.neto;
        totalIVAGeneral += valores.iva;
        totalBrutoGeneral += valores.total;
    });
    
    const footerRow = ["TOTALES", "", "", "", "", totalNetoGeneral, totalIVAGeneral, totalBrutoGeneral, "ARS"];
    if (esAdminReport) {
        footerRow.unshift(""); // Celda vacía para columna Viaje
        footerRow.unshift(""); // Celda vacía para columna Responsable
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    
    // Ajustar anchos de columna (aproximado)
    const colWidths = esAdminReport 
        ? [{wch:25},{wch:25},{wch:12},{wch:15},{wch:30},{wch:20},{wch:20},{wch:12},{wch:12},{wch:12},{wch:8}] 
        : [{wch:12},{wch:15},{wch:40},{wch:25},{wch:25},{wch:12},{wch:12},{wch:12},{wch:8}];
    worksheet['!cols'] = colWidths;

    // Aplicar formato de moneda
    const currencyFormat = '#,##0.00';
    const netoCol = esAdminReport ? 5 : 5; // Ajustar índice de columna
    for (let r = 1; r <= dataRows.length + 1; ++r) { // +1 para incluir la fila de totales
        [netoCol, netoCol + 1, netoCol + 2].forEach(c => { 
            const cellAddress = XLSX.utils.encode_cell({r,c});
            if (worksheet[cellAddress] && typeof worksheet[cellAddress].v === 'number') {
                worksheet[cellAddress].t = 'n';
                worksheet[cellAddress].z = currencyFormat;
            }
        });
    }
    
    const workbook = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Detalle_Gastos');
    
    const fileName = `Gastos_${esAdminReport ? 'Admin_Global' : (viajeSeleccionadoInfo?.codigo_rendicion || 'General')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    console.log("useReportGenerator: Archivo Excel generado:", fileName);
  };
  
  const generateAdminResumenTiposGastoExcel = (dataCalculada, fileNamePrefix = 'Admin_ResumenDetalladoTipo') => {
    const { rawData, totales } = dataCalculada;
    if (!rawData || rawData.length === 0) { console.warn('No hay datos para Resumen Detallado Excel.'); return; }
    const headers = ["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"];
    const dataRows = rawData.map(item => [item.tipo_gasto, item.moneda, item.neto, item.iva, item.bruto]);
    const footerRow = [`TOTAL GENERAL (${totales.moneda})`, "", totales.neto, totales.iva, totales.bruto];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    worksheet['!cols'] = [{wch:30},{wch:10},{wch:20},{wch:20},{wch:20}];
    const currencyFormat = '#,##0.00';
    for (let r = 1; r <= dataRows.length + 1; ++r) { [2,3,4].forEach(c => { const cell = worksheet[XLSX.utils.encode_cell({r,c})]; if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = currencyFormat; }}); }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'ResumenDetalladoPorTipo');
    XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
    console.log("Resumen Detallado por Tipo (Excel) generado.");
  };
  // src/composables/useReportGenerator.js - Bloque 6

  const generateAdminResumenTiposGastoPDF = (dataCalculada, fileNamePrefix = 'Admin_ResumenDetalladoTipo') => {
    const { body, foot } = dataCalculada;
    if (!body || body.length === 0) { console.warn('No hay datos para Resumen Detallado PDF.'); return; }
    const doc = new jsPDF(); const margin = 15; const pageWidth = doc.internal.pageSize.getWidth(); let currentY = margin;
    doc.setFontSize(14); doc.text("Resumen Detallado de Gastos por Tipo y Moneda", pageWidth / 2, currentY, { align: 'center' }); currentY += 10;
    const tableColumn = ["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"];
    doc.autoTable({ 
      head: [tableColumn], body: body, foot: foot, startY: currentY, theme: 'striped',
      headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' },
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
    doc.save(`${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`);
    console.log("Resumen Detallado por Tipo (PDF) generado.");
  };

  const generateResumenGerencialTiposGastoExcel = (dataResumen, fileNamePrefix = 'Admin_ResumenGerencialTipo') => {
    const { detalles, totalesGenerales } = dataResumen;
    if (!detalles || detalles.length === 0) { console.warn('No hay datos para Resumen Gerencial Excel.'); return; }
    const headers = ["Tipo de Gasto", "Monedas Encontradas", `Total Neto (${totalesGenerales.moneda})`, `Total IVA (${totalesGenerales.moneda})`, `Total Bruto (${totalesGenerales.moneda})`];
    const dataRows = detalles.map(item => [item.tipoGastoNombre, item.monedas, item.totalNeto, item.totalIVA, item.totalBruto]);
    const footerRow = [totalesGenerales.nombre, "", totalesGenerales.neto, totalesGenerales.iva, totalesGenerales.bruto];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    worksheet['!cols'] = [{wch:40},{wch:20},{wch:20},{wch:20},{wch:20}];
    const currencyFormat = '#,##0.00';
    for (let r = 1; r <= dataRows.length + 1; ++r) { [2,3,4].forEach(c => { const cell = worksheet[XLSX.utils.encode_cell({r,c})]; if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = currencyFormat; }}); }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'ResumenGerencialPorTipo');
    XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
    console.log("Resumen Gerencial por Tipo (Excel) generado.");
  };

  const generateResumenGerencialTiposGastoPDF = (dataResumen, fileNamePrefix = 'Admin_ResumenGerencialTipo') => { 
    const { detalles, totalesGenerales } = dataResumen;
    if (!detalles || detalles.length === 0) { console.warn('No hay datos para Resumen Gerencial PDF.'); return; }
    const doc = new jsPDF(); const margin = 15; const pageWidth = doc.internal.pageSize.getWidth(); let currentY = margin;
    doc.setFontSize(14); doc.text("Resumen Gerencial de Gastos por Tipo", pageWidth / 2, currentY, { align: 'center' }); currentY += 10;
    const tableColumn = ["Tipo de Gasto", "Monedas Encontradas", `Total Neto (${totalesGenerales.moneda})`, `Total IVA (${totalesGenerales.moneda})`, `Total Bruto (${totalesGenerales.moneda})`];
    const tableRows = detalles.map(item => [item.tipoGastoNombre,item.monedas,formatCurrency(item.totalNeto,totalesGenerales.moneda),formatCurrency(item.totalIVA,totalesGenerales.moneda),formatCurrency(item.totalBruto,totalesGenerales.moneda)]);
    const tableFoot = [[{ content: totalesGenerales.nombre, colSpan:2, styles: { halign: 'left', fontStyle: 'bold'} }, formatCurrency(totalesGenerales.neto,totalesGenerales.moneda), formatCurrency(totalesGenerales.iva,totalesGenerales.moneda), formatCurrency(totalesGenerales.bruto,totalesGenerales.moneda)]];
    doc.autoTable({ 
      head: [tableColumn], body: tableRows, foot: tableFoot, startY: currentY, theme: 'grid',
      headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      footStyles: { fillColor: [200, 200, 200], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' },
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'visible' },
      columnStyles: { 0: { cellWidth: pageWidth * 0.25 }, 1: { cellWidth: pageWidth * 0.15 }, 2: { halign: 'right', cellWidth: pageWidth * 0.15 }, 3: { halign: 'right', cellWidth: pageWidth * 0.15 }, 4: { halign: 'right', cellWidth: pageWidth * 0.15 } },
    });
    doc.save(`${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`);
    console.log("Resumen Gerencial por Tipo (PDF) generado.");
  };

  const generateAdminReporteConsolidadoPDF = (gastos, filtrosAplicados = {}, fileNamePrefix = 'Reporte_Consolidado_Admin') => {
    console.log("useReportGenerator: Iniciando generateAdminReporteConsolidadoPDF con", gastos?.length, "gastos.");
    if (!gastos || gastos.length === 0) {
      alert('No hay gastos para generar el reporte consolidado PDF.');
      console.warn("generateAdminReporteConsolidadoPDF: No hay gastos.");
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let currentY = margin;

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text("Reporte Consolidado de Gastos (Admin)", pageWidth / 2, currentY, { align: 'center' });
    currentY += 30;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    let filtroTexto = "Período de Gastos: Todos los gastos cargados.";
    if (filtrosAplicados.fechaDesde || filtrosAplicados.fechaHasta) {
        const desde = filtrosAplicados.fechaDesde ? formatDate(filtrosAplicados.fechaDesde) : 'Inicio';
        const hasta = filtrosAplicados.fechaHasta ? formatDate(filtrosAplicados.fechaHasta) : 'Fin';
        filtroTexto = `Período de Gastos: Desde ${desde} Hasta ${hasta}`;
    }
    doc.text(filtroTexto, margin, currentY);
    currentY += 15;
    doc.text(`Generado el: ${formatDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, currentY);
    currentY += 25;

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text("1. Resumen de Gastos por Tipo y Moneda", margin, currentY);
    currentY += 20;

    const dataResumenPorTipo = calculateAdminGastosPorTipo(gastos, 'ARS');
    if (dataResumenPorTipo.body.length > 0) {
      doc.autoTable({
        head: [["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"]],
        body: dataResumenPorTipo.body,
        foot: dataResumenPorTipo.foot,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: { 
            0: { cellWidth: pageWidth * 0.25 }, 
            1: { cellWidth: pageWidth * 0.10 }, 
            2: { halign: 'right', cellWidth: pageWidth * 0.18 }, 
            3: { halign: 'right', cellWidth: pageWidth * 0.18 }, 
            4: { halign: 'right', cellWidth: pageWidth * 0.18 } 
        },
        didDrawPage: (data) => { currentY = data.cursor.y + 15; } 
      });
    } else {
      doc.setFontSize(10); doc.setFont(undefined, 'italic');
      doc.text("No hay datos para el resumen por tipo.", margin, currentY); currentY += 20;
    }
    currentY = doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY + 25 : currentY + 10;


    if (currentY > pageHeight - 150) { 
        doc.addPage(); currentY = margin;
    }

    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text("2. Detalle Completo de Gastos", margin, currentY); currentY += 20;

    const dataDetalleGastos = prepararDetalleGastosParaLibroIVA(gastos);
    if (dataDetalleGastos.body.length > 0) {
      doc.autoTable({
        head: [["Fecha", "N° Comp.", "Descripción", "Responsable", "Neto", "IVA", "Total"]],
        body: dataDetalleGastos.body,
        foot: dataDetalleGastos.foot,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [13, 47, 91], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0], fontStyle: 'bold', fontSize: 9, halign: 'right' },
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'ellipsize' },
        columnStyles: {
            0: { cellWidth: pageWidth * 0.08 }, 1: { cellWidth: pageWidth * 0.10 }, 
            2: { cellWidth: pageWidth * 0.27 }, 3: { cellWidth: pageWidth * 0.15 },
            4: { halign: 'right', cellWidth: pageWidth * 0.12 }, 
            5: { halign: 'right', cellWidth: pageWidth * 0.10 }, 
            6: { halign: 'right', cellWidth: pageWidth * 0.12 }
        },
      });
    } else {
      doc.setFontSize(10); doc.setFont(undefined, 'italic');
      doc.text("No hay gastos detallados para mostrar.", margin, currentY);
    }

    doc.save(`${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`);
    console.log("useReportGenerator: Reporte Consolidado PDF generado.");
  };
  // src/composables/useReportGenerator.js - Bloque 7 (CORREGIDO)

  const generateAdminReporteConsolidadoExcel = (gastos, filtrosAplicados = {}, fileNamePrefix = 'Reporte_Consolidado_Admin') => {
    console.log("useReportGenerator: Iniciando generateAdminReporteConsolidadoExcel con", gastos?.length, "gastos.");
    // CORRECCIÓN: 'ifCl' cambiado a 'if'
    if (!gastos || gastos.length === 0) {
      alert('No hay gastos para generar el reporte consolidado Excel.');
      console.warn("generateAdminReporteConsolidadoExcel: No hay gastos.");
      return;
    }

    const workbook = XLSX.utils.book_new();

    const dataResumenPorTipo = calculateAdminGastosPorTipo(gastos, 'ARS');
    if (dataResumenPorTipo.rawData.length > 0) {
        const headersResumen = ["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"];
        const dataRowsResumen = dataResumenPorTipo.rawData.map(item => [
            item.tipo_gasto, item.moneda, item.neto, item.iva, item.bruto
        ]);
        const footerResumen = [`TOTAL GENERAL (${dataResumenPorTipo.totales.moneda})`, "", dataResumenPorTipo.totales.neto, dataResumenPorTipo.totales.iva, dataResumenPorTipo.totales.bruto];
        const wsResumen = XLSX.utils.aoa_to_sheet([headersResumen, ...dataRowsResumen, footerResumen]);
        wsResumen['!cols'] = [{wch:35},{wch:10},{wch:18},{wch:18},{wch:18}];
        const currencyFormat = '#,##0.00';
        for (let r = 1; r <= dataRowsResumen.length + 1; ++r) { 
            [2,3,4].forEach(c => { 
                const cellAddress = XLSX.utils.encode_cell({r,c});
                if (wsResumen[cellAddress] && typeof wsResumen[cellAddress].v === 'number') {
                    wsResumen[cellAddress].t = 'n'; wsResumen[cellAddress].z = currencyFormat;
                }
            });
        }
        XLSX.utils.book_append_sheet(workbook, wsResumen, 'ResumenPorTipo');
    } else {
        console.log("generateAdminReporteConsolidadoExcel: No hay datos para la hoja 'ResumenPorTipo'.");
    }
    
    const dataDetalleGastos = prepararDetalleGastosParaLibroIVA(gastos);
    if (dataDetalleGastos.rawData.length > 0) {
        const headersDetalle = ["Fecha", "N° Comprobante", "Descripción", "Responsable", "Neto", "IVA", "Total", "Moneda", "Viaje/Rendición", "Estado Viaje"];
        const dataRowsDetalle = dataDetalleGastos.rawData.map(item => [
            item.fecha, item.n_comp, item.descripcion, item.responsable,
            item.neto, item.iva, item.total, item.moneda,
            item.viaje_rendicion, item.estado_viaje
        ]);
        const footerDetalle = [`TOTALES GENERALES (${dataDetalleGastos.totales.moneda})`, "", "", "", dataDetalleGastos.totales.neto, dataDetalleGastos.totales.iva, dataDetalleGastos.totales.bruto, "", "", ""];
        const wsDetalle = XLSX.utils.aoa_to_sheet([headersDetalle, ...dataRowsDetalle, footerDetalle]);
        wsDetalle['!cols'] = [{wch:12},{wch:20},{wch:40},{wch:30},{wch:15},{wch:15},{wch:15},{wch:10},{wch:30},{wch:20}];
        const currencyFormat = '#,##0.00';
        for (let r = 1; r <= dataRowsDetalle.length + 1; ++r) { 
            [4,5,6].forEach(c => {
                const cellAddress = XLSX.utils.encode_cell({r,c});
                if (wsDetalle[cellAddress] && typeof wsDetalle[cellAddress].v === 'number') {
                    wsDetalle[cellAddress].t = 'n'; wsDetalle[cellAddress].z = currencyFormat;
                }
            });
        }
        XLSX.utils.book_append_sheet(workbook, wsDetalle, 'DetalleDeGastos');
    } else {
        console.log("generateAdminReporteConsolidadoExcel: No hay datos para la hoja 'DetalleDeGastos'.");
    }

    let filtroTextoSheet = [["Filtros Aplicados al Reporte Consolidado"]];
    if (filtrosAplicados.fechaDesde || filtrosAplicados.fechaHasta) {
        const desde = filtrosAplicados.fechaDesde ? formatDate(filtrosAplicados.fechaDesde) : 'Inicio del registro';
        const hasta = filtrosAplicados.fechaHasta ? formatDate(filtrosAplicados.fechaHasta) : 'Fin del registro';
        filtroTextoSheet.push(["Período de Gastos:", `Desde ${desde} Hasta ${hasta}`]);
    } else {
        filtroTextoSheet.push(["Período de Gastos:", "Todos los gastos cargados."]);
    }
    filtroTextoSheet.push(["Generado el:", formatDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })]);
    const wsFiltros = XLSX.utils.aoa_to_sheet(filtroTextoSheet);
    wsFiltros['!cols'] = [{wch:25},{wch:50}];
    XLSX.utils.book_append_sheet(workbook, wsFiltros, 'InfoReporte');

    if (workbook.SheetNames.length > 0) {
        XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
        console.log("useReportGenerator: Reporte Consolidado Excel generado.");
    } else {
        alert("No se pudo generar ninguna hoja en el reporte Excel debido a la falta de datos.");
        console.warn("generateAdminReporteConsolidadoExcel: No se generaron hojas.");
    }
  };
  // --- FIN DEL BLOQUE 3 ---

  // --- INICIO DEL CÓDIGO NUEVO ---
  const generateUserReportPDF = (kpis, tableData, pieChartImage, lineChartImage, filterInfo) => {
    console.log("Iniciando generación de PDF para reporte de usuario...");
    const doc = new jsPDF({ orientation: 'p', unit: 'px', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let currentY = margin;

    // --- Título y Período ---
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text("Reporte de Gastos", pageWidth / 2, currentY, { align: 'center' });
    currentY += 25;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const periodoStr = `Período del reporte: ${formatDate(filterInfo.fechaDesde)} al ${formatDate(filterInfo.fechaHasta)}`;
    doc.text(periodoStr, pageWidth / 2, currentY, { align: 'center' });
    currentY += 35;

    // --- KPIs ---
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text("Indicadores Clave", margin, currentY);
    currentY += 20;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`- Total Gastado en el Período: ${formatCurrency(kpis.total_gastado_periodo, 'ARS')}`, margin + 10, currentY);
    currentY += 15;
    doc.text(`- Rendiciones Abiertas Actualmente: ${kpis.rendiciones_abiertas}`, margin + 10, currentY);
    currentY += 35;

    // --- Gráficos ---
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text("Visualización de Datos", margin, currentY);
    currentY += 20;

    const chartWidth = (pageWidth - (margin * 2) - 10) / 2;
    const chartHeight = chartWidth * 0.75;

    if (pieChartImage) {
      doc.addImage(pieChartImage, 'PNG', margin, currentY, chartWidth, chartHeight);
    }
    if (lineChartImage) {
      doc.addImage(lineChartImage, 'PNG', margin + chartWidth + 10, currentY, chartWidth, chartHeight);
    }
    currentY += chartHeight + 35;

    // --- Tabla de Datos ---
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text("Detalle de Gastos por Tipo", margin, currentY);
    currentY += 20;

    const head = [["Tipo de Gasto", "Monto Total"]];
    const body = tableData.map(item => [
      item.tipo_gasto_nombre,
      formatCurrency(item.total_monto, 'ARS')
    ]);

    doc.autoTable({
      head: head,
      body: body,
      startY: currentY,
      theme: 'striped',
      headStyles: { fillColor: [13, 47, 91] },
      styles: { cellPadding: 4 },
      columnStyles: { 1: { halign: 'right' } }
    });

    const fileName = `Reporte_Gastos_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    console.log("PDF generado:", fileName);
  };
  // --- FIN DEL CÓDIGO NUEVO ---

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
    generateUserReportPDF, // <-- Exportación de la nueva función
  };
  
}