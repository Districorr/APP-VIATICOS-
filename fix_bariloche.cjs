const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fixBariloche() {
  console.log("=== CORRIGIENDO PROVINCIA DE BARILOCHE EN LA BASE DE DATOS ===");

  // Actualizar localidad 1371 a provincia_id = 16 (Río Negro)
  const { data: updateData, error: updateErr } = await supabase
    .from('localidades')
    .update({ provincia_id: 16, nombre: 'BARILOCHE' })
    .eq('id', 1371)
    .select();

  if (updateErr) {
    console.error("Error al actualizar localidad 1371:", updateErr);
  } else {
    console.log("Localidad 1371 actualizada exitosamente a Río Negro:", updateData);
  }

  // Eliminar la duplicada id 1373 (o actualizarla si se prefiere)
  const { data: delData, error: delErr } = await supabase
    .from('localidades')
    .delete()
    .eq('id', 1373)
    .select();

  if (delErr) {
    console.error("Error al eliminar la localidad duplicada 1373:", delErr);
  } else {
    console.log("Localidad duplicada 1373 eliminada exitosamente:", delData);
  }
}

fixBariloche();
