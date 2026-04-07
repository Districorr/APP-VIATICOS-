// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// --- Tus claves de Supabase ---
const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

// --- Creación del cliente de Supabase ---
export const supabase = createClient(supabaseUrl, supabaseAnonKey);


// --- LÓGICA CENTRALIZADA PARA OBTENER EL USUARIO INICIAL (SIN CACHÉ) ---

// Se elimina la variable `let userPromise = null;`

/**
 * Obtiene la sesión y el perfil del usuario actual directamente de Supabase.
 * Esta función ya no utiliza una caché propia (userPromise) para asegurar que
 * siempre se obtiene el estado más reciente, solucionando problemas de sesiones obsoletas.
 * @returns {Promise<{ session: import('@supabase/supabase-js').Session | null, profile: any | null }>}
 */
export const getInitialUser = async () => {
  // Ya no hay `if (userPromise)` aquí. Siempre se ejecuta la lógica.
  console.log("getInitialUser: Ejecutando lógica de obtención de usuario...");
  
  try {
    // 1. Obtenemos la sesión del usuario. Supabase gestiona su propia caché para esto.
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    // MANEJO DE ERROR DE TOKEN INVÁLIDO
    if (sessionError && sessionError.message.includes('Invalid Refresh Token')) {
      console.warn("getInitialUser: Refresh token inválido detectado. Forzando signOut para limpiar estado.");
      await supabase.auth.signOut();
      return { session: null, profile: null };
    }

    // Si no hay sesión, devolvemos un resultado nulo.
    if (!session?.user) {
      console.log("getInitialUser: No se encontró sesión válida.");
      return { session: null, profile: null };
    }
    
    console.log("getInitialUser: Sesión encontrada para el usuario:", session.user.id);

    // 2. Si hay sesión, obtenemos el perfil correspondiente.
    const { data: profile, error: profileError } = await supabase
      .from('perfiles')
      .select('id, email, rol, nombre_completo, puesto, formato_predeterminado_id')
      .eq('id', session.user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error("getInitialUser: Error al obtener el perfil:", profileError);
      return { session, profile: null };
    }

    console.log("getInitialUser: Perfil obtenido:", profile);
    return { session, profile };

  } catch (e) {
    console.error("getInitialUser: Excepción inesperada durante la obtención del usuario:", e);
    return { session: null, profile: null };
  }
};