import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { AuthUser } from './interfaces/User';
import { LoginUserDto } from './dto/login-auth.dto';
import { UserSecurity } from 'src/user/entities/user.system.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userSystemRepository: Repository<UserSecurity>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(credential: string, password: string): Promise<AuthUser> {
    // Buscar al usuario por email o name
    const user = await this.userRepository.findOne({
      where: [{ email: credential }, { name: credential }],
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // Comparar la contraseña encriptada (Usar `await` y `compare`)
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
    };
  }
  async validatesystemUser(
    credential: string,
    password: string,
  ): Promise<AuthUser> {
    // Buscar al usuario por email o name
    const user = await this.userSystemRepository.findOne({
      where: [{ email: credential }, { name: credential }],
    });
    if (!user) {
      throw new UnauthorizedException('Usuario de seguridad no encontrado');
    }

    // Comparar la contraseña encriptada (Usar `await` y `compare`)
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
    };
  }

  async login(loginDto: LoginUserDto): Promise<{ access_token: string }> {
    let user: AuthUser;
    if (loginDto.isSystemUser) {
      user = await this.validatesystemUser(
        loginDto.credential,
        loginDto.password,
      );
    } else {
      user = await this.validateUser(loginDto.credential, loginDto.password);
    }

    const payload = { name: user.name, id: user.id, roleId: user.roleId };
    const token = this.jwtService.sign(
      { payload },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN,
      },
    );
    return {
      access_token: token,
    };
  }
}
