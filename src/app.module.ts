import { CacheModule } from '@nestjs/cache-manager';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
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
import { ParametersModule } from './parameters/parameters.module';
import { MenuModule } from './menu/menu.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { FilesModule } from './files/files.module';
import { CryptoModule } from './crypto/crypto.module';
import { PatientModule } from './patient/patient.module';
import { SchemaInitService } from './database/schema-init.service';
import { MedicalCenterModule } from './medical-center/medical-center.module';
import { DoctorsModule } from './doctors/doctors.module';
import { CommonPersonModule } from './common-person/common-person.module';
import { MedicalHistoryModule } from './medical-history/medical-history.module';
import { RecipeModule } from './recipe/recipe.module';
import { DepartmentsModule } from './departments/departments.module';
import { MedicalAppointmentsModule } from './medical-appointments/medical-appointments.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
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
        limit: 100, // 100 peticiones por 1 segundo
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
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        index: false,
        fallthrough: false,
      },
    }),
    getMainConnection(), // Conexión principal a la base de datos
    AuthModule,
    UserModule,
    CommonPersonModule,
    RoleModule,
    PermissionModule,
    LogsModule,
    QueuesModule,
    BullBoardModule,
    RedisSessionModule,
    HealthModule,
    ParametersModule,
    MenuModule,
    FilesModule,
    CryptoModule,
    PatientModule,
    MedicalCenterModule,
    DoctorsModule,
    MedicalHistoryModule,
    RecipeModule,
    DepartmentsModule,
    MedicalAppointmentsModule,
    DashboardModule,
  ],
  controllers: [],
  providers: [
    PermissionsGuard,
    SessionGuard,
    JwtAuthGuard,
    SchemaInitService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          transform: true,
          whitelist: true,
        }),
    },
  ],
})
export class AppModule {}
