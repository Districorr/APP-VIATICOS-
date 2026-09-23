const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRioNegro() {
  const { data: locsRN } = await supabase
    .from('localidades')
    .select('id, nombre, provincia_id')
    .eq('provincia_id', 16);

  console.log("Localidades en Río Negro (provincia_id = 16):");
  console.table(locsRN);

  // También verificar si algún gasto hace referencia a las localidades 1371 o 1373
  const { data: gastos1371 } = await supabase.from('gastos').select('id, provincia_id, localidad_destino_id').eq('localidad_destino_id', 1371);
  const { data: gastos1373 } = await supabase.from('gastos').select('id, provincia_id, localidad_destino_id').eq('localidad_destino_id', 1373);

  console.log("Gastos que usan la localidad 1371 (Bariloche Corrientes):", gastos1371);
  console.log("Gastos que usan la localidad 1373 (Bariloche Buenos Aires):", gastos1373);
}

checkRioNegro();
