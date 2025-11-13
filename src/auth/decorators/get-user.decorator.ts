import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

/**
 * 🔹 Custom decorator: @GetUser
 * 
 * Permite acceder al usuario autenticado dentro de un controlador o un handler de NestJS.
 * 
 * 📘 Uso:
 * ```ts
 * @GetUser() user: User
 * @GetUser('email') email: string
 * ```
 * 
 * ✅ Qué hace:
 * - Extrae el objeto `user` del objeto `Request` (inyectado por el AuthGuard JWT).
 * - Si se le pasa un argumento (por ejemplo `'email'`), retorna solo esa propiedad del usuario.
 * - Si no se le pasa argumento, retorna el objeto completo `user`.
 * - Si el usuario no está presente en la request, lanza un `InternalServerErrorException`.
 * 
 * ⚠️ Requisitos:
 * Este decorador debe usarse en rutas protegidas por un guard que añada `req.user`
 * (por ejemplo, `JwtAuthGuard` o cualquier estrategia Passport).
 */
export const GetUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    // Extrae el objeto request de la ejecución HTTP
    const req = ctx.switchToHttp().getRequest();

    // Obtiene el usuario autenticado inyectado por el AuthGuard
    const user = req.user;
    // Si no hay usuario en la request, lanza error
    if (!user) {
      throw new InternalServerErrorException('User not found (request)');
    }

    // Si se solicita una propiedad específica del usuario, la devuelve
    // Ej: @GetUser('email') => user.email
    // Si no se pasa 'data', devuelve el objeto completo
    return !data ? user : user[data];
  },
);
