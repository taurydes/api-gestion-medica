# Sistema de Plantillas Handlebars - Módulo de Logs

## Descripción

Este módulo utiliza **Handlebars** como motor de plantillas para renderizar páginas HTML dinámicas en NestJS, siguiendo las mejores prácticas de la documentación oficial.

## Estructura de Archivos

```
src/logs/infrastructure/views/
├── logs-page.hbs          # Plantilla principal de logs
├── helpers.ts             # Helpers personalizados de Handlebars
└── README.md              # Esta documentación
```

## Configuración

### 1. Dependencias Instaladas

```bash
npm install hbs @types/hbs
```

### 2. Configuración en main.ts

```typescript
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

// Configurar Handlebars
app.setBaseViewsDir(join(__dirname, '..', 'src', 'logs', 'infrastructure', 'views'));
app.setViewEngine('hbs');

// Registrar helpers personalizados
import('./logs/infrastructure/views/helpers');
```

## Uso en Controladores

### Renderizado Básico

```typescript
@Get()
async getLogsPage(@Res() res: Response) {
  const templateData = {
    title: 'Error Logs',
    icon: '📊',
    // ... más datos
  };
  
  // Renderizar plantilla con datos
  res.render('logs/views/logs-page', templateData);
}
```

### Datos Dinámicos

La plantilla recibe un objeto con datos que se pueden usar en:

- **Variables simples**: `{{title}}`, `{{icon}}`
- **Arrays con each**: `{{#each logLevels}}...{{/each}}`
- **Condicionales**: `{{#if condition}}...{{/if}}`
- **Helpers personalizados**: `{{formatDate timestamp}}`

## Helpers Disponibles

### Helpers de Formato

- `{{formatDate timestamp}}` - Formatea fechas en español
- `{{truncate text maxLength}}` - Trunca texto largo
- `{{escapeHtml text}}` - Escapa HTML para seguridad
- `{{formatNumber num}}` - Formatea números en español

### Helpers de Lógica

- `{{logLevelColor level}}` - Retorna color CSS para nivel de log
- `{{exists value}}` - Verifica si un valor existe
- `{{eq a b}}` - Compara dos valores

## Ventajas del Sistema

### ✅ **Separación de Responsabilidades**
- **Plantillas**: Solo HTML y lógica de presentación
- **Controladores**: Solo lógica de negocio y datos
- **Helpers**: Funciones reutilizables para formateo

### ✅ **Mantenibilidad**
- Fácil modificar la UI sin tocar código TypeScript
- Helpers centralizados y reutilizables
- Estructura clara y organizada

### ✅ **Flexibilidad**
- Datos dinámicos desde el servidor
- Lógica condicional en las plantillas
- Fácil agregar nuevas funcionalidades

### ✅ **Estándar NestJS**
- Sigue las mejores prácticas oficiales
- Compatible con Express y NestJS
- Configuración estándar

## Ejemplo de Plantilla

```handlebars
<h1>{{icon}} {{title}}</h1>

{{#each logLevels}}
<option value="{{value}}">{{label}}</option>
{{/each}}

<div class="hint">{{hint}}</div>
```

## Agregar Nuevas Plantillas

1. **Crear archivo .hbs** en `src/logs/infrastructure/views/`
2. **Definir datos** en el controlador
3. **Renderizar** con `res.render('nombre-plantilla', datos)`

## Agregar Nuevos Helpers

1. **Editar** `src/logs/infrastructure/views/helpers.ts`
2. **Registrar** con `registerHelper('nombre', function(...) {...})`
3. **Usar** en plantillas con `{{nombre parametros}}`

## Troubleshooting

### Error: "Cannot find module 'hbs'"
```bash
npm install hbs @types/hbs
```

### Error: "View engine not found"
Verificar que `app.setViewEngine('hbs')` esté configurado

### Error: "Helpers not working"
Verificar que `import('./logs/infrastructure/views/helpers')` esté en main.ts

### Plantilla no se renderiza
Verificar que la ruta en `setBaseViewsDir` sea correcta
