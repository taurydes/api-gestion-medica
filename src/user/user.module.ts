import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { AuthModule } from 'src/auth/auth.module';
import { RoleModule } from 'src/role/role.module';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Module({
  imports: [
    TypeOrmModule.forFeature([User], DatabaseConnectionName.DB_MAIN), 
    AuthModule,
    forwardRef(() => RoleModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService, TypeOrmModule],
})
export class UserModule {}