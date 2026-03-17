# Agentes del Proyecto — Comandos de Uso

Este proyecto tiene 3 agentes especializados configurados en `.claude/agents/`.

---

## Agentes disponibles

| Agente | Especialidad | Cuándo usarlo |
|--------|-------------|---------------|
| `pm` | Project Manager | Tareas completas, features nuevas, dudas sobre qué hacer |
| `backend-expert` | NestJS + TypeScript | Controladores, servicios, entidades, DTOs, guards, permisos |
| `frontend-expert` | Angular + RxJS | Componentes, servicios HTTP, rutas, formularios, estado |

---

## Cómo invocar agentes

### Desde el chat de Claude Code

Simplemente escribe tu petición con el prefijo del agente:

```
@pm quiero agregar un módulo de historial médico completo con API y pantalla Angular
```

```
@backend-expert agrega paginación al endpoint GET /patients
```

```
@frontend-expert crea un componente de tabla reutilizable con ordenamiento y filtros
```

### Invocar directamente (slash command estilo)

También puedes pedirle al PM que coordine sin prefijo:

```
Necesito que el PM analice y delegue: implementar notificaciones por email cuando se confirma una cita
```

---

## Ejemplos de peticiones por tipo de tarea

### Tarea solo de backend
```
@backend-expert
Tarea: Agregar endpoint PATCH /appointments/:id/cancel que cambie el estado a 'cancelled'
- Solo el médico asignado o un admin puede cancelar
- Enviar error 403 si no tiene permiso
- Seguir el patrón existente en appointments module
```

### Tarea solo de frontend
```
@frontend-expert
Tarea: En la página de gestión de roles, agregar un buscador que filtre los roles por nombre en tiempo real
- Usar el servicio RolesService existente
- Componente ubicado en: src/app/modules/roles/pages/
- Sin llamadas adicionales a la API, filtrar en el cliente
```

### Feature completa (usa el PM)
```
@pm
Feature: Módulo de reportes — generar PDF con las citas del mes por médico
Contexto: El usuario quiere descargar un reporte desde el portal Angular
¿Qué necesitamos en backend y frontend?
```

### Revisión de código
```
@backend-expert
Revisa el archivo src/permission/services/permission.service.ts
¿Hay problemas de arquitectura, seguridad o performance?
```

```
@frontend-expert
Revisa src/app/modules/roles/pages/role-permissions/role-permissions.component.ts
¿Hay memory leaks, malas prácticas o algo que mejorar?
```

---

## Ver en qué está trabajando un agente

Cuando Claude ejecuta un agente en background, te notificará al terminar automáticamente.
Para tareas largas puedes pedirle:

```
¿Qué decidió el backend-expert sobre la estructura del módulo?
```

```
Dame un resumen de lo que hizo el pm en la última tarea
```

---

## Asignar tareas múltiples en paralelo

```
@pm
Ejecuta estas tareas en paralelo:
1. [backend-expert] Agregar endpoint de estadísticas GET /dashboard/stats
2. [frontend-expert] Crear skeleton loaders en la página de citas mientras carga
```

---

## Tips

- **Usa `@pm`** cuando la tarea sea ambigua o abarque ambas capas
- **Usa `@backend-expert`** directamente cuando sepas que es solo API/NestJS
- **Usa `@frontend-expert`** directamente cuando sepas que es solo Angular
- Siempre da contexto: archivos relevantes, comportamiento esperado, restricciones
- El PM puede pedirles a los agentes que lean archivos antes de modificar
