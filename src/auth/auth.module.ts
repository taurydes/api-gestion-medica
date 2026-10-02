import { UserMedicalCenter } from 'src/user/entities/user-medical-center.entity';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { CommonModule } from 'src/common/common.module';
import { PermissionModule } from 'src/permission/permission.module';
import { User } from 'src/user/entities/user.entity';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PanelAccessService } from './services/panel-access.service';

dotenv.config();
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [User, UserSecurity, UserMedicalCenter],
      DatabaseConnectionName.DB_MAIN,
    ),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '1h',
        },
      }),
    }),
    PermissionModule,
    CommonModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PanelAccessService],
  exports: [JwtModule, AuthService, PanelAccessService],
})
export class AuthModule {}
