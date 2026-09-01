/**
 * Verifica si una descripción corresponde a cirugía
 * @param {string} desc
 * @returns {boolean}
 */
export function isSurgeryDescription(desc) {
  if (!desc) return false;
  const normalized = String(desc)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return normalized.includes('cirugia');
}

/**
 * Normalización de Empresas de Transporte / Encomiendas / Operadores Logísticos
 * Únicamente utiliza el valor del transporte. No consulta proveedor ni descripción.
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

/**
 * Determina si un registro corresponde a Logística de Cirugía.
 * Fuente de verdad principal: datos_adicionales.tipo_logistica === 'cirugia'.
 * Compatibilidad histórica: proveedor_id === 14 o nombre de proveedor histórico 'LOGISTICA CIRUGIA'.
 * 
 * @param {Object} item 
 * @returns {boolean}
 */
export function isLogisticaCirugia(item) {
  if (!item) return false;
  const extra = item.datos_adicionales || {};
  
  if (extra.tipo_logistica === 'cirugia') return true;
  if (extra.tipo_logistica === 'proveedor' || extra.tipo_logistica === 'proveedor_otros') return false;

  if (Number(item.proveedor_id) === 14) return true;

  const provName = (item.proveedores?.nombre || item.proveedor_nombre || item.proveedor || '').toUpperCase().trim();
  if (provName === 'LOGISTICA CIRUGIA' || provName === 'LOGISTICA CIRUGIAS' || provName === 'LOGISTICA DE CIRUGIAS') {
    return true;
  }

  return false;
}

/**
 * Retorna la etiqueta visual oficial del proveedor o 'Logística de Cirugía'.
 * 
 * @param {Object|string} itemOrName 
 * @returns {string}
 */
export function getProveedorLabel(itemOrName) {
  if (!itemOrName) return 'Sin Proveedor';
  
  if (typeof itemOrName === 'object') {
    if (isLogisticaCirugia(itemOrName)) {
      return 'Logística de Cirugía';
    }
    const name = itemOrName.proveedores?.nombre || itemOrName.proveedor_nombre || itemOrName.proveedor || '';
    if (!name || name === 'SIN PROVEEDOR' || name === 'Sin proveedor') return 'Sin Proveedor';
    return normalizeProveedor(name);
  }

  const strName = String(itemOrName).trim();
  const upper = strName.toUpperCase();
  if (upper === 'LOGISTICA CIRUGIA' || upper === 'LOGISTICA CIRUGIAS' || upper === '14') {
    return 'Logística de Cirugía';
  }
  if (!strName || upper === 'SIN PROVEEDOR' || upper === 'SIN_PROVEEDOR') {
    return 'Sin Proveedor';
  }
  return normalizeProveedor(strName);
}

/**
 * Normaliza nombres de proveedores de insumos/cirugías.
 * Mantiene 'SIN PROVEEDOR' para registros nulos, vacíos, institucionales o DISTRICORR.
 * No utiliza el transporte ni la descripción como fallback.
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
    return 'Logística de Cirugía';
  }

  return cleanName;
}

/**
 * Extracción pura de presentación de localidad desde texto descriptivo (sin modificar la BD).
 * Reconoce ciudades conocidas presentes en descripciones históricas.
 * 
 * @param {string} text 
 * @returns {string|null}
 */
