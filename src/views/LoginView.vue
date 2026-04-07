<template>
  <!-- LoginView simplemente renderiza el componente LoginForm. -->
  <!-- LoginForm.vue es ahora responsable de su propio layout, centrado, fondo, título, logo, etc. -->
  <LoginForm />
</template>

<script setup>
// Asegúrate de que la ruta al componente LoginForm sea correcta.
// Si LoginForm.vue está en 'src/components/forms/LoginForm.vue':
import LoginForm from '../components/LoginForm.vue';
console.log('LoginView: LoginForm importado:', LoginForm); // Verifica este log
console.log('LoginView.vue SCRIPT EJECUTADO');
// Si LoginForm.vue está directamente en 'src/components/LoginForm.vue':
// import LoginForm from '../components/LoginForm.vue';

// No se necesita más lógica aquí si LoginForm se encarga de todo.
// No necesitas RouterLink aquí si el enlace a Register está dentro de LoginForm.
</script>

<style scoped>
/* No se necesitan estilos aquí si LoginForm.vue maneja todo. */
</style>