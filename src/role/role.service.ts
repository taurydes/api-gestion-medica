import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role, DatabaseConnectionName.DB_MAIN)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    try {
      const role = this.roleRepository.create(createRoleDto);
      return await this.roleRepository.save(role);
    } catch (error) {
      throw new InternalServerErrorException('Error al crear el rol');
    }
  }

  async findAll(): Promise<Role[]> {
    try {
      return await this.roleRepository.find();
    } catch (error) {
      throw new InternalServerErrorException('Error al obtener los roles');
    }
  }

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
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al obtener el rol');
    }
  }

  async update(id: number, updateRoleDto: UpdateRoleDto): Promise<Role> {
    try {
      const role = await this.findOne(id);
      Object.assign(role, updateRoleDto);
      return await this.roleRepository.save(role);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al actualizar el rol');
    }
  }

  async remove(id: number): Promise<void> {
    try {
      const role = await this.findOne(id);
      await this.roleRepository.remove(role);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al eliminar el rol');
    }
  }
}
