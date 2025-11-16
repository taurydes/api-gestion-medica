import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { join } from 'path';

// 🔹 Módulos internos
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permission.guard';
import { SessionGuard } from './auth/guards/session.guard';
import { HttpExceptionFilter } from './common/exceptions/HttpExceptionFilter';
import { HttpResponseInterceptor } from './common/interceptors/HttpResponse.interceptor';
import { LogsService } from './logs/logs.service';
import { registerHandlebarsHelpers } from './logs/views/helpers';
import { BullBoardService } from './queues/bull-board/bull-board.service';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // -------------------------------------------------
  // ⚙️ Inyectamos ConfigService (ya disponible globalmente)
  // -------------------------------------------------
  const configService = app.get(ConfigService);

  // -------------------------------------------------
  // 🗂️ Configuración de vistas (Logs y BullBoard)
  // -------------------------------------------------
  app.setBaseViewsDir(join(__dirname, '..', 'src'));
  app.setViewEngine('hbs');
  app.use(cookieParser());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // 🔹 Vistas para logs
  app.useStaticAssets(join(__dirname, '..', 'src', 'logs', 'views'), {
    prefix: '/logs/views',
  });

  // 🔹 Vistas para Bull Board
  app.useStaticAssets(
    join(__dirname, '..', 'src', 'queues', 'bull-board', 'views'),
    { prefix: '/admin/views' },
  );

  registerHandlebarsHelpers(app);
  Logger.log('✅ Handlebars y assets estáticos configurados');

  // -------------------------------------------------
  // 🌍 CORS y Swagger
  // -------------------------------------------------
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || true,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'token',
      'Token',
      'TOKEN',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  const NODE_ENV = configService.get<string>('NODE_ENV') || 'development';
  if (NODE_ENV === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(configService.get('APP_NAME') || 'API SUVE ADS')
      .setDescription('Documentación de la API SUVE ADS')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
    Logger.log('📘 Swagger habilitado en /api');
  } else {
    Logger.log('⚙️ Swagger deshabilitado en ambiente PROD');
  }

  // -------------------------------------------------
  // 🧱 Interceptores y Filtros globales
  // -------------------------------------------------
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new HttpResponseInterceptor());

  const logsService = app.get(LogsService);
  app.useGlobalFilters(new HttpExceptionFilter(logsService));

  // -------------------------------------------------
  // 🛡️ Guards globales (excluyendo rutas del Bull Board)
  // -------------------------------------------------
  const reflector = app.get(Reflector);
  const jwtService = app.get(JwtService);
  const jwtAuthGuard = new JwtAuthGuard(jwtService, reflector);
  const sessionGuard = app.get(SessionGuard);
  const permissionsGuard = app.get(PermissionsGuard);

  app.useGlobalGuards(
    jwtAuthGuard, // 1️⃣ Valida el token
    sessionGuard, // 2️⃣ Revisa Redis
    permissionsGuard, // 3️⃣ Aplica roles/permisos
  );

  // -------------------------------------------------
  // 📊 Bull Board - Panel de administración
  // -------------------------------------------------
  const bullBoardService = app.get(BullBoardService);
  const bullRouter = bullBoardService.serverAdapter.getRouter();
  app.use('/admin/queues', bullRouter);

  // -------------------------------------------------
  // 🚀 Arranque
  // -------------------------------------------------
  const PORT = configService.get<number>('PORT') ?? 3000;
  const URL_HOST = configService.get<string>('URL_HOST') ?? 'localhost';
  await app.listen(PORT);

  Logger.log(`🚀 App corriendo en: http://${URL_HOST}:${PORT}/api`);
  Logger.log(`🧠 Logs UI disponible en: http://${URL_HOST}:${PORT}/logs/ui/view`);
  Logger.log(`📦 Bull Board login: http://${URL_HOST}:${PORT}/admin/login`);
}

bootstrap();
