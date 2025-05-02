import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { Permission } from './entities/permission.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Role } from 'src/role/entities/role.entity';
import { PermissionRoles } from './entities/PermissionRole.entity';
import { CreatePermissionsRoleDto } from './dto/create-permission-role.dto';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission, DatabaseConnectionName.DB_MAIN)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role, DatabaseConnectionName.DB_MAIN)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(PermissionRoles, DatabaseConnectionName.DB_MAIN)
    private readonly rolePermissionRepository: Repository<PermissionRoles>,
  ) {}

  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    try {
      const permission = this.permissionRepository.create(createPermissionDto);
      return await this.permissionRepository.save(permission);
    } catch (error) {
      throw new InternalServerErrorException('Error al crear el permiso');
    }
  }

  async findAll(): Promise<Permission[]> {
    try {
      return await this.permissionRepository.find();
    } catch (error) {
      throw new InternalServerErrorException('Error al obtener los permisos');
    }
  }

  async findOne(id: number): Promise<Permission> {
    try {
      const permission = await this.permissionRepository.findOne({
        where: { id },
      });
      if (!permission) {
        throw new NotFoundException(`Permission con ID ${id} no encontrado`);
      }
      return permission;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al obtener el permiso');
    }
  }

  async update(
    id: number,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    try {
      const permission = await this.findOne(id);
      Object.assign(permission, updatePermissionDto);
      return await this.permissionRepository.save(permission);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al actualizar el permiso');
    }
  }

  async remove(id: number): Promise<void> {
    try {
      const permission = await this.findOne(id);
      await this.permissionRepository.remove(permission);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al eliminar el permiso');
    }
  }

  async assignPermissionsToRole(
    createPermissionsRoleDto: CreatePermissionsRoleDto,
  ): Promise<string> {
    try {
      const { roleId, permissionIds } = createPermissionsRoleDto;
      const role = await this.roleRepository.findOne({ where: { id: roleId } });
      if (!role) {
        throw new NotFoundException(`Role con ID ${roleId} no encontrado`);
      }

      const permissions = await this.permissionRepository.find({
        where: { id: In(permissionIds) },
      });

      if (permissions.length !== permissionIds.length) {
        throw new NotFoundException('Uno o más permisos no fueron encontrados');
      }

      const rolePermissions = permissions.map((Permission) => {
        return this.rolePermissionRepository.create({
          roleId,
          permissionId: Permission.id,
        });
      });

      await this.rolePermissionRepository.save(rolePermissions);
      return 'Permisos asignados correctamente al rol';
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al asignar permisos al rol',
      );
    }
  }
}
