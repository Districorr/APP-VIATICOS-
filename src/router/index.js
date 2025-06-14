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
import AdminLayout from '../views/admin/AdminLayout.vue';
import AdminDashboardView from '../views/admin/AdminDashboardView.vue';
import AdminTiposGastoGlobalesView from '../views/admin/AdminTiposGastoGlobalesView.vue';
import AdminGestionFormatos from '../views/admin/AdminGestionFormatos.vue';
import AdminCamposFormatoView from '../views/admin/AdminCamposFormatoView.vue';
import AdminAsignarUsuariosFormatoView from '../views/admin/AdminAsignarUsuariosFormatoView.vue';
import AdminViajesListView from '../views/admin/AdminViajesListView.vue'; 
import AdminGastosListView from '../views/admin/AdminGastosListView.vue';

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
    meta: { title: 'Actualizar Contraseña' }
  },
  {
    path: '/', 
    name: 'Dashboard', 
    component: DashboardView,
    meta: { requiresAuth: true, title: 'Inicio' }
  },
  {
    path: '/viajes',
    name: 'ViajesListUser', 
    component: ViajesListView,
    meta: { requiresAuth: true, title: 'Mis Rendiciones' }
  },
  {
    path: '/reportes',
    name: 'Reportes',
    component: () => import('../views/ReportesView.vue'),
    meta: { requiresAuth: true, title: 'Mis Reportes' }
  },
  {
    path: '/viajes/nuevo',
    name: 'ViajeCreate', 
    component: ViajeFormView,
    meta: { requiresAuth: true, title: 'Nueva Rendición' }
  },
  {
    path: '/viajes/editar/:id',
    name: 'ViajeEdit', 
    component: ViajeFormView,
    props: true,
    meta: { requiresAuth: true, title: 'Editar Rendición' }
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
  path: '/notificaciones',
  name: 'Notificaciones',
  component: () => import('../views/NotificacionesView.vue'),
  meta: { requiresAuth: true, title: 'Mis Notificaciones' }
  },
  {
    path: '/perfil',
    name: 'Perfil',
    component: PerfilView,
    meta: { requiresAuth: true, title: 'Mi Perfil' }
  },
    // --- INICIO DE LA REESTRUCTURACIÓN DE RUTAS DE ADMINISTRACIÓN ---
  {
    path: '/admin',
    component: AdminLayout, // El componente padre es el Layout
    meta: { requiresAuth: true, requiresAdmin: true }, // Metadatos comunes para todos los hijos
    children: [
      {
        path: '', // El path vacío coincide con /admin y muestra el Dashboard
        name: 'AdminDashboard',
        component: AdminDashboardView,
        meta: { title: 'Admin: Dashboard' }
      },
      {
        path: 'tipos-gasto', // path relativo, se convierte en /admin/tipos-gasto
        name: 'AdminTiposGastoGlobales',
        component: AdminTiposGastoGlobalesView,
        meta: { title: 'Admin: Tipos de Gasto' }
      },
      {
        path: 'formatos-gasto', // path relativo
        name: 'AdminFormatosGasto',
        component: AdminGestionFormatos, // Usando el componente renombrado
        meta: { title: 'Admin: Formatos de Gasto' }
      },
      {
        path: 'usuarios',
        name: 'AdminUsuarios',
        component: () => import('../views/admin/AdminUsuariosView.vue'),
        meta: { title: 'Admin: Gestión de Usuarios' }
      },
      {
        path: 'formatos-gasto/:formatoId/campos',
        name: 'AdminCamposFormato',
        component: AdminCamposFormatoView,
        props: true,
        meta: { title: 'Admin: Campos de Formato' }
      },
      {
        path: 'formatos-gasto/:formatoId/asignar-usuarios',
        name: 'AdminAsignarUsuariosFormato',
        component: AdminAsignarUsuariosFormatoView,
        props: true,
        meta: { title: 'Admin: Asignar Formatos' }
      },
      { 
        path: 'todos-los-viajes',
        name: 'AdminViajesList',
        component: AdminViajesListView,
        meta: { title: 'Admin: Todas las Rendiciones' }
      },
      { 
        path: 'gastos', 
        name: 'AdminGastosList',
        component: AdminGastosListView,
        meta: { title: 'Admin: Todos los Gastos' }
      },
      {
        path: 'analiticas',
        name: 'AdminAnalytics',
        component: () => import('../views/admin/AdminAnalyticsView.vue'),
        meta: { title: 'Admin: Gráficos y Estadísticas' }
      },
      {
        path: 'clientes',
        name: 'AdminClientes',
        component: () => import('../views/admin/AdminClientesView.vue'),
        meta: { title: 'Admin: Clientes' }
      },
      {
        path: 'transportes',
        name: 'AdminTransportes',
        component: () => import('../views/admin/AdminTransportesView.vue'),
        meta: { title: 'Admin: Transportes' }
      },
    ]
  },
  // --- FIN DE LA REESTRUCTURACIÓN ---
  ];

// --- Redirección para rutas no encontradas (Catch-all) ---
routes.push({
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
});

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