import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';


@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company, DatabaseConnectionName.DB_MAIN)
    private readonly companyRepository: Repository<Company>,
  ) {}

  /**
   * @summary Crea una nueva empresa
   */
  async create(dto: CreateCompanyDto, userId: number): Promise<Company> {
    try {
      const newCompany = this.companyRepository.create({
        ...dto,
        userId,
      });

      return await this.companyRepository.save(newCompany);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creando la empresa: ${error.message}`,
      );
    }
  }

  /**
   * @summary Obtiene todas las empresas
   */
  async findAll(): Promise<Company[]> {
    return await this.companyRepository.find({
      relations: ['state', 'municipality'],
    });
  }

  /**
   * @summary Obtiene una empresa por ID
   */
  async findOne(id: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['state', 'municipality'],
    });

    if (!company) {
      throw new NotFoundException(`La empresa con ID ${id} no existe`);
    }

    return company;
  }

  /**
   * @summary Actualiza una empresa por ID
   */
  async update(id: number, dto: UpdateCompanyDto): Promise<Company> {
    const company = await this.findOne(id);

    Object.assign(company, dto);
    company.updatedAt = new Date();

    try {
      return await this.companyRepository.save(company);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error actualizando la empresa: ${error.message}`,
      );
    }
  }

  /**
   * @summary Elimina una empresa
   */
  async remove(id: number): Promise<void> {
    const company = await this.findOne(id);

    try {
      await this.companyRepository.remove(company);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error eliminando la empresa: ${error.message}`,
      );
    }
  }
}
