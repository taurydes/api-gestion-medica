import { RECIPE_FIXTURE } from '../../test/recipe-pdf-fixture';
import {
  RecipePdfData,
  buildRecipePdfDefinition,
  fullName,
  recipePdfFingerprint,
  renderPdf,
} from './recipe-pdf.builder';

// Page-tree count; Buffer.from because pdfmake may hand back a plain Uint8Array.
const pageCount = (pdf: Uint8Array) =>
  Number(/\/Count (\d+)/.exec(Buffer.from(pdf).toString('latin1'))?.[1] ?? 0);
const json = (recipe: RecipePdfData) =>
  JSON.stringify(
    buildRecipePdfDefinition(recipe, new Date('2026-10-05T15:00:00Z')),
  );

describe('Recipe PDF builder', () => {
  it('prints the patient and doctor full names from commonPerson, never "undefined"', () => {
    const json = JSON.stringify(
      buildRecipePdfDefinition(
        RECIPE_FIXTURE,
        new Date('2026-10-05T15:00:00Z'),
      ),
    );

    expect(json).toContain('Ana María Pérez Gómez');
    expect(json).toContain('V-12345678');
    expect(json).toContain('Dr(a). Carlos Mendoza');
    expect(json).toContain('"text":"Otorrinolaringología"');
    expect(json).toContain('Clínica Central');
    expect(json).toContain('REC-2026-00042');
    expect(json).toContain(`ID Gestión: ${RECIPE_FIXTURE.id.slice(0, 8)}"`);
    expect(json).not.toContain(RECIPE_FIXTURE.id);
    expect(json).not.toMatch(/undefined|null/);
  });

  it('lists every item with dose, frequency, duration and quantity', () => {
    const json = JSON.stringify(buildRecipePdfDefinition(RECIPE_FIXTURE));
    for (const value of [
      'Amoxicilina',
      'Cápsulas · 500mg',
      'Con alimentos',
      'cada 8 horas',
      '7 días',
      '"text":"21"',
      '"text":" cápsulas"',
      'Ibuprofeno',
      '"text":"10"',
    ]) {
      expect(json).toContain(value);
    }
  });

  it('a recipe without person data says so instead of printing "undefined undefined"', () => {
    const json = JSON.stringify(
      buildRecipePdfDefinition({
        ...RECIPE_FIXTURE,
        patient: null,
        doctor: { commonPerson: undefined },
      }),
    );
    expect(json).not.toContain('undefined');
    expect(json).toContain('Sin nombre registrado');
    expect(fullName({ firstName: '  ', lastName: 'Pérez' })).toBe('Pérez');
  });

  it('renders a real PDF that fits a typical recipe on one page', async () => {
    const pdf = await renderPdf(buildRecipePdfDefinition(RECIPE_FIXTURE));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('a long prescription flows onto more pages without breaking the layout', async () => {
    const items = Array.from({ length: 18 }, (_, i) => ({
      ...RECIPE_FIXTURE.items![0],
      orderNumber: i,
    }));
    const pdf = await renderPdf(
      buildRecipePdfDefinition({ ...RECIPE_FIXTURE, items }),
    );
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it('sex, license, phone and route print only when the data has them', () => {
    const bare = json(RECIPE_FIXTURE);
    for (const label of ['Sexo:', 'Licencia:', 'Tel:', 'Rp. Vía', 'Vía '])
      expect(bare).not.toContain(label);

    const full = json({
      ...RECIPE_FIXTURE,
      patient: {
        commonPerson: { ...RECIPE_FIXTURE.patient!.commonPerson, sex: 'F' },
      },
      doctor: { ...RECIPE_FIXTURE.doctor, licenseNumber: 'MPPS-45821' },
      medicalHistory: {
        ...RECIPE_FIXTURE.medicalHistory,
        medicalCenter: {
          ...RECIPE_FIXTURE.medicalHistory!.medicalCenter,
          phone: '0212-555-0142',
        },
      },
      items: RECIPE_FIXTURE.items!.map((i) => ({ ...i, route: 'oral' })),
    });
    expect(full).toContain('Sexo: Femenino');
    expect(full).toContain('Licencia: MPPS-45821');
    expect(full).toContain('Tel: 0212-555-0142');
    expect(full).toContain('Rp. Vía Oral');
  });

  it('mixed routes go next to each medication instead of the section header', () => {
    const mixed = json({
      ...RECIPE_FIXTURE,
      items: RECIPE_FIXTURE.items!.map((i, n) => ({
        ...i,
        route: n ? 'tópica' : 'oral',
      })),
    });
    expect(mixed).not.toContain('Rp. Vía');
    expect(mixed).toContain('Cápsulas · 500mg · Vía oral');
    expect(mixed).toContain('Vía tópica');
  });

  it('prints no value from the design mockup that the recipe does not have', () => {
    const printed = json(RECIPE_FIXTURE);
    for (const mock of [
      'J-30495811-0',
      '84.192',
      'RIF',
      'REC-2026-00150',
      'Evaluación de control clínico',
      'Colegio',
    ]) {
      expect(printed).not.toContain(mock);
    }
  });

  it('the footer carries the print date, the short id and the center', () => {
    const printed = json(RECIPE_FIXTURE);
    expect(printed).toContain('Fecha de impresión: ');
    expect(printed).toContain(`"ID Gestión: ${RECIPE_FIXTURE.id.slice(0, 8)}"`);
    expect(printed).toContain('Clínica Central • MedOS');
  });

  it('the newly printed fields invalidate the cached PDF', () => {
    const base = recipePdfFingerprint(RECIPE_FIXTURE);
    const changed = [
      {
        ...RECIPE_FIXTURE,
        patient: {
          commonPerson: { ...RECIPE_FIXTURE.patient!.commonPerson, sex: 'M' },
        },
      },
      {
        ...RECIPE_FIXTURE,
        doctor: { ...RECIPE_FIXTURE.doctor, licenseNumber: 'X-1' },
      },
      {
        ...RECIPE_FIXTURE,
        medicalHistory: {
          ...RECIPE_FIXTURE.medicalHistory,
          medicalCenter: { name: 'Clínica Central', phone: '1' },
        },
      },
      {
        ...RECIPE_FIXTURE,
        items: RECIPE_FIXTURE.items!.map((i) => ({ ...i, route: 'oral' })),
      },
    ];
    for (const recipe of changed)
      expect(recipePdfFingerprint(recipe)).not.toBe(base);
  });
});
