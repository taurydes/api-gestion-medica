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
import * as jwt from 'jsonwebtoken';
import { QueuesService } from '../queues.service';
import { Public } from 'src/auth/decorators/public.decorator';

/**
 * @summary Controlador para la interfaz Bull Board (panel de colas).
 * @description
 * Este controlador gestiona:
 * - El **login protegido con JWT** para acceder al panel Bull Board.
 * - El **renderizado de la UI del panel** bajo `/admin/queues`.
 * 
 * Se apoya en `QueuesService` para obtener los adaptadores BullMQ y
 * conectar el sistema de colas al dashboard.
 */
@Controller('admin')
export class BullBoardController {
  /**
   * @summary Adaptador Express para Bull Board.
   * @description
   * Permite integrar la UI de Bull Board dentro del servidor Express
   * que ejecuta la app NestJS.
   */
  private serverAdapter = new ExpressAdapter();

  constructor(private readonly queuesService: QueuesService) {
    this.serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: this.queuesService.getBullAdapters(),
      serverAdapter: this.serverAdapter,
    });
  }

  // ======================================================
  // 🔹 VISTA DE LOGIN
  // ======================================================

  /**
   * @summary Renderiza la vista de login del panel Bull Board.
   * @description
   * Permite el acceso inicial al formulario de autenticación.
   * El archivo de plantilla `bull-login.hbs` se encuentra en:
   * `src/queues/bull-board/views/bull-login.hbs`.
   *
   * @route GET /admin/login
   */
  @Public()
  @Get('login')
  @Render('queues/bull-board/views/bull-login')
  renderLogin(@Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.headers.host}`;
    return { title: 'Login Bull Board', baseUrl };
  }

  // ======================================================
  // 🔹 VALIDACIÓN DE CREDENCIALES
  // ======================================================

  /**
   * @summary Valida credenciales y genera un token JWT.
   * @description
   * Comprueba las credenciales enviadas desde el formulario.
   * Si son correctas, crea un `access_token` JWT con duración de 1 hora
   * y lo guarda como cookie segura (`bull_token`).
   *
   * @route POST /admin/login
   * @param body Contiene las credenciales `{ username, password }`.
   * @throws UnauthorizedException Si las credenciales son incorrectas.
   */
  @Post('login')
  async login(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const { username, password } = body;
    const USER_BULL = process.env.USER_BULL || 'admin';
    const PASSWORD_BULL = process.env.PASSWORD_BULL || '123456';
    const JWT_SECRET_BULL = process.env.JWT_SECRET_BULL || 'bull_secret';

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: 'Usuario y clave son requeridos' });
    }

    if (username !== USER_BULL || password !== PASSWORD_BULL) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const token = jwt.sign({ user: username }, JWT_SECRET_BULL, {
      expiresIn: '1h',
    });

    res.cookie('bull_token', token, {
      httpOnly: true,
      maxAge: 3600000, // 1 hora
    });

    return res.json({
      message: 'Login exitoso',
      data: { access_token: token },
    });
  }

  // ======================================================
  // 🔹 RUTAS DEL PANEL PRINCIPAL
  // ======================================================

  /**
   * @summary Renderiza la interfaz principal de Bull Board.
   * @description
   * Carga el panel en `/admin/queues`, validando previamente el token JWT.
   * Si el token es inválido o inexistente, redirige al login.
   *
   * @route GET /admin/queues
   */
  @Get('queues')
  async renderQueues(@Req() req: Request, @Res() res: Response) {
    return this.handleBullBoard(req, res);
  }

  /**
   * @summary Captura todas las rutas hijas de `/admin/queues/*`.
   * @description
   * Necesario para que Bull Board maneje rutas internas del dashboard
   * (por ejemplo `/admin/queues/api/queues` o `/admin/queues/static/*`).
   *
   * @route GET /admin/queues/*
   */
  @Get('queues/*')
  async renderSubRoutes(@Req() req: Request, @Res() res: Response) {
    return this.handleBullBoard(req, res);
  }

  // ======================================================
  // 🧠 LÓGICA DE VALIDACIÓN COMPARTIDA
  // ======================================================

  /**
   * @summary Middleware interno para validar acceso al panel.
   * @description
   * Verifica el token JWT ya sea desde la cookie (`bull_token`)
   * o desde el header `Authorization: Bearer <token>`.
   * 
   * Si el token no existe o no es válido, redirige automáticamente al login.
   */
  private handleBullBoard(req: Request, res: Response) {
    const token =
      req.cookies?.bull_token ||
      req.headers.authorization?.replace('Bearer ', '');

    const JWT_SECRET_BULL = process.env.JWT_SECRET_BULL || 'bull_secret';

    if (!token) {
      return res.redirect('/admin/login?error=Token%20requerido');
    }

    try {
      jwt.verify(token, JWT_SECRET_BULL);
      const router = this.serverAdapter.getRouter();
      router(req, res);
    } catch {
      return res.redirect('/admin/login?error=Token%20inválido');
    }
  }
}
