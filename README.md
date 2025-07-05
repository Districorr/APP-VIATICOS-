# Districorr InfoGastos - Aplicación de Gestión de Viáticos y Gastos

## Descripción General

Districorr InfoGastos es una aplicación web diseñada para facilitar el registro, seguimiento, cierre y administración de gastos y viáticos incurridos por los empleados de Districorr. La aplicación permite a los usuarios registrar diferentes tipos de gastos, asociarlos a viajes o períodos de rendición, adjuntar comprobantes, y generar reportes. Incluye un panel de administración para la gestión global de usuarios, configuraciones y datos.

La aplicación está construida con Vue.js 3 (Composition API), Vite como herramienta de compilación, Tailwind CSS para los estilos, y Supabase como backend (Base de Datos PostgreSQL, Autenticación, Almacenamiento de Archivos y Edge Functions).

## Estado Actual del Proyecto (Fecha del Resumen)

La aplicación cuenta con las siguientes funcionalidades implementadas y en desarrollo:

### 1. Autenticación y Perfiles de Usuario
*   Registro de nuevos usuarios con Nombre Completo, Puesto/Área, Email y Contraseña.
*   Inicio de sesión.
*   Cierre de sesión.
*   Flujo de "Olvidé mi contraseña" (envío de email implementado, pendiente vista de actualización de contraseña).
*   Tabla `perfiles` en Supabase (`id`, `email`, `nombre_completo`, `puesto`, `rol`, `formato_predeterminado_id`).
    *   Roles: 'admin', 'usuario_comun'.
*   Trigger `handle_new_user` en `auth.users` para crear automáticamente un perfil en `public.perfiles` al registrar un nuevo usuario, incluyendo `nombre_completo` y `puesto` desde `raw_user_meta_data`.
*   Vista "Mi Perfil" (básica).

### 2. Gestión de Viajes / Períodos de Rendición (para Usuarios)
*   **CRUD en `ViajesListView.vue` y `ViajeForm.vue`:**
    *   **Creación:** Solo se requiere `nombre_viaje` (concepto con `<datalist>`), `fecha_inicio`, y `monto_adelanto` (adelanto inicial del viaje). `fecha_fin` es `NULL` al crear.
    *   **Listado:** Muestra `codigo_rendicion` (ID legible autoincremental), estado ("EN CURSO" o "CERRADO EL [fecha]"), detalles del viaje, adelanto inicial, gastos brutos, impacto neto de gastos, y saldo del viaje.
    *   **Edición:** Solo permitida si el viaje está "EN CURSO" (`cerrado_en IS NULL`).
    *   **Eliminación:** Solo permitida si el viaje está "EN CURSO".
    *   **Cierre de Rendición:**
        *   UI (modal) en `ViajesListView.vue` para cerrar períodos "EN CURSO".
        *   Permite ingresar `observacion_cierre`.
        *   Al confirmar, se actualiza en la BD: `viajes.cerrado_en = now()`, `viajes.fecha_fin = now() (solo fecha)`, `viajes.observacion_cierre`.
*   **Nuevas Columnas en BD (`viajes`):** `cerrado_en` (TIMESTAMPTZ), `codigo_rendicion` (SERIAL UNIQUE), `observacion_cierre` (TEXT). `fecha_fin` es NULLABLE.

### 3. Gestión de Gastos (para Usuarios)
*   **CRUD en `GastosListView.vue` y `GastoForm.vue`:**
    *   Asociación obligatoria a un Viaje/Período.
    *   Campos: Fecha, Tipo Gasto (de `tipos_gasto_config`), Monto Ingresado, Tipo de Monto (Bruto, Neto, **Sin Factura**), IVA Calculado (se pone a 0 si es "Sin Factura"), Moneda, Descripción, N° Factura (opcional, no aplica para "Sin Factura"), Cliente Referido (**obligatorio**, con sugerencias de `<datalist>` pobladas desde `clientes_referidos_usuario`), `adelanto_especifico_aplicado` (para descontar del impacto al viaje), Adjuntar Comprobante.
    *   **Cliente Referido:** Se guardan los clientes usados en `clientes_referidos_usuario` para futuras sugerencias.
    *   **Formulario de Gastos Dinámico:** `GastoForm.vue` está preparado para cargar `campos_formato_config` y renderizar campos adicionales que se guardan en `gastos.datos_adicionales` (JSONB).
*   **Inmutabilidad Post-Cierre:**
    *   La UI en `GastosListView.vue` y `GastoForm.vue` deshabilita la adición, edición o eliminación de gastos si el Viaje/Período asociado está cerrado (`viajes.cerrado_en IS NOT NULL`).
    *   Políticas RLS en Supabase refuerzan esta inmutabilidad a nivel de base de datos.

### 4. Reportes (Generados desde `GastosListView.vue` usando `useReportGenerator.js`)
*   **Composable `useReportGenerator.js`:** Centraliza la lógica de generación de reportes.
*   **PDF:**
    *   Encabezado, info del "Responsable", info del Viaje/Período (incluyendo `codigo_rendicion` y "Estado").
    *   Tabla de gastos: Fecha, Tipo, Descripción (con Cliente Referido en nueva línea), N° Fact., IVA, Monto Bruto.
    *   Resumen de totales: "Total Gastos (Bruto)", "Adelanto del Viaje" (inicial), "(+) Adelantos Extras", "(=) Total Adelantos Disponibles", y "SALDO FINAL (A REPONER POR RESPONSABLE / SALDO A FAVOR)".
    *   Resumen por tipo de gasto.
    *   Firmas: "Firma Responsable", "Firma Gerencia".
    *   Pie de página con CUIT, Dirección, paginación.
    *   Opción de marca de agua con logo.
