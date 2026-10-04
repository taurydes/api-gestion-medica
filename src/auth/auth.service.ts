import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MenuService } from 'src/menu/menu.service';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { IsNull, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { JwtPayload, JwtUserPayload, toJwtUserPayload } from './auth.const';
import { LoginUserDto } from './dto/login-auth.dto';
import { MedicalCenterSummaryDto } from './dto/medical-center-summary.dto';
import { UserMedicalCenter } from 'src/user/entities/user-medical-center.entity';
import { findUserCenters } from 'src/user/user-centers';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthUser } from './interfaces/User';
import { PermissionService } from 'src/permission/services/permission.service';
import { encryptModules } from './utils/permissions-cipher.util';

/**
 * @summary Servicio de autenticación principal de la aplicación.
 * @description
 * Se encarga de validar credenciales, generar tokens JWT y
 * mantener sesiones activas en Redis (a través de `RedisSessionService`).
 */
/** Same rule as UserAccessService.isActive: a missing, disabled or deleted role blocks the account. */
const isRoleActive = (role?: { isActive?: boolean; deletedAt?: Date | null } | null) =>
  !!role && role.isActive !== false && !role.deletedAt;

/** One message for unknown user, inactive account and wrong password: the login does not reveal which accounts exist. */
export const INVALID_CREDENTIALS = 'Credenciales inválidas';
/** Per-credential lockout (MJ-01): 5 failures in 15 min lock that credential for 15 min, whether it exists or not. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_SECONDS = 15 * 60;
export const LOGIN_LOCKED = 'Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos.';
// Compared when the user does not exist, so both paths pay the same bcrypt cost
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userSystemRepository: Repository<UserSecurity>,

    private readonly jwtService: JwtService,
    private readonly redisSession: RedisSessionService,
    private readonly permissionService: PermissionService,
    private readonly authContextService: AuthContextService,

    @InjectRepository(UserMedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly userCentersRepo: Repository<UserMedicalCenter>,
  ) {}

  // ======================================================
  // 🔹 VALIDACIÓN DE USUARIOS (NORMAL Y SISTEMA)
  // ======================================================

  /**
   * @summary Valida un usuario regular por email o nombre.
   * @throws UnauthorizedException Si las credenciales son inválidas.
   */
  async validateUser(credential: string, password: string): Promise<AuthUser> {
    // Usuarios borrados o desactivados no inician sesión
    const active = { deletedAt: IsNull(), status: true };
    const user = await this.userRepository.findOne({
      where: [
        { email: credential, ...active },
        { name: credential, ...active },
      ],
      relations: ['role'],
    });

    const isPasswordValid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !isRoleActive(user.role) || !isPasswordValid)
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    const { password: _, role: _role, ...safeUser } = user;

    return {
      id: user.id,
      user: safeUser,
    };
  }

  /**
   * @summary Valida un usuario del sistema (tabla de seguridad).
   * @throws UnauthorizedException Si las credenciales son inválidas.
   */
  async validateSystemUser(
    credential: string,
    password: string,
  ): Promise<AuthUser> {
    const active = { deletedAt: IsNull(), status: true };
    const user = await this.userSystemRepository.findOne({
      where: [
        { email: credential, ...active },
        { name: credential, ...active },
      ],
      relations: ['role'],
    });

    const isPasswordValid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !isRoleActive(user.role) || !isPasswordValid)
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    const { password: _, role: _role, ...safeUser } = user;

    return {
      id: user.id,
      user: safeUser,
    };
  }

  // ======================================================
  // 🔹 LOGIN Y GENERACIÓN DE TOKEN
  // ======================================================

  /**
   * @summary Genera un JWT y registra la sesión en Redis.
   * @param loginDto Datos de inicio de sesión (`credential`, `password`, `isSystemUser`)
   * @returns Token JWT de acceso.
   */
  async login(loginDto: LoginUserDto): Promise<JwtPayload> {
    // Keyed by the credential typed, so the lock does not reveal whether the account exists.
    const attemptKey = `${loginDto.isSystemUser ? 'sys' : 'usr'}:${String(loginDto.credential ?? '').trim().toLowerCase()}`;
    if ((await this.redisSession.getLoginFailures(attemptKey)) >= LOGIN_MAX_FAILURES) {
      throw new HttpException(LOGIN_LOCKED, HttpStatus.TOO_MANY_REQUESTS);
    }

    let user: AuthUser;
    try {
      user = loginDto.isSystemUser
        ? await this.validateSystemUser(loginDto.credential, loginDto.password)
        : await this.validateUser(loginDto.credential, loginDto.password);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.redisSession.registerLoginFailure(attemptKey, LOGIN_MAX_FAILURES, LOGIN_LOCK_SECONDS);
      }
      throw error;
    }
    await this.redisSession.clearLoginFailures(attemptKey);
    const tokens = this.signTokens(toJwtUserPayload(user.id, user.user));
    await this.redisSession.setSession(
      user.id,
      {
        ...tokens,
        userId: user.id,
        roleId: user.user.roleId,
        loginAt: new Date().toISOString(),
      },
      this.sessionTtlSeconds(tokens.refresh_token),
    );
    return tokens;
  }

  // ======================================================
  // 🔹 REFRESH TOKEN
  // ======================================================
  async refreshTokens(dto: RefreshTokenDto): Promise<JwtPayload> {
    const { refreshToken } = dto;

    // 1. Decodificar el refresh token para obtener el userId
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const userId = payload.id;
    if (!userId) {
      throw new UnauthorizedException('Refresh token no contiene información de usuario');
    }

    // 2. Validar que la sesión en Redis aún exista y el refresh_token coincida
    const session = await this.redisSession.getSession(userId);
    if (!session) {
      throw new UnauthorizedException('Sesión expirada o inválida');
    }
    if (session.refresh_token !== refreshToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // 3. Buscar al usuario para obtener datos actualizados del rol
    let user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role'],
    });
    if (!user) {
      const sysUser = await this.userSystemRepository.findOne({
        where: { id: userId },
        relations: ['role'],
      });
      user = sysUser as any;
    }
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    if (user.deletedAt || user.status === false || !isRoleActive(user.role)) {
      await this.redisSession.deleteSession(userId);
      throw new UnauthorizedException('Usuario inactivo o eliminado');
    }

    // 4. Regenerar tokens con datos frescos
    const tokens = this.signTokens(toJwtUserPayload(user.id, user));

    // 5. Actualizar sesión en Redis
    await this.redisSession.setSession(
      userId,
      {
        ...tokens,
        userId: user.id,
        roleId: user.roleId,
        refreshedAt: new Date().toISOString(),
      },
      this.sessionTtlSeconds(tokens.refresh_token),
    );
    return tokens;
  }

  private signTokens(payload: JwtUserPayload): JwtPayload {
    return {
      access_token: this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      }),
      refresh_token: this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      }),
    };
  }

  /** The session lives as long as the refresh token, so a refresh after an idle hour still finds it. */
  private sessionTtlSeconds(refreshToken: string): number {
    const { exp } = this.jwtService.decode(refreshToken) as { exp: number };
    return Math.max(exp - Math.floor(Date.now() / 1000), 1);
  }

  // ======================================================
  // 🔹 LOGOUT / INVALIDACIÓN DE SESIÓN
  // ======================================================

  /**
   * @summary Elimina una sesión activa de Redis.
   * @param userId ID del usuario
   */
  async logout(userId: string): Promise<void> {
    await this.redisSession.deleteSession(userId);
  }

  // ======================================================
  // 🔹 VERIFICACIÓN DE SESIÓN ACTIVA
  // ======================================================

  /**
   * @summary Verifica si una sesión está activa en Redis.
   * @param userId ID del usuario
   * @returns `true` si la sesión es válida, `false` en caso contrario.
   */
  async isSessionActive(userId: string): Promise<boolean> {
    return this.redisSession.isValidSession(userId);
  }

  // ======================================================
  // 🔹 OBTENER USUARIO CON PERMISOS
  // ======================================================

  /**
   * Retorna datos del usuario autenticado junto con sus permisos
   * en formato 'module.action' para que el frontend construya la UI.
   * Incluye la lista de centros médicos asociados al usuario cuando
   * éste tiene un perfil de doctor vinculado.
   */
  async getUserWithPermissions(userId: string) {
    // 1. Obtener módulos y permisos desde el servicio de permisos
    const {
      userId: _,
      email: __,
      rules: ___,
      ...modules
    } = await this.permissionService.getUserPermissions(userId);

    // 2. Obtener datos del usuario (buscando en ambos repositorios).
    //    Los usuarios de seguridad (UserSecurity) se buscan primero;
    //    si no se encuentran, se busca en el repositorio regular (User).
    const isSystemUser = !!(await this.userSystemRepository.findOne({
      where: { id: userId },
    }));

    let user = isSystemUser
      ? await this.userSystemRepository.findOne({ where: { id: userId } })
      : (await this.userRepository.findOne({ where: { id: userId } })) as any;

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // 3. Resolver centros médicos y doctorId.
    //    - UserSecurity (superusuarios): no tienen perfil de doctor → array vacío, doctorId null.
    //    - User regular: se busca el doctor vinculado a través de CommonPerson.
    let medicalCenters: MedicalCenterSummaryDto[] = [];
    let doctorId: string | null = null;

    if (!isSystemUser) {
      doctorId = await this.authContextService.getDoctorIdForUser(userId);
      // Union of the doctor's centers and the staff link (users_medical_centers), deduped by id.
      const centers = [
        ...(doctorId ? await this.authContextService.getMedicalCentersForDoctor(doctorId) : []),
        ...(await findUserCenters(this.userCentersRepo, userId)),
      ];
      const byId = new Map(centers.map((mc) => [mc.id, mc]));
      medicalCenters = [...byId.values()].map((mc) => ({
        id: mc.id,
        name: mc.name,
        address: mc.address ?? null,
        isActive: mc.isActive,
      }));
    }

    const data = {
      id: user.id,
      name: user.name,
      email: user.email,
      doctorId,
      // Computed by the API so the UI and the API agree on who is an admin (MJ-06).
      isAdmin: await this.authContextService.isAdmin(userId),
      // Set by an admin password reset (MJ-05); the UI must send the user to change it.
      mustChangePassword: user.firstLogin === true,
    };

    const modulesPayload = { ...modules, medicalCenters };
    return { ...data, modules: encryptModules(modulesPayload) };
  }
}
