# Guía de Desarrollo Basado en Especificaciones (Spec-Driven)

## 1. Filosofía

En el proyecto InfoGastos, **no se escribe código para funcionalidades nuevas o modificaciones significativas sin una especificación (Spec) previa, clara y aprobada.**

El objetivo de esta metodología es:
- **Claridad:** Asegurar que todo el equipo (humanos y IA) entienda el *qué* y el *porqué* antes de empezar a programar el *cómo*.
- **Precisión:** Reducir la ambigüedad, los supuestos y la necesidad de refactorizar por malentendidos.
- **Eficiencia:** Permitir que el desarrollo sea un proceso de "traducción" de la Spec a código, en lugar de un proceso de "descubrimiento".
- **Calidad:** Forzar la consideración de casos borde, estados de error y criterios de aceptación desde el principio.

## 2. Flujo de Trabajo

```mermaid
graph TD
    A[1. Idea o Requerimiento] --> B{2. ¿Es un cambio trivial?};
    B -- Sí (ej. cambio de texto, color) --> C[Implementar directamente];
    B -- No --> D[3. Crear Spec de Feature];
    D --> E[4. Revisión y Aprobación de la Spec];
    E --> F[5. Implementación Técnica];
    F --> G[6. Pruebas y QA];
    G --> H[7. Despliegue];
    H --> I[8. Actualizar Documentación Maestra];
    C --> I;
3. ¿Cuándo se Requiere una Spec?
Se requiere una Spec para cualquier cambio que involucre:
Una nueva vista o ruta en el frontend.
Un nuevo flujo de usuario de varios pasos.
Cambios en la estructura de la base de datos (nuevas tablas, columnas, relaciones).
Una nueva RPC o la modificación de la firma de una existente.
Cambios en las políticas de seguridad (RLS).
La introducción de una nueva dependencia o librería externa.
4. Proceso Detallado
Crear la Spec:
Copia el archivo FEATURE_SPECS/TEMPLATE_FEATURE_SPEC.md.
Renómbralo con un nombre descriptivo (ej. 003_notificaciones_en_app.md).
Completa todas las secciones del template de la forma más detallada posible. No dejes secciones en blanco; si algo no aplica, escribe "No aplica".
Revisión:
La Spec se somete a revisión por el Product Owner / Arquitecto.
Se discuten los riesgos, el alcance y las decisiones abiertas.
El desarrollo no comienza hasta que la Spec esté en estado "Aprobada".
Implementación:
El desarrollador (humano o IA) utiliza la Spec como su única fuente de verdad.
Regla de No Improvisación: Si durante el desarrollo se descubre un caso no contemplado o una ambigüedad, se debe pausar, actualizar la Spec, y solicitar una revisión rápida antes de continuar. No se deben tomar decisiones de negocio o arquitectura "sobre la marcha".
Post-Implementación:
Una vez que la funcionalidad está desplegada y verificada, es responsabilidad del desarrollador actualizar la documentación principal.
Checklist de Actualización:

¿Cambió un flujo de negocio? Actualizar BUSINESS_DOMAIN_AND_FLOWS.md.

¿Se añadió una vista/componente/composable? Actualizar FRONTEND_ARCHITECTURE.md.

¿Se modificó la BD/RPC/Vista? Actualizar SUPABASE_BACKEND_ARCHITECTURE.md.

¿Cambió la interacción FE/BE? Actualizar FRONTEND_BACKEND_DATA_FLOW.md.

Actualizar CHANGELOG_TECHNICAL.md con un resumen de los cambios.

Marcar la Spec como "Implementada" y añadir notas sobre el resultado final.
5. Reglas para Agentes de IA
Directiva Principal: Tu función es traducir Specs aprobadas en código de alta calidad que se adhiera a la arquitectura existente.
Punto de Partida: Siempre debes comenzar leyendo AI_WORKING_CONTEXT.md.
Contexto: Antes de proponer una solución, debes confirmar que has leído y entendido la Spec de la feature, así como los documentos maestros relevantes (PROJECT_CONTEXT_MASTER.md, etc.).
Propuestas: Tus propuestas de implementación deben hacer referencia explícita a las secciones de la Spec que estás resolviendo.
Dudas: Si una Spec es ambigua o incompleta, tu tarea es preguntar y solicitar clarificación, no asumir. Debes listar los puntos de duda y proponer opciones si es posible.