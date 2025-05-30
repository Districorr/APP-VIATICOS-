// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// ¡¡TUS CLAVES REALES DE SUPABASE!!
const supabaseUrl = 'https://lluhjkslpvudqueqtvhg.supabase.co';
const supabaseAnonKey ='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWhqa3NscHZ1ZHF1ZXF0dmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzA1MDIsImV4cCI6MjA2MzQwNjUwMn0.3ytZAbh1zaxJXuBhzJQ5bjBOtTCad6tFpvAhwUhJAys';

// Ya no necesitamos estas alertas si las claves están bien puestas arriba.
// if (!supabaseUrl || supabaseUrl.includes('TU_SUPABASE_URL_REAL') || supabaseUrl.length < 20) {
//   const errorMessage = '¡Atención! La URL de Supabase no parece estar configurada correctamente en src/supabaseClient.js';
//   console.error(errorMessage);
//   alert(errorMessage);
// }
// if (!supabaseAnonKey || supabaseAnonKey.includes('TU_SUPABASE_ANON_KEY_REAL') || supabaseAnonKey.length < 50) {
//   const errorMessage = '¡Atención! La Clave Anónima de Supabase no parece estar configurada correctamente en src/supabaseClient.js';
//   console.error(errorMessage);
//   alert(errorMessage);
// }

export const supabase = createClient(supabaseUrl, supabaseAnonKey);