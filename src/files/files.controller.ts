import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Res,
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
  async downloadVideo(@Param('id') id: number, @Res() res) {
    return this.filesService.downloadVideo(id, res);
  }
}
