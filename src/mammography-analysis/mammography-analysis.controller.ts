import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

import { ParseUuid } from 'src/common/pipes/parse-uuid.pipe';
import { ANALYSIS_IMAGE_MAX_BYTES, FileUpload } from 'src/files/upload-limits';
import { MammographyAnalysisService } from './mammography-analysis.service';
import { CreateMammographyAnalysisDto } from './dto/create-mammography-analysis.dto';
import { QueryMammographyAnalysisDto } from './dto/query-mammography-analysis.dto';
import { ReviewMammographyAnalysisDto } from './dto/review-mammography-analysis.dto';
import { DeleteMammographyAnalysisDto } from './dto/delete-mammography-analysis.dto';

@ApiTags('Mammography Analysis')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('mammography-analyses')
export class MammographyAnalysisController {
  constructor(
    private readonly service: MammographyAnalysisService,
  ) {}

  /* ============================================================
   * REGISTRAR ANÁLISIS (el backend corre el modelo)
   * ============================================================ */
  @ApiOperation({
    summary: 'Analizar un archivo de cita y guardar el resultado',
    description:
      'Carga la imagen almacenada del archivo de cita, la envía al detector y guarda la respuesta ' +
      'del detector. El cliente no envía prediction/probability/status/rawResponseJson (400).',
  })
  @Post()
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.CREATE}`,
  )
  create(@Body() dto: CreateMammographyAnalysisDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  /* ============================================================
   * VISTA PREVIA (sin guardar)
   * ============================================================ */
  @ApiOperation({
    summary: 'Analizar una imagen sin guardar el resultado',
    description:
      'Multipart con `file` (PNG/JPEG o DICOM, máx. 20 MB). Devuelve el resultado del detector; no persiste nada.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @Post('preview')
  @FileUpload('file', ANALYSIS_IMAGE_MAX_BYTES)
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.CREATE}`,
  )
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.service.preview(file);
  }

  /* ============================================================
   * BANDEJA DEL DÍA (AGRUPADA POR CITA, ORDENADA POR GRAVEDAD)
   * ============================================================ */
  @ApiOperation({
    summary: 'Bandeja de revisión del día',
    description:
      'Devuelve los análisis del día agrupados por cita y ordenados por gravedad (probabilidad descendente). ' +
      'Los análisis sin cita aparecen en un grupo separado.',
  })
  @Get('inbox')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  inbox(@Query() query: QueryMammographyAnalysisDto, @Req() req: any) {
    return this.service.findTodayInbox(query, req.user);
  }

  /* ============================================================
   * RANKING PAGINADO (lista plana para tablas de dashboard)
   * ============================================================ */
  @ApiOperation({
    summary: 'Ranking paginado de análisis del día',
    description:
      'Lista plana de análisis del día ordenados por probabilidad descendente, ' +
      'con info de cita y paciente. Pensado para el widget del dashboard.',
  })
  @Get('recent')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  recent(@Query() query: QueryMammographyAnalysisDto, @Req() req: any) {
    return this.service.findRecent(query, req.user);
  }

  /* ============================================================
   * STATS DEL DÍA
   * ============================================================ */
  @ApiOperation({
    summary: 'Estadísticas diarias de análisis ML',
    description:
      'Total, alertas (danger), pendientes de revisión y casos de alto riesgo (probabilidad de malignidad ≥ 80 %).',
  })
  @Get('stats/daily')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  dailyStats(@Query() query: QueryMammographyAnalysisDto, @Req() req: any) {
    return this.service.getDailyStats(query, req.user);
  }

  /* ============================================================
   * ANÁLISIS DE UNA CITA
   * ============================================================ */
  @ApiOperation({
    summary: 'Listar todos los análisis de una cita',
    description:
      'Devuelve los análisis ordenados por gravedad para una cita concreta.',
  })
  @Get('appointment/:appointmentId')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  byAppointment(
    @Param('appointmentId', ParseUuid) appointmentId: string,
    @Req() req: any,
  ) {
    return this.service.findByAppointment(appointmentId, req.user);
  }

  /* ============================================================
   * MARCAR REVISADO
   * ============================================================ */
  @ApiOperation({
    summary: 'Marcar un análisis como revisado',
    description:
      'Establece is_reviewed=true, reviewed_by, reviewed_at y opcionalmente notas del médico.',
  })
  @Patch(':id/review')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.UPDATE}`,
  )
  markReviewed(
    @Param('id', ParseUuid) id: string,
    @Body() dto: ReviewMammographyAnalysisDto,
    @GetUser('id') userId: string,
  ) {
    return this.service.markReviewed(id, dto, userId);
  }

  /** Soft delete with a reason (MJ-37); 409 once reviewed. */
  @ApiOperation({ summary: 'Retirar un análisis hecho por error' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.DELETE}`,
  )
  remove(
    @Param('id', ParseUuid) id: string,
    @Body() dto: DeleteMammographyAnalysisDto,
    @GetUser('id') userId: string,
  ) {
    return this.service.remove(id, dto.reason, userId);
  }

  /* ============================================================
   * IMAGEN
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir la imagen analizada',
    description:
      'Devuelve la imagen (PNG/JPG) que se usó para el análisis como stream.',
  })
  @Get(':id/image')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  image(@Param('id', ParseUuid) id: string, @Res() res: any, @Req() req: any) {
    return this.service.serveImage(id, res, req.user);
  }

  /* ============================================================
   * DETALLE
   * ============================================================ */
  @ApiOperation({ summary: 'Detalle completo de un análisis' })
  @Get(':id')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  findOne(@Param('id', ParseUuid) id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }
}
