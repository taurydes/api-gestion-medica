import { RECIPE_FIXTURE } from '../../test/recipe-pdf-fixture';
import { buildRecipePdfDefinition, fullName, renderPdf } from './recipe-pdf.builder';

describe('Recipe PDF builder', () => {
  it('prints the patient and doctor full names from commonPerson, never "undefined"', () => {
    const json = JSON.stringify(buildRecipePdfDefinition(RECIPE_FIXTURE, new Date('2026-10-05T15:00:00Z')));

    expect(json).toContain('Ana María Pérez Gómez');
    expect(json).toContain('V-12345678');
    expect(json).toContain('Dr(a). Carlos Mendoza');
    expect(json).toContain('Especialidad: Otorrinolaringología');
    expect(json).toContain('Clínica Central');
    expect(json).toContain('REC-2026-00042');
    expect(json).toContain(`ID Gestión: ${RECIPE_FIXTURE.id}`);
    expect(json).not.toMatch(/undefined|null/);
  });

  it('lists every item with dose, frequency, duration and quantity', () => {
    const json = JSON.stringify(buildRecipePdfDefinition(RECIPE_FIXTURE));
    for (const value of ['Amoxicilina', 'Cápsulas · 500mg', 'Con alimentos', 'cada 8 horas', '7 días', '21 cápsulas', 'Ibuprofeno', '10']) {
      expect(json).toContain(value);
    }
  });

  it('a recipe without person data says so instead of printing "undefined undefined"', () => {
    const json = JSON.stringify(buildRecipePdfDefinition({ ...RECIPE_FIXTURE, patient: null, doctor: { commonPerson: undefined } }));
    expect(json).not.toContain('undefined');
    expect(json).toContain('Sin nombre registrado');
    expect(fullName({ firstName: '  ', lastName: 'Pérez' })).toBe('Pérez');
  });

  it('renders a real PDF', async () => {
    const pdf = await renderPdf(buildRecipePdfDefinition(RECIPE_FIXTURE));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
