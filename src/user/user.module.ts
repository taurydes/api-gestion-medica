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
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User,UserSecurity,CommonPerson,IdentityDocument], DatabaseConnectionName.DB_MAIN), 
    forwardRef(() => RoleModule),
  ],
  controllers: [UserSecurityController,UserController],
  providers: [UserSecurityService,UserService],
  exports: [UserSecurityService,UserService, TypeOrmModule],
})
export class UserModule {}