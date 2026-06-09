import {
  Controller,
  Delete,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
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
import { DicomConverterService } from './dicom-converter.service';
import { UploadFileDto } from './dto/create-file.dto';
import {
  CreateVideoBase64Dto,
  CreateVideoMultipartDto,
} from './dto/create-video-publict.dto';

import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { VideoValidationInterceptor } from 'src/common/interceptors/video.interceptor';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@ApiTags('Files & Videos')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly dicomConverterService: DicomConverterService,
  ) {}

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
      limits: { fileSize: 300 * 1024 * 1024 }, // 300MB límite (DICOM/tomosíntesis)
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

  /* ============================================================
   * 🖼️ MÉTODO 9 – SUBIR FOTO DE PERFIL (multipart)
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir foto de perfil',
    description:
      'Recibe una imagen en formato binario (multipart), la almacena en ' +
      'UPLOADS_PATH/profile-photos/ y retorna la URL pública.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Imagen de perfil (PNG, JPEG, JPG o WEBP, máx. 5 MB)',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        ownerId: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @Post('profile-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadProfilePhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body('ownerId') ownerId: string,
  ): Promise<{ url: string }> {
    return this.filesService.uploadProfilePhoto(file, ownerId);
  }

  /* ============================================================
   * 🖼️ MÉTODO 10 – SERVIR FOTO DE PERFIL
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir foto de perfil por ownerId y nombre de archivo',
    description: 'Devuelve la imagen de perfil almacenada como stream.',
  })
  @Get('profile-photos/:ownerId/:filename')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async serveProfilePhoto(
    @Param('ownerId') ownerId: string,
    @Param('filename') filename: string,
    @Res() res,
  ): Promise<void> {
    return this.filesService.serveProfilePhoto(ownerId, filename, res);
  }

  /* ============================================================
   * 🏥 MÉTODO 11 – SUBIR FOTO DE CENTRO MÉDICO (multipart)
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir foto de centro médico',
    description:
      'Recibe una imagen en formato binario (multipart), la almacena en ' +
      'UPLOADS_PATH/medical-centers/ y retorna la URL pública.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Imagen del centro médico (PNG, JPEG, JPG o WEBP, máx. 5 MB)',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        medicalCenterId: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @Post('medical-center-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadMedicalCenterPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body('medicalCenterId') medicalCenterId: string,
    @Body('imageType') imageType: string,
    @Body('description') description: string,
    @GetUser('id') userId: string,
  ) {
    return this.filesService.uploadMedicalCenterPhoto(file, {
      medicalCenterId,
      uploadedBy: userId,
      imageType: imageType || undefined,
      description: description || undefined,
    });
  }

  /* ============================================================
   * 🏥 MÉTODO 11b – ELIMINAR IMAGEN DE CENTRO MÉDICO
   * ============================================================ */
  @ApiOperation({
    summary: 'Eliminar imagen de centro médico',
    description: 'Soft delete de una imagen registrada en medical_center_images.',
  })
  @Delete('medical-center-images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.DELETE}`)
  async deleteMedicalCenterImage(
    @Param('imageId') imageId: string,
  ): Promise<void> {
    return this.filesService.deleteMedicalCenterImage(imageId);
  }

  /* ============================================================
   * 🏥 MÉTODO 11c – SERVIR IMAGEN DE CENTRO MÉDICO POR ID
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir imagen de centro médico por ID',
    description: 'Devuelve la imagen del centro médico como stream buscándola por su ID en BD.',
  })
  @Get('medical-center-images/:imageId')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async serveMedicalCenterImage(
    @Param('imageId') imageId: string,
    @Res() res,
  ): Promise<void> {
    return this.filesService.serveMedicalCenterImage(imageId, res);
  }

  /* ============================================================
   * 🏥 MÉTODO 12 – SERVIR FOTO DE CENTRO MÉDICO
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir foto de centro médico por medicalCenterId y nombre de archivo',
    description: 'Devuelve la imagen del centro médico almacenada como stream.',
  })
  @Get('medical-center-photos/:medicalCenterId/:filename')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async serveMedicalCenterPhoto(
    @Param('medicalCenterId') medicalCenterId: string,
    @Param('filename') filename: string,
    @Res() res,
  ): Promise<void> {
    return this.filesService.serveMedicalCenterPhoto(medicalCenterId, filename, res);
  }

  /* ============================================================
   * 🧑‍⚕️ MÉTODO 13 – SUBIR FOTO DE COMMON PERSON (multipart)
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir foto de CommonPerson (paciente o doctor)',
    description:
      'Recibe una imagen en formato binario (multipart), la almacena en ' +
      'UPLOADS_PATH/common-persons/{personId}/images/ y retorna la URL pública.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Imagen de la persona (PNG, JPEG, JPG o WEBP, máx. 5 MB)',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        personId: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @Post('common-person-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadCommonPersonPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body('personId') personId: string,
  ): Promise<{ url: string }> {
    return this.filesService.uploadCommonPersonPhoto(file, personId);
  }

  /* ============================================================
   * 🧑‍⚕️ MÉTODO 14 – SERVIR FOTO DE COMMON PERSON
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir foto de CommonPerson por personId y nombre de archivo',
    description: 'Devuelve la imagen de la persona almacenada como stream.',
  })
  @Get('common-person-photos/:personId/:filename')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async serveCommonPersonPhoto(
    @Param('personId') personId: string,
    @Param('filename') filename: string,
    @Res() res,
  ): Promise<void> {
    return this.filesService.serveCommonPersonPhoto(personId, filename, res);
  }

  /* ============================================================
   * 👨‍⚕️ MÉTODO – SUBIR FOTO DE DOCTOR (multipart)
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir foto de doctor',
    description: 'Recibe una imagen en formato binario, la almacena en UPLOADS_PATH/doctors/{doctorId}/ y crea un registro en doctor_images.',
  })
  @Post('doctor-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadDoctorPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body('doctorId') doctorId: string,
    @GetUser('id') userId: string,
  ): Promise<{ url: string }> {
    return this.filesService.uploadDoctorPhoto(file, { doctorId, uploadedBy: userId });
  }

  /* ============================================================
   * 👨‍⚕️ MÉTODO – SERVIR IMAGEN DE DOCTOR POR ID
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir imagen de doctor por ID',
    description: 'Devuelve la imagen del doctor como stream buscándola por su ID en BD.',
  })
  @Get('doctor-images/:imageId')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async serveDoctorImage(
    @Param('imageId') imageId: string,
    @Res() res,
  ): Promise<void> {
    return this.filesService.serveDoctorImage(imageId, res);
  }

  /* ============================================================
   * MÉTODO – SUBIR FOTO DE COMMON PERSON (DB-backed, stream)
   * ============================================================ */
  @ApiOperation({
    summary: 'Subir foto de CommonPerson (con registro en BD)',
    description: 'Recibe una imagen multipart, la almacena en UPLOADS_PATH/common-persons/{personId}/ y crea un registro en common_person_images.',
  })
  @Post('common-person-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.CREATE}`)
  async uploadCommonPersonImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('commonPersonId') commonPersonId: string,
    @GetUser('id') userId: string,
  ): Promise<{ url: string }> {
    return this.filesService.uploadCommonPersonImage(file, {
      commonPersonId,
      uploadedBy: userId,
    });
  }

  /* ============================================================
   * MÉTODO – SERVIR IMAGEN DE COMMON PERSON POR ID
   * ============================================================ */
  @ApiOperation({
    summary: 'Servir imagen de CommonPerson por ID',
    description: 'Devuelve la imagen como stream buscándola por su ID en BD.',
  })
  @Get('common-person-images/:imageId')
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async serveCommonPersonImage(
    @Param('imageId') imageId: string,
    @Res() res,
  ): Promise<void> {
    return this.filesService.serveCommonPersonImage(imageId, res);
  }

  /* ============================================================
   * 🧬 MÉTODO – CONVERTIR ARCHIVO DICOM A IMÁGENES PNG
   * ============================================================ */
  @ApiOperation({
    summary: 'Convertir archivo DICOM a imágenes PNG',
    description:
      'Recibe un archivo DICOM (.dcm) en multipart, extrae cada frame, ' +
      'aplica Window/Level y retorna las imágenes en base64 (PNG) listas para ' +
      'previsualización en el frontend.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo DICOM (.dcm) sin compresión, máx. 300 MB',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @Post('dicom-convert')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 300 * 1024 * 1024 },
    }),
  )
  @Permission(`${ModuleItemsMenu.FilesModule}.${PermissionActionsMenu.VIEW}`)
  async convertDicom(
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.dicomConverterService.convert(file);
  }
}
