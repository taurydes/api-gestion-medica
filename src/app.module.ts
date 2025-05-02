import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { RoleModule } from './role/role.module';
import { getMainConnection } from './database/getMainConnection';
import { PermissionModule } from './permission/permission.module';
import { PermissionsGuard } from './auth/permission.guard';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    getMainConnection(), // Conexión principal a la base de datos
    UserModule,
    AuthModule,
    RoleModule,
    PermissionModule,
  ],
  controllers: [],
  providers: [PermissionsGuard],
})
export class AppModule {}