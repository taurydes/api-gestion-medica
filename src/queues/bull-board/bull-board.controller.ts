import { Body, Controller, Get, Post, Render, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/auth/decorators/public.decorator';
import { AuthService } from 'src/auth/auth.service';

/**
 * Login del panel Bull Board. El panel (`/admin/queues`) se monta en `main.ts`
 * detrás de `PanelAccessService`, no en este controlador.
 */
@Controller('admin')
@Throttle({ short: {} })
export class BullBoardController {
  constructor(private readonly authService: AuthService) {}

  // ======================================================
  // 🔹 VISTA DE LOGIN (FORM)
  // ======================================================
  @Public()
  @Get('login')
  @Render('queues/bull-board/views/bull-login')
  renderLogin(@Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.headers.host}`;
    return { title: 'Login Bull Board', baseUrl };
  }

  // ======================================================
  // 🔹 LOGIN vía AuthService (usuarios de sistema)
  // ======================================================
  @Public()
  @Post('login')
  async login(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const { username, password } = body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: 'Usuario y clave son requeridos' });
    }

    // 👉 Delegamos al AuthService (mismo pipeline que el resto de la app)
    //    Aquí forzamos isSystemUser: true para el panel
    const { access_token } = await this.authService.login({
      credential: username,
      password,
      isSystemUser: true,
    });

    // Cookie opcional para UI (httpOnly recomendado)
    res.cookie('access_token', access_token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 3600000, // 1 hora
      // Secure solo bajo HTTPS: con NODE_ENV=production sobre http://localhost el navegador la descartaría
      secure: req.secure,
      path: '/',
    });

    return res.json({
      message: 'Login exitoso',
      data: { access_token },
    });
  }
}
