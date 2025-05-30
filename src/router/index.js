// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from '../supabaseClient.js'; // Asegúrate que la ruta sea correcta

// Vistas de Usuario
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import DashboardView from '../views/DashboardView.vue';
import ViajesListView from '../views/ViajesListView.vue';
import ViajeFormView from '../views/ViajeFormView.vue';
import GastosListView from '../views/GastosListView.vue';
import GastoFormView from '../views/GastoFormView.vue';
import PerfilView from '../views/PerfilView.vue';
import ActualizarContrasenaView from '../views/ActualizarContrasenaView.vue';

// Vistas de Administración
import AdminDashboardView from '../views/admin/AdminDashboardView.vue';
import AdminTiposGastoGlobalesView from '../views/admin/AdminTiposGastoGlobalesView.vue';
import AdminFormatosGastoView from '../views/admin/AdminFormatosGastoView.vue';
import AdminCamposFormatoView from '../views/admin/AdminCamposFormatoView.vue';
import AdminAsignarUsuariosFormatoView from '../views/admin/AdminAsignarUsuariosFormatoView.vue';
import AdminViajesListView from '../views/admin/AdminViajesListView.vue'; // Import de la nueva vista
import AdminGastosListView from '../views/admin/AdminGastosListView.vue';
// import AdminUsuariosView from '../views/admin/AdminUsuariosView.vue'; // MANTENER COMENTADO SI NO ESTÁ LISTO

const routes = [
  // --- Rutas de Autenticación y Usuario ---

  
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresGuest: true }
  },
  {
    path: '/registro',
    name: 'Register',
    component: RegisterView,
    meta: { requiresGuest: true }
  },
  {
    path: '/actualizar-contrasena',
    name: 'ActualizarContrasena',
    component: ActualizarContrasenaView,
  },
  
  // --- Rutas Principales de Usuario Autenticado ---
  {
    path: '/', 
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
  },
  {
    path: '/viajes',
    name: 'ViajesList',
    component: ViajesListView,
    meta: { requiresAuth: true }
  },
  {
    path: '/viajes/nuevo',
    name: 'ViajeNuevo',
    component: ViajeFormView,
    meta: { requiresAuth: true }
  },
  {
    path: '/viajes/editar/:id',
    name: 'ViajeEditar',
    component: ViajeFormView,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/gastos',
    name: 'GastosList',
    component: GastosListView,
    meta: { requiresAuth: true }
  },
  {
    path: '/gastos/nuevo',
    name: 'GastoNuevo',
    component: GastoFormView,
    meta: { requiresAuth: true }
  },
  {
    path: '/gastos/editar/:id',
    name: 'GastoEditar',
    component: GastoFormView,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/perfil',
    name: 'Perfil',
    component: PerfilView,
    meta: { requiresAuth: true }
  },

  // --- Rutas de Administración ---
{
    path: '/admin',
    name: 'AdminDashboard',
    component: AdminDashboardView,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/tipos-gasto',
    name: 'AdminTiposGastoGlobales',
    component: AdminTiposGastoGlobalesView,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/formatos-gasto',
    name: 'AdminFormatosGasto',
    component: AdminFormatosGastoView,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/formatos-gasto/:formatoId/campos',
    name: 'AdminCamposFormato',
    component: AdminCamposFormatoView,
    props: true,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/formatos-gasto/:formatoId/asignar-usuarios',
    name: 'AdminAsignarFormatoUsuarios',
    component: AdminAsignarUsuariosFormatoView,
    props: true,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  { 
    path: '/admin/todos-los-viajes',
    name: 'AdminViajesList',
    component: AdminViajesListView,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  { // <--- NUEVA RUTA PARA ADMIN GASTOS LIST VIEW ---
    path: '/admin/gastos', // Puedes cambiar este path si prefieres otro, ej. /admin/todos-los-gastos
    name: 'AdminGastosList',
    component: AdminGastosListView,
    // props: true, // Si quieres que los query params se pasen como props, usa:
    // props: route => ({ viajeIdQuery: route.query.viajeId, otroQuery: route.query.otro }),
    meta: { 
      requiresAuth: true,
      requiresAdmin: true 
    }
  },
  // { // RUTA PARA ADMIN USUARIOS - MANTENER COMENTADA SI NO ESTÁ IMPLEMENTADA
  //   path: '/admin/usuarios',
  //   name: 'AdminUsuarios',
  //   component: AdminUsuariosView,
  //   meta: { requiresAuth: true, requiresAdmin: true }
  // },

  // --- Redirección para rutas no encontradas (Catch-all) ---
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: async (to) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          return { name: 'Dashboard' };
        }
      } catch (e) {
        console.error("Router Guard (NotFound): Error obteniendo sesión:", e);
      }
      return { name: 'Login' };
    }
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0, behavior: 'smooth' };
    }
  }
});

