import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import * as dotenv from 'dotenv';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

// 🔹 Módulos internos
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permission.guard';
import { HttpResponseInterceptor } from './common/interceptors/HttpResponseInterceptor';
import { HttpExceptionFilter } from './common/exceptions/HttpExceptionFilter';
import { LogsService } from './logs/logs.service';
import { registerHandlebarsHelpers } from './logs/views/helpers';
import { BullBoardService } from './queues/bull-board/bull-board.service';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
    origin: true,
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

  const NODE_ENV = process.env.NODE_ENV || 'development';
  if (NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('API BASE - TypeScript + NestJS')
      .setDescription('Documentación de la API BASE')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
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

  app.useGlobalGuards(
    new JwtAuthGuard(jwtService, reflector),
    app.get(PermissionsGuard),
  );

  // ⚠️ Middleware para excluir /admin/* de los guards globales
  app.use((req, res, next) => {
    if (req.path.startsWith('/admin')) {
      // rutas de Bull Board: sin guard Nest
      return next();
    }
    return next(); // las demás rutas siguen protegidas por los guards globales
  });

  // -------------------------------------------------
  // 📊 Bull Board - Panel de administración
  // -------------------------------------------------
  const bullBoardService = app.get(BullBoardService);
  const bullRouter = bullBoardService.serverAdapter.getRouter();
  app.use('/admin/queues', bullRouter);

  // -------------------------------------------------
  // 🚀 Arranque
  // -------------------------------------------------
  const PORT = process.env.PORT ?? 3000;
  const URL_HOST = process.env.URL_HOST ?? 'localhost';
  await app.listen(PORT);

  Logger.log(`🚀 App corriendo en: http://${URL_HOST}:${PORT}/api`);
  Logger.log(`🧠 Logs UI disponible en: http://${URL_HOST}:${PORT}/logs/ui/view`);
  Logger.log(`📦 Bull Board login: http://${URL_HOST}:${PORT}/admin/login`);
}

bootstrap();
