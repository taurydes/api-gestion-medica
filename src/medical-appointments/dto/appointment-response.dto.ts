/**
 * appointment-response.dto.ts
 *
 * Response DTOs para los endpoints findAll y findOne del módulo de citas médicas.
 * Aplica mapeo manual para controlar exactamente qué campos se exponen al frontend,
 * eliminando datos de auditoría interna, IDs de mapeo, datos sensibles y campos
 * de infraestructura que el frontend no consume.
 */

// ─── Sub-DTOs reutilizables ───────────────────────────────────────────────────

export class AppointmentFileResponseDto {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: Date;
}

export class NamedItemDto {
  id: string;
  name: string;
}

export class SpecialtyResponseDto {
  id: string;
  name: string;
  code: string | null;
}

export class MedicalCenterResponseDto {
  id: string;
  name: string;
  address: string | null;
}

export class DepartmentResponseDto {
  id: string;
  name: string;
}

// ─── Patient DTO para listado (findAll) ──────────────────────────────────────

export class PatientSummaryDto {
  id: string;
  patientCode: string;
  fullName: string;
  documentNumber: string; // letra + número, ej: "V-12345678"
  photoUrl: string | null;
}

// ─── Patient DTO completo para detalle (findOne) ─────────────────────────────

export class PatientDetailDto extends PatientSummaryDto {
  bloodType: string | null;
  insuranceCompany: string | null;
  insurancePolicyNumber: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  maritalStatus: string | null;
  occupation: string | null;
  allergies: NamedItemDto[];
  chronicDiseases: NamedItemDto[];
  medications: NamedItemDto[];
}

// ─── Doctor DTO para listado (findAll) ───────────────────────────────────────

export class DoctorSummaryDto {
  id: string;
  licenseNumber: string;
  fullName: string;
  photoUrl: string | null;
}

// ─── Doctor DTO completo para detalle (findOne) ──────────────────────────────

export class DoctorDetailDto extends DoctorSummaryDto {
  specialties: SpecialtyResponseDto[];
}

// ─── Response DTO para findAll ────────────────────────────────────────────────

export class AppointmentListItemDto {
  id: string;
  appointmentNumber: string;
  appointmentDate: Date;
  durationMinutes: number;
  status: string;
  type: string;
  reason: string;
  patient: PatientSummaryDto | null;
  doctor: DoctorSummaryDto | null;
  specialty: SpecialtyResponseDto | null;
  medicalCenter: MedicalCenterResponseDto | null;
  department: DepartmentResponseDto | null;
}

// ─── Response DTO para findOne ────────────────────────────────────────────────

export class AppointmentDetailDto extends AppointmentListItemDto {
  observations: string | null;
  cancellationReason: string | null;
  declare patient: PatientDetailDto | null;
  declare doctor: DoctorDetailDto | null;
  files: AppointmentFileResponseDto[];
  medicalHistory: any | null;
  recipes: any[];
}

// ─── Resultado paginado para findAll ─────────────────────────────────────────

export class AppointmentPaginatedResponseDto {
  data: AppointmentListItemDto[];
  total: number;
  page: number;
  limit: number;
}

// ─── Funciones de mapeo ───────────────────────────────────────────────────────

/**
 * Construye el nombre completo desde primer nombre + primer apellido.
 * Se usan solo estos dos campos en el listado para mantener el payload pequeño.
 */
function buildFullName(commonPerson: any): string {
  if (!commonPerson) return '';
  const parts = [commonPerson.firstName, commonPerson.lastName].filter(Boolean);
  return parts.join(' ');
}

/**
 * Construye el número de documento con letra prefija.
 * Ejemplo: "V-12345678". Si no hay letra, retorna solo el número.
 */
function buildDocumentNumber(commonPerson: any): string {
  if (!commonPerson) return '';
  const letter = commonPerson.letter ? `${commonPerson.letter}-` : '';
  return `${letter}${commonPerson.documentNumber ?? ''}`;
}

/**
 * Mapea un paciente a su forma resumida para el listado.
 */
export function mapPatientSummary(patient: any): PatientSummaryDto | null {
  if (!patient) return null;
  const cp = patient.commonPerson ?? {};
  return {
    id: patient.id,
    patientCode: patient.patientCode,
    fullName: buildFullName(cp),
    documentNumber: buildDocumentNumber(cp),
    photoUrl: cp.photoUrl ?? null,
  };
}

/**
 * Mapea un paciente a su forma completa para el detalle.
 */