*   **CSV:**
    *   Columnas: Fecha, Tipo Gasto, Descripción, Cliente Referido, Viaje/Período, ID Rendición (`codigo_rendicion`), N° Factura, IVA, Adelanto Espec. Gasto, Monto Total Bruto, Moneda, URL Factura.
    *   Formato limpio para importación en hojas de cálculo.

### 5. Panel de Administración
*   **Acceso Protegido:** Rutas `/admin/*` requieren autenticación y `rol = 'admin'`.
*   **`AdminDashboardView.vue`:** Panel principal con enlaces a módulos de gestión. (KPIs y gráficos son pendientes).
*   **Gestión de Tipos de Gasto Globales (`AdminTiposGastoGlobalesView.vue`):** CRUD completo para `tipos_gasto_config`.
*   **Gestión de Formatos de Gasto (`AdminFormatosGastoView.vue`):** CRUD para `formatos_gasto_config`.
*   **Configurar Campos por Formato (`AdminCamposFormatoView.vue`):** CRUD para `campos_formato_config`.
*   **`AdminViajesListView.vue`:**
    *   Muestra **todos** los viajes/períodos de **todos** los usuarios.
    *   Utiliza una **VISTA de BD `admin_viajes_con_responsable`** para obtener datos del viaje y el nombre/email del responsable.
    *   Muestra `codigo_rendicion`, estado, y detalles del responsable.
    *   Permite navegar para ver los gastos de un viaje específico (lleva a `AdminGastosListView.vue`).
*   **`AdminGastosListView.vue` (Implementado/En progreso):**
    *   Muestra **todos** los gastos de **todos** los usuarios (o filtrados por viaje desde `AdminViajesListView`).
    *   Utiliza una **VISTA de BD `admin_gastos_completos`**.
    *   Muestra columna "Responsable (Gasto)".
    *   Filtros por Fecha, Tipo de Gasto, Viaje/Período (todos los del sistema).
    *   Filtro por Responsable (pendiente de Edge Function para listar usuarios).
*   **`AdminAsignarUsuariosFormatoView.vue`:**
    *   Utiliza la **Edge Function `get-all-users`** para listar todos los usuarios.
    *   Permite asignar/desasignar usuarios a un formato de gasto (actualiza `usuario_formatos_permitidos`).
*   **Edge Function `get-all-users`:**
    *   Desplegada en Supabase.
    *   Requiere que el llamante sea admin (verificación interna).
    *   Usa `service_role_key` para llamar a `auth.admin.listUsers()` y luego consulta `perfiles` para enriquecer los datos.
    *   Devuelve `id, email, nombre_completo, rol, formato_predeterminado_id`.
*   **Pendiente:** `AdminUsuariosView.vue` y Edge Function `update-user-admin-settings` para que el admin modifique roles y formatos predeterminados de usuarios.

### 6. Tecnologías y Estructura
*   **Vue.js 3 (Composition API)**, **Vite**, **Vue Router**.
*   **Tailwind CSS** (con `postcss.config.js`, `tailwind.config.js`, `src/assets/style.css`).
*   **Supabase:** PostgreSQL, Auth, Storage, Edge Functions, Vistas de BD, Triggers, RLS.
*   **Cliente Supabase:** Configurado en `src/supabaseClient.js`.
*   **Composables:** `src/composables/useReportGenerator.js`. Se mencionó `useViajes.js` como posible refactorización.
*   **Utilidades:** `src/utils/formatters.js` para `formatDate` y `formatCurrency`.
*   **Componentes:** Organizados en `src/components/` y `src/components/admin/`.
*   **Vistas:** Organizadas en `src/views/` y `src/views/admin/`.
*   **`App.vue`:** Componente raíz, maneja estado global de autenticación (`user`, `userProfile`, `loadingAuth`) y lo provee a través de `provide/inject`.

### 7. Terminología
*   Se ha empezado a aplicar la terminología: "Responsable" (en lugar de Empleado), "Adelanto Inicial", "Adelantos Extras", "A REPONER POR RESPONSABLE", "Firma Gerencia".

---

## Próximos Pasos y Lógica Pendiente Principal

1.  **Finalizar `AdminUsuariosView.vue` y Edge Function `update-user-admin-settings`:**
    *   Permitir a los administradores modificar el `rol` y `formato_predeterminado_id` de los usuarios.
2.  **Implementar KPIs y Gráficos en `AdminDashboardView.vue`:**
    *   Definir KPIs específicos.
    *   Crear funciones de agregación en PostgreSQL (RPC) o Edge Functions.
    *   Integrar con una librería de gráficos (Chart.js/ApexCharts).
3.  **Completar Flujo de "Olvidé mi contraseña":**
    *   Implementar la lógica en `ActualizarContrasenaView.vue` para manejar el token de Supabase y permitir al usuario establecer una nueva contraseña.
4.  **Refinar Lógica de "Homenajes/Presentes" en `GastoForm.vue`:**
    *   Añadir columna `requiere_cliente_referido` a `tipos_gasto_config`.
    *   `App.vue` (o composable) debe cargar `tiposDeGasto` con este nuevo campo.
    *   `GastoForm.vue` debe hacer `cliente_referido` condicionalmente obligatorio.
5.  **Revisión Global de Terminología:** Asegurar consistencia en toda la UI y reportes.
6.  **Flujo de Adelantos Avanzado (Si se decide implementar):**
    *   Considerar la tabla `procesos_rendicion` para un manejo más detallado de solicitudes y aprobaciones de adelantos, y múltiples adelantos.
7.  **Pruebas Exhaustivas y Refinamiento de UI/UX.**
8.  **Resolver problemas de desarrollo local con Edge Functions (Docker/WSL)** si se quiere mejorar el flujo de desarrollo para estas.

---