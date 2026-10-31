import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductosService } from '../src/productos/productos.service.js';
import { CategoriasService } from '../src/categorias/categorias.service.js';
import { ColoresService } from '../src/colores/colores.service.js';
import { MarcasService } from '../src/marcas/marcas.service.js';

describe('Validación HTTP de actualizaciones del catálogo', () => {
  let app: INestApplication;
  let token: string;
  const actualizar = {
    productos: vi.fn(async (id: number, datos: object) => ({ id, ...datos })),
    categorias: vi.fn(async (id: number, datos: object) => ({ id, ...datos })),
    colores: vi.fn(async (id: number, datos: object) => ({ id, ...datos })),
    marcas: vi.fn(async (id: number, datos: object) => ({ id, ...datos })),
  };
  const crearProducto = vi.fn(async (datos: object) => ({ id: 3, ...datos }));

  beforeAll(async () => {
    for (const [nombre, valor] of Object.entries({
      NODE_ENV: 'test',
      JWT_SECRET: 'jwt-test',
      MP_ACCESS_TOKEN: ' ',
      CLOUDINARY_CLOUD_NAME: 'test',
      CLOUDINARY_API_KEY: 'test',
      CLOUDINARY_API_SECRET: 'test',
      FRONTEND_ORIGIN: 'http://localhost:4200',
    }))
      vi.stubEnv(nombre, valor);

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: {
          findUnique: vi
            .fn()
            .mockResolvedValue({
              id: 7,
              email: 'admin@example.test',
              rol: 'ADMIN',
            }),
        },
        pedido: { findMany: vi.fn().mockResolvedValue([]) },
        cloudinaryDeleteJob: { findMany: vi.fn().mockResolvedValue([]) },
      })
      .overrideProvider(ProductosService)
      .useValue({ actualizar: actualizar.productos, crear: crearProducto })
      .overrideProvider(CategoriasService)
      .useValue({ actualizar: actualizar.categorias })
      .overrideProvider(ColoresService)
      .useValue({ actualizar: actualizar.colores })
      .overrideProvider(MarcasService)
      .useValue({ actualizar: actualizar.marcas })
      .compile();
    app = module.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    token = app.get(JwtService).sign({ sub: 7 });
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const camposObligatorios = [
    ['productos', 'nombre'],
    ['productos', 'codigoModelo'],
    ['productos', 'precio'],
    ['productos', 'marcaId'],
    ['productos', 'categoriaId'],
    ['productos', 'activo'],
    ['productos', 'tallas'],
    ['categorias', 'nombre'],
    ['colores', 'nombre'],
    ['colores', 'codigo'],
    ['marcas', 'nombre'],
    ['marcas', 'codigo'],
  ] as const;

  it.each(camposObligatorios)(
    'rechaza %s.%s nulo antes de llamar al servicio',
    async (recurso, campo) => {
      const respuesta = await request(app.getHttpServer())
        .patch(`/api/${recurso}/3`)
        .set('Authorization', `Bearer ${token}`)
        .send({ [campo]: null })
        .expect(400);
      expect(respuesta.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining(campo)]),
      );
      expect(actualizar[recurso]).not.toHaveBeenCalled();
    },
  );

  it.each(['id', 'genero', 'colorId', 'talla', 'stock'])(
    'rechaza una variante con %s nulo',
    async (campo) => {
      const talla = {
        id: 10,
        genero: 'M',
        colorId: 5,
        talla: '6.5',
        stock: 2,
        [campo]: null,
      };
      await request(app.getHttpServer())
        .patch('/api/productos/3')
        .set('Authorization', `Bearer ${token}`)
        .send({ tallas: [talla] })
        .expect(400);
      expect(actualizar.productos).not.toHaveBeenCalled();
    },
  );

  it.each([{ tallas: [null] }, { tallas: [{}] }, { tallas: {} }])(
    'rechaza una colección de variantes inválida: %j',
    async ({ tallas }) => {
      await request(app.getHttpServer())
        .patch('/api/productos/3')
        .set('Authorization', `Bearer ${token}`)
        .send({ tallas })
        .expect(400);
      expect(actualizar.productos).not.toHaveBeenCalled();
    },
  );

  it.each([
    { precio: 0 },
    { precio: 'texto' },
    { activo: 'false' },
    { grupoModeloId: 0 },
    { descripcion: 123 },
  ])('mantiene las validaciones de los valores enviados: %j', async (datos) => {
    await request(app.getHttpServer())
      .patch('/api/productos/3')
      .set('Authorization', `Bearer ${token}`)
      .send(datos)
      .expect(400);
    expect(actualizar.productos).not.toHaveBeenCalled();
  });

  it.each(['colores', 'marcas'] as const)(
    'conserva la normalización de códigos de %s',
    async (recurso) => {
      const respuesta = await request(app.getHttpServer())
        .patch(`/api/${recurso}/3`)
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: ' bk ' })
        .expect(200);
      expect(respuesta.body).toEqual({ id: 3, codigo: 'BK' });
    },
  );

  it.each([
    { tallas: null },
    { tallas: [{ id: null, genero: 'M', colorId: 5, talla: '6.5', stock: 0 }] },
  ])('rechaza tallas nulas también al crear productos: %j', async (datos) => {
    await request(app.getHttpServer())
      .post('/api/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Air Force 1',
        codigoModelo: 'AF1',
        precio: 100,
        marcaId: 2,
        categoriaId: 1,
        ...datos,
      })
      .expect(400);
    expect(crearProducto).not.toHaveBeenCalled();
  });

  it.each([
    ['productos', { precio: 125 }],
    ['productos', { activo: false }],
    ['productos', { descripcion: null, grupoModeloId: null }],
    ['productos', { descripcion: '', grupoModeloId: 7 }],
    ['productos', { tallas: [] }],
    [
      'productos',
      { tallas: [{ genero: 'M', colorId: 5, talla: '6.5', stock: 0 }] },
    ],
    ['categorias', { nombre: 'Urbanas' }],
    ['colores', { nombre: 'Negro' }],
    ['marcas', { nombre: 'Nike' }],
  ] as const)(
    'acepta una actualización parcial válida de %s: %j',
    async (recurso, datos) => {
      const respuesta = await request(app.getHttpServer())
        .patch(`/api/${recurso}/3`)
        .set('Authorization', `Bearer ${token}`)
        .send(datos)
        .expect(200);
      expect(respuesta.body).toEqual({ id: 3, ...datos });
      expect(actualizar[recurso]).toHaveBeenCalledExactlyOnceWith(
        3,
        expect.objectContaining(datos),
      );
    },
  );

  it.each(['productos', 'categorias', 'colores', 'marcas'] as const)(
    'permite omitir todos los campos de %s sin introducir valores predeterminados',
    async (recurso) => {
      const respuesta = await request(app.getHttpServer())
        .patch(`/api/${recurso}/3`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);
      expect(respuesta.body).toEqual({ id: 3 });
    },
  );
});