export function mapPatientDetail(patient: any): PatientDetailDto | null {
  if (!patient) return null;
  const cp = patient.commonPerson ?? {};
  return {
    id: patient.id,
    patientCode: patient.patientCode,
    fullName: buildFullName(cp),
    documentNumber: buildDocumentNumber(cp),
    photoUrl: cp.photoUrl ?? null,
    bloodType: patient.bloodType ?? null,
    insuranceCompany: patient.insuranceCompany ?? null,
    insurancePolicyNumber: patient.insurancePolicyNumber ?? null,
    emergencyContactName: patient.emergencyContactName ?? null,
    emergencyContactPhone: patient.emergencyContactPhone ?? null,
    emergencyContactRelationship: patient.emergencyContactRelationship ?? null,
    maritalStatus: patient.maritalStatus ?? null,
    occupation: patient.occupation ?? null,
    allergies: (patient.allergies ?? []).map((a: any) => ({ id: a.id, name: a.name })),
    chronicDiseases: (patient.chronicDiseases ?? []).map((d: any) => ({ id: d.id, name: d.name })),
    medications: (patient.medications ?? []).map((m: any) => ({ id: m.id, name: m.name })),
  };
}

/**
 * Mapea un médico a su forma resumida para el listado.
 */
export function mapDoctorSummary(doctor: any): DoctorSummaryDto | null {
  if (!doctor) return null;
  const cp = doctor.commonPerson ?? {};
  return {
    id: doctor.id,
    licenseNumber: doctor.licenseNumber,
    fullName: buildFullName(cp),
    photoUrl: cp.photoUrl ?? null,
  };
}

/**
 * Mapea un médico a su forma completa para el detalle.
 */
export function mapDoctorDetail(doctor: any): DoctorDetailDto | null {
  if (!doctor) return null;
  const cp = doctor.commonPerson ?? {};
  return {
    id: doctor.id,
    licenseNumber: doctor.licenseNumber,
    fullName: buildFullName(cp),
    photoUrl: cp.photoUrl ?? null,
    specialties: (doctor.specialties ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      code: s.code ?? null,
    })),
  };
}

/**
 * Mapea una especialidad. Retorna null si no existe.
 */
export function mapSpecialty(specialty: any): SpecialtyResponseDto | null {
  if (!specialty) return null;
  return { id: specialty.id, name: specialty.name, code: specialty.code ?? null };
}

/**
 * Mapea un centro médico a solo id, name, address.
 */
export function mapMedicalCenter(center: any): MedicalCenterResponseDto | null {
  if (!center) return null;
  return { id: center.id, name: center.name, address: center.address ?? null };
}

/**
 * Mapea un departamento a solo id y name.
 */
export function mapDepartment(dept: any): DepartmentResponseDto | null {
  if (!dept) return null;
  return { id: dept.id, name: dept.name };
}

/**
 * Mapea los archivos adjuntos de una cita.
 * - fileName: nombre original del archivo
 * - fileUrl: ruta relativa almacenada (el frontend construye la URL completa)
 * - fileType: tipo de archivo (mammography, exam, report, other)
 * - uploadedAt: fecha de creación del registro
 */
export function mapAppointmentFiles(files: any[]): AppointmentFileResponseDto[] {
  if (!files?.length) return [];
  return files.map((f) => ({
    id: f.id,
    fileName: f.originalName,
    fileUrl: f.filePath,
    fileType: f.fileType,
    uploadedAt: f.createdAt,
  }));
}

/**
 * Convierte una cita cruda (con relaciones cargadas) a AppointmentListItemDto.
 * Se usa en findAll, getPatientHistory y getDoctorSchedule.
 */
export function mapToListItem(apt: any): AppointmentListItemDto {
  return {
    id: apt.id,
    appointmentNumber: apt.appointmentNumber,
    appointmentDate: apt.appointmentDate,
    durationMinutes: apt.durationMinutes,
    status: apt.status,
    type: apt.type,
    reason: apt.reason,
    patient: mapPatientSummary(apt.patient),
    doctor: mapDoctorSummary(apt.doctor),
    specialty: mapSpecialty(apt.specialty),
    medicalCenter: mapMedicalCenter(apt.medicalCenter),
    department: mapDepartment(apt.department),
  };
}

/**
 * Convierte una cita cruda (con todas las relaciones cargadas por loadFullAppointment)
 * a AppointmentDetailDto. Se usa en findOne.
 */
export function mapToDetail(apt: any): AppointmentDetailDto {
  return {
    id: apt.id,
    appointmentNumber: apt.appointmentNumber,
    appointmentDate: apt.appointmentDate,
    durationMinutes: apt.durationMinutes,
    status: apt.status,
    type: apt.type,
    reason: apt.reason,
    observations: apt.observations ?? null,
    cancellationReason: apt.cancellationReason ?? null,
    patient: mapPatientDetail(apt.patient),
    doctor: mapDoctorDetail(apt.doctor),
    specialty: mapSpecialty(apt.specialty),
    medicalCenter: mapMedicalCenter(apt.medicalCenter),
    department: mapDepartment(apt.department),
    files: mapAppointmentFiles(apt.appointmentFiles ?? []),
    medicalHistory: apt.medicalHistory ?? null,
    recipes: apt.recipes ?? [],
  };
}
