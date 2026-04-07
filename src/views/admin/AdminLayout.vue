<script setup>
// Este componente es un simple contenedor.
// En el futuro, podrías añadir aquí un encabezado o una barra lateral
// que sea común para todas las páginas de administración.
</script>

<template>
  <div>
    
    <!-- Este <router-view> es el corazón del layout. -->
    <!-- Aquí es donde Vue Router renderizará el componente de la ruta hija activa, -->
    <!-- ya sea AdminDashboardView, AdminGestionFormatos, etc. -->
    <router-view></router-view>
  </div>
</template>