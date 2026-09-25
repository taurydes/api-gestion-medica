import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { User } from 'src/user/entities/user.entity';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { AuthContextService } from './services/auth-context.service';
import { UserAccessService } from './services/user-access.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [User, UserSecurity, Doctor],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  providers: [AuthContextService, UserAccessService],
  exports: [AuthContextService, UserAccessService],
})
export class CommonModule {}
