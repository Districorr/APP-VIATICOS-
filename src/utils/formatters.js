// src/utils/formatters.js

export const formatDate = (dateString, options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) => {
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
  // Usar es-AR para el formato DD/MM/AAAA consistentemente
  return date.toLocaleDateString('es-AR', options);
};

export const formatCurrency = (amount, currency = 'ARS') => {
  if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return 'N/A';
  // Usar es-AR para el formato de moneda con $ y separadores correctos.
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};