import { FakeRepo } from '../../test/in-memory-db';
import { RECIPE_FIXTURE } from '../../test/recipe-pdf-fixture';
import { RecipeVerificationController } from './recipe-verification.controller';
import { RecipeVerificationService, initials } from './recipe-verification.service';
import { newVerificationCode, VERIFICATION_CODE_PATTERN } from './recipe-verification.util';

const CODE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const CANCELLED = 'ffffffffffffffffffffffffffffffff';
const DELETED = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function build() {
  const base = {
    ...RECIPE_FIXTURE,
    issueDate: new Date(RECIPE_FIXTURE.issueDate),
    doctor: { ...RECIPE_FIXTURE.doctor, licenseNumber: 'MPPS-55821' },
    status: 'active',
    deletedAt: null,
  };
  const recipes = new FakeRepo([
    { ...base, verificationCode: CODE },
    { ...base, id: 'r-cancelled', verificationCode: CANCELLED, status: 'cancelled' },
    { ...base, id: 'r-deleted', verificationCode: DELETED, deletedAt: new Date('2026-10-01') },
  ]);
  const accessLog = { insert: jest.fn().mockResolvedValue(undefined) };
  const service = new RecipeVerificationService(recipes as any, accessLog as any);
  return { service, controller: new RecipeVerificationController(service), accessLog };
}

const call = async (controller: RecipeVerificationController, code: string) => {
  const res = { status: jest.fn() };
  const body = await controller.verify(code, { ip: '10.0.0.7' } as any, res as any);
  return { body, status: res.status.mock.calls[0]?.[0] ?? 200 };
};

describe('GET /public/recipes/verify/:code', () => {
  it('a valid code returns exactly the safe fields', async () => {
    const { controller } = build();

    const { body, status } = await call(controller, CODE);

    expect(status).toBe(200);
    expect(body).toEqual({
      valid: true,
      recipeNumber: 'REC-2026-00042',
      issuedAt: new Date('2026-10-05T14:30:00.000Z'),
      status: 'active',
      doctor: { fullName: 'Dr(a). Carlos Mendoza', license: 'MPPS-55821', specialty: 'Otorrinolaringología' },
      center: { name: 'Clínica Central' },
      patientInitials: 'A.P.G.',
    });
  });

  it('never leaks clinical data, items, the patient name or document', async () => {
    const { controller } = build();

    const json = JSON.stringify((await call(controller, CODE)).body);

    for (const secret of ['Faringitis', 'Amoxicilina', 'Reposo', 'Control en 7', 'Ana', 'Pérez', '12345678', RECIPE_FIXTURE.id, 'Av. Principal']) {
      expect(json).not.toContain(secret);
    }
  });

  it.each([
    ['unknown', '0000000000000000000000000000000a'],
    ['malformed', "x' OR '1'='1"],
  ])('an %s code → 404 { valid: false }', async (_label, code) => {
    const { controller } = build();
    await expect(call(controller, code)).resolves.toEqual({ body: { valid: false }, status: 404 });
  });

  it.each([
    [CANCELLED, 'cancelled'],
    [DELETED, 'deleted'],
  ])('a cancelled or deleted recipe is not valid and says why', async (code, status) => {
    const { controller } = build();
    await expect(call(controller, code)).resolves.toEqual({ body: { valid: false, status }, status: 200 });
  });

  it('every lookup lands in the access log without the code', async () => {
    const { controller, accessLog } = build();

    await call(controller, CODE);
    await call(controller, '0000000000000000000000000000000a');

    expect(accessLog.insert.mock.calls.map(([row]) => row)).toEqual([
      expect.objectContaining({ action: 'recipe_verify', resourceId: RECIPE_FIXTURE.id, statusCode: 200, ip: '10.0.0.7', userId: null }),
      expect.objectContaining({ action: 'recipe_verify', resourceId: null, statusCode: 404 }),
    ]);
    expect(JSON.stringify(accessLog.insert.mock.calls)).not.toContain(CODE);
  });

  it('new codes are 32 random hex chars, distinct, and match the lookup pattern', () => {
    const codes = new Set(Array.from({ length: 200 }, newVerificationCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(VERIFICATION_CODE_PATTERN);
    expect(initials({ firstName: ' ana', lastName: null })).toBe('A.');
  });
});
