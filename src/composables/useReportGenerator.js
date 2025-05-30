// src/composables/useReportGenerator.js
import jsPDF from 'jspdf';
import 'jspdf-autotable';
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
    const totalBruto = parseFloat(gasto.gasto_monto_total || gasto.monto_total) || 0;
    const iva = parseFloat(gasto.gasto_monto_iva || gasto.monto_iva) || 0;
    const neto = totalBruto - iva;
    return { neto, iva, total: totalBruto };
  };

  /**
   * Obtiene las fechas mínima y máxima de una lista de gastos.
   * @param {Array<Object>} gastos - Lista de objetos gasto, cada uno con 'fecha_gasto'.
   * @returns {object} - { min: string | null, max: string | null }
   */
  const getFechaMinMaxGastos = (gastos) => {
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) { // Verificación adicional
        console.warn("getFechaMinMaxGastos: Se recibió una entrada inválida o vacía para 'gastos'.");
        return { min: null, max: null };
    }
    let minDate = null;
    let maxDate = null;
    try {
      // Filtrar gastos sin fecha_gasto válida antes de procesar
      const gastosConFechaValida = gastos.filter(gasto => gasto && gasto.fecha_gasto);
      if (gastosConFechaValida.length === 0) {
          console.warn("getFechaMinMaxGastos: Ningún gasto con fecha válida encontrado.");
          return { min: null, max: null };
      }

      minDate = new Date(gastosConFechaValida[0].fecha_gasto);
      maxDate = new Date(gastosConFechaValida[0].fecha_gasto);
      if (isNaN(minDate.getTime())) { // Si la primera fecha parseada es inválida
          minDate = null; maxDate = null; // Resetear para buscar la primera válida en el loop
      }

      for (const gasto of gastosConFechaValida) {
        const currentDate = new Date(gasto.fecha_gasto);
        if (!isNaN(currentDate.getTime())) {
          if (minDate === null || currentDate < minDate) minDate = currentDate;
          if (maxDate === null || currentDate > maxDate) maxDate = currentDate;
        } else {
          console.warn("getFechaMinMaxGastos: Fecha inválida encontrada y omitida durante el loop:", gasto.fecha_gasto);
        }
      }
      return { 
        min: minDate ? formatDate(minDate) : null, 
        max: maxDate ? formatDate(maxDate) : null 
      };
    } catch (e) {
      console.error("Error procesando fechas en getFechaMinMaxGastos:", e);
      return { min: null, max: null };
    }
  };
  
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
      if (!gasto || typeof gasto !== 'object') return; // Saltar iteración si el gasto es inválido

      const monedaGasto = (gasto.gasto_moneda || gasto.moneda || 'ARS').toUpperCase();
      if (monedaGasto === MONEDA_REPORTE) {
        const responsableId = gasto.gasto_user_id || 'desconocido';
        const nombre = gasto.responsable_gasto_nombre || `Usuario ID ${typeof responsableId === 'string' ? responsableId.substring(0,8) : 'Inválido'}`;
        const valores = getValoresMonetariosGasto(gasto);

        if (!gastosPorResponsableARS[responsableId]) {
          gastosPorResponsableARS[responsableId] = { id: responsableId, nombre: nombre, totalGastadoBruto: 0 };
        }
        gastosPorResponsableARS[responsableId].totalGastadoBruto += valores.total;
      }
    });
    
    let maxGastador = { nombre: 'N/A (Sin gastos en ARS)', total: 0, moneda: MONEDA_REPORTE };
    if (Object.keys(gastosPorResponsableARS).length > 0) {
        maxGastador.nombre = 'N/A'; // Reset para asegurar que solo se asigna si hay un gastador
        let maxTotal = -1; // Iniciar con -1 para que el primer gastador real sea asignado
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

  /**
   * Agrupa gastos por tipo y moneda. Usado para "Resumen Detallado por Tipo".
   * Devuelve un array de objetos listos para ser consumidos por las funciones de generación de reportes.
   * @param {Array<Object>} gastos - Lista de gastos (de la vista admin_gastos_completos).
   * @param {string} monedaPrincipalParaTotales - Moneda para formatear los totales generales.
   * @returns {Object} - { 
   *                      body: Array<Array<string>>, // Para PDF autoTable
   *                      foot: Array<Array<Object>>, // Para PDF autoTable
   *                      rawData: Array<object>,     // Para Excel (datos crudos por tipo/moneda)
   *                      totales: object             // Objeto con totales generales (neto, iva, bruto)
   *                    }
   */
  const calculateAdminGastosPorTipo = (gastos, monedaPrincipalParaTotales = 'ARS') => {
    const resumen = {};
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        console.warn("calculateAdminGastosPorTipo: Entrada 'gastos' inválida o vacía.");
        return { body: [], foot: [], rawData: [], totales: { neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales } };
    }

    gastos.forEach(gasto => {
      if (!gasto || typeof gasto !== 'object') return;
      const tipoNombre = gasto.nombre_tipo_gasto || 'Sin Tipo Especificado'; 
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

    const bodyForPDF = detallesOrdenados.map(item => [ 
        item.tipoGastoNombre,
        item.moneda, 
        formatCurrency(item.totalNeto, item.moneda), // Formatear con la moneda del item
        formatCurrency(item.totalIVA, item.moneda),
        formatCurrency(item.totalBruto, item.moneda),
    ]);
    
    const footForPDF = [[ 
      { content: 'TOTAL GENERAL (Resumen Detallado):', colSpan:2, styles: { halign: 'left', fontStyle: 'bold'} },
      { content: formatCurrency(totalesGenerales.neto, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
      { content: formatCurrency(totalesGenerales.iva, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
      { content: formatCurrency(totalesGenerales.bruto, monedaPrincipalParaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
    ]];

    // rawData para Excel (números crudos)
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
        rawData: rawDataForExcel, // Para que generateAdminResumenTiposGastoExcel use los datos crudos
        totales: totalesGenerales // Para que generateAdminResumenTiposGastoExcel use los totales crudos
    };
  };

  /**
   * Prepara datos para el "Resumen Gerencial por Tipo", agrupando tipos y sumando monedas.
   * @param {Array<Object>} gastos - Lista de gastos.
   * @param {string} monedaPrincipalParaTotales - Moneda para mostrar los totales generales.
   * @returns {Object} - { 
   *                      detalles: Array<Object>, // Datos agrupados por tipo (sumando diferentes monedas)
   *                      totalesGenerales: Object  // Totales generales de la agrupación
   *                    }
   */
  const calculateResumenGerencialPorTipo = (gastos, monedaPrincipalParaTotales = 'ARS') => {
    const resumenPorTipo = {}; 
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        console.warn("calculateResumenGerencialPorTipo: Entrada 'gastos' inválida o vacía.");
        return { detalles: [], totalesGenerales: { nombre: "TOTAL GENERAL", neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales } };
    }

    gastos.forEach(gasto => {
      if (!gasto || typeof gasto !== 'object') return;
      const tipoNombre = gasto.nombre_tipo_gasto || 'Sin Tipo Especificado';
      const valores = getValoresMonetariosGasto(gasto);
      if (!resumenPorTipo[tipoNombre]) {
        resumenPorTipo[tipoNombre] = { tipoGastoNombre: tipoNombre, totalNeto: 0, totalIVA: 0, totalBruto: 0, monedas: new Set() };
      }
      // Suma directa de montos, independientemente de la moneda original para el total por tipo.
      // La conversión de moneda sería más compleja.
      resumenPorTipo[tipoNombre].totalNeto += valores.neto;
      resumenPorTipo[tipoNombre].totalIVA += valores.iva;
      resumenPorTipo[tipoNombre].totalBruto += valores.total;
      resumenPorTipo[tipoNombre].monedas.add(gasto.gasto_moneda || gasto.moneda || 'N/A');
    });

    const detalles = Object.values(resumenPorTipo).map(item => ({
        ...item, 
        monedas: Array.from(item.monedas).join(', ') // String de monedas encontradas
    })).sort((a, b) => a.tipoGastoNombre.localeCompare(b.tipoGastoNombre));
    
    const totalesGenerales = { nombre: "TOTAL GENERAL", neto: 0, iva: 0, bruto: 0, moneda: monedaPrincipalParaTotales };
    detalles.forEach(item => {
        totalesGenerales.neto += item.totalNeto;
        totalesGenerales.iva += item.totalIVA;
        totalesGenerales.bruto += item.totalBruto;
    });

    return { detalles, totalesGenerales }; 
  };

  /**
   * Prepara los datos para la tabla de detalle de gastos (formato Libro IVA).
   * Usado por el reporte consolidado y podría ser usado por un reporte de Libro IVA individual.
   * @param {Array<Object>} gastos - Lista de objetos gasto de la vista admin_gastos_completos.
   * @returns {object} - { body: Array<Array<string>>, foot: Array<Array<Object>>, totales: object, rawData: Array<object> }
   */
  const prepararDetalleGastosParaLibroIVA = (gastos) => { // Renombrada para claridad, es la que usa el consolidado
    let totalNetoGeneral = 0, totalIVAGeneral = 0, totalGeneralBruto = 0;
    const monedaTotales = 'ARS'; 
    const rawDataForExcel = [];
    if (!gastos || !Array.isArray(gastos) || gastos.length === 0) {
        return { body: [], foot: [], totales: {neto: 0, iva: 0, bruto: 0, moneda: monedaTotales}, rawData: [] };
    }

    const bodyForPDF = gastos.map(gasto => {
      if (!gasto || typeof gasto !== 'object') return []; // Omitir si el gasto es inválido
      const valores = getValoresMonetariosGasto(gasto);
      const monedaGastoActual = gasto.gasto_moneda || gasto.moneda || monedaTotales;
      totalNetoGeneral += valores.neto; totalIVAGeneral += valores.iva; totalGeneralBruto += valores.total;
      rawDataForExcel.push({
        fecha: formatDate(gasto.fecha_gasto), n_comp: gasto.gasto_n_factura || gasto.numero_factura || 'S/N',
        descripcion: gasto.gasto_descripcion || gasto.descripcion_general || '-', responsable: gasto.responsable_gasto_nombre || 'N/A',
        neto: valores.neto, iva: valores.iva, total: valores.total, moneda: monedaGastoActual
      });
      return [ 
        formatDate(gasto.fecha_gasto), gasto.gasto_n_factura || gasto.numero_factura || 'S/N',
        gasto.gasto_descripcion || gasto.descripcion_general || '-',
        gasto.responsable_gasto_nombre || 'N/A', formatCurrency(valores.neto, monedaGastoActual),
        formatCurrency(valores.iva, monedaGastoActual), formatCurrency(valores.total, monedaGastoActual),
      ];
    });
    const footForPDF = [[
        { content: 'TOTALES GENERALES (Detalle):', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalNetoGeneral, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalIVAGeneral, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
        { content: formatCurrency(totalGeneralBruto, monedaTotales), styles: { halign: 'right', fontStyle: 'bold'} },
    ]];
    return { body: bodyForPDF, foot: footForPDF, totales: {neto: totalNetoGeneral, iva: totalIVAGeneral, bruto: totalGeneralBruto, moneda: monedaTotales}, rawData: rawDataForExcel };
  };

  // --- FIN DEL BLOQUE 2 ---
    // --- BLOQUE 3: FUNCIONES DE GENERACIÓN DE REPORTES Y EXPORTACIÓN FINAL ---

  // --- FUNCIONES ORIGINALES PARA REPORTES DE RENDICIÓN INDIVIDUAL (COMPLETAS) ---
  const generateGastosPDF = (gastos, viajeSeleccionadoInfo, userInfo) => {
    // ... (CÓDIGO COMPLETO DE TU generateGastosPDF ORIGINAL - como lo tenías en el archivo .txt) ...
    // Ejemplo simplificado para asegurar que la estructura es correcta:
    console.log("Ejecutando generateGastosPDF (individual)... Reemplaza con tu código completo.");
    if (!gastos || gastos.length === 0) { alert('No hay datos para PDF individual.'); return; }
    const doc = new jsPDF();
    doc.text("Reporte de Rendición Individual", 10, 10);
    let currentY = 20;
    if (viajeSeleccionadoInfo) {
      doc.text(`Viaje: ${viajeSeleccionadoInfo.nombre_viaje || 'N/A'}`, 10, currentY); currentY += 7;
    }
    if (userInfo) {
      doc.text(`Responsable: ${userInfo.nombre || userInfo.email || 'N/A'}`, 10, currentY); currentY += 7;
    }
    doc.text("Detalle de Gastos:", 10, currentY); currentY += 7;
    const tableColumn = ["Fecha", "Descripción", "Monto"];
    const tableRows = gastos.map(g => [formatDate(g.fecha_gasto), g.descripcion_general || '-', formatCurrency(g.monto_total, g.moneda)]);
    doc.autoTable({ head: [tableColumn], body: tableRows, startY: currentY });
    doc.save(`Rendicion_${viajeSeleccionadoInfo?.codigo_rendicion || 'General'}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const generateGastosExcel = (gastos, viajeSeleccionadoInfo, userInfo, esAdminReport = false) => {
    // ... (CÓDIGO COMPLETO DE TU generateGastosExcel ORIGINAL - como lo tenías en el archivo .txt) ...
    // Ejemplo simplificado:
    console.log("Ejecutando generateGastosExcel (individual/admin)... Reemplaza con tu código completo.");
    if (!gastos || gastos.length === 0) { alert('No hay datos para Excel.'); return; }
    const headers = ["Fecha", "Descripción", "Monto", "Moneda"];
    if (esAdminReport) headers.unshift("Responsable");
    const dataRows = gastos.map(g => {
      let row = [formatDate(g.fecha_gasto), g.descripcion_general || '-', parseFloat(g.monto_total) || 0, g.moneda || 'ARS'];
      if (esAdminReport) row.unshift(g.responsable_gasto_nombre || userInfo?.nombre || 'N/A');
      return row;
    });
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    // ... (Aplicar anchos y formatos) ...
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Gastos');
    XLSX.writeFile(workbook, `Gastos_${esAdminReport ? 'Admin' : (viajeSeleccionadoInfo?.codigo_rendicion || 'General')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };
  // --- FIN DE FUNCIONES ORIGINALES ---


  // --- FUNCIONES PARA "RESUMEN DETALLADO POR TIPO" (Admin) ---
  // Estas funciones ahora esperan el resultado de calculateAdminGastosPorTipo, 
  // que es un objeto con { body, foot, rawData, totales }
  const generateAdminResumenTiposGastoExcel = (dataCalculada, fileNamePrefix = 'Admin_ResumenDetalladoTipo') => {
    const { rawData, totales } = dataCalculada;
    if (!rawData || rawData.length === 0) { console.warn('No hay datos para Resumen Detallado Excel.'); return; }
    const headers = ["Tipo de Gasto", "Moneda", "Total Neto", "Total IVA", "Total Bruto"];
    const dataRows = rawData.map(item => [item.tipo_gasto, item.moneda, item.neto, item.iva, item.bruto]);
    const footerRow = ["TOTAL GENERAL", "", totales.neto, totales.iva, totales.bruto];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, footerRow]);
    worksheet['!cols'] = [{wch:30},{wch:10},{wch:20},{wch:20},{wch:20}];
    const currencyFormat = '#,##0.00';
    for (let r = 1; r <= dataRows.length + 1; ++r) { [2,3,4].forEach(c => { const cell = worksheet[XLSX.utils.encode_cell({r,c})]; if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = currencyFormat; }}); }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'ResumenDetalladoPorTipo');
    XLSX.writeFile(workbook, `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
    console.log("Resumen Detallado por Tipo (Excel) generado.");
  };

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

  // --- FUNCIONES PARA "RESUMEN GERENCIAL POR TIPO" (Admin) ---
  // Estas funciones esperan el resultado de calculateResumenGerencialPorTipo, 
  // que es un objeto con { detalles, totalesGenerales }
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

  // --- FUNCIONES PARA REPORTE CONSOLIDADO DE ADMIN (Opcional, si se usan desde AdminViajesList u otro lado) ---
  const generateAdminReporteConsolidadoPDF = (gastos, filtrosAplicados = {}, fileNamePrefix = 'Reporte_Consolidado_Admin') => { /* ... (código completo de la respuesta anterior) ... */ };
  const generateAdminReporteConsolidadoExcel = (gastos, filtrosAplicados = {}, fileNamePrefix = 'Reporte_Consolidado_Admin') => { /* ... (código completo de la respuesta anterior) ... */ };

  // --- EXPORTAR TODAS LAS FUNCIONES ---
  return {
    // Funciones originales para rendiciones individuales
    generateGastosPDF, 
    generateGastosExcel, 

    // Funciones de cálculo que los componentes pueden usar directamente
    calculateAdminGastosPorTipo,
    calculateResumenGerencialPorTipo,

    // Funciones de generación para reportes granulares de Admin (usadas por AdminGastosListView)
    generateAdminResumenTiposGastoExcel,
    generateAdminResumenTiposGastoPDF,
    generateResumenGerencialTiposGastoExcel,
    generateResumenGerencialTiposGastoPDF,

    // Funciones de reporte consolidado (si las usas en algún componente como AdminViajesListView)
    generateAdminReporteConsolidadoPDF,
    generateAdminReporteConsolidadoExcel,
  };
  
} // ESTA ES LA LLAVE DE CIERRE FINAL DE export function useReportGenerator()