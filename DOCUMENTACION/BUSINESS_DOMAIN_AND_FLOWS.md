\# Dominio de Negocio y Flujos Funcionales



Este documento detalla la lógica de negocio y los flujos de usuario principales del sistema InfoGastos.



\## 1. Actores del Sistema



\- \*\*Empleado/Usuario:\*\* Cualquier miembro del personal que necesita registrar gastos.

\- \*\*Consolidador:\*\* Un usuario (generalmente un líder de equipo o gerente, como "Hernán") que recibe gastos delegados de otros para incluirlos en sus propias rendiciones.

\- \*\*Administrador:\*\* Un rol con privilegios de supervisión y gestión total.



\## 2. Flujo de Vida de una Rendición (Viaje)



Este es el flujo central para gastos asociados a un período o viaje específico.



```mermaid

sequenceDiagram

&#x20;   participant U as Usuario

&#x20;   participant S as Sistema (Frontend)

&#x20;   participant B as Backend (Supabase)



&#x20;   U->>S: Crea nueva Rendición (nombre, fechas, adelanto)

&#x20;   S->>B: INSERT en tabla `viajes`

&#x20;   B-->>S: Rendición creada (Estado: "Abierta")

&#x20;   S-->>U: Muestra Rendición en la lista



&#x20;   U->>S: Añade Gasto a la Rendición

&#x20;   S->>B: INSERT en tabla `gastos` (con `viaje\_id`)

&#x20;   B-->>S: Gasto creado

&#x20;   S-->>U: Gasto visible en la lista de la Rendición



&#x20;   U->>S: Cierra y Envía la Rendición

&#x20;   S->>B: UPDATE en `viajes` (set `cerrado\_en`, `estado\_aprobacion` = 'pendiente\_aprobacion')

&#x20;   B->>B: Trigger `on\_viaje\_closed` se dispara

&#x20;   B-->>B: Genera notificación para Administradores

&#x20;   B-->>S: Estado de Rendición actualizado

&#x20;   S-->>U: Rendición bloqueada (solo lectura)



&#x20;   participant A as Administrador

&#x20;   A->>S: Revisa Rendición Pendiente

&#x20;   alt Aprobación

&#x20;       A->>S: Aprueba la Rendición

&#x20;       S->>B: RPC `aprobar\_rechazar\_rendicion` (estado='aprobado')

&#x20;       B-->>S: Rendición Aprobada

&#x20;   else Rechazo

&#x20;       A->>S: Rechaza con motivo

&#x20;       S->>B: RPC `aprobar\_rechazar\_rendicion` (estado='rechazado', motivo)

&#x20;       B-->>S: Rendición Rechazada (vuelve a estado "Abierta")

&#x20;       B-->>B: Genera notificación para Usuario

&#x20;   end

