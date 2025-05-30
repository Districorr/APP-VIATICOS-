// src/main.js
import { createApp } from 'vue'
import App from './App.vue'         // Tu componente raíz
import router from './router'     // Tu configuración de Vue Router (asegúrate que src/router/index.js exista)
import './assets/style.css';      // Tu archivo CSS principal con las directivas de Tailwind

// Creamos la instancia de la aplicación Vue
const app = createApp(App);

// Le decimos a Vue que use el router que configuramos
app.use(router);

// Montamos la aplicación en el elemento con id="app" en tu index.html
app.mount('#app');