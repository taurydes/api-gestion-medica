import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MenuService } from 'src/menu/menu.service';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { JwtPayload } from './auth.const';
import { LoginUserDto } from './dto/login-auth.dto';
import { MedicalCenterSummaryDto } from './dto/medical-center-summary.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthUser } from './interfaces/User';
import { PermissionService } from 'src/permission/services/permission.service';

/**
 * @summary Servicio de autenticación principal de la aplicación.
 * @description
 * Se encarga de validar credenciales, generar tokens JWT y
 * mantener sesiones activas en Redis (a través de `RedisSessionService`).
 */
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
  ) {}

  // ======================================================
  // 🔹 VALIDACIÓN DE USUARIOS (NORMAL Y SISTEMA)
  // ======================================================

  /**
   * @summary Valida un usuario regular por email o nombre.
   * @throws UnauthorizedException Si las credenciales son inválidas.
   */
  async validateUser(credential: string, password: string): Promise<AuthUser> {
    const user = await this.userRepository.findOne({
      where: [{ email: credential }, { name: credential }],
    });

    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    const { password: _, ...safeUser } = user;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Credenciales inválidas');

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
    const user = await this.userSystemRepository.findOne({
      where: [{ email: credential }, { name: credential }],
    });

    if (!user)
      throw new UnauthorizedException('Usuario de seguridad no encontrado');
    const { password: _, ...safeUser } = user;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Credenciales inválidas');

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
    let user: AuthUser;

    if (loginDto.isSystemUser) {
      user = await this.validateSystemUser(
        loginDto.credential,
        loginDto.password,
      );
    } else {
      user = await this.validateUser(loginDto.credential, loginDto.password);
    }
    const payload = {
      id: user.id,
      user,
    };

    const access_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });

    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });
    // ✅ Guardar sesión activa en Redis
    await this.redisSession.setSession(
      user.id.toString(),
      {
        access_token,
        refresh_token,
        userId: user.id,
        roleId: user.user.roleId,
        loginAt: new Date().toISOString(),
      },
      3600, // TTL del access token
    );
    return { access_token, refresh_token };
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

    // 4. Regenerar tokens con datos frescos
    const tokenPayload = {
      id: user.id,
      user: { id: user.id, user: { ...user, password: undefined } },
    };

    const newAccessToken = this.jwtService.sign(tokenPayload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });

    const newRefreshToken = this.jwtService.sign(tokenPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    // 5. Actualizar sesión en Redis
    await this.redisSession.setSession(
      userId,
      {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        userId: user.id,
        roleId: user.roleId,
        refreshedAt: new Date().toISOString(),
      },
      3600,
    );
    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
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
      if (doctorId) {
        const centers =
          await this.authContextService.getMedicalCentersForDoctor(doctorId);
        medicalCenters = centers.map((mc) => ({
          id: mc.id,
          name: mc.name,
          address: mc.address ?? null,
          isActive: mc.isActive,
        }));
      }
    }

    const data = {
      id: user.id,
      name: user.name,
      email: user.email,
      doctorId,
    };

    return { data, modules: { ...modules, medicalCenters } };
  }
}
