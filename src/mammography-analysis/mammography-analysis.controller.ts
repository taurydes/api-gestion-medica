import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { Throttle } from '@nestjs/throttler';

import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

import { MammographyAnalysisService } from './mammography-analysis.service';
import { CreateMammographyAnalysisDto } from './dto/create-mammography-analysis.dto';
import { QueryMammographyAnalysisDto } from './dto/query-mammography-analysis.dto';
import { ReviewMammographyAnalysisDto } from './dto/review-mammography-analysis.dto';

@ApiTags('Mammography Analysis')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('mammography-analyses')
export class MammographyAnalysisController {
  constructor(
    private readonly service: MammographyAnalysisService,
  ) {}

  /* ============================================================
   * REGISTRAR ANÁLISIS
   * ============================================================ */
  @ApiOperation({
    summary: 'Registrar un análisis ML de mamografía',
    description:
      'Persiste el resultado del clasificador junto a la imagen analizada. ' +
      'Acepta multipart con la imagen y todos los metadatos del resultado.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Imagen analizada + resultado del modelo ML',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        prediction: { type: 'string', enum: ['MALIGNANT', 'BENIGN'] },
        probability: { type: 'number' },
        status: { type: 'string', enum: ['danger', 'success'] },
        label: { type: 'string' },
        rawResponseJson: { type: 'string' },
        appointmentId: { type: 'string' },
        appointmentFileId: { type: 'string' },
        patientId: { type: 'string' },
        sourceFileName: { type: 'string' },
      },
      required: ['prediction', 'probability', 'status'],
    },
  })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 300 * 1024 * 1024 },
    }),
  )
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.CREATE}`,
  )
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateMammographyAnalysisDto,
    @GetUser('id') userId: string,
  ) {
    return this.service.create(dto, file, userId);
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
  inbox(@Query() query: QueryMammographyAnalysisDto) {
    return this.service.findTodayInbox(query);
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
  recent(@Query() query: QueryMammographyAnalysisDto) {
    return this.service.findRecent(query);
  }

  /* ============================================================
   * STATS DEL DÍA
   * ============================================================ */
  @ApiOperation({
    summary: 'Estadísticas diarias de análisis ML',
    description:
      'Total, alertas (danger), pendientes de revisión y casos de alto riesgo (≥80%).',
  })
  @Get('stats/daily')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  dailyStats(@Query() query: QueryMammographyAnalysisDto) {
    return this.service.getDailyStats(query);
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
  byAppointment(@Param('appointmentId') appointmentId: string) {
    return this.service.findByAppointment(appointmentId);
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
    @Param('id') id: string,
    @Body() dto: ReviewMammographyAnalysisDto,
    @GetUser('id') userId: string,
  ) {
    return this.service.markReviewed(id, dto, userId);
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
  image(@Param('id') id: string, @Res() res: any) {
    return this.service.serveImage(id, res);
  }

  /* ============================================================
   * DETALLE
   * ============================================================ */
  @ApiOperation({ summary: 'Detalle completo de un análisis' })
  @Get(':id')
  @Permission(
    `${ModuleItemsMenu.MammographyAnalysisModule}.${PermissionActionsMenu.VIEW}`,
  )
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
