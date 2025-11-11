import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { redisStore } from 'cache-manager-redis-store';
import { AuthModule } from './auth/auth.module';
import { PermissionsGuard } from './auth/guards/permission.guard';
import { SessionGuard } from './auth/guards/session.guard';
import { configuration, validationSchema } from './configuration/index';
import { getMainConnection } from './database/getMainConnection';
import { HealthModule } from './health/health.module';
import { LogsModule } from './logs/logs.module';
import { PermissionModule } from './permission/permission.module';
import { BullBoardModule } from './queues/bull-board/bull-board.module';
import { QueuesModule } from './queues/queues.module';
import { RedisSessionModule } from './redis-session/redis-session.module';
import { RoleModule } from './role/role.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        // opcionales:
        ttl: configService.get<number>('CACHE_TTL') || 3600, // segundos
        max: configService.get<number>('CACHE_MAX') || 1000,
      }),
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        //los segundos son en milisegundos
        name: 'short',
        ttl: 1000, // 1 segundo
        limit: 3, // 3 peticiones por 1000 milisegundos
        blockDuration: 30000, // Bloquea por 30 segundos si se excede el límite
      },
      {
        name: 'medium',
        ttl: 10000, // 10 segundos
        limit: 20, // 20 peticiones por 10 segundos
        blockDuration: 60000, // Bloquea por 60 segundos si se excede el límite
      },
      {
        name: 'long',
        ttl: 60000, // 60 segundos
        limit: 100, // 100 peticiones por minuto
        blockDuration: 90000, // Bloquea por 90 segundos si se excede el límite
      },
    ]),
    getMainConnection(), // Conexión principal a la base de datos
    UserModule,
    AuthModule,
    RoleModule,
    PermissionModule,
    LogsModule,
    QueuesModule,
    BullBoardModule,
    RedisSessionModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    PermissionsGuard,
    SessionGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Esto aplicará el guard automáticamente
    },
  ],
})
export class AppModule {}
