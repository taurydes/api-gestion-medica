import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as dotenv from 'dotenv';
import { PermissionsGuard } from './auth/permission.guard';


dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configuración Swagger
  const config = new DocumentBuilder()
    .setTitle('API de Usuarios')
    .setDescription('Documentación de la API de Usuarios con NestJS')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Habilitar validaciones con class-validator
  app.useGlobalPipes(new ValidationPipe());

  // Habilitar transformación de objetos
  app.enableCors();

  // Registrar el Guard Globalmente
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(app.get(JwtService), reflector));
  app.useGlobalGuards(app.get(PermissionsGuard));
  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`App running on http://localhost:${process.env.PORT || 3000}/api`);
}
bootstrap();
