// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from '../supabaseClient.js'; 
// getInitialUser sigue siendo útil, pero no lo "esperaremos" de forma bloqueante
// import { getInitialUser } from '../supabaseClient.js'; // Esta importación no es usada directamente en el guardián

// --- Importación de Vistas de Usuario ---
import AdminVehiculosView from '../views/admin/AdminVehiculosView.vue'
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import DashboardView from '../views/DashboardView.vue';
import ViajesListView from '../views/ViajesListView.vue'; 
import ViajeFormView from '../views/ViajeFormView.vue';   
import GastosListView from '../views/GastosListView.vue'; 
import GastoFormView from '../views/GastoFormView.vue';   
import PerfilView from '../views/PerfilView.vue';
import ActualizarContrasenaView from '../views/ActualizarContrasenaView.vue';
import ReportesView from '../views/ReportesView.vue'; // Agregué esta importación, ya que se usaba via lazy load
import NotificacionesView from '../views/NotificacionesView.vue'; // Agregué esta importación, ya que se usaba via lazy load

// --- Importación de Vistas de Administración ---
import AdminGestionSolicitudesView from '../views/admin/AdminGestionSolicitudesView.vue'; // Agregué esta importación, ya que se usaba via lazy load
import AdminGestionCajasView from '../views/admin/AdminGestionCajasView.vue';
import AdminLayout from '../views/admin/AdminLayout.vue';
import AdminDashboardView from '../views/admin/AdminDashboardView.vue';
import AdminTiposGastoGlobalesView from '../views/admin/AdminTiposGastoGlobalesView.vue';
import AdminGestionFormatos from '../views/admin/AdminGestionFormatos.vue';
import AdminCamposFormatoView from '../views/admin/AdminCamposFormatoView.vue';
import AdminAsignarUsuariosFormatoView from '../views/admin/AdminAsignarUsuariosFormatoView.vue';
import AdminViajesListView from '../views/admin/AdminViajesListView.vue'; 
import AdminGastosListView from '../views/admin/AdminGastosListView.vue';
import AdminUsuariosView from '../views/admin/AdminUsuariosView.vue'; // Agregué esta importación, ya que se usaba via lazy load
import AdminAnalyticsView from '../views/admin/AdminAnalyticsView.vue'; // Agregué esta importación, ya que se usaba via lazy load
import AdminClientesView from '../views/admin/AdminClientesView.vue'; // Agregué esta importación, ya que se usaba via lazy load
import AdminTransportesView from '../views/admin/AdminTransportesView.vue'; // Agregué esta importación, ya que se usaba via lazy load

// INICIO: INTEGRACIÓN CAJA DIARIA - Importar la nueva vista
import CajaDiariaView from '../views/CajaDiariaView.vue';
// FIN: INTEGRACIÓN CAJA DIARIA

console.log("router/index.js: Script INICIADO. Todas las vistas importadas.");

const routes = [
  // --- Tu definición de rutas original se mantiene aquí, completa ---
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
    component: ReportesView, // Usamos importación directa
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
    path: '/rendiciones/delegados',
    name: 'GastosDelegados',
    component: () => import('../views/GastosDelegadosView.vue'),
    meta: { requiresAuth: true, title: 'Gastos Delegados' }
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
    component: NotificacionesView, // Usamos importación directa
    meta: { requiresAuth: true, title: 'Mis Notificaciones' }
  },
  {
    path: '/perfil',
    name: 'Perfil',
    component: PerfilView,
    meta: { requiresAuth: true, title: 'Mi Perfil' }
  },
  {
    path: '/caja-diaria',
    name: 'CajaDiaria',
    component: CajaDiariaView,
    meta: { requiresAuth: true, requiresCajaResponsible: true, title: 'Caja Diaria' }
  },
  
