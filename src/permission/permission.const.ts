import { UserRoleInfoDto } from './casl.types';

export enum PermissionActionsMenu {
  CREATE = 'crear',
  UPLOAD = 'crear',
  ASSIGN = 'crear',
  VIEW = 'consultar',
  UPDATE = 'actualizar',
  DELETE = 'eliminar',
  DIAGNOSTICAR = 'diagnosticar',
}

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Resultado de la verificación de permisos.
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  user?: CaslUser;
}

/**
 * Permisos agrupados por módulo para el frontend.
 */
export interface ModulePermissions {
  module: string;
  moduleName: string;
  permissions: {
    action: string;
    actionName: string;
    allowed: boolean;
  }[];
}

/**
 * Matriz de permisos por rol para administración.
 */
export interface PermissionMatrix {
  roleId: number | string;
  roleName: string;
  modules: ModulePermissions[];
}

export interface PermissionToFront {
  role: UserRoleInfoDto;
  permissions: string[];
  menus: MenuTree[];
}

/**
 * Estructura recursiva de menú para frontend.
 */
export interface MenuTree {
  id: number | string;
  slug: string;
  name: string;
  url?: string | null;
  icon?: string | null;
  order?: number | null;
  submenu: MenuTree[];
}

// = [REMOVED CASL IMPORTS] =

// ============================================================================
// MODULES - Basados en ModuleItemsMenu (menu.const.ts)
// ============================================================================

/**
 * Módulos del sistema basados en menu.const.ts.
 * Estos corresponden a los slugs de menú.
 */
export enum CaslModule {
  User = 'User',
  Auth = 'Auth',
  Role = 'Role',
  Permission = 'Permission',
  Logs = 'Logs',
  Queues = 'Queues',
  BullBoard = 'BullBoard',
  RedisSession = 'RedisSession',
  Health = 'Health',
  Parameters = 'Parameters',
  Menu = 'Menu',
  Plan = 'Plan',
  Customer = 'Customer',
  Company = 'Company',
  File = 'File',
  Email = 'Email',
  UserSecurity = 'UserSecurity',
  PlanningCalendar = 'PlanningCalendar',
  Crypto = 'Crypto',
  VideoQueue = 'VideoQueue',
  KioskSchedule = 'KioskSchedule',
  Category = 'Category',
  Trademark = 'Trademark',
  Product = 'Product',
  Campaign = 'Campaign',
}

// ============================================================================
// ACTIONS - Basados en PermissionActionsMenu (permission.const.ts)
// ============================================================================

/**
 * Acciones disponibles, basadas en PermissionActionsMenu.
 * Se mapean al español para coincidir con la DB.
 */
export enum CaslAction {
  // Acciones en español (como están en DB)
  CREAR = 'crear',
  VER = 'ver',
  ACTUALIZAR = 'actualizar',
  ELIMINAR = 'eliminar',
  ASIGNAR = 'asignar',
  // Acciones adicionales
  MANAGE = 'manage', // Acción especial: incluye todas
  SCHEDULE = 'schedule', // Programar
  APPROVE = 'approve', // Aprobar
  REJECT = 'reject', // Rechazar
  EXPORT = 'export', // Exportar
}

/**
 * Tipo para las acciones (string para flexibilidad con DB)
 */
export type Action = CaslAction | string;

// ============================================================================
// SUBJECT CLASSES - Para typing con condiciones
// ============================================================================

/**
 * Clase base para subjects con atributos comunes de condición.
 */
export class SubjectBase {
  id?: number | string;
  companyId?: number | string;
  clientId?: number | string;
  customerId?: number | string;
  userId?: number | string;
  status?: string;
  createdBy?: number | string;
}

// Clases específicas por módulo
export class UserSubject extends SubjectBase {
  roleId?: number | string;
}

export class CampaignSubject extends SubjectBase {
  campaignStatusId?: number;
}

export class VideoQueueSubject extends SubjectBase {
  videoId?: number;
  kioskId?: number;
  campaignId?: number;
}

export class KioskSubject extends SubjectBase {
  code?: string;
}

export class ScheduleSubject extends SubjectBase {
  kioskId?: number;
}

export class FileSubject extends SubjectBase {
  type?: string;
}

export class CustomerSubject extends SubjectBase {}
export class CompanySubject extends SubjectBase {}
export class CategorySubject extends SubjectBase {}
export class TrademarkSubject extends SubjectBase {}
export class ProductSubject extends SubjectBase {}
export class RoleSubject extends SubjectBase {}
export class PermissionSubject extends SubjectBase {}
export class MenuSubject extends SubjectBase {}
export class PlanSubject extends SubjectBase {}
export class ParameterSubject extends SubjectBase {}
export class LogSubject extends SubjectBase {}

// ============================================================================
// CONVENIENCE TYPE ALIASES
// ============================================================================

export const Video = VideoQueueSubject;
export const Campaign = CampaignSubject;
export const Kiosk = KioskSubject;
export const Schedule = ScheduleSubject;
export const VideoQueue = VideoQueueSubject;
export const User = UserSubject;
export const Company = CompanySubject;
export const Customer = CustomerSubject;
export const Category = CategorySubject;
export const Trademark = TrademarkSubject;
export const Product = ProductSubject;
export const Role = RoleSubject;
export const Permission = PermissionSubject;
export const Menu = MenuSubject;
export const Plan = PlanSubject;
export const Parameter = ParameterSubject;
export const Log = LogSubject;
export const File = FileSubject;

