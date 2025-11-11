import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { User } from '../user/entities/user.entity';
import { LoginUserDto } from './dto/login-auth.dto';
import { AuthUser } from './interfaces/User';

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

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Credenciales inválidas');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
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

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Credenciales inválidas');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
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
  async login(loginDto: LoginUserDto): Promise<{ access_token: string }> {
    let user: AuthUser;

    if (loginDto.isSystemUser) {
      user = await this.validateSystemUser(
        loginDto.credential,
        loginDto.password,
      );
    } else {
      user = await this.validateUser(loginDto.credential, loginDto.password);
    }

    const payload = { id: user.id, name: user.name, roleId: user.roleId };

    const token = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });

    // ✅ Guardar sesión activa en Redis
    await this.redisSession.setSession(
      user.id.toString(),
      {
        token,
        userId: user.id,
        roleId: user.roleId,
        loginAt: new Date().toISOString(),
      },
      3600, // TTL de 1 hora
    );

    return { access_token: token };
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
}
