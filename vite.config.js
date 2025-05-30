import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Opcional: si necesitas que el servidor de desarrollo sea accesible en tu red local
  // server: {
  //   host: true
  // }
})