// Guardia de Navegación Global (Global beforeEach guard)
router.beforeEach(async (to, from, next) => {
  console.log("%c--- Router Guard: Inicio de Chequeo ---", "color: blue; font-weight: bold;");
  console.log(`Navegando DESDE: '${String(from.name)}' (Path: ${from.fullPath})`);
  console.log(`Navegando HACIA: '${String(to.name)}' (Path: ${to.fullPath})`);

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error("Router Guard: Error crítico al obtener la sesión de Supabase:", sessionError.message);
  }
  const isAuthenticated = !!session?.user;
  let userRole = null;

  console.log(`Router Guard: Estado de Autenticación al inicio de la guardia: ${isAuthenticated}`);

  if (isAuthenticated) {
    console.log(`Router Guard: Usuario autenticado (ID: ${session.user.id}). Obteniendo perfil...`);
    try {
      const { data: profile, error: profileError, status } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', session.user.id)
        .single();
      
      if (profileError && status !== 406) { 
         console.warn("Router Guard: Error obteniendo perfil desde BD:", profileError.message, `(Status: ${status})`);
      }
      if (profile) {
        userRole = profile.rol;
        console.log(`Router Guard: Rol del perfil obtenido: '${userRole}'`);
      } else if (!profileError || status === 406) {
        console.warn(`Router Guard: Perfil no encontrado en BD para usuario ${session.user.id}. Asumiendo rol 'usuario_comun'.`);
        userRole = 'usuario_comun'; 
      }
    } catch (e) {
      console.error("Router Guard: Excepción al intentar obtener perfil:", e.message);
      userRole = 'error_obteniendo_rol';
    }
  } else {
    console.log("Router Guard: Usuario NO autenticado.");
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin);

  console.log(`Router Guard: Meta de la ruta '${String(to.name)}': requiresAuth=${requiresAuth}, requiresGuest=${requiresGuest}, requiresAdmin=${requiresAdmin}`);

  if (requiresAuth && !isAuthenticated) {
    console.log("%cRouter Guard: ACCIÓN -> Redirigiendo a Login (requiere auth, no autenticado).", "color: orange;");
    next({ name: 'Login', query: { redirectTo: to.fullPath } });
  } else if (requiresGuest && isAuthenticated) {
    console.log("%cRouter Guard: ACCIÓN -> Redirigiendo a Dashboard (ruta guest, pero usuario autenticado).", "color: orange;");
    if (to.name === 'Dashboard') {
        console.log("%cRouter Guard: Ya en Dashboard, permitiendo.", "color: green;");
        next();
    } else {
        next({ name: 'Dashboard' });
    }
  } else if (requiresAdmin && userRole !== 'admin') {
    console.log(`%cRouter Guard: ACCIÓN -> Acceso denegado a ruta admin. Rol: '${userRole}'.`, "color: red;");
    alert('Acceso denegado. No tienes los permisos necesarios para acceder a esta sección.');
    next(isAuthenticated ? { name: 'Dashboard' } : { name: 'Login', query: { redirectTo: to.fullPath }});
  } else {
    let componentName = 'Desconocido/LazyLoaded';
    if (to.matched[0] && to.matched[0].components && to.matched[0].components.default) {
      const componentDefinition = to.matched[0].components.default;
      if (typeof componentDefinition === 'function') { 
        componentName = `Lazy<${to.matched[0].path}>`; 
      } else if (typeof componentDefinition === 'object' && componentDefinition !== null) {
        componentName = componentDefinition.__name || componentDefinition.name || 'ObjetoComponente';
      }
    }
    console.log(`Router Guard: Componente resuelto para '${String(to.name)}': ${componentName}`);
    console.log(`%cRouter Guard: ACCIÓN -> Permitiendo navegación a '${String(to.name)}'.`, "color: green;");
    next();
  }
  console.log("%c--- Router Guard: Fin de Chequeo ---", "color: blue;");
});

export default router;