import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PermissionsGuard } from './auth/guards/permission.guard';
import configuration from './configuration';
import { getMainConnection } from './database/getMainConnection';
import { PermissionModule } from './permission/permission.module';
import { RoleModule } from './role/role.module';
import { UserModule } from './user/user.module';
import { LogsModule } from './logs/logs.module';
import { QueuesModule } from './queues/queues.module';
import { BullBoardModule } from './queues/bull-board/bull-board.module';


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
    LogsModule,
    QueuesModule,
    BullBoardModule
  ],
  controllers: [],
  providers: [PermissionsGuard],
})
export class AppModule {}