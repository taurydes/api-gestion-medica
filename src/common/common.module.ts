import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { User } from 'src/user/entities/user.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { AuthContextService } from './services/auth-context.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Doctor], DatabaseConnectionName.DB_MAIN),
  ],
  providers: [AuthContextService],
  exports: [AuthContextService],
})
export class CommonModule {}
