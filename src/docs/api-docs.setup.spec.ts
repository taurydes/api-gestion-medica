import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as request from 'supertest';
import {
  API_DOCS_JSON_PATH,
  API_DOCS_PATH,
  setupApiDocs,
} from './api-docs.setup';

@ApiTags('Ping')
@ApiBearerAuth()
@Controller('ping')
class PingController {
  @Get()
  ping(): string {
    return 'pong';
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

describe('setupApiDocs', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(PingModule, { logger: false });
    setupApiDocs(app, 'API TEST');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Scalar reference pointing at the OpenAPI JSON', async () => {
    const res = await request(app.getHttpServer())
      .get(API_DOCS_PATH)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('@scalar/api-reference');
    expect(res.text).toContain(API_DOCS_JSON_PATH);
    expect(res.text).not.toContain('swagger-ui');
  });

  it('serves the OpenAPI document with the bearer scheme and the app routes', async () => {
    const res = await request(app.getHttpServer())
      .get(API_DOCS_JSON_PATH)
      .expect(200);

    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('API TEST');
    expect(res.body.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(res.body.paths['/ping'].get.security).toEqual([{ bearer: [] }]);
  });

  it('keeps the YAML document and drops the Swagger UI assets', async () => {
    await request(app.getHttpServer()).get('/api-yaml').expect(200);
    await request(app.getHttpServer())
      .get(`${API_DOCS_PATH}/swagger-ui-init.js`)
      .expect(404);
  });
});
