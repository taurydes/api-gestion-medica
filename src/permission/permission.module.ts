import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Permission } from './entities/permission.entity';
import { PermissionRoles } from './entities/PermissionRole.entity';
import { Role } from 'src/role/entities/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Permission, PermissionRoles,Role],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [PermissionController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
