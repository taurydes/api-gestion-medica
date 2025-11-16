import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { RoleModule } from 'src/role/role.module';
import { User } from './entities/user.entity';

import { IdentityDocument } from 'src/parameters/entities/identity-document.entity';
import { CommonPerson } from './entities/common-person.entity';
import { UserSecurity } from './entities/user.system.entity';
import { UserSecurityController } from './user-security.controller';
import { UserSecurityService } from './user-security.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User,UserSecurity,CommonPerson,IdentityDocument], DatabaseConnectionName.DB_MAIN), 
    forwardRef(() => RoleModule),
  ],
  controllers: [UserSecurityController],
  providers: [UserSecurityService],
  exports: [UserSecurityService, TypeOrmModule],
})
export class UserModule {}