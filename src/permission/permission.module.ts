import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Menu } from 'src/menu/entities/menu.entity';
import { MenuModule } from 'src/menu/menu.module';
import { Role } from 'src/role/entities/role.entity';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { CaslPermissionController } from './controller/permission.controller';
import { PermissionMenu } from './entities/permission-menu.entity';
import { Permission } from './entities/permission.entity';
import { PermissionService } from './services/permission.service';
import { User } from 'src/user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Permission, Role, PermissionMenu, UserSecurity, Menu, User],
      DatabaseConnectionName.DB_MAIN,
    ),
    forwardRef(() => AuthModule),
    MenuModule,
  ],
  controllers: [CaslPermissionController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
