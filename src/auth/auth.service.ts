import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MenuService } from 'src/menu/menu.service';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { JwtPayload } from './auth.const';
import { LoginUserDto } from './dto/login-auth.dto';
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
    const {
      userId: rawUserId,
      email,
      rules,
      ...modules
    } = await this.permissionService.getUserPermissions(user.id);

    const summaryUser = {
      id: user.id,
      name: user.user.name,
      email: user.user.email,
    };
    return { access_token, refresh_token, data: summaryUser, modules };
  }

  // ======================================================
  // 🔹 REFRESH TOKEN
  // ======================================================
  async refreshTokens(
    dto: RefreshTokenDto,
    currentUser: AuthUser,
  ): Promise<JwtPayload> {
    const { refreshToken } = dto;
    const userId = currentUser.id;

    const session = await this.redisSession.getSession(userId);

    if (!session) {
      throw new UnauthorizedException('Sesión expirada o inválida');
    }

    if (session.refresh_token !== refreshToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // ========================
    // 🔥 Decodificar refresh token
    // ========================
    let payload: any;

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // ========================
    //  Regenerar tokens
    // ========================
    const newAccessToken = this.jwtService.sign(
      {
        id: payload.id,
        name: payload.name,
        roleId: payload.roleId,
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      },
    );

    const newRefreshToken = this.jwtService.sign(
      {
        id: payload.id,
        name: payload.name,
        roleId: payload.roleId,
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      },
    );
    //  Actualizar sesión en Redis
    await this.redisSession.setSession(
      userId,
      {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        userId: payload.id,
        roleId: payload.roleId,
        refreshedAt: new Date().toISOString(),
      },
      3600,
    );
    const {
      userId: rawUserId,
      email,
      ...modules
    } = await this.permissionService.getUserPermissions(userId);
    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      data: {
        id: payload.id,
        user: currentUser.user,
      },
      modules,
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
   */
  async getUserWithPermissions(userId: string) {
    // Buscar en users normales primero
    let user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'role',
        'role.permissionMenus',
        'role.permissionMenus.permission',
        'role.permissionMenus.menu',
        'commonPerson',
      ],
    });

    if (user) {
      const { password, ...safeUser } = user;
      const permissions = (user.role?.permissionMenus ?? [])
        .filter(
          (pr) =>
            pr.isActive &&
            pr.menu?.name &&
            pr.permission?.isActive &&
            pr.permission?.name,
        )
        .map((pr) => `${pr.menu.name}.${pr.permission.name}`.toLowerCase());

      return {
        user: safeUser,
        role: user.role ? { id: user.role.id, name: user.role.name } : null,
        permissions,
        isSystemUser: false,
      };
    }

    // Buscar en users de seguridad
    const secUser = await this.userSystemRepository.findOne({
      where: { id: userId },
      relations: [
        'role',
        'role.permissionMenus',
        'role.permissionMenus.permission',
        'role.permissionMenus.menu',
      ],
    });

    if (!secUser) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const { password, ...safeSecUser } = secUser;
    const permissions = (secUser.role?.permissionMenus ?? [])
      .filter(
        (pr) =>
          pr.isActive &&
          pr.menu?.name &&
          pr.permission?.isActive &&
          pr.permission?.name,
      )
      .map((pr) => `${pr.menu.name}.${pr.permission.name}`.toLowerCase());

    return {
      user: safeSecUser,
      role: secUser.role
        ? { id: secUser.role.id, name: secUser.role.name }
        : null,
      permissions,
      isSystemUser: true,
    };
  }
}
