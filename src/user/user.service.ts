import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'password'>> {
    try {
      // Verificar si el usuario ya existe (email)
      const existingUser = await this.userRepository.findOne({
        where: { email: createUserDto.email },
      });

      if (existingUser) {
        throw new BadRequestException('El correo electrónico ya está en uso.');
      }

      // Cifrar la contraseña antes de guardar
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

  async findAll(): Promise<Omit<User, 'password'>[]> {
    try {
      const users = await this.userRepository.find( );
      return users.map(({ password, ...rest }) => rest);
    } catch (error) {
      console.log(error);
      throw new NotFoundException('Error al obtener la lista de usuarios.');
    }
  }

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
