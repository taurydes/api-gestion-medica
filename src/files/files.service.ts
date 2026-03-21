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
import * as sharp from 'sharp';

import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { IsNull, Repository } from 'typeorm';

import { UploadFileDto } from './dto/create-file.dto';
import { VideoPublicity } from './entities/video-publicy.entity';
import { AppointmentFile } from './entities/appointment-file.entity';
import { CreateVideoBase64Dto, CreateVideoMultipartDto } from './dto/create-video-publict.dto';
import { MedicalCenterImage } from 'src/medical-center/entities/medical-center-image.entity';
import { DoctorImage } from 'src/doctors/entities/doctor-image.entity';
import { CommonPersonImage } from 'src/common-person/entities/common-person-image.entity';


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

    @InjectRepository(MedicalCenterImage, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterImageRepository: Repository<MedicalCenterImage>,

    @InjectRepository(DoctorImage, DatabaseConnectionName.DB_MAIN)
    private readonly doctorImageRepository: Repository<DoctorImage>,

    @InjectRepository(CommonPersonImage, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonImageRepository: Repository<CommonPersonImage>,

    private readonly configService: ConfigService,
  ) {
    this.uploadsDir = this.configService.get<string>('UPLOADS_PATH') || 'uploads';
    const host = this.configService.get<string>('URL_HOST') || 'localhost';
    const port = this.configService.get<string>('PORT') || '8008';
    const baseHost = host.startsWith('http') ? host : `http://${host}`;
    this.publicUrl = `${baseHost}:${port}`;
    this.maxSize = Number(this.configService.get<string>('MAX_VIDEO_MB') || 20) * 1024 * 1024;

  }

  /* ============================================================
   * HELPER: construir URL pública a partir de ruta relativa
   * ============================================================ */

  /**
   * @summary Construir URL pública de un archivo en uploads/
   * @param relativePath Ruta relativa desde la carpeta uploads/
   *   Ejemplo: 'medical-centers/abc-123/photo.webp'
   * @returns URL completa accesible vía ServeStaticModule
   *   Ejemplo: 'http://localhost:8008/uploads/medical-centers/abc-123/photo.webp'
   */
  buildFileUrl(relativePath: string): string {
    return `${this.publicUrl}/uploads/${relativePath}`;
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
    return { url: this.buildFileUrl(name) };
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
   * @description Retorna los registros enriquecidos con la URL pública de cada archivo.
   */
  async getFilesByAppointment(
    appointmentId: string,
  ): Promise<(AppointmentFile & { url: string })[]> {
    const files = await this.appointmentFileRepository.find({
      where: { appointmentId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    return files.map((f) => ({ ...f, url: this.buildFileUrl(f.filePath) }));
  }

  /**
   * @summary Listar archivos asociados a un historial médico
   * @description Retorna los registros enriquecidos con la URL pública de cada archivo.
   */
  async getFilesByMedicalHistory(
    medicalHistoryId: string,
  ): Promise<(AppointmentFile & { url: string })[]> {
    const files = await this.appointmentFileRepository.find({
      where: { medicalHistoryId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    return files.map((f) => ({ ...f, url: this.buildFileUrl(f.filePath) }));
  }

  /* ============================================================
   * 🖼️  FOTOS DE PERFIL Y CENTROS MÉDICOS
   * ============================================================ */

  /**
   * @summary Subir foto de perfil de una persona
   * @description
   * - Valida MIME type (PNG, JPEG, JPG, WEBP)
   * - Valida tamaño máximo (5 MB)
   * - Convierte a WebP con sharp (calidad 85)
   * - Si se provee ownerId: guarda en UPLOADS_PATH/{ownerId}/images/profile/
   * - Si no: guarda en UPLOADS_PATH/images/profile/
   * - Retorna URL pública completa
   */
  async uploadProfilePhoto(
    file: Express.Multer.File,
    ownerId?: string,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Debe enviar un archivo de imagen.');
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan PNG, JPEG, JPG o WEBP.`,
      );
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      throw new BadRequestException('La imagen no puede superar los 5 MB.');
    }

    const webpBuffer = await sharp(file.buffer).webp({ quality: 85 }).toBuffer();

    const folder = ownerId ?? 'general';
    const dir = path.join(process.cwd(), this.uploadsDir, 'users', folder, 'profile');

    fs.mkdirSync(dir, { recursive: true });

    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const filePath = path.join(dir, storedName);

    fs.writeFileSync(filePath, webpBuffer);

    const url = this.buildFileUrl(`users/${folder}/profile/${storedName}`);
    return { url };
  }

  /**
   * @summary Servir foto de perfil por ownerId y nombre de archivo
   * @description Devuelve un stream de la imagen con las cabeceras MIME correctas.
   */
  async serveProfilePhoto(ownerId: string, filename: string, res: any): Promise<void> {
    const baseDir = path.join(
      process.cwd(),
      this.uploadsDir,
      'users',
      ownerId,
      'profile',
    );

    const fullPath = path.join(baseDir, filename);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Foto de perfil no encontrada en el servidor.');
    }

    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeMap[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(fullPath).pipe(res);
  }

  /**
   * @summary Subir foto de un centro médico
   * @description
   * - Valida MIME type (PNG, JPEG, JPG, WEBP)
   * - Valida tamaño máximo (5 MB)
   * - Convierte a WebP con sharp (calidad 85)
   * - Guarda en UPLOADS_PATH/medical-centers/{medicalCenterId}/
   * - Persiste registro en medical_center_images
   * - Retorna URL pública y registro de la imagen
   */
  async uploadMedicalCenterPhoto(
    file: Express.Multer.File,
    data: {
      medicalCenterId: string;
      uploadedBy?: string;
      imageType?: string;
      description?: string;
    },
  ): Promise<{ url: string; image: MedicalCenterImage }> {
    if (!file) {
      throw new BadRequestException('Debe enviar un archivo de imagen.');
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan PNG, JPEG, JPG o WEBP.`,
      );
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      throw new BadRequestException('La imagen no puede superar los 5 MB.');
    }

    const webpBuffer = await sharp(file.buffer).webp({ quality: 85 }).toBuffer();

    const folder = data.medicalCenterId;
    const dir = path.join(process.cwd(), this.uploadsDir, 'medical-centers', folder);

    fs.mkdirSync(dir, { recursive: true });

    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const fullFilePath = path.join(dir, storedName);

    fs.writeFileSync(fullFilePath, webpBuffer);

    const filePathRelative = `medical-centers/${folder}/${storedName}`;
    const url = this.buildFileUrl(filePathRelative);

    // Desactivar todas las imágenes activas previas del centro
    await this.medicalCenterImageRepository.update(
      { medicalCenterId: data.medicalCenterId, isActive: true },
      { isActive: false },
    );

    // Persistir registro en BD
    const record = this.medicalCenterImageRepository.create({
      medicalCenterId: data.medicalCenterId,
      uploadedBy: data.uploadedBy ?? null,
      originalName: file.originalname,
      storedName,
      mimeType: 'image/webp',
      fileSize: webpBuffer.length,
      filePath: filePathRelative,
      imageType: data.imageType ?? 'general',
      description: data.description ?? null,
    });

    const image = await this.medicalCenterImageRepository.save(record);

    return { url, image };
  }

  /**
   * @summary Eliminar imagen de centro médico (soft delete + borrado físico)
   * @description
   * - Verifica que el registro exista (404 si no)
   * - Soft delete: isActive = false, deletedAt = now
   * - Borra el archivo físico del disco si existe
   */
  async deleteMedicalCenterImage(imageId: string): Promise<void> {
    const record = await this.medicalCenterImageRepository.findOne({
      where: { id: imageId, deletedAt: IsNull() },
    });

    if (!record) {
      throw new NotFoundException(
        `Imagen con ID ${imageId} no encontrada o ya fue eliminada.`,
      );
    }

    // Soft delete
    record.isActive = false;
    record.deletedAt = new Date();
    await this.medicalCenterImageRepository.save(record);

    // Borrar archivo físico si existe
    const fullPath = path.join(process.cwd(), this.uploadsDir, record.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  /**
   * @summary Obtener URL pública de una imagen de centro médico por ID
   */
  getMedicalCenterImageUrl(imageId: string): string {
    return `${this.publicUrl}/files/medical-center-images/${imageId}`;
  }

  /**
   * @summary Servir imagen de centro médico por ID (stream)
   * @description Busca el registro en BD por ID y devuelve el archivo como stream.
   */
  async serveMedicalCenterImage(imageId: string, res: any): Promise<void> {
    const record = await this.medicalCenterImageRepository.findOne({
      where: { id: imageId, deletedAt: IsNull() },
    });
    if (!record) {
      throw new NotFoundException('Imagen no encontrada.');
    }

    const fullPath = path.join(process.cwd(), this.uploadsDir, record.filePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Archivo físico no encontrado en el servidor.');
    }

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${record.originalName}"`);
    fs.createReadStream(fullPath).pipe(res);
  }

  /* ============================================================
   * FOTOS DE DOCTOR
   * ============================================================ */

  /**
   * @summary Obtener URL pública de una imagen de doctor por ID
   */
  getDoctorImageUrl(imageId: string): string {
    return `${this.publicUrl}/files/doctor-images/${imageId}`;
  }

  /**
   * @summary Subir foto de doctor
   * - Desactiva imágenes previas activas del doctor
   * - Convierte a WebP con sharp
   * - Guarda en UPLOADS_PATH/doctors/{doctorId}/
   * - Persiste registro en doctor_images
   */
  async uploadDoctorPhoto(
    file: Express.Multer.File,
    data: { doctorId: string; uploadedBy?: string },
  ): Promise<{ url: string; image: DoctorImage }> {
    if (!file) throw new BadRequestException('Debe enviar un archivo de imagen.');
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype))
      throw new BadRequestException(`Tipo no permitido: ${file.mimetype}.`);
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('La imagen no puede superar los 5 MB.');

    const webpBuffer = await sharp(file.buffer).webp({ quality: 85 }).toBuffer();
    const dir = path.join(process.cwd(), this.uploadsDir, 'doctors', data.doctorId);
    fs.mkdirSync(dir, { recursive: true });

    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    fs.writeFileSync(path.join(dir, storedName), webpBuffer);

    const filePathRelative = `doctors/${data.doctorId}/${storedName}`;
    const url = this.buildFileUrl(filePathRelative);

    // Desactivar imágenes previas
    await this.doctorImageRepository.update(
      { doctorId: data.doctorId, isActive: true },
      { isActive: false },
    );

    const record = this.doctorImageRepository.create({
      doctorId: data.doctorId,
      uploadedBy: data.uploadedBy ?? null,
      originalName: file.originalname,
      storedName,
      mimeType: 'image/webp',
      fileSize: webpBuffer.length,
      filePath: filePathRelative,
    });
    const image = await this.doctorImageRepository.save(record);
    return { url, image };
  }

  /**
   * @summary Servir imagen de doctor por ID (stream)
   */
  async serveDoctorImage(imageId: string, res: any): Promise<void> {
    const record = await this.doctorImageRepository.findOne({
      where: { id: imageId, deletedAt: IsNull() },
    });
    if (!record) throw new NotFoundException('Imagen no encontrada.');
    const fullPath = path.join(process.cwd(), this.uploadsDir, record.filePath);
    if (!fs.existsSync(fullPath)) throw new NotFoundException('Archivo físico no encontrado.');
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${record.originalName}"`);
    fs.createReadStream(fullPath).pipe(res);
  }

  /**
   * @summary Servir foto de centro médico por medicalCenterId y nombre de archivo
   * @description Devuelve un stream de la imagen con las cabeceras MIME correctas.
   */
  async serveMedicalCenterPhoto(
    medicalCenterId: string,
    filename: string,
    res: any,
  ): Promise<void> {
    const baseDir = path.join(
      process.cwd(),
      this.uploadsDir,
      'medical-centers',
      medicalCenterId,
    );

    const fullPath = path.join(baseDir, filename);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Foto de centro médico no encontrada en el servidor.');
    }

    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeMap[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(fullPath).pipe(res);
  }

  /* ============================================================
   * 🧑‍⚕️ FOTOS DE COMMON PERSON (PACIENTES / DOCTORES)
   * ============================================================ */

  /**
   * @summary Subir foto de CommonPerson (paciente o doctor)
   * @description
   * - Valida MIME type (PNG, JPEG, JPG, WEBP)
   * - Valida tamaño máximo (5 MB)
   * - Convierte a WebP con sharp (calidad 85)
   * - Si se provee personId: guarda en UPLOADS_PATH/common-persons/{personId}/images/
   * - Si no: guarda en UPLOADS_PATH/common-persons/general/images/
   * - Retorna URL pública completa
   */
  async uploadCommonPersonPhoto(
    file: Express.Multer.File,
    personId?: string,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Debe enviar un archivo de imagen.');
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan PNG, JPEG, JPG o WEBP.`,
      );
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      throw new BadRequestException('La imagen no puede superar los 5 MB.');
    }

    const webpBuffer = await sharp(file.buffer).webp({ quality: 85 }).toBuffer();

    const folder = personId ?? 'general';
    const dir = path.join(process.cwd(), this.uploadsDir, 'common-persons', folder);

    fs.mkdirSync(dir, { recursive: true });

    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const filePath = path.join(dir, storedName);

    fs.writeFileSync(filePath, webpBuffer);

    const url = this.buildFileUrl(`common-persons/${folder}/${storedName}`);
    return { url };
  }

  /**
   * @summary Servir foto de CommonPerson por personId y nombre de archivo
   * @description Devuelve un stream de la imagen con las cabeceras MIME correctas.
   */
  async serveCommonPersonPhoto(
    personId: string,
    filename: string,
    res: any,
  ): Promise<void> {
    const baseDir = path.join(
      process.cwd(),
      this.uploadsDir,
      'common-persons',
      personId,
    );

    const fullPath = path.join(baseDir, filename);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Foto de persona no encontrada en el servidor.');
    }

    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeMap[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(fullPath).pipe(res);
  }

  /* ============================================================
   * FOTOS DE PERSONAS COMUNES (PACIENTES) — DB backed
   * ============================================================ */

  getCommonPersonImageUrl(imageId: string): string {
    return `${this.publicUrl}/files/common-person-images/${imageId}`;
  }

  /**
   * Sube foto de CommonPerson, deactiva la anterior y crea registro en BD.
   */
  async uploadCommonPersonImage(
    file: Express.Multer.File,
    data: { commonPersonId: string; uploadedBy?: string },
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('Debe enviar un archivo de imagen.');

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan PNG, JPEG, JPG o WEBP.`,
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede superar los 5 MB.');
    }

    const webpBuffer = await sharp(file.buffer).webp({ quality: 85 }).toBuffer();

    const dir = path.join(
      process.cwd(),
      this.uploadsDir,
      'common-persons',
      data.commonPersonId,
    );
    fs.mkdirSync(dir, { recursive: true });

    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const filePath = path.join(dir, storedName);
    fs.writeFileSync(filePath, webpBuffer);

    // Desactivar imagen previa
    await this.commonPersonImageRepository.update(
      { commonPersonId: data.commonPersonId, isActive: true },
      { isActive: false },
    );

    // Crear registro en BD
    const record = this.commonPersonImageRepository.create({
      commonPersonId: data.commonPersonId,
      uploadedBy: data.uploadedBy ?? null,
      originalName: file.originalname,
      storedName,
      mimeType: 'image/webp',
      fileSize: webpBuffer.length,
      filePath: `common-persons/${data.commonPersonId}/${storedName}`,
      isActive: true,
    });
    const saved = await this.commonPersonImageRepository.save(record);

    return { url: this.getCommonPersonImageUrl(saved.id) };
  }

  /**
   * Sirve imagen de CommonPerson por imageId (desde BD).
   */
  async serveCommonPersonImage(imageId: string, res: any): Promise<void> {
    const record = await this.commonPersonImageRepository.findOne({
      where: { id: imageId, deletedAt: null as any },
    });
    if (!record) {
      throw new NotFoundException('Imagen de persona no encontrada.');
    }

    const fullPath = path.join(process.cwd(), this.uploadsDir, record.filePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Archivo de imagen no encontrado en el servidor.');
    }

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${record.storedName}"`);
    fs.createReadStream(fullPath).pipe(res);
  }
}
