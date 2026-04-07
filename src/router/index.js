// src/router/index.js (Versión Optimizada con Lazy Loading)

import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from '../supabaseClient.js'; 

// --- VISTAS DE CARGA INICIAL (ESTÁTICAS) ---
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';
import AdminLayout from '../views/admin/AdminLayout.vue';

console.log("router/index.js: Script INICIADO.");

const routes = [
  // ===============================================
  // RUTAS PÚBLICAS Y DE AUTENTICACIÓN
  // ===============================================
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresGuest: true, title: 'Iniciar Sesión' }
  },
  {
    path: '/registro',
    name: 'Register',
    component: () => import('../views/RegisterView.vue'),
    meta: { requiresGuest: true, title: 'Registrarse' }
  },
  {
    path: '/actualizar-contrasena',
    name: 'ActualizarContrasena',
    component: () => import('../views/ActualizarContrasenaView.vue'),
    meta: { title: 'Actualizar Contraseña' }
  },
  
  // ===============================================
  // RUTAS DE USUARIO AUTENTICADO
  // ===============================================
  {
    path: '/', 
    name: 'Dashboard', 
    component: DashboardView,
    meta: { requiresAuth: true, title: 'Inicio' }
  },
  {
    path: '/viajes',
    name: 'ViajesListUser', 
    component: () => import('../views/ViajesListView.vue'),
    meta: { requiresAuth: true, title: 'Mis Rendiciones' }
  },
  {
    path: '/viajes/nuevo',
    name: 'ViajeCreate', 
    component: () => import('../views/ViajeFormView.vue'),
    meta: { requiresAuth: true, title: 'Nueva Rendición' }
  },
  {
    path: '/viajes/editar/:id',
    name: 'ViajeEdit',
    component: () => import('../views/ViajeFormView.vue'),
    props: true,
    meta: { requiresAuth: true, title: 'Editar Rendición' }
  },
  {
    path: '/gastos', 
    name: 'GastosListUser', 
    component: () => import('../views/GastosListView.vue'),
    meta: { requiresAuth: true, title: 'Mis Gastos' }
  },
  {
    path: '/gastos/nuevo', 
    name: 'GastoFormCreate', 
    component: () => import('../views/GastoFormView.vue'),
    meta: { requiresAuth: true, title: 'Nuevo Gasto' }
  },
  {
    path: '/gastos/editar/:id',
    name: 'GastoFormEdit', 
    component: () => import('../views/GastoFormView.vue'),
    props: true,
    meta: { requiresAuth: true, title: 'Editar Gasto' }
  },
  {
    path: '/rendiciones/delegados',
    name: 'GastosDelegados',
    component: () => import('../views/GastosDelegadosView.vue'),
    meta: { requiresAuth: true, title: 'Gastos Delegados' }
  },
  {
    path: '/caja-diaria',
    name: 'CajaDiaria',
    component: () => import('../views/CajaDiariaView.vue'),
    meta: { requiresAuth: true, requiresCajaResponsible: true, title: 'Caja Diaria' }
  },
  {
    path: '/reportes',
    name: 'Reportes',
    component: () => import('../views/ReportesView.vue'),
    meta: { requiresAuth: true, title: 'Mis Reportes' }
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
    component: () => import('../views/PerfilView.vue'),
    meta: { requiresAuth: true, title: 'Mi Perfil' }
  },
  
  // ===============================================
  // RUTAS DE ADMINISTRACIÓN (LAZY-LOADED)
  // ===============================================
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', name: 'AdminDashboard', component: () => import('../views/admin/AdminDashboardView.vue'), meta: { title: 'Admin: Dashboard' } },
      { 
        path: 'pagos-directos', 
        name: 'AdminPagosDirectos', 
        component: () => import('../views/admin/PagosDirectosView.vue'), 
        meta: { title: 'Admin: Pagos Directos' } 
      },
      { path: 'analiticas', name: 'AdminAnalytics', component: () => import('../views/admin/AdminAnalyticsView.vue'), meta: { title: 'Admin: Análisis' } },
      { path: 'analisis-clientes', name: 'AdminAnalisisClientes', component: () => import('../views/admin/AdminAnalisisClientesView.vue'), meta: { title: 'Admin: Análisis por Cliente' } },
      { path: 'todos-los-viajes', name: 'AdminViajesList', component: () => import('../views/admin/AdminViajesListView.vue'), meta: { title: 'Admin: Rendiciones' } },
      { path: 'gastos', name: 'AdminGastosList', component: () => import('../views/admin/AdminGastosListView.vue'), meta: { title: 'Admin: Gastos' } },
      { path: 'usuarios', name: 'AdminUsuarios', component: () => import('../views/admin/AdminUsuariosView.vue'), meta: { title: 'Admin: Usuarios' } },
      { path: 'cajas-diarias', name: 'AdminGestionCajas', component: () => import('../views/admin/AdminGestionCajasView.vue'), meta: { title: 'Admin: Cajas' } },
      { path: 'solicitudes-caja', name: 'AdminGestionSolicitudes', component: () => import('../views/admin/AdminGestionSolicitudesView.vue'), meta: { title: 'Admin: Solicitudes' } },
      { path: 'tipos-gasto', name: 'AdminTiposGastoGlobales', component: () => import('../views/admin/AdminTiposGastoGlobalesView.vue'), meta: { title: 'Admin: Tipos de Gasto' } },
      
      // --- INICIO DE LA CORRECCIÓN ---
      // La nueva ruta va aquí, dentro de los children de /admin
      { 
        path: 'permisos-tipos-gasto', 
        name: 'AdminPermisosTiposGasto', 
        component: () => import('../views/admin/AdminTiposGastoGlobalesView.vue'), // Apunta a la nueva vista
        meta: { title: 'Admin: Permisos de Gastos' } 
      },
      // --- FIN DE LA CORRECCIÓN ---

      { path: 'formatos-gasto', name: 'AdminFormatosGasto', component: () => import('../views/admin/AdminGestionFormatos.vue'), meta: { title: 'Admin: Formatos' } },
      { path: 'formatos-gasto/:formatoId/campos', name: 'AdminCamposFormato', component: () => import('../views/admin/AdminCamposFormatoView.vue'), props: true, meta: { title: 'Admin: Campos' } },
      { path: 'formatos-gasto/:formatoId/asignar-usuarios', name: 'AdminAsignarUsuariosFormato', component: () => import('../views/admin/AdminAsignarUsuariosFormatoView.vue'), props: true, meta: { title: 'Admin: Asignar Formatos' } },
      { path: 'clientes', name: 'AdminClientes', component: () => import('../views/admin/AdminClientesView.vue'), meta: { title: 'Admin: Clientes' } },
      { path: 'transportes', name: 'AdminTransportes', component: () => import('../views/admin/AdminTransportesView.vue'), meta: { title: 'Admin: Transportes' } },
      
      { 
        path: 'vehiculos', 
        name: 'AdminVehiculos', 
        component: () => import('../views/admin/AdminVehiculosView.vue'), 
        meta: { title: 'Admin: Vehículos' } 
      },
      {
        path: 'vehiculos/:id',
        name: 'AdminVehiculoDetalle',
        component: () => import('../views/admin/VehiculoDetalleView.vue'),
        props: true,
        meta: { title: 'Admin: Detalle de Vehículo' }
      },
      { 
        path: 'proveedores', 
        name: 'AdminProveedores', 
        component: () => import('../views/admin/AdminProveedoresView.vue'), 
        meta: { title: 'Admin: Proveedores' } 
      },
    ]
  },
  
  // ===============================================
  // RUTA NOT FOUND (WILDCARD)
  // ===============================================
  {
    path: '/:pathMatch(.*)*', 
    name: 'NotFound',
    redirect: async () => { 
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user ? { name: 'Dashboard' } : { name: 'Login' };
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

router.beforeEach(async (to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - ${APP_NAME}` : APP_NAME;

  const { data: { session } } = await supabase.auth.getSession();
  const isAuthenticated = !!session?.user;

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin);
  const requiresCajaResponsible = to.matched.some(record => record.meta.requiresCajaResponsible);

  if (requiresAuth && !isAuthenticated) {
    return next({ name: 'Login', query: { redirectTo: to.fullPath } });
  }

  if (requiresGuest && isAuthenticated) {
    return next({ name: 'Dashboard' });
  }

  if (isAuthenticated && (requiresAdmin || requiresCajaResponsible)) {
    try {
      const { data: profile } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', session.user.id)
        .single();
      
      const userRole = profile?.rol;

      if (requiresAdmin && userRole !== 'admin') {
        return next({ name: 'Dashboard' }); 
      }
      
      if (requiresCajaResponsible && userRole !== 'admin') {
          const { count, error: cajaError } = await supabase
            .from('cajas_chicas')
            .select('id', { count: 'exact', head: true })
            .eq('responsable_id', session.user.id)
            .eq('activo', true);

          if (cajaError || count === 0) {
            return next({ name: 'Dashboard' });
          }
      }
    } catch (e) {
      console.error("Error en guardián de rutas al obtener perfil/caja:", e.message);
      return next({ name: 'Dashboard' });
    }
  }

  next();
});

export default router;