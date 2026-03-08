import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/auth/decorators/public.decorator';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserSecurityQueryDto } from './dto/user-security-query.dto';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * @summary Crear usuario.
   * @description Registra un nuevo usuario con los datos enviados.
   */
  @ApiOperation({
    summary: 'Crear usuario',
    description: 'Crea un nuevo usuario en el sistema.',
  })
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  /**
   * @summary Listar usuarios.
   * @description Obtiene el listado completo de usuarios (ruta pública).
   */
  @ApiOperation({
    summary: 'Listar usuarios',
    description: 'Retorna todos los usuarios registrados. Ruta pública.',
  })
  @Public()
  @Get()
  findAll(@Query() query: UserSecurityQueryDto) {
    return this.userService.findAll(query);
  }

  /**
   * @summary Obtener usuario por ID.
   * @description Devuelve el detalle de un usuario específico.
   */
  @ApiOperation({
    summary: 'Obtener usuario',
    description: 'Recupera un usuario mediante su ID numérico.',
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  /**
   * @summary Actualizar usuario.
   * @description Modifica información de un usuario existente.
   */
  @ApiOperation({
    summary: 'Actualizar usuario',
    description: 'Actualiza campos del usuario identificado por su ID.',
  })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  /**
   * @summary Eliminar usuario.
   * @description Elimina (lógico o físico según servicio) un usuario por ID.
   */
  @ApiOperation({
    summary: 'Eliminar usuario',
    description: 'Elimina un usuario existente usando su ID.',
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
