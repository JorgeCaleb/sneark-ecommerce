import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configurarAplicacion } from './../src/configurar-aplicacion.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { Rol } from '@prisma/client';

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
    vi.spyOn(app.get(PrismaService).usuario, 'findUnique').mockResolvedValue({
      id: 7,
      nombre: 'Cliente',
      email: 'cliente@example.com',
      password: 'hash',
      rol: Rol.CLIENTE,
      creadoEn: new Date(),
    });

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

  it('denies access if the user was deleted from the database', () => {
    vi.spyOn(app.get(PrismaService).usuario, 'findUnique').mockResolvedValue(null);

    const token = app.get(JwtService).sign({
      sub: 99,
      email: 'eliminado@example.com',
      rol: 'CLIENTE',
    });

    return request(app.getHttpServer())
      .get('/api/usuarios/perfil')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
