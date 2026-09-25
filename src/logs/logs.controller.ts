import {
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from 'src/auth/decorators/public.decorator';
import { PanelAccessService } from 'src/auth/services/panel-access.service';
import { PaginationLogDto } from './dto/pagination-log.dto';
import { LogsService } from './logs.service';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { PermissionActionsMenu } from 'src/permission/permission.const';

const LOGS_VIEW_PERMISSION = `${ModuleItemsMenu.LogsModule}.${PermissionActionsMenu.VIEW}`;

@ApiBearerAuth()
@ApiTags('logs')
@Controller('logs')
export class LogsController {
  private readonly logger = new Logger(LogsController.name);

  constructor(
    private readonly logsService: LogsService,
    private readonly panelAccess: PanelAccessService,
  ) {}

  // 🔹 Endpoint REST tradicional (para Swagger o API externa)
  @ApiOperation({ summary: 'Obtener todos los logs (API REST)' })
  @Get()
  @Permission(LOGS_VIEW_PERMISSION)
  findAll(@Query() pagination: PaginationLogDto) {
    return this.logsService.findAll(pagination);
  }

  // 🔹 Endpoint REST para obtener un log específico
  @ApiOperation({ summary: 'Obtener un log por ID' })
  @Get(':id')
  @Permission(LOGS_VIEW_PERMISSION)
  findOne(@Param('id') id: string) {
    return this.logsService.findOne(+id);
  }

  // =========================================
  // 🔹 Vista de Logs: el token llega por cookie, nunca por query string
  // =========================================
  @Public()
  @Get('ui/view')
  @ApiOperation({ summary: 'Vista visual de logs (HTML UI)' })
  async renderLogsPage(@Req() req: Request, @Res() res: Response) {
    try {
      await this.panelAccess.authorize(
        this.panelAccess.extractToken(req),
        LOGS_VIEW_PERMISSION,
      );
    } catch (err) {
      if (!(err instanceof HttpException)) {
        this.logger.error('Fallo inesperado al autorizar la vista de logs', err?.stack);
      }
      return res.redirect(
        `/logs/ui/login?error=${encodeURIComponent(err.message)}`,
      );
    }
    return res.render('logs/views/logs-page', {
      title: '📊 Logs del Sistema',
      icon: '🧠',
      apiEndpoint: '/logs/ui/api',
      defaultPageSize: 20,
      maxPageSize: 100,
    });
  }

  @Get('ui/api')
  @Permission(LOGS_VIEW_PERMISSION)
  async getLogsApi(@Query() pagination: PaginationLogDto) {
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
