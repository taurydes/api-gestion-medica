import { forwardRef, Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { UserModule } from 'src/user/user.module';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role], DatabaseConnectionName.DB_MAIN), // Especifica el nombre de la conexión
    forwardRef(() => UserModule),
  ],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [TypeOrmModule, RoleService],
})
export class RoleModule {}
