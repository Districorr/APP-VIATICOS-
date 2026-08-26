/**
 * Normalización de Proveedores / Transportes de Logística
 */

/**
 * Unifica sinónimos de empresas de transporte, couriers o servicios de logística.
 * Convertirá automáticamente valores como "EMA PACK", "EMA", "LOGISTICA", "CIRUGIA", 
 * "LOGISTICA CIRUGIAS" o "LOGISTICA Y CIRUGIA" a la denominación oficial unificada: "LOGISTICA CIRUGIA".
 * 
 * @param {string} name 
 * @returns {string} Nombre oficial unificado
 */
export function normalizeProveedor(name) {
  if (!name || typeof name !== 'string') return 'LOGISTICA CIRUGIA';
  
  const cleanName = name.trim().toUpperCase();

  // Sinónimos de Logística Cirugía
  const logisticaCirugiaSynonyms = [
    'EMA PACK',
    'EMA',
    'LOGISTICA',
    'CIRUGIA',
    'LOGISTICA CIRUGIAS',
    'LOGISTICA Y CIRUGIA',
    'LOGISTICA CIRUGIA',
    'EMAPACK',
    'EMA-PACK',
    'LOGISTICA DE CIRUGIAS'
  ];

  if (logisticaCirugiaSynonyms.includes(cleanName)) {
    return 'LOGISTICA CIRUGIA';
  }

  // Andreani
  if (cleanName.includes('ANDREANI') || cleanName.includes('ANDREANNI')) {
    return 'ANDREANI';
  }

  // OCA
  if (cleanName === 'OCA' || cleanName.startsWith('OCA ') || cleanName.endsWith(' OCA')) {
    return 'OCA';
  }

  // Cadetería
  if (cleanName.includes('CADETE') || cleanName.includes('CADETERIA') || cleanName.includes('CADETERÍA')) {
    return 'CADETERIA';
  }

  // San Expedito
  if (cleanName.includes('EXPEDITO') || cleanName.includes('SAN EXPEDITO')) {
    return 'SAN EXPEDITO';
  }

  // Vía Cargo
  if (cleanName.includes('VIA CARGO') || cleanName.includes('VIACARGO')) {
    return 'VIA CARGO';
  }

  // Buspack / Chevallier / Urquiza / Flecha Bus
  if (cleanName.includes('BUSPACK') || cleanName.includes('CHEVALLIER') || cleanName.includes('FLECHA BUS')) {
    return cleanName;
  }

  return cleanName;
}

/**
 * Devuelve clases CSS de Tailwind para pintar Badges/Chips según la empresa de transporte.
 * 
 * @param {string} name 
 * @returns {string} Clases Tailwind CSS para el badge
 */
export function getProveedorBadgeColor(name) {
  const norm = normalizeProveedor(name);

  switch (norm) {
    case 'LOGISTICA CIRUGIA':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/40';
    case 'ANDREANI':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40';
    case 'OCA':
      return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40';
    case 'CADETERIA':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40';
    case 'SAN EXPEDITO':
      return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40';
    case 'VIA CARGO':
      return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
}
