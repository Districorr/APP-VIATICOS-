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
/**
 * Unifica sinónimos de empresas de transporte, couriers o servicios de logística.
 * Asigna 'LOGISTICA CIRUGIA' como operador logístico por defecto para envíos propios o sin transporte registrado.
 * 
 * @param {string} name 
 * @returns {string} Nombre oficial unificado del transporte
 */
export function normalizeTransporte(name) {
  if (!name || typeof name !== 'string') return 'SIN ENCOMIENDA';
  
  const cleanName = name.trim().toUpperCase();

  const sinTransporteSynonyms = [
    'SIN TRANSPORTE',
    'SIN ENCOMIENDA',
    'SIN PROVEEDOR',
    'SIN_PROVEEDOR',
    'N/A',
    'SIN DATO',
    '—',
    '-'
  ];

  if (sinTransporteSynonyms.includes(cleanName)) {
    return 'SIN ENCOMIENDA';
  }

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

  if (cleanName.includes('ANDREANI') || cleanName.includes('ANDREANNI')) return 'ANDREANI';
  if (cleanName === 'OCA' || cleanName.startsWith('OCA ') || cleanName.endsWith(' OCA')) return 'OCA';
  if (cleanName.includes('CADETE') || cleanName.includes('CADETERIA') || cleanName.includes('CADETERÍA')) return 'CADETERIA';
  if (cleanName.includes('EXPEDITO') || cleanName.includes('SAN EXPEDITO')) return 'SAN EXPEDITO';
  if (cleanName.includes('VIA CARGO') || cleanName.includes('VIACARGO')) return 'VIA CARGO';
  if (cleanName.includes('BUSPACK') || cleanName.includes('CHEVALLIER') || cleanName.includes('FLECHA BUS')) return cleanName;

  return cleanName;
}

/**
 * Normaliza nombres de proveedores de insumos/cirugías.
 * Mantiene 'SIN PROVEEDOR' para registros generales o institucionales (DISTRICORR / sin proveedor),
 * y 'LOGISTICA CIRUGIA' únicamente cuando corresponda explícitamente a ese proveedor.
 * 
 * @param {string} name 
 * @returns {string} Nombre oficial unificado del proveedor
 */
export function normalizeProveedor(name) {
  if (!name || typeof name !== 'string') return 'SIN PROVEEDOR';
  
  const cleanName = name.trim().toUpperCase();

  const sinProveedorSynonyms = [
    'DISTRICORR',
    'DISTRICORR SRL',
    'DISTRICORR S.R.L.',
    'DISTRICORR S.R.L',
    'SIN PROVEEDOR',
    'SIN_PROVEEDOR',
    'SIN PROVEEDOR ASIGNADO',
    'SIN PROVEEDOR/OTROS',
    'SIN PROVEEDOR/OTRO',
    'N/A',
    'SIN DATO',
    '—',
    '-'
  ];

  if (!cleanName || sinProveedorSynonyms.includes(cleanName)) {
    return 'SIN PROVEEDOR';
  }

  const logisticaCirugiaSynonyms = [
    'LOGISTICA CIRUGIA',
    'LOGISTICA CIRUGIAS',
    'LOGISTICA Y CIRUGIA',
    'LOGISTICA DE CIRUGIAS'
  ];

  if (logisticaCirugiaSynonyms.includes(cleanName)) {
    return 'LOGISTICA CIRUGIA';
  }

  if (cleanName.includes('ANDREANI') || cleanName.includes('ANDREANNI')) return 'ANDREANI';
  if (cleanName === 'OCA' || cleanName.startsWith('OCA ') || cleanName.endsWith(' OCA')) return 'OCA';
  if (cleanName.includes('CADETE') || cleanName.includes('CADETERIA') || cleanName.includes('CADETERÍA')) return 'CADETERIA';
  if (cleanName.includes('EXPEDITO') || cleanName.includes('SAN EXPEDITO')) return 'SAN EXPEDITO';
  if (cleanName.includes('VIA CARGO') || cleanName.includes('VIACARGO')) return 'VIA CARGO';

  return cleanName;
}

// Paleta de colores elegantes, suaves y de alto contraste
const PALETTE = [
  'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold',
  'bg-sky-100 text-sky-900 border-sky-300 font-bold',
  'bg-teal-100 text-teal-900 border-teal-300 font-bold',
  'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
  'bg-amber-100 text-amber-900 border-amber-300 font-bold',
  'bg-orange-100 text-orange-900 border-orange-300 font-bold',
  'bg-rose-100 text-rose-900 border-rose-300 font-bold',
  'bg-purple-100 text-purple-900 border-purple-300 font-bold',
  'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300 font-bold',
  'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold',
  'bg-violet-100 text-violet-900 border-violet-300 font-bold',
  'bg-blue-100 text-blue-900 border-blue-300 font-bold',
];

/**
 * Devuelve clases CSS de Tailwind para pintar Badges/Chips vistosos según la empresa de transporte.
 * Garantiza alto contraste y legibilidad para todas las empresas (Full Pack, Integral Pack, Alcorta, etc.)
 * 
 * @param {string} name 
 * @returns {string} Clases Tailwind CSS para el badge
 */
export function getProveedorBadgeColor(name) {
  const norm = normalizeProveedor(name);

  switch (norm) {
    case 'LOGISTICA CIRUGIA':
      return 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold';
    case 'ANDREANI':
      return 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
    case 'OCA':
      return 'bg-sky-100 text-sky-900 border-sky-300 font-bold';
    case 'CADETERIA':
      return 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
    case 'SAN EXPEDITO':
      return 'bg-rose-100 text-rose-900 border-rose-300 font-bold';
    case 'VIA CARGO':
      return 'bg-purple-100 text-purple-900 border-purple-300 font-bold';
    case 'FULL PACK':
      return 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold';
    case 'INTEGRAL PACK':
      return 'bg-teal-100 text-teal-900 border-teal-300 font-bold';
    case 'ALCORTA':
      return 'bg-orange-100 text-orange-900 border-orange-300 font-bold';
    case 'RAY PACK':
      return 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300 font-bold';
    case 'ELISA':
      return 'bg-violet-100 text-violet-900 border-violet-300 font-bold';
    case 'EL PRACTICO PACK':
    case 'EL PRACTICO':
      return 'bg-blue-100 text-blue-900 border-blue-300 font-bold';
    default: {
      // Hash determinista para asignar un color suave y legible a cualquier transporte dinámico
      let hash = 0;
      for (let i = 0; i < norm.length; i++) {
        hash = norm.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % PALETTE.length;
      return PALETTE[index];
    }
  }
}
