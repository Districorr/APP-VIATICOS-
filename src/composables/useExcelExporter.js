// src/composables/useExcelExporter.js

import * as XLSX from 'xlsx';

export function useExcelExporter() {
  const exportToExcel = (data, fileName = 'reporte') => {
    if (!data || data.length === 0) {
      console.warn('No hay datos para exportar.');
      // Opcional: mostrar una notificación al usuario.
      return;
    }

    // Crea una hoja de cálculo a partir de nuestro array de datos JSON.
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Crea un nuevo libro de trabajo.
    const workbook = XLSX.utils.book_new();
    
    // Añade la hoja de cálculo al libro de trabajo, dándole un nombre.
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
    
    // Dispara la descarga del archivo en el navegador del usuario.
    // El nombre del archivo será, por ejemplo, "reporte_2023-10-27.xlsx".
    const finalFileName = `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, finalFileName);
  };

  return { exportToExcel };
}