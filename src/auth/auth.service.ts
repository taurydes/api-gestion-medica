import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../user/entities/user.entity';
import { AuthUser } from './interfaces/User';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,
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

    const { password: _, ...userData } = user; // Excluir la contraseña de la respuesta
    return userData as AuthUser;
  }

  async login(user: AuthUser): Promise<{ access_token: string }> {
    const payload = { name: user.name, id: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
