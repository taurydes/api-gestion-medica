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
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserSecurityQueryDto } from './dto/user-security-query.dto';
import { UserSecurityService } from './user-security.service';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiTags('Users-Security')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('users-security')
export class UserSecurityController {
  constructor(private readonly userSecurityService: UserSecurityService) {}

  /**
   * @summary Crear usuario.
   * @description Registra un nuevo usuario con los datos enviados.
   */
  @ApiOperation({
    summary: 'Crear usuario',
    description: 'Crea un nuevo usuario en el sistema.',
  })
  @Post()
  @Permission(`${ModuleItemsMenu.UserModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createUserSecurityDto: CreateUserSecurityDto) {
    return this.userSecurityService.create(createUserSecurityDto);
  }

  /**
   * @summary Listar usuarios.
   * @description Obtiene el listado completo de usuarios (ruta pública).
   */
  @ApiOperation({
    summary: 'Listar usuarios',
    description: 'Retorna todos los usuarios registrados. Ruta pública.',
  })
  @Get()
  @Permission(`${ModuleItemsMenu.UserModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: UserSecurityQueryDto) {
    return this.userSecurityService.findAll(query);
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
  @Permission(`${ModuleItemsMenu.UserModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.userSecurityService.findOne(id);
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
  @Permission(`${ModuleItemsMenu.UserModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userSecurityService.update(id, updateUserDto);
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
  @Permission(`${ModuleItemsMenu.UserModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.userSecurityService.remove(id);
  }
}
