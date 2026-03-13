import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import * as fs from 'fs';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';

import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { IsNull, Repository } from 'typeorm';

import { UploadFileDto } from './dto/create-file.dto';
import { VideoPublicity } from './entities/video-publicy.entity';
import { AppointmentFile } from './entities/appointment-file.entity';
import { CreateVideoBase64Dto, CreateVideoMultipartDto } from './dto/create-video-publict.dto';


@Injectable()
export class FilesService {
  private readonly uploadsDir: string;
  private readonly publicUrl: string;
  private readonly maxSize: number;


  constructor(
    @InjectRepository(VideoPublicity, DatabaseConnectionName.DB_MAIN)
    private readonly videoRepository: Repository<VideoPublicity>,

    @InjectRepository(AppointmentFile, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentFileRepository: Repository<AppointmentFile>,

    private readonly configService: ConfigService,
  ) {
    this.uploadsDir = this.configService.get<string>('UPLOADS_PATH') || 'uploads';
    this.publicUrl = `${this.configService.get<string>('URL_HOST')}:${this.configService.get<string>('PORT')}`;
    this.maxSize = Number(this.configService.get<string>('MAX_VIDEO_MB') || 20) * 1024 * 1024;

  }

  /* ============================================================
   * 🎯 MÉTODOS EXISTENTES (BASE64) — NO SE TOCAN
   * ============================================================ */

  /**
   * @summary Subir archivo base64 (genérico)
   * @description Guarda archivo base64 y retorna URL pública.
   */
  async uploadFile(dto: UploadFileDto): Promise<{ url: string; name: string }> {
    const uploadPath = path.join(process.cwd(), this.uploadsDir);
    fs.mkdirSync(uploadPath, { recursive: true });

    const filePath = path.join(uploadPath, dto.name);

    const base64 = dto.content.includes(',')
      ? dto.content.split(',')[1]
      : dto.content;

    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

    return {
      url: `${this.publicUrl}/${this.uploadsDir}/${dto.name}`,
      name: dto.name,
    };
  }

  /**
   * @summary Obtener URL pública
   * @description Construye URL usando PUBLIC_URL del .env.
   */
  async getFileUrl(name: string): Promise<{ url: string }> {
    return { url: `${this.publicUrl}/${this.uploadsDir}/${name}` };
  }

  /**
   * @summary Crear registro de video publicitario (base64)
   * @description Guarda video en carpeta cliente & DB.
   */
  async create(dto: CreateVideoBase64Dto): Promise<VideoPublicity> {
    const archivoRuta = await this.saveVideoBase64(
      dto.fileName,
      dto.fileBase64,
      dto.clienteId,
    );

    const video = this.videoRepository.create({
      ...dto,
      archivoRuta,
    });

    return this.videoRepository.save(video);
  }

  /**
   * @summary Guardar video base64 por cliente
   * @description Crea `uploads/client-{id}` y escribe archivo.
   */
  async saveVideoBase64(
    fileName: string,
    base64: string,
    clienteId: string,
  ): Promise<string> {
    try {
      const clientDir = path.join(process.cwd(), this.uploadsDir, `client-${clienteId}`);
      fs.mkdirSync(clientDir, { recursive: true });

      const filePath = path.join(clientDir, fileName);
      const pure = base64.includes(',') ? base64.split(',')[1] : base64;

      fs.writeFileSync(filePath, Buffer.from(pure, 'base64'));

      return `${this.publicUrl}/${this.uploadsDir}/client-${clienteId}/${fileName}`;
    } catch {
      throw new InternalServerErrorException('Error al guardar video');
    }
  }

  /* ============================================================
   * 🚀 NUEVOS MÉTODOS (multipart + metadata + validaciones)
   * ============================================================ */

  /**
   * @summary Subir video publicitario por multipart
   * @description
   * - Valida MIME type (solo MP4)  
   * - Valida tamaño máximo (`MAX_VIDEO_MB` en .env)  
   * - Extrae duración con ffprobe  
   * - Valida duración ≤ 15 segundos  
   * - Guarda en `/uploads/client-{id}`  
   * - Crea registro en DB  
   */
  async uploadVideoMultipart(
    dto: CreateVideoMultipartDto,
    file: Express.Multer.File,
  ): Promise<VideoPublicity> {
    if (!file) throw new BadRequestException('Debe enviar un archivo de video.');

    /* 🔹 Validar MIME type */
    if (file.mimetype !== 'video/mp4') {
      throw new BadRequestException('Solo se permiten archivos MP4.');
    }

    /* 🔹 Validar tamaño */
    if (file.size > this.maxSize) {
      throw new BadRequestException(
        `El archivo excede el límite permitido de ${this.maxSize / 1024 / 1024} MB.`,
      );
    }

    /* 🔹 Crear carpeta del cliente */
    const clientDir = path.join(process.cwd(), this.uploadsDir, `client-${dto.clienteId}`);
    fs.mkdirSync(clientDir, { recursive: true });

    const filePath = path.join(clientDir, file.originalname);

    fs.writeFileSync(filePath, file.buffer);

    /* 🔹 Extraer metadatos */
    const metadata = await this.getVideoMetadata(filePath);
    const duration = metadata.format.duration;
    const size = metadata.format.size;

    /* 🔹 Validar duración */
    if (duration > 15) {
      fs.unlinkSync(filePath);
      throw new BadRequestException('El video no puede exceder 15 segundos.');
    }

    /* 🔹 Construir URL pública */
    const url = `${this.publicUrl}/${this.uploadsDir}/client-${dto.clienteId}/${file.originalname}`;

    /* 🔹 Registrar en DB */
    const video = this.videoRepository.create({
      ...dto,
      archivoRuta: url,
      duracion: Math.round(duration),
      tamano: size,
    });

    return this.videoRepository.save(video);
  }

  /**
   * @summary Extraer metadata de video
   * @description Utiliza ffprobe para obtener duración, tamaño, codecs, etc.
   */
  private getVideoMetadata(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
  }

  /**
   * @summary Descargar video publicitario por ID
   * @description Devuelve un stream del archivo físico.
   */
  async downloadVideo(id: string, res: any) {
    const video = await this.videoRepository.findOne({ where: { id } });
    if (!video) throw new NotFoundException('Video no encontrado');

    const localPath = video.archivoRuta.replace(this.publicUrl, path.join(process.cwd()));

    if (!fs.existsSync(localPath)) {
      throw new NotFoundException('Archivo de video no existe en el servidor');
    }

    res.setHeader('Content-Type', 'video/mp4');
    fs.createReadStream(localPath).pipe(res);
  }

  /* ============================================================
   * 📁 ARCHIVOS DE CITAS MÉDICAS (mamografías, estudios, etc.)
   * ============================================================ */

  /**
   * @summary Subir archivo asociado a una cita médica (binario/multipart)
   * @description
   * - Guarda el archivo en UPLOADS_PATH/userId/medicalCenterId/appointmentId/
   * - Registra la referencia en BD (appointment_files)
   * - Usa almacenamiento binario, NO base64
   */
  async uploadAppointmentFile(
    file: Express.Multer.File,
    data: {
      appointmentId: string;
      medicalHistoryId?: string;
      patientId: string;
      medicalCenterId: string;
      uploadedBy: string;
      fileType?: string;
      description?: string;
    },
  ): Promise<AppointmentFile> {
    if (!file) {
      throw new BadRequestException('Debe enviar un archivo.');
    }

    // Validar tipo de imagen
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/dicom'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan imágenes.`,
      );
    }

