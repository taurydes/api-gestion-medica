import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export const API_DOCS_PATH = '/api';
export const API_DOCS_JSON_PATH = '/api-json';

/** Serves the Scalar API reference at /api and the raw OpenAPI document at /api-json and /api-yaml. */
export function setupApiDocs(app: INestApplication, title: string): void {
  const config = new DocumentBuilder()
    .setTitle(title)
    .setDescription('Documentación de la API BASE')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // ui: false drops the Swagger UI; @nestjs/swagger still builds the spec and serves it raw
  SwaggerModule.setup(API_DOCS_PATH, app, document, { ui: false, raw: true });

  app.getHttpAdapter().get(
    API_DOCS_PATH,
    apiReference({
      url: API_DOCS_JSON_PATH,
      pageTitle: title,
      authentication: { preferredSecurityScheme: 'bearer' },
    }),
  );
}
