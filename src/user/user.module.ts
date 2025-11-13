import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { RoleModule } from 'src/role/role.module';
import { User } from './entities/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { CommonPerson } from './entities/common-person.entity';
import { IdentityDocument } from 'src/parameters/entities/identity-document.entity';
import { UserSecurity } from './entities/user.system.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User,UserSecurity,CommonPerson,IdentityDocument], DatabaseConnectionName.DB_MAIN), 
    forwardRef(() => RoleModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService, TypeOrmModule],
})
export class UserModule {}