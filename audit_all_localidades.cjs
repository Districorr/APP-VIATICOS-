const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function auditLocalidades() {
  const { data: locs, error } = await supabase
    .from('localidades')
    .select('id, nombre, provincia_id, provincias(id, nombre)')
    .order('nombre');

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Total de localidades en la base de datos: ${locs.length}`);
  
  // Buscar duplicadas por nombre
  const namesMap = {};
  locs.forEach(l => {
    const name = l.nombre.trim().toUpperCase();
    if (!namesMap[name]) namesMap[name] = [];
    namesMap[name].push(l);
  });

  const dupes = Object.entries(namesMap).filter(([name, list]) => list.length > 1);
  console.log(`\nLocalidades duplicadas encontradas (${dupes.length}):`);
  dupes.forEach(([name, list]) => {
    console.log(`- ${name}:`, list.map(l => `#${l.id} (${l.provincias?.nombre})`).join(', '));
  });
}

auditLocalidades();
