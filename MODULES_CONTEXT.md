# 📋 Guía de Módulos — API Gestión Médica

> Instrucciones y contexto para continuar el desarrollo de la API.

---

## 🗂️ Módulos implementados

### 1. Departments (`/departments`)

| Archivo    | Ruta                                            |
| ---------- | ----------------------------------------------- |
| Entity     | `src/departments/entities/department.entity.ts` |
| Create DTO | `src/departments/dto/create-department.dto.ts`  |
| Update DTO | `src/departments/dto/update-department.dto.ts`  |
| Query DTO  | `src/departments/dto/department-query.dto.ts`   |
| Service    | `src/departments/departments.service.ts`        |
| Controller | `src/departments/departments.controller.ts`     |
| Module     | `src/departments/departments.module.ts`         |

**Schema de BD:** `parametro.departments`

**Relaciones:**

- `Department` →(N:1)→ `MedicalCenter` (FK: `medical_center_id`)
- `Department` →(1:N)→ `Specialty` (campo `departmentId` en Specialty)

**Permiso RBAC:** `ModuleItemsMenu.DepartmentsModule = 'Departments'`

---

### 2. Medical Appointments (`/medical-appointments`)

| Archivo    | Ruta                                                              |
| ---------- | ----------------------------------------------------------------- |
| Entity     | `src/medical-appointments/entities/medical-appointment.entity.ts` |
| Create DTO | `src/medical-appointments/dto/create-medical-appointment.dto.ts`  |
| Update DTO | `src/medical-appointments/dto/update-medical-appointment.dto.ts`  |
| Query DTO  | `src/medical-appointments/dto/query-medical-appointment.dto.ts`   |
| Service    | `src/medical-appointments/medical-appointments.service.ts`        |
| Controller | `src/medical-appointments/medical-appointments.controller.ts`     |
| Module     | `src/medical-appointments/medical-appointments.module.ts`         |

**Schema de BD:** `public.medical_appointments`

**Relaciones del hub:**

```
MedicalAppointment
  ├── →(N:1)→ Patient
  ├── →(N:1)→ Doctor
  ├── →(N:1)→ Specialty (nullable)
  ├── →(N:1)→ MedicalCenter (nullable)
  ├── →(N:1)→ Department (nullable)
  ├── →(1:1)→ MedicalHistory (inversa, opcional)
  └── →(1:N)→ Recipe (inversa)
```

**Enums:**

```typescript
enum AppointmentStatus {
  PENDING,
  CONFIRMED,
  COMPLETED,
  CANCELLED,
}
enum AppointmentType {
  FIRST_VISIT,
  FOLLOW_UP,
  EMERGENCY,
}
```

**Número de cita:** se genera automáticamente como `APT-YYYY-NNNNN`.

**Permiso RBAC:** `ModuleItemsMenu.MedicalAppointmentsModule = 'MedicalAppointments'`

---

## 🔗 Entidades modificadas

| Entidad           | Cambio aplicado                                                                  |
| ----------------- | -------------------------------------------------------------------------------- |
| `Specialty`       | Agregado `departmentId` (FK nullable) + `ManyToOne → Department`                 |
| `MedicalCenter`   | Agregado `OneToMany → Department` (campo `departments`)                          |
| `MedicalHistory`  | Agregado `medicalAppointmentId` (FK nullable) + `OneToOne → MedicalAppointment`  |
| `Recipe`          | Agregado `medicalAppointmentId` (FK nullable) + `ManyToOne → MedicalAppointment` |
| `ModuleItemsMenu` | Agregados: `DepartmentsModule` y `MedicalAppointmentsModule`                     |

---

## 🚀 Endpoints de Citas Médicas

### Flujo básico recomendado

```
1. POST /medical-appointments          → Crear cita (busca/crea paciente)
2. PATCH /medical-appointments/:id     → Confirmar o actualizar
3. PATCH /medical-appointments/:id/complete → Marcar como completada
4. POST /medical-history               → Crear historial médico (linkeado a cita)
5. POST /recipe                        → Crear receta (linkeada a cita)
```

### Verificar disponibilidad antes de crear

```
GET /medical-appointments/availability?doctorId=1&date=2026-03-15
```

Retorna los bloques horarios ya ocupados del médico ese día.

---

## 🧠 Convenciones del proyecto

### Cache Redis

- Clave de detalle: `resource:id` → TTL 600s
- Claves de lista: registradas en `resource:query:keys` → TTL 300s
- Invalidar en mutaciones: `del(resource:id)` + `clearQueryCache()`

### RBAC (permisos)

```typescript
@Permission(`${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.CREATE}`)
```

### Soft delete

- Columna `deleted_at` + `is_active = false`
- Siempre filtrar: `.where('entity.deletedAt IS NULL')`

### DTOs

- `CreateXxxDto` — decoradores `class-validator` + `@ApiProperty`
- `UpdateXxxDto extends PartialType(CreateXxxDto)`
- `QueryXxxDto extends QueryPaginationDto` — filtros opcionales

### Estructura de módulo mínimo

```
src/<module>/
  ├─ entities/<module>.entity.ts
  ├─ dto/create-<module>.dto.ts
  ├─ dto/update-<module>.dto.ts
  ├─ dto/<module>-query.dto.ts
  ├─ <module>.service.ts
  ├─ <module>.controller.ts
  └─ <module>.module.ts
```

---

## ⚠️ Dependencias circulares

Para evitar importaciones circulares entre entidades, se usa la variante con string de TypeORM:

```typescript
// En lugar de: () => MedicalAppointment
@OneToOne('MedicalAppointment', 'medicalHistory', { nullable: true })
@ManyToOne('MedicalAppointment', 'recipes', { nullable: true })
```

---

## 📂 Próximos pasos sugeridos

1. **Migración de BD**: ejecutar `typeorm migration:generate` y `migration:run` para crear las tablas nuevas.
2. **Diagnoses y Exams**: vincularlos a `MedicalAppointment` igual que `Recipe`.
3. **Notificaciones**: usar BullMQ para enviar emails de confirmación/recordatorio de citas.
4. **Frontend**: implementar las pantallas de agendamiento en el portal-usuario (`c:\Users\taury\OneDrive\Documentos\Tesis\portal-usuario`).
5. **Tests E2E**: cubrir los flujos de creación de cita con auto-creación de paciente.
