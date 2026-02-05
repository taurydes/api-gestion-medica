import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Patient } from './entities/patient.entity';
import { CommonPersonService } from 'src/common-person/common-person.service';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private readonly patientRepository: Repository<Patient>,
    private readonly commonPersonService: CommonPersonService,
  ) {}

  async create(createPatientDto: CreatePatientDto) {
    // 1. Crear o buscar CommonPerson
    // Asumimos que si envían los datos es para crearla.
    // Podríamos añadir lógica para buscar por documento si ya existe.

    let commonPerson;

    // Check if person exists by document number to prevent duplicates or reuse
    if (createPatientDto.commonPerson.documentNumber) {
      const existing = await this.commonPersonService.findAll({
        page: 1,
        limit: 1,
        search: createPatientDto.commonPerson.documentNumber,
        order: 'ASC' as any,
      });
      if (existing.data.length > 0) {
        commonPerson = existing.data[0];
        // Update fields?? or just link? For now, let's just use it.
        // But if the user wants to update, we might need update logic.
      }
    }

    if (!commonPerson) {
      commonPerson = await this.commonPersonService.create(
        createPatientDto.commonPerson,
      );
    }

    // 2. Verificar si ya es paciente
    const existingPatient = await this.patientRepository.findOne({
      where: { commonPersonId: commonPerson.id },
    });

    if (existingPatient) {
      throw new BadRequestException(
        'Esta persona ya registrado como paciente.',
      );
    }

    // 3. Crear Paciente
    const newPatient = this.patientRepository.create({
      ...createPatientDto,
      commonPerson: commonPerson,
    });

    return this.patientRepository.save(newPatient);
  }

  findAll() {
    return this.patientRepository.find({
      relations: ['commonPerson'],
    });
  }

  findOne(id: number) {
    return this.patientRepository.findOne({
      where: { id },
      relations: ['commonPerson'],
    });
  }

  update(id: number, updatePatientDto: UpdatePatientDto) {
    return `This action updates a #${id} patient`;
  }

  remove(id: number) {
    return `This action removes a #${id} patient`;
  }
}
