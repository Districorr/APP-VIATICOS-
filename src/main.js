import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // Asume que es src/router/index.js
import './assets/style.css';

console.log('main.js: Instancia de Router importada:', router); // NUEVO LOG
console.log('main.js: Rutas definidas en el router:', router.getRoutes()); // NUEVO LOG

const app = createApp(App);

app.use(router);
console.log('main.js: app.use(router) ejecutado.'); // NUEVO LOG

app.mount('#app');
console.log('main.js: app.mount("#app") ejecutado.'); // NUEVO LOG