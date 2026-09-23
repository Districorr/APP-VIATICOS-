const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Lista de parejas válidas (Localidad - Provincia ID) en la geografía argentina
const PAREJAS_VALIDAS = [
  // CORRIENTES (7)
  { nombre: 'Corrientes', provincia_id: 7 },
  { nombre: 'Goya', provincia_id: 7 },
  { nombre: 'Paso de los Libres', provincia_id: 7 },
  { nombre: 'Curuzú Cuatiá', provincia_id: 7 },
  { nombre: 'Mercedes', provincia_id: 7 },
  { nombre: 'Bella Vista', provincia_id: 7 },
  { nombre: 'Esquina', provincia_id: 7 },
  { nombre: 'Ituzaingó', provincia_id: 7 },
  { nombre: 'Santo Tomé', provincia_id: 7 },
  { nombre: 'Monte Caseros', provincia_id: 7 },
  { nombre: 'Saladas', provincia_id: 7 },
  { nombre: 'San Luis del Palmar', provincia_id: 7 },
  { nombre: 'Empedrado', provincia_id: 7 },
  { nombre: 'Santa Lucía', provincia_id: 7 },
  { nombre: 'Caá Catí', provincia_id: 7 },
  { nombre: 'Mburucuyá', provincia_id: 7 },
  { nombre: 'Gobernador Virasoro', provincia_id: 7 },
  { nombre: 'Itatí', provincia_id: 7 },
  { nombre: 'Alvear', provincia_id: 7 },
  { nombre: 'General Alvear', provincia_id: 7 },
  { nombre: 'Concepción', provincia_id: 7 },
  { nombre: 'San Roque', provincia_id: 7 },
  { nombre: 'Santa Rosa', provincia_id: 7 },

  // BUENOS AIRES (1)
  { nombre: 'La Plata', provincia_id: 1 },
  { nombre: 'Mar del Plata', provincia_id: 1 },
  { nombre: 'Bahía Blanca', provincia_id: 1 },
  { nombre: 'Tandil', provincia_id: 1 },
  { nombre: 'Mercedes', provincia_id: 1 },
  { nombre: 'Ituzaingó', provincia_id: 1 },
  { nombre: 'Junín', provincia_id: 1 },
  { nombre: 'Castelli', provincia_id: 1 },
  { nombre: 'San Pedro', provincia_id: 1 },
  { nombre: 'San Vicente', provincia_id: 1 },
  { nombre: 'General Alvear', provincia_id: 1 },
  { nombre: 'Maipú', provincia_id: 1 },
  { nombre: 'Rivadavia', provincia_id: 1 },

  // CABA (2)
  { nombre: 'CABA', provincia_id: 2 },
  { nombre: 'Buenos Aires', provincia_id: 2 },

  // CHACO (4)
  { nombre: 'Resistencia', provincia_id: 4 },
  { nombre: 'Presidencia Roque Sáenz Peña', provincia_id: 4 },
  { nombre: 'Villa Ángela', provincia_id: 4 },
  { nombre: 'Charata', provincia_id: 4 },
  { nombre: 'Juan José Castelli', provincia_id: 4 },
  { nombre: 'Castelli', provincia_id: 4 },

  // SANTA FE (21)
  { nombre: 'Rosario', provincia_id: 21 },
  { nombre: 'Santa Fe', provincia_id: 21 },
  { nombre: 'Rafaela', provincia_id: 21 },
  { nombre: 'Venado Tuerto', provincia_id: 21 },
  { nombre: 'Reconquista', provincia_id: 21 },
  { nombre: 'Santo Tomé', provincia_id: 21 },

  // ENTRE RÍOS (8)
  { nombre: 'Paraná', provincia_id: 8 },
  { nombre: 'Concordia', provincia_id: 8 },
  { nombre: 'Gualeguaychú', provincia_id: 8 },
  { nombre: 'Concepción del Uruguay', provincia_id: 8 },

  // CÓRDOBA (6)
  { nombre: 'Córdoba', provincia_id: 6 },
  { nombre: 'Río Cuarto', provincia_id: 6 },
  { nombre: 'Villa María', provincia_id: 6 },
  { nombre: 'Villa Carlos Paz', provincia_id: 6 },
  { nombre: 'General Roca', provincia_id: 6 },

  // MENDOZA (13)
  { nombre: 'Mendoza', provincia_id: 13 },
  { nombre: 'San Rafael', provincia_id: 13 },
  { nombre: 'Godoy Cruz', provincia_id: 13 },
  { nombre: 'Guaymallén', provincia_id: 13 },
  { nombre: 'Maipú', provincia_id: 13 },
  { nombre: 'General Alvear', provincia_id: 13 },
  { nombre: 'Junín', provincia_id: 13 },
  { nombre: 'Rivadavia', provincia_id: 13 },
  { nombre: 'Santa Rosa', provincia_id: 13 },

  // RÍO NEGRO (16)
  { nombre: 'Bariloche', provincia_id: 16 },
  { nombre: 'San Carlos de Bariloche', provincia_id: 16 },
  { nombre: 'Viedma', provincia_id: 16 },
  { nombre: 'General Roca', provincia_id: 16 },
  { nombre: 'Cipolletti', provincia_id: 16 },
  { nombre: 'El Bolsón', provincia_id: 16 },

  // MISIONES (14)
  { nombre: 'Posadas', provincia_id: 14 },
  { nombre: 'Puerto Iguazú', provincia_id: 14 },
  { nombre: 'Oberá', provincia_id: 14 },
  { nombre: 'Eldorado', provincia_id: 14 },
  { nombre: 'San Vicente', provincia_id: 14 }
];

async function ensureValidPairs() {
  console.log("=== VERIFICANDO Y ASEGURANDO EXISTENCIA DE PAREJAS VÁLIDAS ===");

  const { data: existingLocs } = await supabase.from('localidades').select('id, nombre, provincia_id');
  const existingSet = new Set((existingLocs || []).map(l => `${l.nombre.trim().toUpperCase()}_${l.provincia_id}`));

  for (const item of PAREJAS_VALIDAS) {
    const key = `${item.nombre.trim().toUpperCase()}_${item.provincia_id}`;
    if (!existingSet.has(key)) {
      console.log(`➕ Insertando pareja legítima faltante: ${item.nombre} (provincia_id: ${item.provincia_id})`);
      const { error: insErr } = await supabase
        .from('localidades')
        .insert({ nombre: item.nombre, provincia_id: item.provincia_id });

      if (insErr) {
        console.error(`Error insertando ${item.nombre}:`, insErr.message);
      } else {
        existingSet.add(key);
      }
    }
  }

  console.log("\n✅ Auditoría de parejas válidas finalizada.");
}

ensureValidPairs();
