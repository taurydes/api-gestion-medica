import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { In, IsNull, Repository } from 'typeorm';

import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Menu } from './entities/menu.entity';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { UserSecurityService } from 'src/user/user-security.service';
import { MenuQueryDto } from './dto/menu-query.dto';
import { UserSecurity } from '../user/entities/user.system.entity';
import { AuthUser } from 'src/auth/interfaces/User';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu, DatabaseConnectionName.DB_MAIN)
    private readonly menuRepository: Repository<Menu>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly userSecurityService: UserSecurityService,
    private readonly userService: UserService,
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
      throw new BadRequestException(`Error al crear el menú: ${error.message}`);
    }
  }

  /**
   * Retorna todos los menús.
   * Usa Redis como caché para mejorar rendimiento.
   */
  async findAll(query: MenuQueryDto) {
    const { page, limit, order, search, parentId, isActive } = query;

    const cacheKey = `menus:query:${JSON.stringify(query)}`;
    const listKey = 'menus:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.menuRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.parent', 'parent')
      .leftJoinAndSelect('m.submenu', 'children')
      .where('m.deletedAt IS NULL');

    if (search) {
      qb.andWhere(`(m.name ILIKE :s OR m.route ILIKE :s OR m.icon ILIKE :s)`, {
        s: `%${search}%`,
      });
    }

    if (parentId !== undefined) {
      qb.andWhere('m.parentId = :parentId', { parentId });
    }

    if (isActive !== undefined) {
      qb.andWhere('m.isActive = :isActive', { isActive });
    }

    qb.orderBy('m.order', order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    const result = { data, total, page, limit };

    await this.cacheManager.set(cacheKey, result, 300);

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Obtiene un menú por su ID.
   * Incluye relaciones útiles: padre, hijos, permisos.
   */
  async findOne(id: string): Promise<Menu> {
    const cacheKey = `menu:${id}`;

    try {
      // 1️⃣ Intentar obtener desde caché
      const cachedMenu = await this.cacheManager.get<Menu>(cacheKey);
      if (cachedMenu) return cachedMenu;

      // 2️⃣ Si no hay caché → DB
      const menu = await this.menuRepository.findOne({
        where: { id },
        relations: ['parent', 'submenu', 'permissionMenus'],
      });

      if (!menu) {
        throw new NotFoundException(`Menú con ID ${id} no encontrado.`);
      }

      // 3️⃣ Guardar en caché 10 min
      await this.cacheManager.set(cacheKey, menu, 600);

      return menu;
    } catch (error) {
      throw new NotFoundException(`Error al obtener el menú: ${error.message}`);
    }
  }

  /**
   * Actualiza un menú existente.
   * Valida que el menú exista y que no se apunte a sí mismo como padre.
   */
  async update(id: string, updateMenuDto: UpdateMenuDto): Promise<Menu> {
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
        relations: ['parent', 'submenu'],
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
  async remove(id: string): Promise<void> {
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

  /**
   * Genera el menú dinámico para un usuario basado en su rol y permisos asignados.
   */
  async getMenuForUser(
    userId: string,
    isUserSecurity: boolean,
  ): Promise<Menu[]> {
    let user: Partial<UserSecurity> | Partial<User> | null;

    if (isUserSecurity) {
      user = await this.userSecurityService.findOne(userId);
    } else {
      user = await this.userService.findOne(userId);
    }
    // 1️⃣ Obtener al usuario con rol y permisosRoles

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    if (!user.role) {
      throw new NotFoundException(`no posee rol asignado`);
    }

    // 2️⃣ Obtener los submenuId permitidos por el rol
    const allowedSubmenuIds = user.role.permissionMenus
      .filter((pr) => pr.isActive)
      .map((pr) => pr.menuId);

    if (allowedSubmenuIds.length === 0) {
      return [];
    }

    // 3️⃣ Obtener los menús correspondientes a estos submenús
    const allowedMenus = await this.menuRepository.find({
      where: { id: In(allowedSubmenuIds) },
      relations: ['parent'],
    });

    // 4️⃣ Obtener todos los padres necesarios
    const parentIds = allowedMenus
      .map((m) => m.parent?.id)
      .filter((id): id is string => Boolean(id));

    const parents = parentIds.length
      ? await this.menuRepository.find({
          where: { id: In(parentIds) },
          relations: ['parent'],
        })
      : [];

    // 5️⃣ Unir menús y padres
    const fullMenus = [...parents, ...allowedMenus];

    // 6️⃣ Construir árbol final
    return this.buildMenuTree(fullMenus);
  }

  /**
   * Construye un árbol jerárquico de menús.
   */
  private buildMenuTree(menus: Menu[]): Menu[] {
    const menuMap = new Map<string, Menu>();

    // Crear copia limpia sin children
    menus.forEach((menu) => {
      menu.submenu = [];
      menuMap.set(menu.id, menu);
    });

    const rootList: Menu[] = [];

    menus.forEach((menu) => {
      if (menu.parent) {
        const parent = menuMap.get(menu.parent.id);
        if (parent) parent.submenu.push(menu);
      } else {
        rootList.push(menu);
      }
    });

    // Evitar estructuras circulares al serializar (parent <-> submenu)
    menus.forEach((menu) => {
      menu.parent = null;
    });

    // Ordenar por order asc
    rootList.sort((a, b) => a.order - b.order);
    rootList.forEach((menu) => {
      menu.submenu.sort((a, b) => a.order - b.order);
    });

    return rootList;
  }
}
