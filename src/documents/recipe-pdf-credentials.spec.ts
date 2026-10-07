import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as sharp from 'sharp';
import { authContextForUsers } from '../../test/auth-context-stub';
import { FakeRepo } from '../../test/in-memory-db';
import { RECIPE_FIXTURE } from '../../test/recipe-pdf-fixture';
import { DoctorCredentialsService } from 'src/doctors/doctor-credentials.service';
import * as builder from './recipe-pdf.builder';
import { VERIFY_HINT, VERIFY_LEGEND, VERIFY_LINK_TEXT, buildRecipePdfDefinition, recipePdfFingerprint } from './recipe-pdf.builder';
import { RecipePdfService } from './recipe-pdf.service';

const DOCTOR = 'd0000000-0000-4000-8000-0000000000aa';
const CODE = '0123456789abcdef0123456789abcdef';
const URL = `http://localhost:8007/verificar/${CODE}`;

let uploads: string;
let png: (color: number) => Promise<Buffer>;

beforeAll(() => {
  png = (color) =>
    sharp({ create: { width: 60, height: 30, channels: 4, background: { r: color, g: 0, b: 0, alpha: 1 } } })
      .png()
      .toBuffer();
});
beforeEach(() => (uploads = mkdtempSync(path.join(tmpdir(), 'pdf-cred-'))));
afterEach(() => {
  jest.restoreAllMocks();
  rmSync(uploads, { recursive: true, force: true });
});

function build() {
  const recipe = { ...structuredClone(RECIPE_FIXTURE), doctorId: DOCTOR, verificationCode: CODE, deletedAt: null };
  const config = { get: (key: string) => (key === 'UPLOADS_PATH' ? uploads : undefined) };
  const credentials = new DoctorCredentialsService(
    new FakeRepo([{ id: DOCTOR, deletedAt: null, signaturePath: null, stampPath: null }]) as any,
    {} as any,
    authContextForUsers({}),
    config as any,
  );
  const recipeRepo = { findOne: jest.fn(async () => recipe) };
  const pdf = new RecipePdfService(recipeRepo as any, config as any, credentials);
  return { pdf, credentials };
}

const upload = (buffer: Buffer) => ({ buffer, size: buffer.length, mimetype: 'image/png' }) as Express.Multer.File;

describe('Recipe PDF: signature, stamp and verification QR', () => {
  it('the definition prints both images, the QR to /verificar/<code>, the legend and a masked link', () => {
    const definition = buildRecipePdfDefinition({ ...RECIPE_FIXTURE, verificationCode: CODE }, new Date(), {
      signature: 'data:image/png;base64,SIG',
      stamp: 'data:image/png;base64,STAMP',
      verificationUrl: URL,
    });
    const json = JSON.stringify(definition);

    expect(json).toContain('"image":"data:image/png;base64,SIG"');
    expect(json).toContain('"image":"data:image/png;base64,STAMP"');
    expect(json).toContain(`"qr":"${URL}"`);
    expect(json).toContain(VERIFY_LEGEND);
    expect(json).toContain(`"text":["${VERIFY_HINT}",{"text":"${VERIFY_LINK_TEXT}","color":"#0f766e","decoration":"underline","link":"${URL}"}]`);
  });

  it('neither the verification URL nor the code is printed as text', () => {
    const definition = buildRecipePdfDefinition({ ...RECIPE_FIXTURE, verificationCode: CODE }, new Date(), {
      verificationUrl: URL,
    });
    const printedTexts: string[] = [];
    JSON.stringify(definition, (key, value) => {
      if (typeof value === 'string' && key !== 'qr' && key !== 'link') printedTexts.push(value);
      return value;
    });

    expect(printedTexts.filter((t) => t.includes(URL) || t.includes(CODE))).toEqual([]);
    expect(printedTexts.some((t) => t.includes('Código de verificación'))).toBe(false);
  });

  it('without images or code the PDF keeps the plain signature line and no QR', () => {
    const json = JSON.stringify(buildRecipePdfDefinition(RECIPE_FIXTURE));
    expect(json).not.toContain('"image"');
    expect(json).not.toContain('"qr"');
    expect(json).toContain('FIRMA Y SELLO MÉDICO');
  });

  it('the rendered PDF embeds the uploaded images and links the verification URL', async () => {
    const { pdf, credentials } = build();
    await credentials.upload(DOCTOR, 'signature', upload(await png(10)));
    await credentials.upload(DOCTOR, 'stamp', upload(await png(200)));

    const file = await pdf.ensurePdf(RECIPE_FIXTURE.id);
    const raw = readFileSync(file.path).toString('latin1');

    expect(raw.match(/\/Subtype \/Image/g)?.length).toBeGreaterThanOrEqual(2);
    expect(raw).toContain(`/URI (${URL})`);
  });

  it('a new signature changes the content hash, so the cached PDF regenerates', async () => {
    // Only the cache decision is under test: skip pdfmake's layout (rendering is covered by the test above).
    jest.spyOn(builder, 'renderPdf').mockResolvedValue(Buffer.from('%PDF-fake'));
    const { pdf, credentials } = build();
    await credentials.upload(DOCTOR, 'signature', upload(await png(10)));
    await pdf.ensurePdf(RECIPE_FIXTURE.id);
    await expect(pdf.ensurePdf(RECIPE_FIXTURE.id)).resolves.toMatchObject({ cached: true });

    await credentials.upload(DOCTOR, 'signature', upload(await png(90)));

    await expect(pdf.ensurePdf(RECIPE_FIXTURE.id)).resolves.toMatchObject({ cached: false });
  });

  it('the fingerprint covers the stamp and the verification URL too', () => {
    const base = recipePdfFingerprint(RECIPE_FIXTURE, {});
    expect(recipePdfFingerprint(RECIPE_FIXTURE, { stamp: 'data:x' })).not.toBe(base);
    expect(recipePdfFingerprint(RECIPE_FIXTURE, { verificationUrl: URL })).not.toBe(base);
  });
});
