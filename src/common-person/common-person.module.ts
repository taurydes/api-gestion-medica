import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { CommonPersonService } from './common-person.service';
import { CommonPersonController } from './common-person.controller';
import { ParametersModule } from 'src/parameters/parameters.module';
import { CommonPerson } from './entities/common-person.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommonPerson], DatabaseConnectionName.DB_MAIN),
    ParametersModule, // For IdentityDocument if needed
  ],
  controllers: [CommonPersonController],
  providers: [CommonPersonService],
  exports: [CommonPersonService],
})
export class CommonPersonModule {}
