// src/utils/formatters.js

/**
 * Formatea una cadena de fecha a un formato legible.
 * Maneja tanto timestamps completos como fechas 'YYYY-MM-DD'.
 * Es seguro contra opciones inválidas y problemas de zona horaria.
 * @param {string} dateString - La fecha a formatear.
 * @param {object} options - Opciones para Intl.DateTimeFormat.
 * @returns {string} - La fecha formateada.
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return 'N/A';
  
  let date;
  const dateStr = String(dateString);

  // --- INICIO CORRECCIÓN DEFINITIVA DE FECHA ---
  // Si es un string de solo fecha (ej: '2025-07-18'), le añadimos la hora
  // para forzar al navegador a interpretarlo en la zona horaria local y no en UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    date = new Date(`${dateStr}T00:00:00`);
  } else {
    // Para timestamps completos (que ya incluyen info de zona horaria),
    // el constructor estándar funciona bien.
    date = new Date(dateStr);
  }
  // --- FIN CORRECCIÓN DEFINITIVA DE FECHA ---

  if (isNaN(date.getTime())) {
    console.warn("formatDate recibió una fecha inválida:", dateString);
    return 'Fecha Inválida';
  }

  const defaultOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };

  const finalOptions = Object.keys(options).length > 0 ? options : defaultOptions;

  try {
    return new Intl.DateTimeFormat('es-AR', finalOptions).format(date);
  } catch (error) {
    console.error("Error en Intl.DateTimeFormat, probablemente por opciones inválidas:", error);
    return date.toLocaleDateString('es-AR');
  }
};

/**
 * Formatea un número como moneda ARS.
 * @param {number|string|null|undefined} amount - El monto a formatear.
 * @param {string} currency - El código de la moneda.
 * @returns {string} - El monto formateado como moneda.
 */
export const formatCurrency = (amount, currency = 'ARS') => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

/**
 * Formatea un número como un decimal para inputs, SIN el símbolo de la moneda.
 * @param {number|string|null|undefined} amount - El monto a formatear.
 * @returns {string} - El monto formateado como un string decimal.
 */
export const formatCurrencyForInput = (amount) => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return '';
  
  return new Intl.NumberFormat('es-AR', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Convierte un string de moneda (formato ARS) a un número.
 * @param {string|number} value - El valor a parsear.
 * @returns {number} - El número resultante.
 */
export const parseCurrency = (value) => {
  if (typeof value !== 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }

  const withoutSymbol = value.replace(/\$\s?/g, '');
  const withoutThousands = withoutSymbol.replace(/\./g, '');
  const withDot = withoutThousands.replace(',', '.');
  const number = parseFloat(withDot);

  return isNaN(number) ? 0 : number;
};