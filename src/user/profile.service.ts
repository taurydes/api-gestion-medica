import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { IsNull, Repository } from 'typeorm';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { UserSecurity } from './entities/user.system.entity';
import { UserService } from './user.service';

/** Operaciones del usuario autenticado sobre su propia cuenta (id tomado del JWT). */
@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userSecurityRepository: Repository<UserSecurity>,

    private readonly userService: UserService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.userService.updateProfile(userId, dto);
  }

  /**
   * Cambia la contraseña tras verificar la actual con bcrypt.
   * La sesión es única por usuario (Redis), así que no hay otras sesiones que invalidar.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const where = { id: userId, deletedAt: IsNull() };
    const secUser = await this.userSecurityRepository.findOne({ where });
    const user = secUser ?? (await this.userRepository.findOne({ where }));

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isCurrentValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }

    const password = await bcrypt.hash(dto.newPassword, 10);
    const changes = { password, updatedAt: new Date() };
    if (secUser) {
      await this.userSecurityRepository.update(userId, changes);
    } else {
      await this.userRepository.update(userId, changes);
    }

    return { message: 'Contraseña actualizada correctamente' };
  }
}
