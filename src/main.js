// src/main.js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { supabase } from './supabaseClient';
import './assets/style.css';

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