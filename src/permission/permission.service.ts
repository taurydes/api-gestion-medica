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

/**
 * Servicio: PermissionService
 *
 * Gestiona la creación, lectura, actualización y eliminación de permisos,
 * así como la asignación de permisos a roles dentro del sistema.
 */
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

  /**
   * Crea un nuevo permiso en la base de datos.
   *
   * @param createPermissionDto - Datos del permiso a crear.
   * @returns El permiso creado con su información completa.
   * @throws InternalServerErrorException Si ocurre un error al guardar el registro.
   */
  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    try {
      const permission = this.permissionRepository.create(createPermissionDto);
      return await this.permissionRepository.save(permission);
    } catch {
      throw new InternalServerErrorException('Error al crear el permiso');
    }
  }

  /**
   * Obtiene todos los permisos registrados en la base de datos.
   *
   * @returns Un arreglo de objetos Permission.
   * @throws InternalServerErrorException Si ocurre un error durante la consulta.
   */
  async findAll(): Promise<Permission[]> {
    try {
      return await this.permissionRepository.find();
    } catch {
      throw new InternalServerErrorException('Error al obtener los permisos');
    }
  }

  /**
   * Busca un permiso específico por su ID.
   *
   * @param id - Identificador único del permiso.
   * @returns El permiso encontrado.
   * @throws NotFoundException Si no existe el permiso con el ID indicado.
   * @throws InternalServerErrorException Si ocurre un error inesperado en la consulta.
   */
  async findOne(id: number): Promise<Permission> {
    try {
      const permission = await this.permissionRepository.findOne({ where: { id } });
      if (!permission) {
        throw new NotFoundException(`Permission con ID ${id} no encontrado`);
      }
      return permission;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al obtener el permiso');
    }
  }

  /**
   * Actualiza la información de un permiso existente.
   *
   * @param id - Identificador del permiso a actualizar.
   * @param updatePermissionDto - Datos a modificar.
   * @returns El permiso actualizado.
   * @throws NotFoundException Si el permiso no existe.
   * @throws InternalServerErrorException Si ocurre un error al guardar los cambios.
   */
  async update(
    id: number,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    try {
      const permission = await this.findOne(id);
      Object.assign(permission, updatePermissionDto);
      return await this.permissionRepository.save(permission);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al actualizar el permiso');
    }
  }

  /**
   * Elimina un permiso de la base de datos.
   *
   * @param id - Identificador del permiso a eliminar.
   * @returns void
   * @throws NotFoundException Si el permiso no existe.
   * @throws InternalServerErrorException Si ocurre un error durante la eliminación.
   */
  async remove(id: number): Promise<void> {
    try {
      const permission = await this.findOne(id);
      await this.permissionRepository.remove(permission);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al eliminar el permiso');
    }
  }

  /**
   * Asigna uno o varios permisos a un rol.
   *
   * @param createPermissionsRoleDto - Contiene el ID del rol y los IDs de los permisos a asignar.
   * @returns Un mensaje de confirmación de la asignación.
   * @throws NotFoundException Si el rol o alguno de los permisos no existen.
   * @throws InternalServerErrorException Si ocurre un error durante la asignación.
   */
  async assignPermissionsToRole(
    createPermissionsRoleDto: CreatePermissionsRoleDto,
  ): Promise<string> {
    try {
      const { roleId, permissionIds } = createPermissionsRoleDto;

      // Verifica que el rol exista
      const role = await this.roleRepository.findOne({ where: { id: roleId } });
      if (!role) throw new NotFoundException(`Role con ID ${roleId} no encontrado`);

      // Verifica que todos los permisos existan
      const permissions = await this.permissionRepository.find({
        where: { id: In(permissionIds) },
      });
      if (permissions.length !== permissionIds.length) {
        throw new NotFoundException('Uno o más permisos no fueron encontrados');
      }

      // Crea las relaciones entre rol y permisos
      const rolePermissions = permissions.map((perm) =>
        this.rolePermissionRepository.create({
          roleId,
          permissionId: perm.id,
        }),
      );

      await this.rolePermissionRepository.save(rolePermissions);
      return 'Permisos asignados correctamente al rol';
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al asignar permisos al rol');
    }
  }
}
