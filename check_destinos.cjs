const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runAudit() {
  console.log("=== AUDITORÍA DE DATOS HISTÓRICOS DE DESTINOS EN LOGÍSTICA ===");

  const { data: tipos } = await supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto');
  console.log("Tipos de gasto en DB:", tipos);

  const { data: gastos, error: errGastos } = await supabase.from('gastos').select('id, tipo_gasto_id, provincia_id, localidad_destino_id, monto_total, fecha_gasto, datos_adicionales, descripcion_general');
  if (errGastos) {
    console.error("Error trayendo gastos:", errGastos);
    return;
  }

  console.log(`Total registros en gastos: ${gastos ? gastos.length : 0}`);
  
  const tiposCounts = {};
  gastos.forEach(g => {
    const tid = g.tipo_gasto_id || 'NULL';
    tiposCounts[tid] = (tiposCounts[tid] || 0) + 1;
  });
  console.log("Conteo de registros por tipo_gasto_id:", tiposCounts);

  // Analizar todos los registros
  let ambosPresentes = 0;
  let soloProvincia = 0;
  let soloLocalidad = 0;
  let sinDestinoId = 0;

  const sinDestinoList = [];

  gastos.forEach(g => {
    const hasProv = g.provincia_id != null;
    const hasLoc = g.localidad_destino_id != null;

    if (hasProv && hasLoc) {
      ambosPresentes++;
    } else if (hasProv && !hasLoc) {
      soloProvincia++;
    } else if (!hasProv && hasLoc) {
      soloLocalidad++;
    } else {
      sinDestinoId++;
      sinDestinoList.push(g);
    }
  });

  console.log(`\n--- ANÁLISIS DE DESTINOS GEOGRÁFICOS SOBRE LOS ${gastos.length} GASTOS ---`);
  console.log(`- Con Provincia ID y Localidad Destino ID completos: ${ambosPresentes} (${((ambosPresentes/gastos.length)*100).toFixed(1)}%)`);
  console.log(`- Con Solo Provincia ID (sin localidad ID): ${soloProvincia}`);
  console.log(`- Con Solo Localidad Destino ID (sin provincia ID): ${soloLocalidad}`);
  console.log(`- Sin ningún ID de Destino Geográfico (provincia_id y localidad_destino_id NULL): ${sinDestinoId} (${((sinDestinoId/gastos.length)*100).toFixed(1)}%)`);
}

runAudit();
