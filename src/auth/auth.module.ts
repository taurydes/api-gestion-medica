import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { User } from 'src/user/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { MenuModule } from 'src/menu/menu.module';

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
    MenuModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
