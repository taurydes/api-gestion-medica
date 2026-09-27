import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { IsNull, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { User } from 'src/user/entities/user.entity';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { resolveUploadPath } from 'src/files/upload-path.util';
import { DicomConverterService } from 'src/files/dicom-converter.service';
import {
  ANALYSIS_IMAGE_MAX_BYTES,
  DICOM_MAX_BYTES,
  tooLargeMessage,
} from 'src/files/upload-limits';
import { DetectorClient } from './detector/detector.client';

import { MammographyAnalysis } from './entities/mammography-analysis.entity';
import { CreateMammographyAnalysisDto } from './dto/create-mammography-analysis.dto';
import { QueryMammographyAnalysisDto } from './dto/query-mammography-analysis.dto';
import { ReviewMammographyAnalysisDto } from './dto/review-mammography-analysis.dto';

const HIGH_RISK_MALIGNANCY = 80;

interface SourceImage {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/** Médico al que se acota la consulta; `null` = sin restricción (admin o usuario que no es médico). */
type DoctorScope = { doctorId: string; userId: string } | null;

@Injectable()
export class MammographyAnalysisService {
  private readonly logger = new Logger(MammographyAnalysisService.name);
  private readonly uploadsDir: string;
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(MammographyAnalysis, DatabaseConnectionName.DB_MAIN)
    private readonly analysisRepo: Repository<MammographyAnalysis>,

    @InjectRepository(AppointmentFile, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentFileRepo: Repository<AppointmentFile>,

    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentRepo: Repository<MedicalAppointment>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepo: Repository<User>,

    private readonly configService: ConfigService,

    private readonly authContextService: AuthContextService,

    private readonly detector: DetectorClient,

    private readonly dicomConverter: DicomConverterService,
  ) {
    this.uploadsDir =
      this.configService.get<string>('UPLOADS_PATH') || 'uploads';
    const host = this.configService.get<string>('URL_HOST') || 'localhost';
    const port = this.configService.get<string>('PORT') || '8008';
    const baseHost = host.startsWith('http') ? host : `http://${host}`;
    this.publicUrl = `${baseHost}:${port}`;
  }

  /* ============================================================
   * CREATE (M-39: el backend llama al detector y guarda su respuesta)
   * ============================================================ */

  async create(
    dto: CreateMammographyAnalysisDto,
    authUser?: { id?: string },
  ) {
    const apptFile = await this.appointmentFileRepo.findOne({
      where: { id: dto.appointmentFileId, deletedAt: IsNull() },
    });
    if (!apptFile) {
      throw new NotFoundException('El archivo de mamografía indicado no existe.');
    }
    if (dto.appointmentId && dto.appointmentId !== apptFile.appointmentId) {
      throw new BadRequestException('appointmentId no corresponde al archivo indicado.');
    }
    if (dto.patientId && dto.patientId !== apptFile.patientId) {
      throw new BadRequestException('patientId no corresponde al archivo indicado.');
    }
    await this.assertAppointmentAccess(
      apptFile.appointmentId,
      await this.resolveDoctorScope(authUser),
    );

    const stored = await this.readStoredFile(apptFile);
    const image = await this.prepareForDetector(stored);
    const result = await this.detector.predict(image);

    // Un DICOM se guarda como el JPEG que vio el modelo, para poder servirlo y re-inferir.
    let imagePath = apptFile.filePath;
    let imageMimeType = apptFile.mimeType;
    if (image.converted) {
      imagePath = this.storeAnalyzedImage(apptFile.appointmentId, image.buffer);
      imageMimeType = image.mimeType;
    }

    const record = this.analysisRepo.create({
      appointmentId: apptFile.appointmentId,
      appointmentFileId: apptFile.id,
      patientId: apptFile.patientId,
      analyzedBy: await this.resolveAnalyzedBy(authUser?.id ?? null),
      prediction: result.prediction,
      // numeric(5,2): se redondea aquí para que la respuesta del POST coincida con lo que devuelve un GET.
      probability: round2(result.probability),
      malignancyProbability: round2(result.malignancyProbability),
      rawScore: result.rawScore,
      threshold: result.threshold,
      modelVersion: result.modelVersion,
      status: result.status,
      label: result.label,
      rawResponse: result.raw,
      notes: dto.notes ?? null,
      imagePath,
      imageMimeType,
      sourceFileName: dto.sourceFileName ?? apptFile.originalName ?? null,
      isReviewed: false,
    });

    return this.serialize(await this.analysisRepo.save(record));
  }

  /** Corre el modelo sobre una imagen subida sin guardar nada (detector independiente). */
  async preview(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Debe enviar un archivo de imagen en el campo "file".');
    }
    const image = await this.prepareForDetector({
      buffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname || 'imagen',
    });
    const r = await this.detector.predict(image);
    return {
      prediction: r.prediction,
      probability: r.probability,
      malignancyProbability: r.malignancyProbability,
      rawScore: r.rawScore,
      threshold: r.threshold,
      modelVersion: r.modelVersion,
      status: r.status,
      label: r.label,
    };
  }

  private async readStoredFile(apptFile: AppointmentFile): Promise<SourceImage> {
    const fullPath = resolveUploadPath(this.uploadsDir, apptFile.filePath);
    let size: number;
    try {
      size = (await fs.promises.stat(fullPath)).size;
    } catch {
      throw new NotFoundException('El archivo de imagen no existe en el servidor.');
    }
    if (size > DICOM_MAX_BYTES) {
      throw new PayloadTooLargeException(tooLargeMessage(DICOM_MAX_BYTES));
    }
    return {
      buffer: await fs.promises.readFile(fullPath),
      mimeType: apptFile.mimeType,
      fileName: apptFile.originalName || path.basename(apptFile.filePath),
    };
  }

  /** DICOM -> JPEG del primer frame; una imagen raster pasa tal cual si cabe en el tope del detector. */
  private async prepareForDetector(src: SourceImage): Promise<SourceImage & { converted: boolean }> {
    if (DicomConverterService.isDicom(src.buffer)) {
      const jpeg = await this.dicomConverter.renderFrameJpeg(src.buffer);
      const base = path.parse(src.fileName).name || 'dicom';
      return { buffer: jpeg, mimeType: 'image/jpeg', fileName: `${base}.jpg`, converted: true };
    }
    if (src.buffer.length > ANALYSIS_IMAGE_MAX_BYTES) {
      throw new PayloadTooLargeException(tooLargeMessage(ANALYSIS_IMAGE_MAX_BYTES));
    }
    return { ...src, converted: false };
  }

  private storeAnalyzedImage(appointmentId: string, jpeg: Buffer): string {
    const relativeDir = path.posix.join('mammography-analyses', appointmentId);
    fs.mkdirSync(resolveUploadPath(this.uploadsDir, relativeDir), { recursive: true });
    const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
    fs.writeFileSync(resolveUploadPath(this.uploadsDir, relativeDir, storedName), jpeg);
    return path.posix.join(relativeDir, storedName);
  }

  /** Un médico solo analiza archivos de sus propias citas. */
  private async assertAppointmentAccess(appointmentId: string, scope: DoctorScope): Promise<void> {
    if (!scope) return;
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      select: ['id', 'doctorId'],
    });
    if (appointment?.doctorId !== scope.doctorId) {
      throw new ForbiddenException('No tiene acceso a este archivo.');
    }
  }

  /**
   * Devuelve el `userId` solo si existe en `public.users`; en caso contrario
   * deja la auditoría en null para no violar la FK. Útil para identidades
   * que viven fuera de la tabla `users` (admin/super-admin con otro origen).
   */
  private async resolveAnalyzedBy(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const exists = await this.userRepo.exists({ where: { id: userId } });
    if (exists) return userId;
    this.logger.warn(
      `El id "${userId}" no existe en public.users; el análisis se guardará con analyzed_by = null.`,
    );
    return null;
  }

  /* ============================================================
   * ALCANCE POR MÉDICO (IDOR)
   * ============================================================ */

  private async resolveDoctorScope(authUser?: any): Promise<DoctorScope> {
    const userId = authUser?.id;
    const doctorId = await this.authContextService.getScopedDoctorId(userId);
    return doctorId ? { doctorId, userId } : null;
  }

  /** Un médico ve los análisis de sus citas y los sin cita que él mismo registró. */
  private applyDoctorScope(qb: any, scope: DoctorScope): void {
    if (!scope) return;
    qb.andWhere(
      '(appointment.doctorId = :scopeDoctorId OR (analysis.appointmentId IS NULL AND analysis.analyzedBy = :scopeUserId))',
      { scopeDoctorId: scope.doctorId, scopeUserId: scope.userId },
    );
  }

  private assertDoctorAccess(record: MammographyAnalysis, scope: DoctorScope): void {
    if (!scope) return;
    const ownAppointment = record.appointment?.doctorId === scope.doctorId;
    const ownStandalone =
      !record.appointmentId && record.analyzedBy === scope.userId;
    if (!ownAppointment && !ownStandalone) {
      throw new ForbiddenException('No tiene acceso a este análisis.');
    }
  }

  /* ============================================================
   * READ
   * ============================================================ */

  /**
   * Bandeja del día agrupada por cita, ordenada por gravedad.
   * Devuelve grupos { appointment, analyses[] } con los análisis ordenados
   * por probabilidad descendente. Los análisis sin cita van en un grupo
   * especial con appointment = null.
   */
  async findTodayInbox(query: QueryMammographyAnalysisDto, authUser?: any) {
    const { start, end } = this.resolveDateRange(query);
    const scope = await this.resolveDoctorScope(authUser);

    const qb = this.analysisRepo
      .createQueryBuilder('analysis')
      .leftJoinAndSelect('analysis.appointment', 'appointment')
      .leftJoinAndSelect('appointment.patient', 'apptPatient')
      .leftJoinAndSelect('apptPatient.commonPerson', 'apptCommonPerson')
      .leftJoinAndSelect('appointment.doctor', 'apptDoctor')
      .leftJoinAndSelect('apptDoctor.commonPerson', 'apptDoctorPerson')
      .leftJoinAndSelect('analysis.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('analysis.appointmentFile', 'appointmentFile')
      .where('analysis.deletedAt IS NULL')
      // Filtramos por la fecha CLÍNICA de la cita; los análisis sin cita
      // usan su propio createdAt como referencia.
      .andWhere(
        `(
          (appointment.appointmentDate IS NOT NULL AND appointment.appointmentDate BETWEEN :start AND :end)
          OR (appointment.appointmentDate IS NULL AND analysis.createdAt BETWEEN :start AND :end)
        )`,
        { start, end },
      );

    if (query.appointmentId) {
      qb.andWhere('analysis.appointmentId = :appointmentId', {
        appointmentId: query.appointmentId,
      });
    }
    if (query.patientId) {
      qb.andWhere('analysis.patientId = :patientId', {
        patientId: query.patientId,
      });
    }
    if (query.onlyUnreviewed) {
      qb.andWhere('analysis.isReviewed = false');
    }
    if (query.isReviewed !== undefined) {
      qb.andWhere('analysis.isReviewed = :reviewed', {
        reviewed: query.isReviewed,
      });
    }
    if (query.minProbability !== undefined) {
      qb.andWhere('analysis.malignancyProbability >= :minProbability', {
        minProbability: query.minProbability,
      });
    }
    if (query.status) {
      qb.andWhere('analysis.status = :status', { status: query.status });
    }
    this.applyDoctorScope(qb, scope);

    this.applyUrgencyOrder(qb);
    qb.limit(query.limit ?? 200).offset(query.offset ?? 0);

    const rows = await qb.getMany();

    // Agrupamos por appointmentId. Cada grupo expone su score de urgencia
    // máximo (mayor = más urgente) calculado con la misma lógica que el orden
    // del ranking: malignos por probabilidad DESC, benignos por ASC.
    const groupsMap = new Map<
      string,
      {
        appointmentId: string | null;
        appointment: any;
        maxProbability: number;
        maxMalignancyProbability: number | null;
        hasDanger: boolean;
        maxUrgency: number;
        analyses: any[];
      }
    >();

    for (const r of rows) {
      const key = r.appointmentId ?? '__standalone__';
      const score = this.urgencyScore(Number(r.probability), r.status);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          appointmentId: r.appointmentId,
          appointment: r.appointment
            ? this.serializeAppointment(r.appointment)
            : null,
          maxProbability: Number(r.probability),
          maxMalignancyProbability: numberOrNull(r.malignancyProbability),
          hasDanger: r.status === 'danger',
          maxUrgency: score,
          analyses: [],
        });
      }
      const g = groupsMap.get(key)!;
      g.maxProbability = Math.max(g.maxProbability, Number(r.probability));
      const malignancy = numberOrNull(r.malignancyProbability);
      if (malignancy !== null) {
        g.maxMalignancyProbability = Math.max(g.maxMalignancyProbability ?? 0, malignancy);
      }
      g.hasDanger = g.hasDanger || r.status === 'danger';
      g.maxUrgency = Math.max(g.maxUrgency, score);
      g.analyses.push(this.serialize(r));
    }

    return Array.from(groupsMap.values()).sort(
      (a, b) => b.maxUrgency - a.maxUrgency,
    );
  }

  /**
   * Lista plana paginada de análisis ML ordenada por probabilidad
   * descendente. Pensada para tablas de dashboard donde se quiere
   * "los N más graves del día" con info enriquecida de cita/paciente.
   */
  async findRecent(query: QueryMammographyAnalysisDto, authUser?: any) {
    const { start, end } = this.resolveDateRange(query);
    const scope = await this.resolveDoctorScope(authUser);
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    const qb = this.analysisRepo
      .createQueryBuilder('analysis')
      .leftJoinAndSelect('analysis.appointment', 'appointment')
      .leftJoinAndSelect('appointment.patient', 'apptPatient')
      .leftJoinAndSelect('apptPatient.commonPerson', 'apptCommonPerson')
      .leftJoinAndSelect('appointment.doctor', 'apptDoctor')
      .leftJoinAndSelect('apptDoctor.commonPerson', 'apptDoctorPerson')
      .where('analysis.deletedAt IS NULL')
      .andWhere(
        `(
          (appointment.appointmentDate IS NOT NULL AND appointment.appointmentDate BETWEEN :start AND :end)
          OR (appointment.appointmentDate IS NULL AND analysis.createdAt BETWEEN :start AND :end)
        )`,
        { start, end },
      );

    if (query.onlyUnreviewed) {
      qb.andWhere('analysis.isReviewed = false');
    }
    if (query.isReviewed !== undefined) {
      qb.andWhere('analysis.isReviewed = :reviewed', {
        reviewed: query.isReviewed,
      });
    }
    if (query.status) {
      qb.andWhere('analysis.status = :status', { status: query.status });
    }
    if (query.minProbability !== undefined) {
      qb.andWhere('analysis.malignancyProbability >= :minProbability', {
        minProbability: query.minProbability,
      });
    }
    this.applyDoctorScope(qb, scope);

    this.applyUrgencyOrder(qb);

    const [rows, total] = await qb
      .clone()
      .limit(limit)
      .offset(offset)
      .getManyAndCount();

    const data = rows.map((r) => ({
      ...this.serialize(r),
      appointment: r.appointment
        ? this.serializeAppointment(r.appointment)
        : null,
    }));

    return {
      data,
      total,
      limit,
      offset,
      dateFrom: query.dateFrom ?? query.date ?? this.todayIsoDate(),
      dateTo: query.dateTo ?? query.date ?? this.todayIsoDate(),
    };
  }

  async findByAppointment(appointmentId: string, authUser?: any) {
    const scope = await this.resolveDoctorScope(authUser);
    // Misma ordenación de "urgencia" que la bandeja/ranking: malignos primero
    // (probability DESC), benignos después (probability ASC).
    const qb = this.analysisRepo
      .createQueryBuilder('analysis')
      .leftJoinAndSelect('analysis.appointmentFile', 'appointmentFile')
      .leftJoin('analysis.appointment', 'appointment')
      .where('analysis.deletedAt IS NULL')
      .andWhere('analysis.appointmentId = :appointmentId', { appointmentId });
    this.applyDoctorScope(qb, scope);
    this.applyUrgencyOrder(qb);
    const items = await qb.getMany();
    return items.map((r) => this.serialize(r));
  }

  async findOne(id: string, authUser?: any): Promise<MammographyAnalysis> {
    const record = await this.analysisRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['appointment', 'appointmentFile', 'patient'],
    });
    if (!record) {
      throw new NotFoundException('Análisis no encontrado.');
    }
    this.assertDoctorAccess(record, await this.resolveDoctorScope(authUser));
    return record;
  }

  /* ============================================================
   * REVIEW
   * ============================================================ */

  async markReviewed(
    id: string,
    dto: ReviewMammographyAnalysisDto,
    userId: string | null,
  ): Promise<MammographyAnalysis> {
    const record = await this.findOne(id, userId ? { id: userId } : undefined);
    record.isReviewed = true;
    record.reviewedBy = userId;
    record.reviewedAt = new Date();
    if (dto.reviewNotes !== undefined) {
      record.reviewNotes = dto.reviewNotes;
    }
    return this.analysisRepo.save(record);
  }

  /* ============================================================
   * SERVE IMAGE
   * ============================================================ */

  async serveImage(id: string, res: any, authUser?: any): Promise<void> {
    const record = await this.findOne(id, authUser);
    if (!record.imagePath) {
      throw new NotFoundException('Este análisis no tiene imagen almacenada.');
    }
    const fullPath = resolveUploadPath(this.uploadsDir, record.imagePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Archivo de imagen no existe en disco.');
    }
    res.setHeader(
      'Content-Type',
      record.imageMimeType ?? 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${record.sourceFileName ?? path.basename(record.imagePath)}"`,
    );
    fs.createReadStream(fullPath).pipe(res);
  }

  /* ============================================================
   * STATS
   * ============================================================ */

  async getDailyStats(
    query: { date?: string; dateFrom?: string; dateTo?: string } = {},
    authUser?: any,
  ) {
    const { start, end } = this.resolveDateRange(query as QueryMammographyAnalysisDto);
    const scope = await this.resolveDoctorScope(authUser);

    // Mismo criterio que la bandeja: fecha de la cita o, en su defecto,
    // fecha de creación del análisis (para análisis standalone).
    const statsQb = this.analysisRepo
      .createQueryBuilder('analysis')
      .leftJoin('analysis.appointment', 'appointment')
      .where('analysis.deletedAt IS NULL')
      .andWhere(
        `(
          (appointment.appointmentDate IS NOT NULL AND appointment.appointmentDate BETWEEN :start AND :end)
          OR (appointment.appointmentDate IS NULL AND analysis.createdAt BETWEEN :start AND :end)
        )`,
        { start, end },
      )
      .select([
        'analysis.id',
        'analysis.status',
        'analysis.probability',
        'analysis.malignancyProbability',
        'analysis.isReviewed',
      ]);
    this.applyDoctorScope(statsQb, scope);
    const all = await statsQb.getMany();

    const total = all.length;
    const danger = all.filter((a) => a.status === 'danger').length;
    const pending = all.filter((a) => !a.isReviewed).length;
    // Alto riesgo = probabilidad de malignidad >= 80 (M-40); `probability` es la confianza en la clase.
    const highRisk = all.filter(
      (a) => a.malignancyProbability !== null && Number(a.malignancyProbability) >= HIGH_RISK_MALIGNANCY,
    ).length;

    return {
      dateFrom: query.dateFrom ?? query.date ?? this.todayIsoDate(),
      dateTo: query.dateTo ?? query.date ?? this.todayIsoDate(),
      total,
      danger,
      pending,
      highRisk,
    };
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */

  /**
   * Resuelve el rango temporal de la query. Si vienen `dateFrom`/`dateTo`
   * los usa (rango inclusivo); si no, cae al `date` único; si tampoco hay,
   * usa hoy. Útil para que los tres flujos (bandeja, ranking y stats)
   * compartan el mismo criterio.
   */
  private resolveDateRange(query: QueryMammographyAnalysisDto): {
    start: Date;
    end: Date;
  } {
    const fromIso = query.dateFrom ?? query.date ?? this.todayIsoDate();
    const toIso = query.dateTo ?? query.date ?? this.todayIsoDate();
    return {
      start: new Date(`${fromIso}T00:00:00.000`),
      end: new Date(`${toIso}T23:59:59.999`),
    };
  }

  /**
   * Aplica el orden por "urgencia clínica" al QueryBuilder de análisis:
   *  1) Malignos antes que benignos (`status = 'danger'` primero).
   *  2) Dentro de malignos: probabilidad DESC (más certeza = más urgente).
   *  3) Dentro de benignos: probabilidad ASC (menos certeza = más urgente,
   *     porque un benigno con baja confianza puede ser falso negativo).
   *  4) Empate: más reciente primero.
   *
   * Se usa en bandeja, ranking y listado por cita para mantener consistencia.
   */
  private applyUrgencyOrder(
    qb: ReturnType<Repository<MammographyAnalysis>['createQueryBuilder']>,
    alias = 'analysis',
  ): void {
    qb.orderBy(`CASE WHEN ${alias}.status = 'danger' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy(
        `CASE WHEN ${alias}.status = 'danger' THEN ${alias}.probability ELSE -${alias}.probability END`,
        'DESC',
      )
      .addOrderBy(`${alias}.createdAt`, 'DESC');
  }

  /**
   * Score numérico de urgencia para ordenar en memoria (grupos de bandeja).
   * Mayor score = más urgente.
   *   - Maligno: 100 + probability  (rango 100-200)
   *   - Benigno: 100 - probability  (rango 0-100, menos seguro = mayor score)
   */
  private urgencyScore(probability: number, status: string): number {
    return status === 'danger' ? 100 + probability : 100 - probability;
  }

  private serialize(r: MammographyAnalysis) {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      appointmentFileId: r.appointmentFileId,
      patientId: r.patientId,
      analyzedBy: r.analyzedBy,
      prediction: r.prediction,
      probability: Number(r.probability),
      malignancyProbability: numberOrNull(r.malignancyProbability),
      rawScore: r.rawScore ?? null,
      threshold: r.threshold ?? null,
      modelVersion: r.modelVersion ?? null,
      status: r.status,
      label: r.label,
      notes: r.notes ?? null,
      isReviewed: r.isReviewed,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      reviewNotes: r.reviewNotes,
      sourceFileName: r.sourceFileName,
      imageUrl: r.imagePath ? this.buildImageUrl(r.id) : null,
      createdAt: r.createdAt,
    };
  }

  private serializeAppointment(a: MedicalAppointment) {
    const patient: any = (a as any).patient;
    const doctor: any = (a as any).doctor;
    return {
      id: a.id,
      appointmentNumber: a.appointmentNumber,
      appointmentDate: a.appointmentDate,
      status: a.status,
      reason: a.reason,
      patient: patient
        ? {
            id: patient.id,
            patientCode: patient.patientCode,
            fullName: this.buildFullName(patient.commonPerson),
          }
        : null,
      doctor: doctor
        ? {
            id: doctor.id,
            licenseNumber: doctor.licenseNumber,
            fullName: this.buildFullName(doctor.commonPerson),
          }
        : null,
    };
  }

  private buildImageUrl(analysisId: string): string {
    return `${this.publicUrl}/mammography-analyses/${analysisId}/image`;
  }

  private buildFullName(person: any): string {
    if (!person) return '';
    const parts = [
      person.firstName,
      person.middleName,
      person.lastName,
      person.secondLastName,
    ].filter((p) => !!p);
    return parts.join(' ').trim();
  }

  private todayIsoDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
