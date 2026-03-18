import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { CommonModule } from 'src/common/common.module';
import { PermissionModule } from 'src/permission/permission.module';
import { User } from 'src/user/entities/user.entity';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

dotenv.config();
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [User, UserSecurity],
      DatabaseConnectionName.DB_MAIN,
    ),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
    }),
    PermissionModule,
    CommonModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
