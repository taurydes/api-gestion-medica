import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Between, IsNull, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';

import { MammographyAnalysis } from './entities/mammography-analysis.entity';
import { CreateMammographyAnalysisDto } from './dto/create-mammography-analysis.dto';
import { QueryMammographyAnalysisDto } from './dto/query-mammography-analysis.dto';
import { ReviewMammographyAnalysisDto } from './dto/review-mammography-analysis.dto';

@Injectable()
export class MammographyAnalysisService {
  private readonly uploadsDir: string;
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(MammographyAnalysis, DatabaseConnectionName.DB_MAIN)
    private readonly analysisRepo: Repository<MammographyAnalysis>,

    @InjectRepository(AppointmentFile, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentFileRepo: Repository<AppointmentFile>,

    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentRepo: Repository<MedicalAppointment>,

    private readonly configService: ConfigService,
  ) {
    this.uploadsDir =
      this.configService.get<string>('UPLOADS_PATH') || 'uploads';
    const host = this.configService.get<string>('URL_HOST') || 'localhost';
    const port = this.configService.get<string>('PORT') || '8008';
    const baseHost = host.startsWith('http') ? host : `http://${host}`;
    this.publicUrl = `${baseHost}:${port}`;
  }

  /* ============================================================
   * CREATE
   * ============================================================ */

  async create(
    dto: CreateMammographyAnalysisDto,
    file: Express.Multer.File | undefined,
    userId: string | null,
  ): Promise<MammographyAnalysis> {
    // Si viene appointmentFileId, validamos y reutilizamos su path.
    let imagePath: string | null = null;
    let imageMimeType: string | null = null;
    let resolvedPatientId = dto.patientId ?? null;
    let resolvedAppointmentId = dto.appointmentId ?? null;

    if (dto.appointmentFileId) {
      const apptFile = await this.appointmentFileRepo.findOne({
        where: { id: dto.appointmentFileId, deletedAt: IsNull() },
      });
      if (!apptFile) {
        throw new NotFoundException(
          'El archivo de mamografía indicado no existe.',
        );
      }
      imagePath = apptFile.filePath;
      imageMimeType = apptFile.mimeType;
      resolvedPatientId = resolvedPatientId ?? apptFile.patientId;
      resolvedAppointmentId = resolvedAppointmentId ?? apptFile.appointmentId;
    }

    // Si no hay file ni appointmentFileId, no podemos guardar imagen.
    if (!dto.appointmentFileId && !file) {
      throw new BadRequestException(
        'Debe enviar un archivo de imagen o un appointmentFileId existente.',
      );
    }

    // Si nos enviaron una imagen nueva, la guardamos en uploads/mammography-analyses/...
    if (file) {
      const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowedMimes.includes(file.mimetype)) {
        throw new BadRequestException(
          `Tipo de imagen no permitido: ${file.mimetype}.`,
        );
      }

      const folder = resolvedAppointmentId ?? 'standalone';
      const relativeDir = path.join('mammography-analyses', folder);
      const fullDir = path.join(process.cwd(), this.uploadsDir, relativeDir);
      fs.mkdirSync(fullDir, { recursive: true });

      const ext = this.extFromMime(file.mimetype) || path.extname(file.originalname) || '.png';
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const fullPath = path.join(fullDir, storedName);
      fs.writeFileSync(fullPath, file.buffer);

      imagePath = path.join(relativeDir, storedName).replace(/\\/g, '/');
      imageMimeType = file.mimetype;
    }

    let rawResponse: Record<string, any> | null = null;
    if (dto.rawResponseJson) {
      try {
        rawResponse = JSON.parse(dto.rawResponseJson);
      } catch {
        rawResponse = { raw: dto.rawResponseJson };
      }
    }

    const record = this.analysisRepo.create({
      appointmentId: resolvedAppointmentId,
      appointmentFileId: dto.appointmentFileId ?? null,
      patientId: resolvedPatientId,
      analyzedBy: userId,
      prediction: dto.prediction,
      probability: dto.probability,
      status: dto.status,
      label: dto.label ?? null,
      rawResponse,
      imagePath,
      imageMimeType,
      sourceFileName: dto.sourceFileName ?? file?.originalname ?? null,
      isReviewed: false,
    });

