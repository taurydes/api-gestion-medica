import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

/**
 * Servicio: UserService
 *
 * Gestiona las operaciones CRUD de usuarios,
 * incluyendo la validación, cifrado de contraseñas,
 * manejo de errores y uso de caché Redis para mejorar el rendimiento.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    // 🔹 Inyectamos el manejador de caché global (Redis)
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Crea un nuevo usuario en la base de datos.
   * Verifica duplicados por email y cifra la contraseña antes de guardar.
   * También limpia el caché global de usuarios.
   *
   * @param createUserDto - Datos del nuevo usuario.
   * @returns El usuario creado sin incluir el campo `password`.
   * @throws BadRequestException Si el correo ya está en uso o ocurre un error al guardar.
   */
  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'password'>> {
    try {
      const existingUser = await this.userRepository.findOne({
        where: { email: createUserDto.email },
      });

      if (existingUser) {
        throw new BadRequestException('El correo electrónico ya está en uso.');
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(
        createUserDto.password,
        saltRounds,
      );

      const newUser = this.userRepository.create({
        ...createUserDto,
        password: hashedPassword,
      });

      const user = await this.userRepository.save(newUser);
      const { password, ...rest } = user;

      // 🧹 Limpiar caché de la lista general
      await this.cacheManager.del('users:all');

      return rest;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el usuario: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene la lista de todos los usuarios registrados.
   * Intenta primero obtener los datos desde Redis antes de consultar la base de datos.
   *
   * @returns Un arreglo de usuarios sin incluir sus contraseñas.
   * @throws NotFoundException Si ocurre un error al recuperar los datos.
   */
  async findAll(): Promise<Omit<User, 'password'>[]> {
    const cacheKey = 'users:all';

    try {
      // 1️⃣ Intentar obtener desde caché
      const cachedUsers =
        await this.cacheManager.get<Omit<User, 'password'>[]>(cacheKey);
      if (cachedUsers) return cachedUsers;

      // 2️⃣ Si no hay caché, obtener desde DB
      const users = await this.userRepository.find();
      const sanitized = users.map(({ password, ...rest }) => rest);

      // 3️⃣ Guardar en caché por 5 minutos
      await this.cacheManager.set(cacheKey, sanitized, 300);

      return sanitized;
    } catch (error) {
      throw new NotFoundException('Error al obtener la lista de usuarios.');
    }
  }

  /**
   * Busca un usuario por su ID.
   * Intenta primero obtener los datos desde Redis antes de consultar la base de datos.
   *
   * @param id - Identificador único del usuario.
   * @returns El usuario encontrado sin el campo `password`.
   * @throws NotFoundException Si el usuario no existe o ocurre un error en la consulta.
   */
  async findOne(id: number): Promise<Omit<User, 'password'> | null> {
    const cacheKey = `user:${id}`;

    try {
      // 1️⃣ Intentar obtener desde caché
      const cachedUser =
        await this.cacheManager.get<Omit<User, 'password'>>(cacheKey);
      if (cachedUser) return cachedUser;

      // 2️⃣ Si no hay caché, buscar en la DB
      const user = await this.userRepository.findOneBy({ id });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      const { password, ...rest } = user;

      // 3️⃣ Guardar en caché por 10 minutos
      await this.cacheManager.set(cacheKey, rest, 600);

      return rest;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener el usuario: ${error.message}`,
      );
    }
  }

  /**
   * Actualiza la información de un usuario existente.
   * Si se incluye una nueva contraseña, se cifra antes de guardarla.
   * Además, limpia el caché correspondiente.
   *
   * @param id - Identificador del usuario a actualizar.
   * @param updateUserDto - Datos a modificar.
   * @returns El usuario actualizado sin incluir la contraseña.
   * @throws NotFoundException Si el usuario no existe.
   * @throws BadRequestException Si ocurre un error durante la actualización.
   */
  async update(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<Omit<User, 'password'> | null> {
    try {
      const user = await this.userRepository.findOneBy({ id });

      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      if (updateUserDto.password) {
        const saltRounds = 10;
        updateUserDto.password = await bcrypt.hash(
          updateUserDto.password,
          saltRounds,
        );
      }

      await this.userRepository.update(id, updateUserDto);
      const updatedUser = await this.userRepository.findOneBy({ id });

      if (!updatedUser) {
        throw new NotFoundException('Error al actualizar el usuario.');
      }

      const { password, ...rest } = updatedUser;

      // 🧹 Limpiar caché relacionado
      await this.cacheManager.del(`user:${id}`);
      await this.cacheManager.del('users:all');

      return rest;
    } catch (error) {
      throw new BadRequestException(
        `Error al actualizar el usuario: ${error.message}`,
      );
    }
  }

  /**
   * Elimina un usuario por su ID.
   * También elimina el caché asociado al usuario y la lista completa.
   *
   * @param id - Identificador del usuario a eliminar.
   * @returns void
   * @throws NotFoundException Si el usuario no existe o no puede eliminarse.
   */
  async remove(id: number): Promise<void> {
    try {
      const user = await this.findOne(id);
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      await this.userRepository.delete(id);

      // 🧹 Limpiar caché relacionado
      await this.cacheManager.del(`user:${id}`);
      await this.cacheManager.del('users:all');
    } catch (error) {
      throw new NotFoundException(
        `Error al eliminar el usuario: ${error.message}`,
      );
    }
  }
}