    // Estructura: UPLOADS_PATH/userId/medicalCenterId/appointmentId/
    const relativePath = path.join(
      data.uploadedBy,
      data.medicalCenterId,
      data.appointmentId,
    );
    const fullDir = path.join(process.cwd(), this.uploadsDir, relativePath);
    fs.mkdirSync(fullDir, { recursive: true });

    // Nombre único para evitar colisiones
    const ext = path.extname(file.originalname);
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const fullPath = path.join(fullDir, storedName);

    // Guardar archivo binario
    fs.writeFileSync(fullPath, file.buffer);

    // Ruta relativa a guardar en BD
    const filePathRelative = path.join(relativePath, storedName).replace(/\\/g, '/');

    // Crear registro en BD
    const record = this.appointmentFileRepository.create({
      appointmentId: data.appointmentId,
      medicalHistoryId: data.medicalHistoryId ?? null,
      patientId: data.patientId,
      uploadedBy: data.uploadedBy,
      originalName: file.originalname,
      storedName,
      mimeType: file.mimetype,
      fileSize: file.size,
      filePath: filePathRelative,
      fileType: data.fileType ?? 'mammography',
      description: data.description ?? null,
    });

    return this.appointmentFileRepository.save(record);
  }

  /**
   * @summary Servir archivo de cita médica por ID
   * @description Devuelve un stream del archivo con las cabeceras MIME correctas.
   */
  async serveAppointmentFile(fileId: string, res: any): Promise<void> {
    const record = await this.appointmentFileRepository.findOne({
      where: { id: fileId, deletedAt: IsNull() },
    });
    if (!record) {
      throw new NotFoundException('Archivo no encontrado.');
    }

    const fullPath = path.join(process.cwd(), this.uploadsDir, record.filePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Archivo físico no encontrado en el servidor.');
    }

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${record.originalName}"`);
    fs.createReadStream(fullPath).pipe(res);
  }

  /**
   * @summary Obtener URL pública de un archivo de cita
   */
  getAppointmentFileUrl(fileId: string): string {
    return `${this.publicUrl}/files/appointment-files/${fileId}`;
  }

  /**
   * @summary Listar archivos asociados a una cita médica
   */
  async getFilesByAppointment(appointmentId: string): Promise<AppointmentFile[]> {
    return this.appointmentFileRepository.find({
      where: { appointmentId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * @summary Listar archivos asociados a un historial médico
   */
  async getFilesByMedicalHistory(medicalHistoryId: string): Promise<AppointmentFile[]> {
    return this.appointmentFileRepository.find({
      where: { medicalHistoryId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }
}
