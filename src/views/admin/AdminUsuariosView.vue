<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';
import UsuarioEditForm from '../../components/admin/UsuarioEditForm.vue';

const usuarios = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const mostrarFormulario = ref(false);
const usuarioSeleccionado = ref(null);

const fetchUsuarios = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    // Primero obtenemos todos los usuarios de auth.users
    // NOTA: Listar todos los usuarios puede requerir permisos especiales o una función de admin en Supabase
    // Por ahora, asumimos que podemos listarlos. Si no, esto necesitará una Edge Function con clave de servicio.
    // Una forma más segura es que el admin solo pueda buscar usuarios por email.
    // Para este ejemplo, intentaremos obtenerlos, pero puede fallar por RLS en auth.users.
    // Una mejor aproximación sería listar desde 'perfiles' y hacer un join o una segunda consulta a 'auth.users' si es necesario.

    const { data: perfilesData, error: perfilesError } = await supabase
      .from('perfiles')
      .select(`
        id,
        rol,
        nombre_completo,
        formato_predeterminado_id,
        users:auth_users (email)
      `); // Usamos la relación implícita o un join explícito

    if (perfilesError) throw perfilesError;

    // Mapeamos para tener una estructura más plana si es necesario, o usamos la anidada
    usuarios.value = perfilesData.map(p => ({
        id: p.id,
        email: p.users?.email || 'Email no disponible', // El email viene de la tabla auth.users
        perfiles: {
            rol: p.rol,
            nombre_completo: p.nombre_completo,
            formato_predeterminado_id: p.formato_predeterminado_id
        }
    }));

  } catch (error) {
    console.error('Error cargando usuarios:', error.message);
    errorMessage.value = 'No se pudieron cargar los usuarios. ' + error.message;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchUsuarios();
});

const abrirFormularioParaEditar = (usuario) => {
  usuarioSeleccionado.value = { ...usuario }; // Pasamos el objeto completo que incluye el perfil
  mostrarFormulario.value = true;
};

const cerrarFormulario = () => {
  mostrarFormulario.value = false;
  usuarioSeleccionado.value = null;
};

const handleGuardado = () => {
  fetchUsuarios(); // Recargar la lista
  // cerrarFormulario(); // Opcional: cerrar el formulario
};

</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-districorr-primary">Gestionar Usuarios</h1>
      <!-- Podríamos tener un botón para invitar usuarios si Supabase lo permite fácilmente -->
    </div>

    <div v-if="mostrarFormulario && usuarioSeleccionado" class="mb-8 p-6 bg-gray-50 rounded-lg shadow">
      <UsuarioEditForm
        :key="usuarioSeleccionado.id"
        :usuarioAEditar="usuarioSeleccionado"
        @guardado="handleGuardado"
        @cancelar="cerrarFormulario"
      />
    </div>

    <div v-if="loading" class="text-center py-10">Cargando usuarios...</div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-districorr-error text-districorr-error p-4 rounded-md" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="usuarios.length === 0" class="bg-white p-6 rounded-lg shadow-md text-center">
      <p class="text-gray-600">No hay usuarios para mostrar (o no se pudieron cargar).</p>
    </div>

    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Completo</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Formato Pred.</th>
            <th scope="col" class="relative px-6 py-3"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="usuario in usuarios" :key="usuario.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-districorr-text-dark">{{ usuario.email }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ usuario.perfiles?.nombre_completo || '-' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{{ usuario.perfiles?.rol?.replace('_', ' ') || 'N/A' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ usuario.perfiles?.formato_predeterminado_id || 'N/A' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button @click="abrirFormularioParaEditar(usuario)" class="text-districorr-accent hover:text-blue-700">Editar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped></style>