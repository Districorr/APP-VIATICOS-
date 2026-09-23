const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Mapeo oficial conocido de ciudades principales argentinas y sus provincias reales
const CIENTOS_DE_CIUDADES = {
  // RÍO NEGRO (16)
  'BARILOCHE': 16,
  'SAN CARLOS DE BARILOCHE': 16,
  'VIEDMA': 16,
  'GENERAL ROCA': 16,
  'CIPOLLETTI': 16,
  'EL BOLSON': 16,
  'CATRIEL': 16,
  'VILLA REGINA': 16,
  'CHOELE CHOEL': 16,
  'ALLEN': 16,
  'CINCO SALTOS': 16,

  // NEUQUÉN (15)
  'NEUQUEN': 15,
  'SAN MARTIN DE LOS ANDES': 15,
  'VILLA LA ANGOSTURA': 15,
  'CUTRAL CO': 15,
  'CUTRAL-CO': 15,
  'ZAPALA': 15,
  'PLOTTIER': 15,
  'CENTENARIO': 15,

  // CHUBUT (5)
  'COMODORO RIVADAVIA': 5,
  'TRELEW': 5,
  'PUERTO MADRYN': 5,
  'ESQUEL': 5,
  'RAWSON': 5,

  // SANTA CRUZ (20)
  'RIO GALLEGOS': 20,
  'CALETA OLIVIA': 20,
  'EL CALAFATE': 20,
  'PUERTO DESEADO': 20,
  'PICO TRUNCADO': 20,

  // TIERRA DEL FUEGO (23)
  'USHUAIA': 23,
  'RIO GRANDE': 23,
  'TOLHUIN': 23,

  // CORRIENTES (7)
  'CORRIENTES': 7,
  'GOYA': 7,
  'PASO DE LOS LIBRES': 7,
  'CURUZU CUATIA': 7,
  'MERCEDES': 7, // En Corrientes hay Mercedes
  'BELLA VISTA': 7,
  'ESQUINA': 7,
  'ITUZAINGO': 7,
  'SANTO TOME': 7,
  'MONTE CASEROS': 7,
  'SALADAS': 7,
  'SAN LUIS DEL PALMAR': 7,
  'EMPEDRADO': 7,
  'SANTA LUCIA': 7,
  'CAA CATI': 7,
  'MBURUCUYA': 7,
  'GOBERNADOR VIRASORO': 7,
  'VIRASORO': 7,
  'ITATI': 7,
  'ALVEAR': 7,
  'SAN ROQUE': 7,

  // CHACO (4)
  'RESISTENCIA': 4,
  'PRESIDENCIA ROQUE SAENZ PENA': 4,
  'SAENZ PENA': 4,
  'VILLA ANGELA': 4,
  'CHARATA': 4,
  'FONTANA': 4,
  'BARRANQUERAS': 4,
  'CASTELLI': 4,
  'JUAN JOSE CASTELLI': 4,
  'MACHAGAI': 4,
  'QUITILIPI': 4,

  // FORMOSA (9)
  'FORMOSA': 9,
  'CLORINDA': 9,
  'PIRANE': 9,
  'EL COLORADO': 9,
  'LAS LOMITAS': 9,

  // MISIONES (14)
  'POSADAS': 14,
  'PUERTO IGUAZU': 14,
  'IGUAZU': 14,
  'OBERA': 14,
  'ELDORADO': 14,
  'APOSTOLES': 14,
  'SAN VICENTE': 14,
  'LEANDRO N. ALEM': 14,

  // ENTRE RÍOS (8)
  'PARANA': 8,
  'CONCORDIA': 8,
  'GUALEGUAYCHU': 8,
  'CONCEPCION DEL URUGUAY': 8,
  'GUALEGUAY': 8,
  'VILLAGUAY': 8,
  'CHAJARI': 8,
  'VICTORIA': 8,
  'DIAMANTE': 8,
  'NOGOYA': 8,
  'COLON': 8,

  // SANTA FE (21)
  'ROSARIO': 21,
  'SANTA FE': 21,
  'RAFAELA': 21,
  'VENADO TUERTO': 21,
  'RECONQUISTA': 21,
  'VILLA GOBERNADOR GALVEZ': 21,
  'ESPERANZA': 21,
  'SAN LORENZO': 21,
  'SANTO TOME': 21, // Santo Tomé Santa Fe
  'SAN JORGE': 21,
  'CASILDA': 21,
  'CAÑADA DE GOMEZ': 21,
  'FIRMAT': 21,

  // CÓRDOBA (6)
  'CORDOBA': 6,
  'RIO CUARTO': 6,
  'VILLA MARIA': 6,
  'VILLA CARLOS PAZ': 6,
  'CARLOS PAZ': 6,
  'SAN FRANCISCO': 6,
  'ALTA GRACIA': 6,
  'RIO TERCERO': 6,
  'BELL VILLE': 6,
  'JESUS MARIA': 6,
  'LA FALDA': 6,
  'COSQUIN': 6,

  // MENDOZA (13)
  'MENDOZA': 13,
  'SAN RAFAEL': 13,
  'GODOY CRUZ': 13,
  'GUAYMALLEN': 13,
  'LAS HERAS': 13,
  'MAIPU': 13,
  'LUJAN DE CUYO': 13,
  'SAN MARTIN': 13,
  'TUNUYAN': 13,
  'MALARGUE': 13,
  'GENERAL ALVEAR': 13,

  // SALTA (17)
  'SALTA': 17,
  'SAN RAMON DE LA NUEVA ORAN': 17,
  'ORAN': 17,
  'TARTAGAL': 17,
  'CAFAYATE': 17,
  'METAN': 17,
  'ROSARIO DE LA FRONTERA': 17,

  // JUJUY (10)
  'SAN SALVADOR DE JUJUY': 10,
  'JUJUY': 10,
  'SAN PEDRO': 10,
  'PALPALA': 10,
  'PERICO': 10,
  'TILCARA': 10,
  'HUMAHUACA': 10,
  'LIBERTADOR GENERAL SAN MARTIN': 10,

  // TUCUMÁN (24)
  'SAN MIGUEL DE TUCUMAN': 24,
  'TUCUMAN': 24,
  'YERBA BUENA': 24,
  'CONCEPCION': 24,
  'TAFI VIEJO': 24,
  'AGUILARES': 24,
  'MONTEROS': 24,

  // SANTIAGO DEL ESTERO (22)
  'SANTIAGO DEL ESTERO': 22,
  'LA BANDA': 22,
  'TERMAS DE RIO HONDO': 22,
  'FRIAS': 22,
  'AÑATUYA': 22,

  // LA PAMPA (11)
  'SANTA ROSA': 11,
  'GENERAL PICO': 11,
  'TOAY': 11,

  // SAN LUIS (19)
  'SAN LUIS': 19,
  'VILLA MERCEDES': 19,
  'MERLO': 19,

  // SAN JUAN (18)
  'SAN JUAN': 18,
  'RAWSON': 18,
  'CHIMBAS': 18,
  'RIVADAVIA': 18,
  'CAUCETE': 18,

  // LA RIOJA (12)
  'LA RIOJA': 12,
  'CHILECITO': 12,
  'AIMOGASTA': 12,

  // CATAMARCA (3)
  'SAN FERNANDO DEL VALLE DE CATAMARCA': 3,
  'CATAMARCA': 3,
  'ANDALGALA': 3,

  // BUENOS AIRES (1)
  'LA PLATA': 1,
  'MAR DEL PLATA': 1,
  'BAHIA BLANCA': 1,
  'TANDIL': 1,
  'QUILMES': 1,
  'LANUS': 1,
  'BANFIELD': 1,
  'AVELLANEDA': 1,
  'LOMAS DE ZAMORA': 1,
  'SAN ISIDRO': 1,
  'TIGRE': 1,
  'VICENTE LOPEZ': 1,
  'PILAR': 1,
  'SAN MARTIN': 1,
  'MORON': 1,
  'MERLO': 1,
  'MORENO': 1,
  'LUJAN': 1,
  'OLAVARRIA': 1,
  'PERGAMINO': 1,
  'JUNIN': 1,
  'AZUL': 1,
  'NECOCHEA': 1,
  'CHIVILCOY': 1,
  'CAMPANA': 1,
  'ZARATE': 1,
  'CHASCOMUS': 1,
  'SAN NICOLAS': 1,
  'DOLORES': 1,
  'VILLA GESELL': 1,
  'PINAMAR': 1,
  'BALCARCE': 1,
  'TRES ARROYOS': 1,

  // CABA (2)
  'CABA': 2,
  'BUENOS AIRES': 2,
  'CAPITAL FEDERAL': 2
};

