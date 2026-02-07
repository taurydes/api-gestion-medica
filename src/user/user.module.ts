import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { RoleModule } from 'src/role/role.module';
import { User } from './entities/user.entity';

import { IdentityDocument } from 'src/parameters/entities/identity-document.entity';
import { UserSecurity } from './entities/user.system.entity';
import { UserSecurityController } from './user-security.controller';
import { UserSecurityService } from './user-security.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        User,
        UserSecurity,
        IdentityDocument,
        CommonPerson,
        Doctor,
        MedicalCenter,
      ],
      DatabaseConnectionName.DB_MAIN,
    ),
    forwardRef(() => RoleModule),
  ],
  controllers: [UserSecurityController, UserController],
  providers: [UserSecurityService, UserService],
  exports: [UserSecurityService, UserService, TypeOrmModule],
})
export class UserModule {}
