// src/main.js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { supabase } from './supabaseClient';
import './assets/style.css';

// --- INICIO DE LA CORRECCIÓN PARA LEAFLET ---

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 1. Importar imágenes de los marcadores directamente desde la librería.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// 2. Soluciona un problema de compatibilidad con Vite/Webpack.
//    Leaflet no puede encontrar las rutas de sus íconos por defecto.
delete L.Icon.Default.prototype._getIconUrl;

// 3. Asignamos manualmente las rutas correctas a la configuración global de Leaflet.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// --- FIN DE LA CORRECCIÓN PARA LEAFLET ---


console.log('main.js (V-Final-Corregida): Script INICIADO.');

const app = createApp(App);
app.use(router);

// Bandera para asegurar que el montaje solo ocurra una vez.
let isMounted = false;

// onAuthStateChange se dispara al menos una vez al inicio con el estado de sesión final.
// Esta es nuestra señal para arrancar la aplicación Vue.
supabase.auth.onAuthStateChange((event, session) => {
  console.log(`main.js: Evento de Auth recibido -> ${event}`);
  
  // Montamos la aplicación solo en la primera llamada de este listener.
  // Esto previene el error "App has already been mounted".
  if (!isMounted) {
    console.log('main.js: Primera ejecución de onAuthStateChange. Montando la aplicación Vue...');
    app.mount('#app');
    isMounted = true;
    console.log('main.js: Aplicación montada y lista.');
  }
});