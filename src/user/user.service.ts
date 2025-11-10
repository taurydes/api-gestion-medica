import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
 * incluyendo la validación, cifrado de contraseñas
 * y manejo de errores asociados.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Crea un nuevo usuario en la base de datos.
   * Verifica duplicados por email y cifra la contraseña antes de guardar.
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

      return rest;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el usuario: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene la lista de todos los usuarios registrados.
   *
   * @returns Un arreglo de usuarios sin incluir sus contraseñas.
   * @throws NotFoundException Si ocurre un error al recuperar los datos.
   */
  async findAll(): Promise<Omit<User, 'password'>[]> {
    try {
      const users = await this.userRepository.find();
      return users.map(({ password, ...rest }) => rest);
    } catch (error) {
      throw new NotFoundException('Error al obtener la lista de usuarios.');
    }
  }

  /**
   * Busca un usuario por su ID.
   *
   * @param id - Identificador único del usuario.
   * @returns El usuario encontrado sin el campo `password`.
   * @throws NotFoundException Si el usuario no existe o ocurre un error en la consulta.
   */
  async findOne(id: number): Promise<Omit<User, 'password'> | null> {
    try {
      const user = await this.userRepository.findOneBy({ id });

      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      const { password, ...rest } = user;
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
      return rest;
    } catch (error) {
      throw new BadRequestException(
        `Error al actualizar el usuario: ${error.message}`,
      );
    }
  }

  /**
   * Elimina un usuario por su ID.
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
    } catch (error) {
      throw new NotFoundException(
        `Error al eliminar el usuario: ${error.message}`,
      );
    }
  }
}
