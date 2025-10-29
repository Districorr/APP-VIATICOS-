// src/composables/useExcelExporter.js

import * as XLSX from 'xlsx';

export function useExcelExporter() {
  /**
   * Exporta datos a un archivo Excel con múltiples pestañas.
   * @param {Array<Object>} sheets - Un array de objetos, donde cada objeto representa una hoja.
   *                                 Formato esperado: [{ name: 'NombreHoja1', data: [...] }, { name: 'NombreHoja2', data: [...] }]
   * @param {string} fileName - El nombre base para el archivo Excel (sin extensión).
   */
  const exportToExcel = (sheets, fileName = 'reporte') => {
    // Validación: Asegurarse de que el array de hojas no esté vacío y tenga el formato correcto.
    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      console.error('Formato de datos incorrecto para exportar. Se esperaba un array de hojas.');
      alert('Error al preparar los datos para la exportación.');
      return;
    }

    // 1. Crea un nuevo libro de trabajo.
    const workbook = XLSX.utils.book_new();

    // 2. Itera sobre cada objeto de hoja que recibimos.
    sheets.forEach(sheet => {
      // Validación para cada hoja individual.
      if (sheet && sheet.data && sheet.name) {
        // Crea una hoja de cálculo a partir del array de datos de la hoja actual.
        const worksheet = XLSX.utils.json_to_sheet(sheet.data);
        
        // Añade la hoja de cálculo al libro de trabajo, usando el nombre personalizado.
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      }
    });

    // 3. Dispara la descarga del archivo (solo si se añadieron hojas válidas).
    if (workbook.SheetNames.length > 0) {
      // El nombre del archivo ya incluye la fecha en el componente que llama.
      const finalFileName = `${fileName}.xlsx`;
      XLSX.writeFile(workbook, finalFileName);
    } else {
      console.error('No se pudo generar ninguna hoja para el archivo Excel.');
      alert('No se encontraron datos válidos para generar el reporte.');
    }
  };

  return { exportToExcel };
}