export function extractLocalidadPresentation(text) {
  if (!text || typeof text !== 'string') return null;
  const upper = text.toUpperCase();

  const CIDADES_CONOCIDAS = [
    'GOYA',
    'CURUZU CUATIA',
    'CURUZÚ CUATIÁ',
    'BELLA VISTA',
    'PASO DE LOS LIBRES',
    'CORRIENTES',
    'MERCEDES',
    'ITUZAINGO',
    'ITUZAINGÓ',
    'ESQUINA',
    'SANTO TOME',
    'SANTO TOMÉ',
    'MONTE CASEROS',
    'FORMOSA',
    'RESISTENCIA',
    'SALADAS',
    'SANTA LUCIA',
    'SANTA LUCÍA',
    'VIRASORO',
    'GOBERNADOR VIRASORO',
    'SAUCE',
    'EMPEDRADO',
    'MBURUCUYA',
    'MBURUCUYÁ',
    'SAN LUIS DEL PALMAR',
    'ITATI',
    'ITATÍ'
  ];

  for (const ciudad of CIDADES_CONOCIDAS) {
    if (upper.includes(ciudad)) {
      // Normalizar nombre de ciudad limpia
      if (ciudad.includes('CURUZU')) return 'Curuzú Cuatiá';
      if (ciudad.includes('PASO DE LOS LIBRES')) return 'Paso de los Libres';
      if (ciudad.includes('BELLA VISTA')) return 'Bella Vista';
      if (ciudad.includes('SANTO TOME')) return 'Santo Tomé';
      if (ciudad.includes('ITUZAINGO')) return 'Ituzaingó';
      if (ciudad.includes('SANTA LUCIA')) return 'Santa Lucía';
      if (ciudad.includes('MBURUCUYA')) return 'Mburucuyá';
      if (ciudad.includes('ITATI')) return 'Itatí';
      if (ciudad.includes('VIRASORO')) return 'Virasoro';
      return ciudad.charAt(0) + ciudad.slice(1).toLowerCase();
    }
  }

  return null;
}

/**
 * Obtiene la localidad/destino para presentación siguiendo el orden estricto:
 * 1. Localidad real del registro (relación localidad_destino / localidad).
 * 2. Extracción de presentación desde la descripción/datos adicionales.
 * 3. Provincia como fallback visual (formateada como provincia).
 * 4. "—"
 * 
 * @param {object} item 
 * @returns {string}
 */
export function getDestinoPresentation(item) {
  if (!item) return '—';

  // 1. Localidad real asignada en el registro
  const locObj = item.localidad_destino || item.localidad;
  if (locObj && locObj.nombre && locObj.nombre.trim()) {
    return locObj.nombre.trim();
  }

  const extra = item.datos_adicionales || {};

  // 2. Extracción visual desde texto de descripción o destino_texto
  const textToScan = [
    extra.destino_texto,
    item.descripcion_general,
    item.detalle,
    extra.observacion_logistica
  ].filter(Boolean).join(' ');

  const extracted = extractLocalidadPresentation(textToScan);
  if (extracted) {
    return extracted;
  }

  // 3. Provincia como fallback visual explícito
  const provObj = item.provincias || item.provincia;
  if (provObj && provObj.nombre && provObj.nombre.trim()) {
    const provNombre = provObj.nombre.trim();
    if (provNombre.toLowerCase().startsWith('prov')) return provNombre;
    return `Prov. ${provNombre}`;
  }

  return '—';
}

/**
 * Limpia y formatea el comentario complementario de la operación.
 * Elimina prefijos redundantes como "Operación con proveedor — XXXXX".
 * 
 * @param {object} item 
 * @returns {string}
 */
export function getComentarioLimpio(item) {
  if (!item) return '—';

  const extra = item.datos_adicionales || {};
  let desc = (item.descripcion_general || item.detalle || extra.observacion_logistica || '').trim();

  if (!desc) {
    const paciente = item.paciente_referido || extra.paciente_referido;
    if (paciente) return `Paciente: ${paciente}`;
    return '—';
  }

  // Eliminar patrones redundantes de descripciones autogeneradas
  desc = desc
    .replace(/^Operaci[oó]n con proveedor\s*[\s—–-]\s*[^\n–—-]+[\s—–-]?/i, '')
    .replace(/^Despacho\s+(Env[ií]o|Recepci[oó]n)[\s—–-]?/i, '')
    .trim();

  // Si tras limpiar quedó vacío o solo con guiones
  if (!desc || desc === '—' || desc === '-') {
    const paciente = item.paciente_referido || extra.paciente_referido;
    if (paciente) return `Paciente: ${paciente}`;
    return '—';
  }

  return desc;
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
