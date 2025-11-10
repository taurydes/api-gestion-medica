import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';

/**
 * Servicio: RoleService
 *
 * Gestiona las operaciones CRUD de roles,
 * incluyendo la obtención de sus permisos asociados.
 */
@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role, DatabaseConnectionName.DB_MAIN)
    private readonly roleRepository: Repository<Role>,
  ) {}

  /**
   * Crea un nuevo rol en la base de datos.
   * 
   * @param createRoleDto - Datos del nuevo rol.
   * @returns El rol creado con su información completa.
   * @throws InternalServerErrorException Si ocurre un error durante la creación.
   */
  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    try {
      const role = this.roleRepository.create(createRoleDto);
      return await this.roleRepository.save(role);
    } catch {
      throw new InternalServerErrorException('Error al crear el rol');
    }
  }

  /**
   * Obtiene todos los roles registrados en la base de datos.
   * 
   * @returns Un arreglo con todos los roles.
   * @throws InternalServerErrorException Si ocurre un error durante la consulta.
   */
  async findAll(): Promise<Role[]> {
    try {
      return await this.roleRepository.find();
    } catch {
      throw new InternalServerErrorException('Error al obtener los roles');
    }
  }

  /**
   * Busca un rol por su ID.
   * Incluye sus permisos relacionados a través de `permissionsRoles`.
   * 
   * @param id - Identificador del rol a consultar.
   * @returns El rol encontrado, incluyendo sus permisos.
   * @throws NotFoundException Si el rol no existe.
   * @throws InternalServerErrorException Si ocurre un error inesperado.
   */
  async findOne(id: number): Promise<Role> {
    try {
      const role = await this.roleRepository.findOne({
        where: { id },
        relations: ['permissionsRoles', 'permissionsRoles.permission'],
        select: {
          id: true,
          name: true,
          permissionsRoles: {
            id: true,
            active: true,
            permission: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!role) {
        throw new NotFoundException(`Rol con ID ${id} no encontrado`);
      }
      return role;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al obtener el rol');
    }
  }

  /**
   * Actualiza la información de un rol existente.
   * 
   * @param id - Identificador del rol a actualizar.
   * @param updateRoleDto - Datos a modificar.
   * @returns El rol actualizado.
   * @throws NotFoundException Si el rol no existe.
   * @throws InternalServerErrorException Si ocurre un error al guardar los cambios.
   */
  async update(id: number, updateRoleDto: UpdateRoleDto): Promise<Role> {
    try {
      const role = await this.findOne(id);
      Object.assign(role, updateRoleDto);
      return await this.roleRepository.save(role);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al actualizar el rol');
    }
  }

  /**
   * Elimina un rol de la base de datos.
   * 
   * @param id - Identificador del rol a eliminar.
   * @returns void
   * @throws NotFoundException Si el rol no existe.
   * @throws InternalServerErrorException Si ocurre un error durante la eliminación.
   */
  async remove(id: number): Promise<void> {
    try {
      const role = await this.findOne(id);
      await this.roleRepository.remove(role);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al eliminar el rol');
    }
  }
}
