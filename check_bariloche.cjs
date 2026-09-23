const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkBariloche() {
  console.log("=== INSPECCIONANDO REGISTROS DE 'BARILOCHE' Y PROVINCIAS EN SUPABASE ===");

  // 1. Provincias
  const { data: provs } = await supabase.from('provincias').select('*').order('id');
  console.log("Provincias en la base de datos:");
  console.table(provs);

  // 2. Localidades llamadas Bariloche o similares
  const { data: locs, error: errLocs } = await supabase
    .from('localidades')
    .select('id, nombre, provincia_id, provincias(id, nombre)')
    .ilike('nombre', '%bariloche%');

  if (errLocs) {
    console.error("Error al buscar Bariloche:", errLocs);
    return;
  }

  console.log("\nLocalidades encontradas con 'Bariloche':");
  console.log(JSON.stringify(locs, null, 2));
}

checkBariloche();
