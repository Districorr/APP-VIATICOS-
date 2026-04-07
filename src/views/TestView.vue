// src/views/TestView.vue
<script setup>
import { onMounted } from 'vue';
console.log('TestView.vue: Script setup INICIADO');

onMounted(() => {
  console.log('TestView.vue: Componente MONTADO');
});
</script>

<template>
  <div style="padding: 40px; border: 4px solid green; background-color: lightgreen; font-size: 20px;">
    <h1>¡¡¡TEST VIEW FUNCIONA!!!</h1>
    <p>Si ves este mensaje grande y verde, el problema está en el código original de DashboardView o cómo se integra.</p>
  </div>
</template>

<style scoped>
h1 {
  color: darkgreen;
  margin-bottom: 10px;
}
</style>