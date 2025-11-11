import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  UnauthorizedException,
  Render,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/auth/decorators/public.decorator';
import { QueuesService } from '../queues.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import { RoleEnum } from 'src/role/role.const';

@Controller('admin')
@Throttle({ short: {} })
export class BullBoardController {
  private serverAdapter = new ExpressAdapter();

  constructor(
    private readonly queuesService: QueuesService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly redisSession: RedisSessionService,
  ) {
    this.serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: this.queuesService.getBullAdapters(),
      serverAdapter: this.serverAdapter,
    });
  }

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
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return res.json({
      message: 'Login exitoso',
      data: { access_token },
    });
  }

  // ======================================================
  // 🔹 RUTAS DEL PANEL PRINCIPAL
  // ======================================================
  @Get('queues')
  async renderQueues(@Req() req: Request, @Res() res: Response) {
    return this.handleBullBoard(req, res);
  }

  @Get('queues/*')
  async renderSubRoutes(@Req() req: Request, @Res() res: Response) {
    return this.handleBullBoard(req, res);
  }

  // ======================================================
  // 🧠 VALIDACIÓN: JWT + Sesión en Redis
  // ======================================================
  private async handleBullBoard(req: Request, res: Response) {
    // 1) Tomamos token de cookie o Authorization
    const token =
      req.cookies?.access_token ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.redirect('/admin/login?error=Token%20requerido');
    }

    try {
      // 2) Verificamos JWT con el mismo secreto de la app
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      }) as {
        id: number;
        name: string;
        roleId: number;
        iat: number;
        exp: number;
      };

      // 3) Validamos sesión en Redis (single-session / aún activa)
      const isActive = await this.redisSession.isValidSession(
        decoded.id.toString(),
      );
      if (!isActive) {
        return res.redirect(
          '/admin/login?error=Sesion%20invalida%20o%20expirada',
        );
      }

      try {
        const roleId = decoded?.roleId;
        if (Number(roleId) !== RoleEnum.ADMIN) {
          console.warn('Acceso denegado: solo superAdministrador');
          return res.redirect('/logs/ui/login?error=Acceso%20denegado');
        }
      } catch (err) {
        throw new UnauthorizedException(err.message);
      }

      // 4) Delegamos a Bull Board
      const router = this.serverAdapter.getRouter();
      return router(req, res);
    } catch {
      return res.redirect('/admin/login?error=Token%20invalido%20o%20expirado');
    }
  }
}
