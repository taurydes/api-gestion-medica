import { Logger } from '@nestjs/common';
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
import {
  BODY_LIMIT_MB,
  HttpExceptionFilter,
  bodyParserErrorMiddleware,
} from './common/exceptions/HttpExceptionFilter';
import { HttpResponseInterceptor } from './common/interceptors/HttpResponse.interceptor';
import { LogsService } from './logs/logs.service';
import { registerHandlebarsHelpers } from './logs/views/helpers';
import { BullBoardService } from './queues/bull-board/bull-board.service';
import { PanelAccessService } from './auth/services/panel-access.service';
import { ModuleItemsMenu } from './menu/menu.const';
import { PermissionActionsMenu } from './permission/permission.const';
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
  // 30 MB: cubre el video base64 (MAX_VIDEO_MB = 20 → ~27 MB); los archivos van por multipart (M-50)
  app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));
  app.use(express.urlencoded({ limit: `${BODY_LIMIT_MB}mb`, extended: true }));
  app.use(bodyParserErrorMiddleware);

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
      .setTitle(configService.get('APP_NAME') || 'API BASE')
      .setDescription('Documentación de la API BASE')
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
  // ValidationPipe se registra una sola vez, como APP_PIPE en app.module.ts
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
  // Montado una sola vez y detrás de JWT + sesión + permiso: el router Express no pasa por los guards globales.
  const bullBoardService = app.get(BullBoardService);
  const panelAccess = app.get(PanelAccessService);
  app.use(
    '/admin/queues',
    panelAccess.middleware(
      `${ModuleItemsMenu.BullBoardModule}.${PermissionActionsMenu.VIEW}`,
      '/admin/login',
    ),
    bullBoardService.serverAdapter.getRouter(),
  );

  // -------------------------------------------------
  // 🚀 Arranque
  // -------------------------------------------------
  const PORT = configService.get<number>('PORT') ?? 3000;
  const URL_HOST = configService.get<string>('URL_HOST') ?? 'localhost';
  await app.listen(PORT);

  // Sin prefijo global: /api es Swagger y solo existe en development
  Logger.log(`🚀 App corriendo en: http://${URL_HOST}:${PORT}`);
  if (NODE_ENV === 'development') Logger.log(`📘 Swagger: http://${URL_HOST}:${PORT}/api`);
  Logger.log(`🧠 Logs UI disponible en: http://${URL_HOST}:${PORT}/logs/ui/view`);
  Logger.log(`📦 Bull Board login: http://${URL_HOST}:${PORT}/admin/login`);
}

bootstrap();
