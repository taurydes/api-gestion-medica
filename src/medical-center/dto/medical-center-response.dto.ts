/**
 * medical-center-response.dto.ts
 *
 * Response DTOs para los endpoints findAll y findOne del módulo de centros médicos.
 * Aplica mapeo manual para controlar exactamente qué campos se exponen al frontend,
 * eliminando datos de auditoría interna, IDs de mapeo, datos sensibles y campos
 * de infraestructura que el frontend no consume en el listado.
 */

// ─── Sub-DTOs reutilizables ───────────────────────────────────────────────────

export class MedicalCenterSpecialtyDto {
  id: string;
  name: string;
  code: string | null;
}

export class MedicalCenterDoctorDto {
  id: string;
  licenseNumber: string;
  fullName: string;
  photoUrl: string | null;
  specialties: MedicalCenterSpecialtyDto[];
}

export class MedicalCenterDepartmentDto {
  id: string;
  name: string;
}

export class MedicalCenterImageDto {
  id: string;
  filePath: string;
  imageType: string;
  description: string | null;
  uploadedAt: Date;
}

// ─── Response DTO para findAll ────────────────────────────────────────────────

export class MedicalCenterListItemDto {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  imageUrl: string | null;
  doctorCount: number;
  departmentCount: number;
}

// ─── Response DTO para findOne ────────────────────────────────────────────────

export class MedicalCenterDetailDto {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  imageUrl: string | null;
  hasEmergency: boolean;
  hasHospitalization: boolean;
  hasIntensiveCare: boolean;
  hasParking: boolean;
  hasPharmacy: boolean;
  hasLaboratory: boolean;
  numBeds: number;
  numOperatingRooms: number;
  doctors: MedicalCenterDoctorDto[];
  departments: MedicalCenterDepartmentDto[];
  images: MedicalCenterImageDto[];
}

// ─── Resultado paginado para findAll ─────────────────────────────────────────

export class MedicalCenterPaginatedResponseDto {
  data: MedicalCenterListItemDto[];
  total: number;
  page: number;
  limit: number;
}

// ─── Funciones de mapeo ───────────────────────────────────────────────────────

/**
 * Construye el nombre completo desde primer nombre + primer apellido del commonPerson.
 */
function buildFullName(commonPerson: any): string {
  if (!commonPerson) return '';
  const parts = [commonPerson.firstName, commonPerson.lastName].filter(Boolean);
  return parts.join(' ');
}

/**
 * Mapea un doctor a su forma completa para el detalle del centro médico.
 */
export function mapMedicalCenterDoctor(doctor: any): MedicalCenterDoctorDto {
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
 * Convierte un centro médico crudo (con relaciones cargadas) a MedicalCenterListItemDto.
 * Solo expone el payload mínimo necesario para el listado.
 * Los conteos de doctores y departamentos se calculan desde las relaciones cargadas.
 */
export function mapToMedicalCenterListItem(
  mc: any,
  buildImageUrl: (imageId: string) => string,
): MedicalCenterListItemDto {
  const firstImage = mc.images?.[0];
  return {
    id: mc.id,
    name: mc.name,
    address: mc.address ?? null,
    phone: mc.phone ?? null,
    email: mc.email ?? null,
    isActive: mc.isActive,
    imageUrl: firstImage ? buildImageUrl(firstImage.id) : null,
    doctorCount: mc.doctors?.length ?? 0,
    departmentCount: mc.departments?.length ?? 0,
  };
}

/**
 * Convierte un centro médico crudo (con todas las relaciones cargadas) a MedicalCenterDetailDto.
 * Incluye campos de infraestructura, doctores completos, departamentos e imágenes activas.
 */
export function mapToMedicalCenterDetail(
  mc: any,
  buildImageUrl: (imageId: string) => string,
): MedicalCenterDetailDto {
  const firstImage = mc.images?.[0];
  return {
    id: mc.id,
    name: mc.name,
    address: mc.address ?? null,
    phone: mc.phone ?? null,
    email: mc.email ?? null,
    isActive: mc.isActive,
    imageUrl: firstImage ? buildImageUrl(firstImage.id) : null,
    hasEmergency: mc.hasEmergency ?? false,
    hasHospitalization: mc.hasHospitalization ?? false,
    hasIntensiveCare: mc.hasIntensiveCare ?? false,
    hasParking: mc.hasParking ?? false,
    hasPharmacy: mc.hasPharmacy ?? false,
    hasLaboratory: mc.hasLaboratory ?? false,
    numBeds: mc.numBeds ?? 0,
    numOperatingRooms: mc.numOperatingRooms ?? 0,
    doctors: (mc.doctors ?? []).map(mapMedicalCenterDoctor),
    departments: (mc.departments ?? []).map((d: any) => ({
      id: d.id,
      name: d.name,
    })),
    images: (mc.images ?? []).map((img: any) => ({
      id: img.id,
      filePath: buildImageUrl(img.id),
      imageType: img.imageType,
      description: img.description ?? null,
      uploadedAt: img.createdAt,
    })),
  };
}
