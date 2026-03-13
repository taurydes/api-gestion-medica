import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Res,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

import { FilesService } from './files.service';
import { UploadFileDto } from './dto/create-file.dto';
import {
  CreateVideoBase64Dto,
  CreateVideoMultipartDto,
} from './dto/create-video-publict.dto';

import { FileInterceptor } from '@nestjs/platform-express';
import { VideoValidationInterceptor } from 'src/common/interceptors/video.interceptor';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@ApiTags('Files & Videos')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /* ============================================================
   * 📌 MÉTODO 1 – Subir archivo BASE64
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir archivo base64',
    description:
      'Recibe un archivo en base64, lo guarda y devuelve la URL pública.',
  })
  @Post('upload-base64')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadBase64(@Body() dto: UploadFileDto) {
    return await this.filesService.uploadFile(dto);
  }

  /* ============================================================
   * 📌 MÉTODO 2 – Obtener URL pública
   * ============================================================ */
  @ApiOperation({
    summary: 'Obtener URL de archivo',
    description: 'Devuelve la URL pública completa del archivo almacenado.',
  })
  @Get('download-url/:name')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  getFileUrl(@Param('name') name: string) {
    return this.filesService.getFileUrl(name);
  }

  /* ============================================================
   * 📌 MÉTODO 3 – Crear video desde BASE64
   * ============================================================ */
  @ApiOperation({
    summary: 'Crear video publicitario (base64)',
    description:
      'Guarda un archivo en base64 en la carpeta del cliente y lo registra en base de datos.',
  })
  @Post('video-base64')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async createBase64(@Body() dto: CreateVideoBase64Dto) {
    return this.filesService.create(dto);
  }

  /* ============================================================
   * 🚀 MÉTODO 4 – SUBIR VIDEO MULTIPART
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir video publicitario (multipart)',
    description:
      'Recibe un archivo MP4, valida tipo, tamaño y duración (≤ 15s), luego lo registra en base de datos.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Datos del video + archivo MP4',
    type: CreateVideoMultipartDto,
  })
  @Post('video')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB límite duro
    }),
    VideoValidationInterceptor,
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadVideoMultipart(
    @Body() dto: CreateVideoMultipartDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.filesService.uploadVideoMultipart(dto, file);
  }

  /* ============================================================
   * 🎥 MÉTODO 5 – DESCARGAR VIDEO POR STREAM
   * ============================================================ */
  @ApiOperation({
    summary: 'Descargar video por ID',
    description:
      'Devuelve un stream del archivo MP4 almacenado en el servidor.',
  })
  @Get('video/:id')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async downloadVideo(@Param('id') id: string, @Res() res) {
    return this.filesService.downloadVideo(id, res);
  }

  /* ============================================================
   * 📁 MÉTODO 6 – SUBIR ARCHIVO DE CITA MÉDICA (multipart/binario)
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir archivo de cita médica (mamografía u otro estudio)',
    description:
      'Recibe una imagen en formato binario (multipart), la almacena en ' +
      'UPLOADS_PATH/userId/medicalCenterId/appointmentId/ y registra la referencia en BD.',
  })
  @ApiConsumes('multipart/form-data')
  @Post('appointment-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB límite
    }),
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadAppointmentFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('appointmentId') appointmentId: string,
    @Body('medicalHistoryId') medicalHistoryId: string,
    @Body('patientId') patientId: string,
    @Body('medicalCenterId') medicalCenterId: string,
    @Body('fileType') fileType: string,
    @Body('description') description: string,
    @GetUser('id') userId: string,
  ) {
    return this.filesService.uploadAppointmentFile(file, {
      appointmentId,
      medicalHistoryId: medicalHistoryId || undefined,
      patientId,
      medicalCenterId,
      uploadedBy: userId,
      fileType: fileType || 'mammography',
      description: description || undefined,
    });
  }

  /* ============================================================
   * 📁 MÉTODO 7 – SERVIR ARCHIVO DE CITA MÉDICA
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir archivo de cita médica',
    description: 'Devuelve el archivo como stream con las cabeceras MIME correctas.',
  })
  @Get('appointment-files/:fileId')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async serveAppointmentFile(
    @Param('fileId') fileId: string,
    @Res() res,
  ) {
    return this.filesService.serveAppointmentFile(fileId, res);
  }

  /* ============================================================
   * 📁 MÉTODO 8 – LISTAR ARCHIVOS DE UNA CITA MÉDICA
   * ============================================================ */
  @ApiOperation({
    summary: 'Listar archivos de una cita médica',
    description: 'Retorna todos los archivos asociados a una cita específica.',
  })
  @Get('appointment-files')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async getFilesByAppointment(
    @Query('appointmentId') appointmentId: string,
  ) {
    return this.filesService.getFilesByAppointment(appointmentId);
  }
}
