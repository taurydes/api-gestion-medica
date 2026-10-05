import {
  mapPatientDetail,
  mapPatientSummary,
} from './appointment-response.dto';

describe('Appointment detail — patient mapping', () => {
  const patient = {
    id: 'p-1',
    patientCode: 'PAC-001',
    email: 'paciente@example.com',
    commonPerson: {
      firstName: 'Ana',
      lastName: 'Pérez',
      letter: 'V',
      documentNumber: '123',
    },
  };

  it('exposes the patient contact email in the detail', () => {
    expect(mapPatientDetail(patient)?.email).toBe('paciente@example.com');
  });

  it('returns email null when the patient has none', () => {
    expect(
      mapPatientDetail({ ...patient, email: undefined })?.email,
    ).toBeNull();
  });

  it('keeps the email out of the list summary', () => {
    expect(mapPatientSummary(patient)).not.toHaveProperty('email');
  });
});
