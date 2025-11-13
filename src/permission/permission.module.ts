import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Role } from 'src/role/entities/role.entity';
import { Permission } from './entities/permission.entity';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { PermissionRole } from './entities/Permission-role.entity';
import { PermissionMenu } from './entities/permission-menu.entity';
import { Menu } from 'src/menu/entities/menu.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Permission, PermissionRole,Role,PermissionMenu,Menu],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [PermissionController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
