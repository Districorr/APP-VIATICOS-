import { ref } from 'vue';
import { supabase } from '../supabaseClient.js';

const destinosOptions = ref([]);
const provinciasOptions = ref([]);
const loading = ref(false);
const error = ref(null);
let loadedOnce = false;

export const OPCION_TODAS_LOCALIDADES = {
  id: 'todos',
  code: 'todos',
  value: 'todos',
  localidad_id: 'todos',
  provincia_id: 'todos',
  localidad_nombre: 'Todas las localidades',
  provincia_nombre: 'Todas las provincias',
  label: 'Todas las localidades (Todas las provincias)',
  is_all: true
};

export function useDestinosUnificados() {
  async function cargarDestinos(force = false) {
    if (loadedOnce && destinosOptions.value.length > 0 && !force) return;
    loading.value = true;
    error.value = null;
    try {
      const [provinciasRes, localidadesRes] = await Promise.all([
        supabase.from('provincias').select('id, nombre').order('nombre'),
        supabase.from('localidades').select('id, nombre, provincia_id, provincias(id, nombre)').order('nombre')
      ]);

      if (provinciasRes.error) throw provinciasRes.error;
      if (localidadesRes.error) throw localidadesRes.error;

      provinciasOptions.value = (provinciasRes.data || []).map(p => ({
        id: p.id,
        code: p.id,
        value: p.id,
        label: p.nombre,
        nombre: p.nombre
      }));

      const provMap = new Map();
      provinciasRes.data.forEach(p => provMap.set(p.id, p.nombre));

      destinosOptions.value = (localidadesRes.data || []).map(l => {
        const provNombre = l.provincias?.nombre || provMap.get(l.provincia_id) || 'Sin Provincia';
        return {
          id: l.id,
          code: l.id,
          value: l.id,
          localidad_id: l.id,
          provincia_id: l.provincia_id,
          localidad_nombre: l.nombre,
          provincia_nombre: provNombre,
          label: `${l.nombre} (${provNombre})`,
        };
      });

      loadedOnce = true;
    } catch (e) {
      console.error('Error al cargar destinos unificados:', e);
      error.value = e;
    } finally {
      loading.value = false;
    }
  }

  async function crearLocalidad({ nombre, provincia_id }) {
    const cleanNombre = (nombre || '').trim();
    const cleanProvId = Number(provincia_id);

    if (!cleanNombre) {
      throw new Error('El nombre de la localidad es obligatorio.');
    }
    if (!cleanProvId) {
      throw new Error('Debe seleccionar una provincia para la localidad.');
    }

    let createdRecord = null;
    let createdId = null;

    // 1. Intentar inserción directa estándar en la tabla 'localidades'
    const { data: directData, error: directErr } = await supabase
      .from('localidades')
      .insert({ nombre: cleanNombre, provincia_id: cleanProvId })
      .select('id, nombre, provincia_id, provincias(id, nombre)')
      .maybeSingle();

    if (!directErr && directData) {
      createdRecord = directData;
      createdId = directData.id;
    } else {
      // 2. Fallback a la RPC preexistente en Supabase 'crear_localidad_al_vuelo'
      const { data: rpcData, error: rpcErr } = await supabase.rpc('crear_localidad_al_vuelo', {
        p_nombre_localidad: cleanNombre,
        p_provincia_id: cleanProvId
      });

      if (rpcErr) {
        throw new Error(rpcErr.message || 'Error al crear la localidad en la base de datos.');
      }

      createdId = typeof rpcData === 'number' ? rpcData : Number(rpcData?.id || rpcData);

      const { data: fetchedData } = await supabase
        .from('localidades')
        .select('id, nombre, provincia_id, provincias(id, nombre)')
        .eq('id', createdId)
        .single();

      createdRecord = fetchedData || { id: createdId, nombre: cleanNombre, provincia_id: cleanProvId };
    }

    const provObj = provinciasOptions.value.find(p => p.id === cleanProvId);
    const provNombre = createdRecord?.provincias?.nombre || provObj?.nombre || 'Provincia';

    const newOption = {
      id: createdRecord.id || createdId,
      code: createdRecord.id || createdId,
      value: createdRecord.id || createdId,
      localidad_id: createdRecord.id || createdId,
      provincia_id: cleanProvId,
      localidad_nombre: createdRecord.nombre || cleanNombre,
      provincia_nombre: provNombre,
      label: `${createdRecord.nombre || cleanNombre} (${provNombre})`,
    };

    if (!destinosOptions.value.some(o => Number(o.localidad_id) === Number(newOption.localidad_id))) {
      destinosOptions.value.push(newOption);
      destinosOptions.value.sort((a, b) => a.localidad_nombre.localeCompare(b.localidad_nombre));
    }

    return newOption;
  }

  function findDestinoOption(localidadId, provinciaId) {
    if (localidadId === 'todos' || provinciaId === 'todos') {
      return OPCION_TODAS_LOCALIDADES;
    }
    if (!destinosOptions.value.length) return null;
    if (localidadId) {
      const match = destinosOptions.value.find(d => Number(d.localidad_id) === Number(localidadId));
      if (match) return match;
    }
    return null;
  }

  return {
    destinosOptions,
    provinciasOptions,
    loading,
    error,
    cargarDestinos,
    crearLocalidad,
    findDestinoOption,
    OPCION_TODAS_LOCALIDADES
  };
}