    return this.analysisRepo.save(record);
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
  async findTodayInbox(query: QueryMammographyAnalysisDto) {
    const date = query.date ?? this.todayIsoDate();
    const start = new Date(`${date}T00:00:00.000`);
    const end = new Date(`${date}T23:59:59.999`);

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
      .andWhere('analysis.createdAt BETWEEN :start AND :end', { start, end });

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
    if (query.minProbability !== undefined) {
      qb.andWhere('analysis.probability >= :minProbability', {
        minProbability: query.minProbability,
      });
    }
    if (query.status) {
      qb.andWhere('analysis.status = :status', { status: query.status });
    }

    qb.orderBy('analysis.probability', 'DESC')
      .addOrderBy('analysis.createdAt', 'DESC')
      .limit(query.limit ?? 200)
      .offset(query.offset ?? 0);

    const rows = await qb.getMany();

    // Agrupamos por appointmentId para que el frontend pueda dibujar
    // tarjetas por cita ordenadas por la gravedad máxima dentro del grupo.
    const groupsMap = new Map<
      string,
      {
        appointmentId: string | null;
        appointment: any;
        maxProbability: number;
        hasDanger: boolean;
        analyses: any[];
      }
    >();

    for (const r of rows) {
      const key = r.appointmentId ?? '__standalone__';
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          appointmentId: r.appointmentId,
          appointment: r.appointment
            ? this.serializeAppointment(r.appointment)
            : null,
          maxProbability: Number(r.probability),
          hasDanger: r.status === 'danger',
          analyses: [],
        });
      }
      const g = groupsMap.get(key)!;
      g.maxProbability = Math.max(g.maxProbability, Number(r.probability));
      g.hasDanger = g.hasDanger || r.status === 'danger';
      g.analyses.push(this.serialize(r));
    }

    return Array.from(groupsMap.values()).sort((a, b) => {
      if (a.hasDanger !== b.hasDanger) return a.hasDanger ? -1 : 1;
      return b.maxProbability - a.maxProbability;
    });
  }

  async findByAppointment(appointmentId: string) {
    const items = await this.analysisRepo.find({
      where: { appointmentId, deletedAt: IsNull() },
      relations: ['appointmentFile'],
      order: { probability: 'DESC', createdAt: 'DESC' },
    });
    return items.map((r) => this.serialize(r));
  }

  async findOne(id: string): Promise<MammographyAnalysis> {
    const record = await this.analysisRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['appointment', 'appointmentFile', 'patient'],
    });
    if (!record) {
      throw new NotFoundException('Análisis no encontrado.');
    }
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
    const record = await this.findOne(id);
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

  async serveImage(id: string, res: any): Promise<void> {
    const record = await this.findOne(id);
    if (!record.imagePath) {
      throw new NotFoundException('Este análisis no tiene imagen almacenada.');
    }
    const fullPath = path.join(
      process.cwd(),
      this.uploadsDir,
      record.imagePath,
    );
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

  async getDailyStats(date?: string) {
    const target = date ?? this.todayIsoDate();
    const start = new Date(`${target}T00:00:00.000`);
    const end = new Date(`${target}T23:59:59.999`);

    const all = await this.analysisRepo.find({
      where: { createdAt: Between(start, end), deletedAt: IsNull() },
      select: ['id', 'status', 'probability', 'isReviewed'],
    });

    const total = all.length;
    const danger = all.filter((a) => a.status === 'danger').length;
    const pending = all.filter((a) => !a.isReviewed).length;
    const highRisk = all.filter((a) => Number(a.probability) >= 80).length;

    return { date: target, total, danger, pending, highRisk };
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */

  private serialize(r: MammographyAnalysis) {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      appointmentFileId: r.appointmentFileId,
      patientId: r.patientId,
      analyzedBy: r.analyzedBy,
      prediction: r.prediction,
      probability: Number(r.probability),
      status: r.status,
      label: r.label,
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

  private extFromMime(mime: string): string | null {
    switch (mime) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      default:
        return null;
    }
  }

  private todayIsoDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
