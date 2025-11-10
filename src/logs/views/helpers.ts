  import { NestExpressApplication } from '@nestjs/platform-express';
// Función para registrar helpers en el motor de plantillas de Express
export function registerHandlebarsHelpers(app: NestExpressApplication) {
  const hbs = require('hbs');

  // Helper para formatear fechas
  hbs.registerHelper('formatDate', function (timestamp: string | Date) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  });

  // Helper para truncar texto
  hbs.registerHelper('truncate', function (text: string, maxLength: number) {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  });

  // Helper para escapar HTML
  hbs.registerHelper('escapeHtml', function (text: string) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  });

  // Helper para obtener el color del nivel de log
  hbs.registerHelper('logLevelColor', function (level: string) {
    switch (level) {
      case 'error':
        return '#ef4444';
      case 'warn':
        return '#f59e0b';
      case 'info':
        return '#3b82f6';
      case 'debug':
        return '#10b981';
      default:
        return '#64748b';
    }
  });

  // Helper para verificar si un valor existe
  hbs.registerHelper('exists', function (value: any) {
    return value !== null && value !== undefined && value !== '';
  });

  // Helper para comparar valores
  hbs.registerHelper('eq', function (a: any, b: any) {
    return a === b;
  });

  // Helper para formatear números
  hbs.registerHelper('formatNumber', function (num: number) {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString('es-ES');
  });

  // Helper para imprimir JSON sin escapar (ideal para scripts)
  hbs.registerHelper('json', function (context: any) {
    // Si es un string, devolverlo directamente entre comillas
    if (typeof context === 'string') {
      return `"${context}"`;
    }
    // Si es un objeto, array, etc., usar JSON.stringify
    return JSON.stringify(context);
  });

}