// ============================================================================
// SUBJECTS TYPE
// ============================================================================

/**
 * Subjects disponibles.
 */
export type Subjects = string | CaslModule | 'all';

// ============================================================================
// ABILITY TYPE (Simulado para no romper referencias)
// ============================================================================

/**
 * Interface que simula el ability de CASL para mantener compatibilidad.
 */
export interface AppAbility {
  can(action: string, subject: string): boolean;
  rules: any[];
}

// ============================================================================
// POLICY HANDLER TYPES
// ============================================================================

/**
 * Interface para handlers de políticas.
 */
export interface IPolicyHandler {
  handle(ability: AppAbility): boolean;
}

/**
 * Tipo función para handlers de políticas inline.
 */
export type PolicyHandlerCallback = (ability: AppAbility) => boolean;

/**
 * Tipo unión para cualquier tipo de policy handler.
 */
export type PolicyHandler = IPolicyHandler | PolicyHandlerCallback;

// ============================================================================
// ROLE TYPES
// ============================================================================

/**
 * Roles del sistema mapeados desde la base de datos.
 */
export enum CaslRole {
  SUPER_ADMIN = 1,
  ADMIN = 48,
  USER_KIOSK = 12,
  MARKETING_ASESOR = 49,
}

/**
 * Información del usuario para construcción de abilities.
 */
export interface CaslUser {
  id: number | string;
  roleId: number | string;
  roleName?: string;
  companyIds?: (number | string)[];
  clientId?: number | string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  /** Permisos cargados desde DB en formato "modulo.accion" */
  permissions?: string[];
}

// ============================================================================
// PERMISSION FROM DB
// ============================================================================

/**
 * Estructura de un permiso cargado desde la base de datos.
 */
export interface DbPermission {
  /** Nombre del módulo (slug del menú) */
  module: string;
  /** Nombre de la acción (nombre del permiso) */
  action: string;
  /** ID del permiso */
  permissionId?: number | string;
  /** ID del menú/submenu */
  menuId?: number | string;
  /** Si está activo */
  isActive?: boolean;
}

/**
 * Resultado de la consulta de permisos por rol.
 */
export interface RolePermissions {
  roleId: number | string;
  roleName: string;
  permissions: DbPermission[];
}

// ============================================================================
// ABILITY FACTORY RESULT
// ============================================================================

/**
 * Respuesta del ability factory con metadata adicional.
 */
export interface AbilityFactoryResult {
  ability: AppAbility;
  user: CaslUser;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/**
 * Opciones para crear abilities.
 */
export interface CreateAbilityOptions {
  /** Si true, permite todos los permisos (modo debug/desarrollo) */
  allowAll?: boolean;
  /** Permisos ya cargados desde DB (para evitar consulta adicional) */
  preloadedPermissions?: DbPermission[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convierte un permiso de DB al formato CASL "modulo.accion".
 */
export function toPermissionCode(permission: DbPermission): string {
  return `${permission.module}.${permission.action}`.toLowerCase();
}

/**
 * Parsea un código de permiso "modulo.accion" a sus componentes.
 */
export function parsePermissionCode(code: string): {
  module: string;
  action: string;
} {
  const [module, action] = code.toLowerCase().split('.');
  return { module: module || '', action: action || '' };
}

/**
 * Verifica si un permiso está en la lista.
 */
export function hasPermission(
  permissions: string[],
  module: string,
  action: string,
): boolean {
  const code = `${module}.${action}`.toLowerCase();
  return permissions.includes(code);
}

/**
 * Mapea CaslModule a la clase de subject correspondiente.
 */
export function getSubjectClass(
  module: CaslModule | string,
): typeof SubjectBase {
  const mapping: Record<string, typeof SubjectBase> = {
    [CaslModule.User]: UserSubject,
    [CaslModule.UserSecurity]: UserSubject,
    [CaslModule.Campaign]: CampaignSubject,
    [CaslModule.VideoQueue]: VideoQueueSubject,
    [CaslModule.KioskSchedule]: ScheduleSubject,
    [CaslModule.PlanningCalendar]: ScheduleSubject,
    [CaslModule.File]: FileSubject,
    [CaslModule.Customer]: CustomerSubject,
    [CaslModule.Company]: CompanySubject,
    [CaslModule.Category]: CategorySubject,
    [CaslModule.Trademark]: TrademarkSubject,
    [CaslModule.Product]: ProductSubject,
    [CaslModule.Role]: RoleSubject,
    [CaslModule.Permission]: PermissionSubject,
    [CaslModule.Menu]: MenuSubject,
    [CaslModule.Plan]: PlanSubject,
    [CaslModule.Parameters]: ParameterSubject,
    [CaslModule.Logs]: LogSubject,
  };
  return mapping[module] || SubjectBase;
}

export interface PermissionResult {
  role: {
    id: number | string;
    name: string;
  };
  rules?: {
    action: string;
    subject: string;
    inverted?: boolean | undefined;
  }[];
  permissions: string[];
  timestamp?: Date;
}
