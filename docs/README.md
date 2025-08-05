# Proyecto InfoGastos - Districorr

## Descripción General

InfoGastos es una aplicación web diseñada para gestionar y analizar los gastos de rendición de viajes y viáticos para la empresa Districorr. Permite a los usuarios registrar gastos, crear y gestionar rendiciones, delegar gastos, y a los administradores supervisar, aprobar y auditar todas estas operaciones. Adicionalmente, incorpora un módulo para el análisis y gestión de la flota de vehículos de la empresa.

## Objetivos Principales

*   **Centralizar la Gestión de Gastos:** Proporcionar una plataforma única para el registro, seguimiento y aprobación de gastos y rendiciones.
*   **Mejorar la Trazabilidad y Auditoría:** Registrar cada operación de forma inmutable para fines de auditoría y control.
*   **Facilitar el Análisis de Negocio:** Ofrecer dashboards y reportes para visualizar tendencias, identificar patrones de gasto y optimizar la operación (ej. rentabilidad por transporte, análisis geográfico).
*   **Automatizar Procesos:** Utilizar triggers y funciones RPC en la base de datos para automatizar flujos de trabajo (ej. notificaciones, validaciones).
*   **Mejorar la Experiencia de Usuario:** Proporcionar una interfaz intuitiva y visualmente clara tanto para usuarios finales como para administradores.

## Tecnologías Utilizadas

*   **Frontend:**
    *   **Framework:** Vue.js 3 (con Composition API).
    *   **Build Tool:** Vite.
    *   **Styling:** Tailwind CSS para un diseño responsivo y modular.
    *   **Mapas:** Leaflet.js con `@vue-leaflet/vue-leaflet` para visualización geográfica interactiva.
    *   **Gráficos:** Chart.js y `vue-chartjs` para visualizaciones de datos (barras, líneas, etc.).
*   **Backend:**
    *   **Base de Datos:** PostgreSQL (gestionada a través de Supabase).
    *   **Autenticación:** Supabase Auth.
    *   **Lógica de Negocio:** Funciones RPC y Triggers en PostgreSQL para automatizaciones y reglas de negocio críticas.
    *   **Seguridad:** Políticas de Seguridad (RLS) en Supabase para controlar el acceso a los datos.

## Estructura General del Proyecto

La aplicación sigue una estructura estándar de Vue.js:

*   **`public/`**: Activos estáticos (logos, favicons, etc.).
*   **`src/`**: El corazón de la aplicación.
    *   **`assets/`**: Estilos globales (CSS), imágenes procesadas.
    *   **`components/`**: Componentes UI reutilizables (ej. `GastoForm.vue`, `CardKPI`, `TableComponent`). Incluye subcarpetas como `admin/` para componentes específicos del panel de administración.
    *   **`composables/`**: Lógica de negocio reutilizable y desacoplada de las vistas (ej. `useReportGenerator.js`).
    *   **`router/`**: Definición de rutas y lógica de navegación (incluyendo guards).
    *   **`utils/`**: Funciones de utilidad puras (formateadores, validaciones).
    *   **`views/`**: Componentes que representan páginas completas de la aplicación (ej. `AdminTransportesView.vue`, `DashboardView.vue`).
*   **Archivos Raíz:** Configuraciones del proyecto (Vite, Tailwind, Supabase, etc.).

## Flujos Principales

*   **Ciclo de Vida de una Rendición:** Creación, agregado de gastos (con opciones de caja diaria, otras rendiciones o delegación), cierre, envío, revisión de admin (aprobación/rechazo) y notificación al usuario.
*   **Flujo de Caja Diaria:** Asignación de caja, registro de gastos (desde caja o formulario general), manejo de saldos negativos y solicitudes de reposición.
*   **Flujo de Delegación de Gastos:** Emisor delega gasto a receptor, recepción en bandeja de entrada, acción del receptor (aceptar/rechazar).
*   **Análisis de Transportes:** Selección de transporte/fechas, visualización de KPIs, desglose por localidad en tabla y mapa interactivo, gráficos de gasto y frecuencia.

## Modificaciones y Mejoras Clave Realizadas

*   **Backend:**
    *   Re-arquitectura de la tabla `gastos` para mejor análisis.
    *   Implementación de funciones seguras RPC para creación "al vuelo" de entidades y localidades.
    *   Actualización de vistas y limpieza de triggers.
    *   Mejoras en el formulario de gastos para manejo de fechas y "al vuelo".
    *   Adición de módulo de Gestión de Flota.
    *   Funciones para análisis por cliente y transporte.
*   **Frontend:**
    *   Corrección de bugs y mejoras en vistas de listado de gastos, formularios y reportes.
    *   Implementación del módulo de Análisis de Transportes con:
        *   Pestañas para Análisis General y Gestión.
        *   Mapas interactivos (puntos por localidad con escala de gasto/frecuencia).
        *   Tablas de desglose detalladas.
        *   Gráficos de barras (gasto y frecuencia).
        *   Filtros de Transporte, Fechas, Provincia y Localidad.
    *   Mejoras en la experiencia de usuario (UX/UI) para la claridad y usabilidad.

## Guía de Inicio Rápido para Desarrolladores

1.  **Clonar el Repositorio:**
    ```bash
    git clone [URL_DEL_REPOSITORIO]
    cd info-gastos-districorr
    ```

2.  **Instalar Dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar Entorno:**
    *   Crear un archivo `.env` en la raíz del proyecto.
    *   Copiar las variables de configuración de tu archivo `.env.example` (si existe) o crear las necesarias. Las más importantes son:
        ```env
        VITE_SUPABASE_URL="TU_SUPABASE_URL"
        VITE_SUPABASE_ANON_KEY="TU_SUPABASE_ANON_KEY"
        ```
    *   Asegúrate de tener la versión correcta de Node.js y npm/yarn según lo especificado en `package.json`.

4.  **Configuración de Base de Datos (Supabase):**
    *   Asegúrate de tener tu proyecto Supabase configurado con las tablas, RPCs, triggers y políticas de seguridad descritas en la documentación de backend.
    *   Ejecuta los scripts SQL proporcionados para la estructura de la base de datos.
    *   Importa los datos iniciales (provincias, localidades) utilizando los archivos CSV proporcionados.

5.  **Correr la Aplicación:**
    ```bash
    npm run dev
    ```
    La aplicación estará disponible en `http://localhost:5173` (o el puerto que Vite use por defecto).

6.  **Ejecutar el Build para Producción:**
    ```bash
    npm run build
    ```
    Esto generará los archivos estáticos para el despliegue.

---