function normalizeText(txt) {
  return (txt || '')
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function auditAndFix() {
  console.log("=== AUDITORÍA COMPLETA DE GEOGRAFÍA (LOCALIDADES Y PROVINCIAS) ===");

  const { data: provs } = await supabase.from('provincias').select('id, nombre');
  const provMap = new Map((provs || []).map(p => [p.id, p.nombre]));

  const { data: locs, error } = await supabase
    .from('localidades')
    .select('id, nombre, provincia_id')
    .order('id');

  if (error) {
    console.error("Error al traer localidades:", error);
    return;
  }

  console.log(`Total de localidades a verificar: ${locs.length}\n`);

  const inconsistencias = [];

  locs.forEach(l => {
    const norm = normalizeText(l.nombre);
    const expectedProvId = CIENTOS_DE_CIUDADES[norm];
    const currentProvNombre = provMap.get(l.provincia_id) || 'Desconocida';

    if (expectedProvId && expectedProvId !== l.provincia_id) {
      inconsistencias.push({
        id: l.id,
        nombre: l.nombre,
        provincia_actual_id: l.provincia_id,
        provincia_actual_nombre: currentProvNombre,
        provincia_esperada_id: expectedProvId,
        provincia_esperada_nombre: provMap.get(expectedProvId)
      });
    }
  });

  if (inconsistencias.length === 0) {
    console.log("🎉 ¡EXCELENTE! Todas las localidades analizadas corresponden 100% a sus provincias oficiales.");
  } else {
    console.log(`⚠️ Se encontraron ${inconsistencias.length} localidades mal asignadas:`);
    console.table(inconsistencias);

    console.log("\nProcediendo a corregir las inconsistencias encontradas en Supabase...");
    for (const inc of inconsistencias) {
      const { error: updErr } = await supabase
        .from('localidades')
        .update({ provincia_id: inc.provincia_esperada_id })
        .eq('id', inc.id);

      if (updErr) {
        console.error(`Error corrigiendo localidad ${inc.id} (${inc.nombre}):`, updErr);
      } else {
        console.log(`✅ Localidad #${inc.id} "${inc.nombre}" actualizada de ${inc.provincia_actual_nombre} -> ${inc.provincia_esperada_nombre}`);
      }
    }
  }
}

auditAndFix();
