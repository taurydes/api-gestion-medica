import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Company } from '../company/entities/company.entity';
import { Municipality } from '../parameters/entities/municipality.entity';
import { Parish } from '../parameters/entities/parish.entity';
import { State } from '../parameters/entities/state.entity';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { Customer } from './entities/customer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Customer, Company, State, Municipality, Parish],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],

  controllers: [CustomerController],
  providers: [CustomerService],

  // ⬇ si otro módulo quiere usar CustomerService o repositorio, se exporta
  exports: [CustomerService, TypeOrmModule],
})
export class CustomerModule {}
