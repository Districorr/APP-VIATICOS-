<script setup>
import { RouterLink } from 'vue-router';
// Podrías importar y mostrar algunos datos resumidos aquí si quisieras en el futuro
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-6 text-center sm:text-left">
        <router-link :to="{ name: 'Dashboard' }" class="text-sm text-districorr-accent hover:underline">
            ← Volver al Panel Principal de Usuario
        </router-link>
    </div>

    <h1 class="text-3xl font-bold text-districorr-primary mb-8 text-center">Panel de Administración</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <RouterLink
        :to="{ name: 'AdminTiposGastoGlobales' }"
        class="block p-6 bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow transform hover:-translate-y-1"
      >
        <h2 class="text-xl font-semibold text-districorr-accent mb-2">Gestionar Tipos de Gasto</h2>
        <p class="text-districorr-text-medium text-sm">
          Crear, editar y administrar la lista maestra de todos los tipos de gasto disponibles en la aplicación.
        </p>
      </RouterLink>

      <RouterLink
        :to="{ name: 'AdminFormatosGasto' }"
        class="block p-6 bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow transform hover:-translate-y-1"
      >
        <h2 class="text-xl font-semibold text-districorr-accent mb-2">Gestionar Formatos de Gasto</h2>
        <p class="text-districorr-text-medium text-sm">
          Definir diferentes plantillas o secciones para la carga de gastos, asignando qué tipos de gasto son aplicables a cada formato.
        </p>
      </RouterLink>

      <!-- Próximamente: Gestionar Usuarios -->
      <div class="block p-6 bg-gray-200 rounded-xl shadow-lg cursor-not-allowed opacity-70">
        <h2 class="text-xl font-semibold text-gray-500 mb-2">Gestionar Usuarios</h2>
        <p class="text-gray-400 text-sm">
          Asignar roles y formatos predeterminados a los usuarios (próximamente).
        </p>
      </div>

       <!-- Próximamente: Configurar Campos por Formato -->
      <div class="block p-6 bg-gray-200 rounded-xl shadow-lg cursor-not-allowed opacity-70">
        <h2 class="text-xl font-semibold text-gray-500 mb-2">Configurar Campos de Formato</h2>
        <p class="text-gray-400 text-sm">
          Definir los campos específicos (texto, número, fecha, etc.) para cada formato de gasto (próximamente).
        </p>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Estilos específicos para AdminDashboardView si son necesarios */
</style>