{
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', name: 'AdminDashboard', component: AdminDashboardView, meta: { title: 'Admin: Dashboard' } },
      
      { path: 'cajas-diarias', name: 'AdminGestionCajas', component: AdminGestionCajasView, meta: { title: 'Admin: Cajas Diarias' } },
      
      // --- INICIO DE MI MODIFICACIÓN ---
      // He añadido la nueva ruta aquí, agrupada lógicamente con la gestión de cajas.
      { 
        path: 'solicitudes-caja', 
        name: 'AdminGestionSolicitudes', 
        component: AdminGestionSolicitudesView, 
        meta: { title: 'Admin: Solicitudes de Caja' } 
      },
      // --- FIN DE MI MODIFICACIÓN ---
      
      { path: 'tipos-gasto', name: 'AdminTiposGastoGlobales', component: AdminTiposGastoGlobalesView, meta: { title: 'Admin: Tipos de Gasto' } },
      { path: 'formatos-gasto', name: 'AdminFormatosGasto', component: AdminGestionFormatos, meta: { title: 'Admin: Formatos de Gasto' } },
      { path: 'usuarios', name: 'AdminUsuarios', component: AdminUsuariosView, meta: { title: 'Admin: Gestión de Usuarios' } },
      { path: 'formatos-gasto/:formatoId/campos', name: 'AdminCamposFormato', component: AdminCamposFormatoView, props: true, meta: { title: 'Admin: Campos de Formato' } },
      { path: 'formatos-gasto/:formatoId/asignar-usuarios', name: 'AdminAsignarUsuariosFormato', component: AdminAsignarUsuariosFormatoView, props: true, meta: { title: 'Admin: Asignar Formatos' } },
      { path: 'todos-los-viajes', name: 'AdminViajesList', component: AdminViajesListView, meta: { title: 'Admin: Todas las Rendiciones' } },
      { path: 'gastos', name: 'AdminGastosList', component: AdminGastosListView, meta: { title: 'Admin: Todos los Gastos' } },
      { path: 'analiticas', name: 'AdminAnalytics', component: AdminAnalyticsView, meta: { title: 'Admin: Gráficos y Estadísticas' } },
      { path: 'clientes', name: 'AdminClientes', component: AdminClientesView, meta: { title: 'Admin: Clientes' } },
      { path: 'transportes', name: 'AdminTransportes', component: AdminTransportesView, meta: { title: 'Admin: Transportes' } },
      { path: 'vehiculos', name: 'AdminVehiculos', component: AdminVehiculosView, meta: { title: 'Admin: Flota de Vehículos' } },
    ]
  },
  
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
  scrollBehavior: (to, from, savedPosition) => {
    return savedPosition ? savedPosition : { top: 0, behavior: 'smooth' };
  }
});

const APP_NAME = "Districorr InfoGastos"; 

// --- GUARDIÁN DE RUTAS FINAL (ARQUITECTURA ROBUSTA) ---
router.beforeEach(async (to, from, next) => {
  console.log("%c--- Router Guard: Inicio de Chequeo ---", "color: blue; font-weight: bold;");
  console.log(`Navegando DESDE: '${String(from.name || from.path)}' (Path: ${from.fullPath}) HACIA: '${String(to.name || to.path)}' (Path: ${to.fullPath})`);

  document.title = to.meta.title ? `${to.meta.title} - ${APP_NAME}` : APP_NAME;

  const { data: { session } } = await supabase.auth.getSession();
  const isAuthenticated = !!session?.user;

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin);
  const requiresCajaResponsible = to.matched.some(record => record.meta.requiresCajaResponsible);

  console.log(`Router Guard: isAuthenticated (sesión Supabase): ${isAuthenticated}`);
  console.log(`Router Guard: Meta de la ruta '${String(to.name)}': requiresAuth=${requiresAuth}, requiresGuest=${requiresGuest}, requiresAdmin=${requiresAdmin}, requiresCajaResponsible=${requiresCajaResponsible}`);

  if (requiresAuth && !isAuthenticated) {
    console.log("%cRouter Guard: ACCIÓN -> Redirigiendo a Login (requiere auth, no autenticado).", "color: orange;");
    return next({ name: 'Login', query: { redirectTo: to.fullPath } });
  }

  if (requiresGuest && isAuthenticated) {
    console.log("%cRouter Guard: ACCIÓN -> Usuario autenticado en ruta de invitado. Redirigiendo a Dashboard.", "color: orange;");
    return next({ name: 'Dashboard' });
  }

  let userRole = null;

  if (isAuthenticated && (requiresAdmin || requiresCajaResponsible)) {
    console.log(`Router Guard: Ruta de admin/caja. Obteniendo perfil para rol...`);
    try {
      const { data: profile } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', session.user.id)
        .single();
      
      userRole = profile?.rol;
      console.log(`Router Guard: Rol del perfil obtenido: '${userRole}'`);

      if (requiresAdmin && userRole !== 'admin') {
        console.log(`%cRouter Guard: ACCIÓN -> Acceso DENEGADO a ruta admin. Rol: '${userRole}'.`, "color: red;");
        return next({ name: 'Dashboard' }); 
      }
    } catch (e) {
      console.error("Router Guard: Excepción al obtener rol del perfil (para admin/caja):", e.message);
      return next({ name: 'Dashboard' });
    }
  }

  if (requiresCajaResponsible && isAuthenticated) {
    if (userRole === 'admin') {
      console.log("Router Guard: ACCIÓN -> Permitiendo a admin el acceso a ruta de Caja Diaria.");
    } else {
      const { count, error: cajaError } = await supabase
        .from('cajas_chicas')
        .select('id', { count: 'exact', head: true })
        .eq('responsable_id', session.user.id)
        .eq('activo', true);

      if (cajaError) {
        console.error("Router Guard: Error al verificar responsable de caja:", cajaError.message);
        return next({ name: 'Dashboard' });
      }

      if (count > 0) {
        console.log("Router Guard: ACCIÓN -> Permitiendo acceso a Caja Diaria (responsable de caja).");
      } else {
        console.log("Router Guard: ACCIÓN -> Redirigiendo a Dashboard (no responsable de caja).");
        return next({ name: 'Dashboard' });
      }
    }
  }

  console.log(`%cACCIÓN -> Permitiendo navegación a '${String(to.name || to.path)}'.`, "color: green;");
  next();
  console.log("%c--- Router Guard: Fin de Chequeo ---", "color: blue;");
});

export default router;