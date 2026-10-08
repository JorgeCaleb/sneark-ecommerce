import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configurarAplicacion } from './../src/configurar-aplicacion.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacion(app);
    await app.init();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('applies global DTO validation to API routes', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'invalid', password: 'short', extra: true })
      .expect(400);
  });

  it('requires authentication for the user profile', () => {
    return request(app.getHttpServer()).get('/api/usuarios/perfil').expect(401);
  });

  it('denies a client token access to admin routes', () => {
    const token = app.get(JwtService).sign({
      sub: 7,
      email: 'cliente@example.com',
      rol: 'CLIENTE',
    });

    return request(app.getHttpServer())
      .get('/api/usuarios/admin/clientes')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  afterEach(async () => {
    await app.close();
  });
});
