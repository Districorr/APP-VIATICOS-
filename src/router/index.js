// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from '../supabaseClient.js'; 

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
import AdminViajesListView from '../views/admin/AdminViajesListView.vue'; 
import AdminGastosListView from '../views/admin/AdminGastosListView.vue';
// import AdminUsuariosView from '../views/admin/AdminUsuariosView.vue'; // MANTENER COMENTADO SI NO ESTÁ LISTO

console.log("router/index.js: Script INICIADO. Todas las vistas importadas.");

const routes = [
  // --- Rutas de Autenticación y Usuario ---
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresGuest: true, title: 'Iniciar Sesión' }
  },
  {
    path: '/registro',
    name: 'Register',
    component: RegisterView,
    meta: { requiresGuest: true, title: 'Registrarse' }
  },
  {
    path: '/actualizar-contrasena',
    name: 'ActualizarContrasena',
    component: ActualizarContrasenaView,
    meta: { title: 'Actualizar Contraseña' } // Abierta, ya que se accede desde un token de correo
  },
  
  // --- Rutas Principales de Usuario Autenticado ---
  {
    path: '/', 
    name: 'Dashboard', 
    component: DashboardView,
    meta: { requiresAuth: true, title: 'Dashboard Principal' }
  },
  {
    path: '/viajes',
    name: 'ViajesListUser', 
    component: ViajesListView,
    meta: { requiresAuth: true, title: 'Mis Viajes' }
  },
  {
    path: '/viajes/nuevo',
    name: 'ViajeCreate', 
    component: ViajeFormView,
    meta: { requiresAuth: true, title: 'Nuevo Viaje' }
  },
  {
    path: '/viajes/editar/:id',
    name: 'ViajeEdit', 
    component: ViajeFormView,
    props: true,
    meta: { requiresAuth: true, title: 'Editar Viaje' }
  },
  {
    path: '/gastos', 
    name: 'GastosListUser', 
    component: GastosListView,
    meta: { requiresAuth: true, title: 'Mis Gastos' }
  },
  {
    path: '/gastos/nuevo', 
    name: 'GastoFormCreate', 
    component: GastoFormView,
    meta: { requiresAuth: true, title: 'Nuevo Gasto' }
  },
  {
    path: '/gastos/editar/:id',
    name: 'GastoFormEdit', 
    component: GastoFormView,
    props: true,
    meta: { requiresAuth: true, title: 'Editar Gasto' }
  },
  {
    path: '/perfil',
    name: 'Perfil',
    component: PerfilView,
    meta: { requiresAuth: true, title: 'Mi Perfil' }
  },

  // --- Rutas de Administración ---
  {
    path: '/admin',
    name: 'AdminDashboard',
    component: AdminDashboardView,
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin: Dashboard' }
  },
  {
    path: '/admin/tipos-gasto',
    name: 'AdminTiposGastoGlobales',
    component: AdminTiposGastoGlobalesView,
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin: Tipos de Gasto' }
  },
  {
    path: '/admin/formatos-gasto',
    name: 'AdminFormatosGasto',
    component: AdminFormatosGastoView,
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin: Formatos de Gasto' }
  },
  {
    path: '/admin/formatos-gasto/:formatoId/campos',
    name: 'AdminCamposFormato',
    component: AdminCamposFormatoView,
    props: true,
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin: Campos de Formato' }
  },
  {
    path: '/admin/formatos-gasto/:formatoId/asignar-usuarios',
    name: 'AdminAsignarFormatoUsuarios', // Corregido el nombre para consistencia si lo tenías diferente
    component: AdminAsignarUsuariosFormatoView,
    props: true,
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin: Asignar Formatos' }
  },
  { 
    path: '/admin/todos-los-viajes',
    name: 'AdminViajesList',
    component: AdminViajesListView,
    meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin: Todos los Viajes' }
  },
  { 
    path: '/admin/gastos', 
    name: 'AdminGastosList',
    component: AdminGastosListView,
    meta: { 
      requiresAuth: true,
      requiresAdmin: true,
      title: 'Admin: Todos los Gastos'
    }
  },
  // { // RUTA PARA ADMIN USUARIOS - MANTENER COMENTADA SI NO ESTÁ IMPLEMENTADA
  //   path: '/admin/usuarios',
  //   name: 'AdminUsuarios',
  //   component: AdminUsuariosView, 
  //   meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin: Gestionar Usuarios' }
  // },

  // --- Redirección para rutas no encontradas (Catch-all) ---
  {
    path: '/:pathMatch(.*)*', 
    name: 'NotFound',
    redirect: async (to) => { 
      console.log(`Router (NotFound): Ruta no encontrada '${to.path}'. Redirigiendo...`);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          console.log("Router (NotFound): Usuario con sesión, redirigiendo a Dashboard.");
          return { name: 'Dashboard' }; 
        }
      } catch (e) {
        console.error("Router (NotFound): Error obteniendo sesión para redirección:", e);
      }
      console.log("Router (NotFound): Sin sesión o error, redirigiendo a Login.");
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

