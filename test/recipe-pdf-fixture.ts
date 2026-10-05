import { RecipePdfData } from 'src/documents/recipe-pdf.builder';

/** A complete recipe as RecipePdfService loads it, with every relation the PDF prints. */
export const RECIPE_FIXTURE: RecipePdfData = {
  id: '6c1f8a47-0d5b-4d43-9a43-2f5c6a1b9e10',
  recipeNumber: 'REC-2026-00042',
  issueDate: '2026-10-05T14:30:00.000Z',
  diagnosis: 'Faringitis aguda',
  generalInstructions: 'Reposo e hidratación',
  notes: 'Control en 7 días',
  patient: { commonPerson: { firstName: 'Ana', middleName: 'María', lastName: 'Pérez', secondLastName: 'Gómez', letter: 'V', documentNumber: '12345678' } },
  doctor: { commonPerson: { firstName: 'Carlos', lastName: 'Mendoza' }, specialties: [{ name: 'Medicina Interna' }] },
  medicalHistory: { medicalCenter: { name: 'Clínica Central', address: 'Av. Principal, Caracas' }, specialty: { name: 'Otorrinolaringología' } },
  items: [
    { medicationName: 'Amoxicilina', presentation: 'Cápsulas', concentration: '500mg', dosage: '1 cápsula', frequency: 'cada 8 horas', duration: '7 días', quantity: 21, unit: 'cápsulas', instructions: 'Con alimentos', orderNumber: 1 },
    { medicationName: 'Ibuprofeno', dosage: '400mg', frequency: 'cada 12 horas', duration: null, quantity: 10, orderNumber: 2 },
  ],
};
