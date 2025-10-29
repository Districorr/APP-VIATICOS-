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
    // --- CONSULTA SIMPLIFICADA ---
    // No intentamos hacer el join. Solo leemos de 'perfiles'.
    const { data: perfilesData, error: perfilesError } = await supabase
      .from('perfiles')
      .select('id, rol, nombre_completo, puesto, email, formato_predeterminado_id')
      .order('nombre_completo');

    if (perfilesError) throw perfilesError;

    // El mapeo ahora es más directo
    usuarios.value = perfilesData.map(p => ({
        id: p.id,
        email: p.email || 'Email no registrado en perfil',
        perfiles: {
            rol: p.rol,
            nombre_completo: p.nombre_completo,
            puesto: p.puesto,
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
  usuarioSeleccionado.value = { ...usuario };
  mostrarFormulario.value = true;
};

const cerrarFormulario = () => {
  mostrarFormulario.value = false;
  usuarioSeleccionado.value = null;
};

const handleGuardado = () => {
  fetchUsuarios();
  cerrarFormulario();
};
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-gray-800">Gestionar Usuarios</h1>
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
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="usuarios.length === 0" class="bg-white p-6 rounded-lg shadow-md text-center">
      <p class="text-gray-600">No hay usuarios para mostrar.</p>
    </div>

    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Completo</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
            <th scope="col" class="relative px-6 py-3"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="usuario in usuarios" :key="usuario.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ usuario.email }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ usuario.perfiles?.nombre_completo || '-' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{{ usuario.perfiles?.rol?.replace('_', ' ') || 'N/A' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button @click="abrirFormularioParaEditar(usuario)" class="text-indigo-600 hover:text-indigo-900">Editar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>