const APP_NAME = "Districorr InfoGastos"; 

router.beforeEach(async (to, from, next) => {
  console.log("%c--- Router Guard: Inicio de Chequeo ---", "color: blue; font-weight: bold;");
  console.log(`Navegando DESDE: '${String(from.name || from.path)}' (Path: ${from.fullPath}) HACIA: '${String(to.name || to.path)}' (Path: ${to.fullPath})`);

  document.title = to.meta.title ? `${to.meta.title} - ${APP_NAME}` : APP_NAME;

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error("Router Guard: Error crítico al obtener la sesión de Supabase:", sessionError.message);
    if (to.matched.some(record => record.meta.requiresAuth)) {
        console.warn("Router Guard: Error de sesión, redirigiendo a Login.");
        return next({ name: 'Login', query: { redirectTo: to.fullPath } });
    }
  }
  const isAuthenticated = !!session?.user;
  let userRole = null; 

  console.log(`Router Guard: isAuthenticated (sesión Supabase): ${isAuthenticated}`);

  if (isAuthenticated && (to.matched.some(record => record.meta.requiresAdmin) || (to.matched.some(record => record.meta.requiresAuth) && !to.matched.some(record => record.meta.requiresGuest)))) {
    console.log(`Router Guard: Usuario ID: ${session.user.id}. Obteniendo perfil para rol...`);
    try {
      const { data: profile, error: profileError, status } = await supabase
        .from('perfiles')
        .select('rol') 
        .eq('id', session.user.id)
        .single();
      
      if (profileError && status !== 406) { 
         console.warn("Router Guard: Error obteniendo rol del perfil desde BD:", profileError.message, `(Status: ${status})`);
      }
      if (profile) {
        userRole = profile.rol;
        console.log(`Router Guard: Rol del perfil obtenido: '${userRole}'`);
      } else { 
        console.warn(`Router Guard: Perfil no encontrado para ${session.user.id} en tabla 'perfiles'. Asumiendo rol por defecto o sin permisos de admin.`);
        userRole = 'usuario_sin_perfil'; 
      }
    } catch (e) {
      console.error("Router Guard: Excepción al intentar obtener rol del perfil:", e.message);
      userRole = 'error_obteniendo_rol'; 
    }
  } else if (!isAuthenticated) {
    console.log("Router Guard: Usuario NO autenticado.");
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin);

  console.log(`Router Guard: Meta de la ruta '${String(to.name)}': requiresAuth=${requiresAuth}, requiresGuest=${requiresGuest}, requiresAdmin=${requiresAdmin}`);

  if (requiresAuth && !isAuthenticated) {
    console.log("%cRouter Guard: ACCIÓN -> Redirigiendo a Login (requiere auth, no autenticado). Guardando redirectTo:", to.fullPath, "color: orange;");
    return next({ name: 'Login', query: { redirectTo: to.fullPath } });
  }
  
  if (requiresGuest && isAuthenticated) {
    const intendedRedirect = to.query.redirectTo || from.query.redirectTo; 
    // Evitar redirigir a /login si ya está autenticado y no hay un redirectTo más específico.
    // También evitar redirigir a la misma ruta de invitado si por alguna razón to.query.redirectTo es la misma ruta.
    if (intendedRedirect && typeof intendedRedirect === 'string' && intendedRedirect !== '/' && !intendedRedirect.startsWith('/login') && intendedRedirect !== to.path) {
      console.log(`%cRouter Guard: ACCIÓN -> Usuario autenticado en ruta guest. Redirigiendo a 'redirectTo': ${intendedRedirect}`, "color: orange;");
      return next({ path: intendedRedirect });
    } else {
      console.log("%cRouter Guard: ACCIÓN -> Usuario autenticado en ruta guest. Redirigiendo a Dashboard.", "color: orange;");
      return next({ name: 'Dashboard' });
    }
  }
  
  if (requiresAdmin && (!isAuthenticated || userRole !== 'admin')) {
    console.log(`%cRouter Guard: ACCIÓN -> Acceso DENEGADO a ruta admin. Rol: '${userRole}', Autenticado: ${isAuthenticated}. Redirigiendo...`, "color: red;");
    return next(isAuthenticated ? { name: 'Dashboard' } : { name: 'Login', query: { redirectTo: to.fullPath } });
  }
  
  console.log(`%cRouter Guard: ACCIÓN -> Permitiendo navegación a '${String(to.name || to.path)}'.`, "color: green;");
  next();
  console.log("%c--- Router Guard: Fin de Chequeo ---", "color: blue;");
});

console.log("router/index.js: Script FINALIZADO. Router exportado.");
export default router;