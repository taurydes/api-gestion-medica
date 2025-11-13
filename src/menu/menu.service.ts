import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { IsNull, Repository } from 'typeorm';

import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Menu } from './entities/menu.entity';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu, DatabaseConnectionName.DB_MAIN)
    private readonly menuRepository: Repository<Menu>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Crea un nuevo registro de menú.
   * Valida que el menú padre exista (si se envía parentId)
   * y limpia la caché relacionada.
   */
  async create(createMenuDto: CreateMenuDto): Promise<Menu> {
    try {
      if (createMenuDto.parentId) {
        const parent = await this.menuRepository.findOneBy({
          id: createMenuDto.parentId,
        });

        if (!parent) {
          throw new BadRequestException(
            `El menú padre con ID ${createMenuDto.parentId} no existe.`,
          );
        }
      }

      const newMenu = this.menuRepository.create(createMenuDto);
      const menu = await this.menuRepository.save(newMenu);

      // 🧹 Limpiar caché de la lista general
      await this.cacheManager.del('menus:all');

      return menu;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el menú: ${error.message}`,
      );
    }
  }

  /**
   * Retorna todos los menús.
   * Usa Redis como caché para mejorar rendimiento.
   */
  async findAll(): Promise<Menu[]> {
    const cacheKey = 'menus:all';

    try {
      // 1️⃣ Intentar obtener desde caché
      const cachedMenus = await this.cacheManager.get<Menu[]>(cacheKey);
      if (cachedMenus) return cachedMenus;

      // 2️⃣ No hay caché → consultar DB
      const menus = await this.menuRepository.find({
        relations: ['parent', 'children'],
        where: { parent: IsNull() },
        order: {
          order: 'ASC',
          id: 'ASC',
        },
      });

      // 3️⃣ Guardar en caché 5 min
      await this.cacheManager.set(cacheKey, menus, 300);

      return menus;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener la lista de menús: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene un menú por su ID.
   * Incluye relaciones útiles: padre, hijos, permisos.
   */
  async findOne(id: number): Promise<Menu> {
    const cacheKey = `menu:${id}`;

    try {
      // 1️⃣ Intentar obtener desde caché
      const cachedMenu = await this.cacheManager.get<Menu>(cacheKey);
      if (cachedMenu) return cachedMenu;

      // 2️⃣ Si no hay caché → DB
      const menu = await this.menuRepository.findOne({
        where: { id },
        relations: [
          'parent',
          'children',
          'permissionMenus',
          'submenuPermissionMenus',
          'permissionRoles',
        ],
      });

      if (!menu) {
        throw new NotFoundException(`Menú con ID ${id} no encontrado.`);
      }

      // 3️⃣ Guardar en caché 10 min
      await this.cacheManager.set(cacheKey, menu, 600);

      return menu;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener el menú: ${error.message}`,
      );
    }
  }

  /**
   * Actualiza un menú existente.
   * Valida que el menú exista y que no se apunte a sí mismo como padre.
   */
  async update(id: number, updateMenuDto: UpdateMenuDto): Promise<Menu> {
    try {
      const menu = await this.menuRepository.findOneBy({ id });

      if (!menu) {
        throw new NotFoundException(`Menú con ID ${id} no encontrado.`);
      }

      if (
        typeof updateMenuDto.parentId !== 'undefined' &&
        updateMenuDto.parentId !== null
      ) {
        if (updateMenuDto.parentId === id) {
          throw new BadRequestException(
            'Un menú no puede ser padre de sí mismo.',
          );
        }

        const parent = await this.menuRepository.findOneBy({
          id: updateMenuDto.parentId,
        });

        if (!parent) {
          throw new BadRequestException(
            `El menú padre con ID ${updateMenuDto.parentId} no existe.`,
          );
        }
      }

      await this.menuRepository.update(id, updateMenuDto);

      const updatedMenu = await this.menuRepository.findOne({
        where: { id },
        relations: ['parent', 'children'],
      });

      if (!updatedMenu) {
        throw new NotFoundException('Error al actualizar el menú.');
      }

      // 🧹 Limpiar caché relacionada
      await this.cacheManager.del(`menu:${id}`);
      await this.cacheManager.del('menus:all');

      return updatedMenu;
    } catch (error) {
      throw new BadRequestException(
        `Error al actualizar el menú: ${error.message}`,
      );
    }
  }

  /**
   * Elimina un menú por ID.
   * (Si más adelante quieres borrado lógico, aquí en vez de delete se hace update del deletedAt.)
   */
  async remove(id: number): Promise<void> {
    try {
      const menu = await this.menuRepository.findOneBy({ id });

      if (!menu) {
        throw new NotFoundException(`Menú con ID ${id} no encontrado.`);
      }

      await this.menuRepository.delete(id);

      // 🧹 Limpiar caché relacionada
      await this.cacheManager.del(`menu:${id}`);
      await this.cacheManager.del('menus:all');
    } catch (error) {
      throw new NotFoundException(
        `Error al eliminar el menú: ${error.message}`,
      );
    }
  }
}
