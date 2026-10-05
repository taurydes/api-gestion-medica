import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { ParseUuid } from 'src/common/pipes/parse-uuid.pipe';
import { DocumentsService } from './documents.service';

/** Status and download of queued jobs; only the requester or an admin sees a job. */
@ApiTags('Documentos')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Estado de un trabajo de PDF o de correo' })
  @ApiResponse({ status: 200, description: 'jobId, status (queued, processing, done, failed) y error si falló' })
  @ApiResponse({ status: 403, description: 'No es quien lo solicitó ni administrador' })
  @ApiResponse({ status: 404, description: 'Trabajo desconocido o ya expirado' })
  getStatus(@Param('jobId', ParseUuid) jobId: string, @Req() req: any) {
    return this.documentsService.getStatus(jobId, req.user.id);
  }

  @Get('jobs/:jobId/file')
  @ApiOperation({ summary: 'Descarga el PDF de un trabajo terminado' })
  @ApiResponse({ status: 200, description: 'application/pdf' })
  @ApiResponse({ status: 409, description: 'El documento aún no está listo' })
  @ApiResponse({ status: 404, description: 'Trabajo desconocido o sin archivo' })
  async download(@Param('jobId', ParseUuid) jobId: string, @Req() req: any, @Res() res: Response): Promise<void> {
    const file = await this.documentsService.getFile(jobId, req.user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file.path);
  }
}
