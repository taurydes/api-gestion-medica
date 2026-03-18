import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from 'src/auth/decorators/public.decorator';
import { PaginationLogDto } from './dto/pagination-log.dto';
import { LogsService } from './logs.service';
import { RoleEnum } from 'src/role/role.const';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiBearerAuth()
@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(
    private readonly logsService: LogsService,
    private readonly jwtService: JwtService,
  ) {}

  // 🔹 Endpoint REST tradicional (para Swagger o API externa)
  @ApiOperation({ summary: 'Obtener todos los logs (API REST)' })
  @Get()
  @Permission(`${ModuleItemsMenu.LogsModule}.${PermissionActionsMenu.CREATE}`)
  findAll(@Query() pagination: PaginationLogDto) {
    return this.logsService.findAll(pagination);
  }

  // 🔹 Endpoint REST para obtener un log específico
  @ApiOperation({ summary: 'Obtener un log por ID' })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.LogsModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.logsService.findOne(+id);
  }

  // =========================================
  // 🔹 Vista de Logs protegida con verificación manual
  // =========================================
  @Public()
  @Get('ui/view')
  @ApiOperation({ summary: 'Vista visual de logs (HTML UI)' })
  async renderLogsPage(@Req() req: Request, @Res() res: Response) {
    try {
      const tokenFromQuery = req.query.token as string;
      const tokenFromCookie = req.cookies?.access_token;
      const token = tokenFromQuery || tokenFromCookie;

      if (!token) {
        return res.redirect('/logs/ui/login');
      }

      const secret = process.env.JWT_SECRET;
      try {
        const decoded = this.jwtService.verify(token, { secret });
        const roleName = decoded?.roleName;
        if (roleName !== RoleEnum.ADMIN) {
          console.warn('Acceso denegado: solo superAdministrador');
          return res.redirect('/logs/ui/login?error=Acceso%20denegado');
        }
      } catch (err) {
        throw new UnauthorizedException(err.message);
      }
      return res.render('logs/views/logs-page', {
        title: '📊 Logs del Sistema',
        icon: '🧠',
        token,
        apiEndpoint: '/logs/ui/api',
        defaultPageSize: 20,
        maxPageSize: 100,
      });
    } catch (err) {
      console.error('❌ Token inválido:', err.message);
      return res.redirect('/logs/ui/login');
    }
  }

  @Get('ui/api')
  async getLogsApi(@Req() req: Request, @Query() pagination: PaginationLogDto) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const secret = process.env.JWTKEY_VALIDATOR || process.env.JWT_SECRET;
    try {
      this.jwtService.verify(token, { secret });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const result = await this.logsService.findAll(pagination);
    return {
      data: result.data,
      page: result.page,
      total: result.totalCount,
      pageCount: result.totalPages,
    };
  }

  // =========================================
  // 🔹 Vista de login (pública)
  // =========================================
  @Public()
  @Get('ui/login')
  getLoginView(@Req() req: Request, @Res() res: Response) {
    // 🔹 Detectar automáticamente el protocolo + host + puerto
    const baseUrl = `${req.protocol}://${req.headers.host}`;

    return res.render('logs/views/logs-login', {
      title: 'Login Logs',
      baseUrl, // 👈 Se pasa al frontend
    });
  }
}
