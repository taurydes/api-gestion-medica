import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

/** Perfil propio bajo `/auth`: solo exige sesión válida, sin permiso de módulo. */
@ApiTags('Auth')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('auth')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @ApiOperation({ summary: 'Leer el perfil propio (usuario, rol y datos de persona)' })
  @Get('profile')
  getProfile(@GetUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @ApiOperation({ summary: 'Actualizar el perfil propio (email y datos de persona)' })
  @Patch('me')
  updateMe(@GetUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(userId, dto);
  }

  @ApiOperation({ summary: 'Cambiar la contraseña propia verificando la actual' })
  @Patch('change-password')
  changePassword(
    @GetUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.profileService.changePassword(userId, dto);
  }
}
