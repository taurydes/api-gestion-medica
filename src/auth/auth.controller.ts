import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginUserDto } from './dto/login-auth.dto';
import { SessionGuard } from './guards/session.guard';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ======================================================
  // 🔹 LOGIN
  // ======================================================

  /**
   * @summary Inicia sesión y genera un token JWT.
   * @description
   * Valida las credenciales del usuario (o de sistema) y devuelve un `access_token`.
   * Además, crea una sesión en Redis para mantener el estado activo del usuario.
   *
   * @route POST /auth/login
   */
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginUserDto, @Res() res: Response) {
    const result = await this.authService.login(loginDto);

    // Guardar token en cookie (opcional, útil para paneles web)
    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 3600000, // 1 hora
    });

    return res.json(result);
  }

  // ======================================================
  // 🔹 LOGOUT
  // ======================================================

  /**
   * @summary Cierra sesión y elimina la sesión de Redis.
   * @description
   * Elimina la sesión activa asociada al usuario autenticado.
   * También limpia la cookie del cliente (si existe).
   *
   * @route POST /auth/logout
   * @auth JWT + RedisSession
   */
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const userId = (req as any).user?.id;
    if (userId) {
      await this.authService.logout(userId.toString());
    }

    res.clearCookie('access_token');
    return res.json({ message: 'Sesión cerrada correctamente' });
  }

  // ======================================================
  // 🔹 VALIDAR SESIÓN ACTIVA
  // ======================================================

  /**
   * @summary Verifica si la sesión del usuario sigue activa.
   * @description
   * Comprueba en Redis si el token asociado al usuario aún es válido.
   *
   * @route GET /auth/session
   * @auth JWT + RedisSession
   */
  @Get('session')
  async checkSession(@Req() req: Request) {
    const userId = (req as any).user?.id;
    const isActive = await this.authService.isSessionActive(userId);
    return {
      userId,
      active: isActive,
    };
  }
}
