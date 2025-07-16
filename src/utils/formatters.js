// src/utils/formatters.js

/**
 * Formatea una cadena de fecha a un formato legible.
 * Maneja tanto timestamps completos como fechas 'YYYY-MM-DD'.
 * Es seguro contra opciones inválidas.
 * @param {string} dateString - La fecha a formatear.
 * @param {object} options - Opciones para Intl.DateTimeFormat.
 * @returns {string} - La fecha formateada.
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return 'N/A';
  
  let date;
  // Intentar detectar si es un timestamp completo o solo una fecha YYYY-MM-DD
  if (String(dateString).includes('T') || String(dateString).includes('Z') || String(dateString).includes(' ')) {
    date = new Date(dateString);
  } else { // Asumir YYYY-MM-DD
    const dateParts = String(dateString).split('-');
    if (dateParts.length === 3) {
      // Usar Date.UTC para evitar problemas de timezone si solo es fecha
      date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
    } else {
      date = new Date(dateString); // Fallback
    }
  }
  
  if (isNaN(date.getTime())) {
    console.warn("formatDate recibió una fecha inválida:", dateString);
    return 'Fecha Inválida';
  }

  // Opciones por defecto si no se especifican ningunas
  const defaultOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };

  // Usar las opciones por defecto solo si el objeto de opciones viene vacío
  const finalOptions = Object.keys(options).length > 0 ? options : defaultOptions;

  try {
    // Usar es-AR para el formato DD/MM/AAAA consistentemente
    return new Intl.DateTimeFormat('es-AR', finalOptions).format(date);
  } catch (error) {
    // Captura errores por combinaciones de opciones inválidas (como dateStyle y timeStyle juntas)
    console.error("Error en Intl.DateTimeFormat, probablemente por opciones inválidas:", error);
    // Como fallback seguro, simplemente devuelve el formato de fecha local
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
  // Usar es-AR para el formato de moneda con $ y separadores correctos.
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

/**
 * Formatea un número como un decimal para inputs, SIN el símbolo de la moneda.
 * @param {number|string|null|undefined} amount - El monto a formatear.
 * @returns {string} - El monto formateado como un string decimal.
 */
export const formatCurrencyForInput = (amount) => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return ''; // Devuelve string vacío para inputs
  
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
    // Si no es un string, intenta convertirlo a número directamente, si falla, devuelve 0
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }

  // 1. Quita el símbolo de peso y los espacios
  const withoutSymbol = value.replace(/\$\s?/g, '');
  // 2. Quita los puntos de miles
  const withoutThousands = withoutSymbol.replace(/\./g, '');
  // 3. Reemplaza la coma decimal por un punto
  const withDot = withoutThousands.replace(',', '.');
  // 4. Convierte el string a un número flotante
  const number = parseFloat(withDot);

  // Si el resultado no es un número válido (ej. un string vacío), devuelve 0
  return isNaN(number) ? 0 : number;
};