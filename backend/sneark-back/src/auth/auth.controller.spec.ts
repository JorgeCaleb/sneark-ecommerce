import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurarAplicacion } from '../configurar-aplicacion.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('Registro público', () => {
  let app: INestApplication;
  const registro = vi.fn();

  beforeAll(async () => {
    @Module({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { registro } }],
    })
    class ModuloPrueba {}

    const modulo = await Test.createTestingModule({
      imports: [ModuloPrueba],
    }).compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
  });

  beforeEach(() => registro.mockClear());

  afterAll(async () => {
    await app.close();
  });

  it('rechaza rol ADMIN antes de invocar el registro', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        nombre: 'Cliente',
        email: 'cliente@example.test',
        password: 'clave-segura',
        rol: 'ADMIN',
      })
      .expect(400);

    expect(registro).not.toHaveBeenCalled();
  });

  it('acepta el registro sin campo rol y mantiene el rol predeterminado de cliente', async () => {
    registro.mockResolvedValue({
      usuario: { rol: 'CLIENTE' },
      token: 'token-de-prueba',
    });

    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        nombre: 'Cliente',
        email: 'cliente@example.test',
        password: 'clave-segura',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.usuario.rol).toBe('CLIENTE');
      });

    expect(registro).toHaveBeenCalledOnce();
    expect(registro.mock.calls[0][0]).not.toHaveProperty('rol');
  });
});
