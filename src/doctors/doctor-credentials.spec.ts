import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as sharp from 'sharp';
import { authContextForUsers } from '../../test/auth-context-stub';
import { FakeRepo } from '../../test/in-memory-db';
import { CREDENTIAL_MAX_BYTES, DoctorCredentialsService, NO_DOCTOR_PROFILE } from './doctor-credentials.service';

const MENDOZA = 'd0000000-0000-4000-8000-000000000001';
const OTHER = 'd0000000-0000-4000-8000-000000000002';

let uploads: string;
let png: Buffer;
let jpeg: Buffer;

beforeAll(async () => {
  const image = sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 128, alpha: 1 } } });
  png = await image.clone().png().toBuffer();
  jpeg = await image.clone().jpeg().toBuffer();
});
beforeEach(() => (uploads = mkdtempSync(path.join(tmpdir(), 'cred-'))));
afterEach(() => rmSync(uploads, { recursive: true, force: true }));

function build() {
  const doctors = [
    { id: MENDOZA, deletedAt: null, signaturePath: null, stampPath: null },
    { id: OTHER, deletedAt: null, signaturePath: null, stampPath: null },
  ];
  const auth = authContextForUsers({
    'u-mendoza': { isAdmin: false, doctorId: MENDOZA },
    'u-other': { isAdmin: false, doctorId: OTHER },
    'u-admin': { isAdmin: true, doctorId: null },
    'u-nurse': { isAdmin: false, doctorId: null },
  });
  const doctorsService = { findOne: jest.fn(async (id: string) => ({ id, licenseNumber: 'MPPS-1' })) };
  const service = new DoctorCredentialsService(
    new FakeRepo(doctors) as any,
    doctorsService as any,
    auth,
    { get: () => uploads } as any,
  );
  return { service, doctors };
}

const file = (buffer: Buffer, mimetype = 'image/png') =>
  ({ buffer, size: buffer.length, mimetype, originalname: 'x' }) as Express.Multer.File;

describe('Doctor signature and stamp', () => {
  it('stores the upload as PNG under the doctor folder and reports it in /doctors/me', async () => {
    const { service, doctors } = build();

    await expect(service.upload(MENDOZA, 'signature', file(jpeg, 'image/jpeg'))).resolves.toEqual({
      hasSignature: true,
      hasStamp: false,
    });

    const stored = doctors[0].signaturePath as unknown as string;
    expect(stored).toMatch(new RegExp(`^doctors/${MENDOZA}/credentials/signature-[0-9a-f-]+\\.png$`));
    expect(readFileSync(path.join(uploads, stored)).subarray(0, 4).toString('hex')).toBe('89504e47');
    await expect(service.getMyProfile('u-mendoza')).resolves.toMatchObject({
      id: MENDOZA, hasSignature: true, hasStamp: false,
    });
  });

  it('a replacement deletes the previous file', async () => {
    const { service, doctors } = build();
    await service.upload(MENDOZA, 'stamp', file(png));
    const first = doctors[0].stampPath as unknown as string;

    await service.upload(MENDOZA, 'stamp', file(png));

    expect(doctors[0].stampPath).not.toBe(first);
    expect(existsSync(path.join(uploads, first))).toBe(false);
  });

  it('rejects a file whose bytes are not PNG/JPEG/WebP, whatever its declared type', async () => {
    const { service, doctors } = build();
    const pdf = Buffer.from('%PDF-1.7\n%fake image');

    await expect(service.upload(MENDOZA, 'signature', file(pdf, 'image/png'))).rejects.toThrow(
      'La imagen debe ser PNG, JPEG o WebP.',
    );
    expect(doctors[0].signaturePath).toBeNull();
  });

  it('rejects a file over 2 MB', async () => {
    const { service } = build();
    const big = Buffer.concat([png, Buffer.alloc(CREDENTIAL_MAX_BYTES)]);

    await expect(service.upload(MENDOZA, 'signature', file(big))).rejects.toThrow(BadRequestException);
  });

  it('only the doctor themself or an admin passes the scope check', async () => {
    const { service } = build();

    await expect(service.assertOwnerOrAdmin(MENDOZA, 'u-mendoza')).resolves.toBeUndefined();
    await expect(service.assertOwnerOrAdmin(MENDOZA, 'u-admin')).resolves.toBeUndefined();
    await expect(service.assertOwnerOrAdmin(MENDOZA, 'u-other')).rejects.toThrow(ForbiddenException);
    await expect(service.assertOwnerOrAdmin(MENDOZA, 'u-nurse')).rejects.toThrow(ForbiddenException);
  });

  it('a user without a doctor profile gets 404 on /doctors/me', async () => {
    const { service } = build();
    await expect(service.getMyProfile('u-nurse')).rejects.toThrow(NO_DOCTOR_PROFILE);
  });

  it('delete clears the column and the file; a second delete is 404', async () => {
    const { service, doctors } = build();
    await service.upload(MENDOZA, 'signature', file(png));
    const stored = doctors[0].signaturePath as unknown as string;

    await expect(service.remove(MENDOZA, 'signature')).resolves.toEqual({ hasSignature: false, hasStamp: false });
    expect(existsSync(path.join(uploads, stored))).toBe(false);
    await expect(service.remove(MENDOZA, 'signature')).rejects.toThrow(NotFoundException);
    await expect(service.filePath(MENDOZA, 'signature')).rejects.toThrow(NotFoundException);
  });

  it('dataUrls returns PNG data URLs for the PDF, null when absent', async () => {
    const { service } = build();
    await service.upload(MENDOZA, 'stamp', file(png));

    const urls = await service.dataUrls(MENDOZA);

    expect(urls.signature).toBeNull();
    expect(urls.stamp).toMatch(/^data:image\/png;base64,iVBOR/);
  });
});
