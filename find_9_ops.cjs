const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function find9Ops() {
  console.log("=== INSPECCIÓN DE OPERACIONES SIN ID DE DESTINO ===");

  const [gastosRes, transportesRes, proveedoresRes, tiposRes, clientesRes] = await Promise.all([
    supabase.from('gastos').select('*').order('fecha_gasto', { ascending: false }),
    supabase.from('transportes').select('id, nombre'),
    supabase.from('proveedores').select('id, nombre'),
    supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto'),
    supabase.from('clientes').select('id, nombre_cliente')
  ]);

  const transportesMap = new Map((transportesRes.data || []).map(t => [t.id, t.nombre]));
  const proveedoresMap = new Map((proveedoresRes.data || []).map(p => [p.id, p.nombre]));
  const tiposMap = new Map((tiposRes.data || []).map(t => [t.id, t.nombre_tipo_gasto]));
  const clientesMap = new Map((clientesRes.data || []).map(c => [c.id, c.nombre_cliente]));

  const LOGISTICA_ID = 22;
  const filtered = (gastosRes.data || []).filter(item => {
    const extra = item.datos_adicionales || {};
    const tipoNombre = (tiposMap.get(item.tipo_gasto_id) || '').toLowerCase();
    return (
      item.tipo_gasto_id === LOGISTICA_ID ||
      extra.modulo === 'logistica' ||
      extra.tipo_logistica != null ||
      extra.origen_carga === 'encomiendas_carga_multiple' ||
      tipoNombre.includes('envio') ||
      tipoNombre.includes('logistica') ||
      tipoNombre.includes('encomienda')
    );
  });

  const sinDestinoList = filtered.filter(g => {
    const hasProv = Boolean(g.provincia_id || g.provincia_destino_id);
    const hasLoc = Boolean(g.localidad_destino_id || g.localidad_destino?.id);
    return !hasProv && !hasLoc;
  });

  console.log(`TOTAL HALLADAS SIN DESTINO IDs: ${sinDestinoList.length}\n`);

  sinDestinoList.forEach((g, idx) => {
    const extra = g.datos_adicionales || {};
    const transpNombre = g.transporte_id ? (transportesMap.get(g.transporte_id) || 'ID '+g.transporte_id) : '—';
    const provNombre = g.proveedor_id ? (proveedoresMap.get(g.proveedor_id) || 'ID '+g.proveedor_id) : (extra.tipo_logistica === 'cirugia' ? 'Logística de Cirugía' : '—');
    const clienteNombre = g.cliente_id ? (clientesMap.get(g.cliente_id) || 'ID '+g.cliente_id) : (g.paciente_referido || '—');

    console.log(`--- [OPERACIÓN #${idx + 1}] ---`);
    console.log(`ID Gasto: ${g.id}`);
    console.log(`Fecha: ${g.fecha_gasto}`);
    console.log(`Monto Total: $${g.monto_total}`);
    console.log(`Transporte: ${transpNombre}`);
    console.log(`Proveedor / Tipo: ${provNombre}`);
    console.log(`Cliente / Pte: ${clienteNombre}`);
    console.log(`Guía / Factura: ${g.numero_factura || extra.numero_guia || '—'}`);
    console.log(`Descripción: ${g.descripcion_general || 'Sin descripción'}`);
    console.log(`Texto libre de destino (si existe): "${extra.destino_texto || extra.localidad_destino_texto || '—'}"`);
    console.log(`datos_adicionales:`, JSON.stringify(extra, null, 2));
    console.log('');
  });
}

find9Ops();
