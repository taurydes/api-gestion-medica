import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { IsNull, Repository } from 'typeorm';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { detectFileType } from 'src/files/file-signature';
import { MB } from 'src/files/upload-limits';
import { assertFolderId, resolveUploadPath } from 'src/files/upload-path.util';
import { DoctorsService } from './doctors.service';
import { Doctor } from './entities/doctor.entity';

export type CredentialKind = 'signature' | 'stamp';

export const CREDENTIAL_MAX_BYTES = 2 * MB;
export const NO_DOCTOR_PROFILE = 'El usuario no tiene perfil médico.';
export const CREDENTIAL_FORBIDDEN = 'Solo el propio médico o un administrador puede gestionar su firma y sello.';
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const COLUMN = { signature: 'signaturePath', stamp: 'stampPath' } as const;
const LABEL = { signature: 'firma', stamp: 'sello' } as const;

export interface CredentialFlags {
  hasSignature: boolean;
  hasStamp: boolean;
}

/** Private signature and stamp images of a doctor: owner or admin only, stored as PNG under the doctor's folder. */
@Injectable()
export class DoctorCredentialsService {
  private readonly uploadsDir: string;

  constructor(
    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,
    private readonly doctorsService: DoctorsService,
    private readonly authContext: AuthContextService,
    config: ConfigService,
  ) {
    this.uploadsDir = config.get<string>('UPLOADS_PATH') || 'uploads';
  }

  /** The caller's doctor id, or 404 when the user has no doctor profile. */
  async myDoctorId(userId: string): Promise<string> {
    const doctorId = await this.authContext.getDoctorIdForUser(userId);
    if (!doctorId) throw new NotFoundException(NO_DOCTOR_PROFILE);
    return doctorId;
  }

  /** 403 unless the caller is that doctor or an admin. */
  async assertOwnerOrAdmin(doctorId: string, userId: string): Promise<void> {
    if ((await this.authContext.getDoctorIdForUser(userId)) === doctorId) return;
    if (await this.authContext.isAdmin(userId)) return;
    throw new ForbiddenException(CREDENTIAL_FORBIDDEN);
  }

  async getMyProfile(userId: string) {
    const doctorId = await this.myDoctorId(userId);
    const doctor = await this.doctorsService.findOne(doctorId);
    return { ...doctor, ...(await this.flags(doctorId)) };
  }

  async flags(doctorId: string): Promise<CredentialFlags> {
    const paths = await this.paths(doctorId);
    return { hasSignature: !!paths.signaturePath, hasStamp: !!paths.stampPath };
  }

  /** Validates by magic bytes, re-encodes to PNG (drops metadata, pdfmake reads it) and replaces the previous file. */
  async upload(doctorId: string, kind: CredentialKind, file?: Express.Multer.File): Promise<CredentialFlags> {
    if (!file?.buffer?.length) throw new BadRequestException('Debe enviar un archivo de imagen en el campo "file".');
    if (file.size > CREDENTIAL_MAX_BYTES) {
      throw new BadRequestException('La imagen no puede superar los 2 MB.');
    }
    const sniffed = detectFileType(file.buffer);
    if (!sniffed || !ALLOWED_TYPES.has(sniffed)) {
      throw new BadRequestException('La imagen debe ser PNG, JPEG o WebP.');
    }
    const previous = await this.paths(doctorId);

    let png: Buffer;
    try {
      png = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      throw new BadRequestException('La imagen está dañada o no se puede leer.');
    }

    assertFolderId(doctorId, 'doctorId');
    const relative = `doctors/${doctorId}/credentials/${kind}-${randomUUID()}.png`;
    const target = resolveUploadPath(this.uploadsDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, png);
    await this.doctorRepository.update(doctorId, { [COLUMN[kind]]: relative });
    await this.removeFile(previous[COLUMN[kind]]);
    return this.flags(doctorId);
  }

  async remove(doctorId: string, kind: CredentialKind): Promise<CredentialFlags> {
    const previous = await this.paths(doctorId);
    if (!previous[COLUMN[kind]]) throw new NotFoundException(`El médico no tiene ${LABEL[kind]} registrada.`);
    await this.doctorRepository.update(doctorId, { [COLUMN[kind]]: null });
    await this.removeFile(previous[COLUMN[kind]]);
    return this.flags(doctorId);
  }

  /** Absolute path of the stored PNG; 404 when the doctor has none or the file is gone. */
  async filePath(doctorId: string, kind: CredentialKind): Promise<string> {
    const relative = (await this.paths(doctorId))[COLUMN[kind]];
    const missing = new NotFoundException(`El médico no tiene ${LABEL[kind]} registrada.`);
    if (!relative) throw missing;
    const absolute = resolveUploadPath(this.uploadsDir, relative);
    if (!(await fs.stat(absolute).catch(() => null))) throw missing;
    return absolute;
  }

  /** Both images as data URLs for the recipe PDF; a missing file prints nothing instead of failing the PDF. */
  async dataUrls(doctorId: string): Promise<{ signature: string | null; stamp: string | null }> {
    const paths = await this.paths(doctorId).catch(() => ({ signaturePath: null, stampPath: null }));
    const read = async (relative?: string | null) => {
      if (!relative) return null;
      const bytes = await fs.readFile(resolveUploadPath(this.uploadsDir, relative)).catch(() => null);
      return bytes ? `data:image/png;base64,${bytes.toString('base64')}` : null;
    };
    return { signature: await read(paths.signaturePath), stamp: await read(paths.stampPath) };
  }

  private async paths(doctorId: string): Promise<Pick<Doctor, 'signaturePath' | 'stampPath'>> {
    const doctor = await this.doctorRepository.findOne({
      where: { id: doctorId, deletedAt: IsNull() },
      select: { id: true, signaturePath: true, stampPath: true },
    });
    if (!doctor) throw new NotFoundException(`Doctor con ID ${doctorId} no encontrado.`);
    return { signaturePath: doctor.signaturePath ?? null, stampPath: doctor.stampPath ?? null };
  }

  private async removeFile(relative?: string | null): Promise<void> {
    if (!relative) return;
    await fs.unlink(resolveUploadPath(this.uploadsDir, relative)).catch(() => undefined);
  }
}
