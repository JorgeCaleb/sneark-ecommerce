import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductosService } from './productos.service.js';

function productoConImagenes(
  imagenes: Awaited<ReturnType<ProductosService['buscarPorId']>>['imagenes'] = [],
): Awaited<ReturnType<ProductosService['buscarPorId']>> {
  return {
    id: 3, nombre: 'Nike Air Max 90 Rojo', codigoModelo: 'AF1',
    descripcion: null, precio: new Prisma.Decimal(100), marcaId: 2, categoriaId: 1,
    grupoModeloId: null, activo: true, creadoEn: new Date(0), actualizadoEn: new Date(0),
    marca: { id: 2, nombre: 'Nike', codigo: 'NK', logo: null },
    categoria: { id: 1, nombre: 'Zapatillas' }, grupoModelo: null, tallas: [], imagenes,
  };
}

describe('ProductosService actualizar tallas', () => {
  let service: ProductosService;
  let tx: {
    producto: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    marca: { findUnique: ReturnType<typeof vi.fn> };
    categoria: { findUnique: ReturnType<typeof vi.fn> };
    color: { findUnique: ReturnType<typeof vi.fn> };
    tallaProducto: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let prisma: {
    producto: { findUnique: ReturnType<typeof vi.fn> };
    imagenProducto: { createMany: ReturnType<typeof vi.fn> };
  };
  let cloudinary: {
    subirImagen: ReturnType<typeof vi.fn>;
    eliminarImagen: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    tx = {
      producto: {
        findUnique: vi.fn().mockResolvedValue({
          id: 3,
          marcaId: 2,
          codigoModelo: 'AF1',
        }),
        update: vi.fn().mockResolvedValue({ id: 3 }),
        create: vi.fn().mockResolvedValue({ id: 3, codigoModelo: 'AF1' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 3 }),
      },
      marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
      categoria: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      color: { findUnique: vi.fn().mockResolvedValue({ codigo: 'BK' }) },
      tallaProducto: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
      producto: { findUnique: vi.fn() },
      imagenProducto: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as typeof prisma;
    cloudinary = {
      subirImagen: vi.fn(),
      eliminarImagen: vi.fn().mockResolvedValue(undefined),
    };
    service = new ProductosService(
      prisma as unknown as PrismaService,
      cloudinary as unknown as CloudinaryService,
    );
  });

  it.each([7, null])('asigna o quita un grupo (%s) sin modificar contenido ni inventario', async (grupoModeloId) => {
    await service.actualizar(3, { grupoModeloId });
    expect(tx.producto.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3 }, data: { grupoModeloId } }));
    expect(tx.tallaProducto.update).not.toHaveBeenCalled();
    expect(tx.tallaProducto.create).not.toHaveBeenCalled();
    expect(tx.tallaProducto.deleteMany).not.toHaveBeenCalled();
  });

  it('actualiza y agrega tallas en la misma transacción', async () => {
    tx.tallaProducto.findMany.mockResolvedValue([
      {
        id: 10,
        genero: 'M',
        colorId: 5,
        talla: '38',
        sku: 'NK-AF1-M-BK-38',
        _count: { itemsCarrito: 0, itemsPedido: 0 },
      },
    ]);

    await service.actualizar(3, {
      tallas: [
        { genero: 'M', colorId: 5, talla: '38', stock: 4 },
        { genero: 'M', colorId: 5, talla: '39', stock: 2 },
      ],
    });

    expect(tx.tallaProducto.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        genero: 'M',
        colorId: 5,
        talla: '38',
        tallaNumero: 38,
        sku: 'NK-AF1-M-BK-38',
      },
    });
    expect(tx.tallaProducto.create).toHaveBeenCalledWith({
      data: {
        genero: 'M',
        colorId: 5,
        talla: '39',
        tallaNumero: 39,
        stock: 2,
        sku: 'NK-AF1-M-BK-39',
        productoId: 3,
      },
    });
    expect(tx.producto.update).toHaveBeenCalled();
  });

  it('elimina tallas omitidas cuando no tienen referencias', async () => {
    tx.tallaProducto.findMany.mockResolvedValue([
      {
        id: 10,
        genero: 'M',
        colorId: 5,
        talla: '38',
        sku: 'NK-AF1-M-BK-38',
        _count: { itemsCarrito: 0, itemsPedido: 0 },
      },
    ]);

    await service.actualizar(3, { tallas: [] });

    expect(tx.tallaProducto.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [10] } },
    });
  });

  it('crea las tallas 3.5 y 35 con códigos distintos', async () => {
    await service.crear({
      nombre: 'Air Force 1', codigoModelo: 'AF1', precio: 100,
      marcaId: 2, categoriaId: 1,
      tallas: [
        { genero: 'M', colorId: 5, talla: '3.5', stock: 4 },
        { genero: 'M', colorId: 5, talla: '35', stock: 2 },
      ],
    });
    expect(tx.tallaProducto.create.mock.calls.map(([argumento]) => argumento.data))
      .toEqual([
        expect.objectContaining({ talla: '3.5', tallaNumero: 3.5, sku: 'NK-AF1-M-BK-3P5' }),
        expect.objectContaining({ talla: '35', tallaNumero: 35, sku: 'NK-AF1-M-BK-35' }),
      ]);
  });

  it('permite crear fichas con el mismo código de modelo y distinto color', async () => {
    tx.producto.create
      .mockResolvedValueOnce({ id: 3, codigoModelo: 'SUP' })
      .mockResolvedValueOnce({ id: 4, codigoModelo: 'SUP' });
    tx.color.findUnique
      .mockResolvedValueOnce({ codigo: 'BK' })
      .mockResolvedValueOnce({ codigo: 'WH' });

    const ficha = {
      nombre: 'Adidas Superstar',
      codigoModelo: 'SUP',
      precio: 100,
      marcaId: 2,
      categoriaId: 1,
      tallas: [{ genero: 'M' as const, colorId: 5, talla: '42', stock: 4 }],
    };

    await service.crear(ficha);
    await service.crear({ ...ficha, tallas: [{ ...ficha.tallas[0], colorId: 6 }] });

    expect(tx.producto.create).toHaveBeenCalledTimes(2);
    expect(tx.tallaProducto.create.mock.calls.map(([argumento]) => argumento.data.sku))
      .toEqual(['NK-SUP-M-BK-42', 'NK-SUP-M-WH-42']);
  });

  it.each(['crear', 'actualizar'] as const)(
    '%s rechaza tallas equivalentes antes de escribir', async (operacion) => {
      const tallas = [
        { genero: 'M' as const, colorId: 5, talla: '06', stock: 4 },
        { genero: 'M' as const, colorId: 5, talla: '6.0', stock: 2 },
      ];
      const resultado = operacion === 'crear'
        ? service.crear({ nombre: 'Air Force 1', codigoModelo: 'AF1', precio: 100, marcaId: 2, categoriaId: 1, tallas })
        : service.actualizar(3, { tallas });
      await expect(resultado).rejects.toThrow('No se pueden repetir variantes');
      expect(tx.producto.findUnique).not.toHaveBeenCalled();
      expect(tx.producto.create).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 10])(
    'normaliza una talla histórica sin cambiar su identidad (id enviado: %s)', async (id) => {
      tx.tallaProducto.findMany.mockResolvedValue([{
        id: 10, genero: 'M', colorId: 5, talla: '06', stock: 9,
        sku: 'NK-AF1-M-BK-06', _count: { itemsCarrito: 1, itemsPedido: 2 },
      }]);
      await service.actualizar(3, {
        tallas: [{ id, genero: 'M', colorId: 5, talla: '6.0', stock: 99 }],
      });
      expect(tx.tallaProducto.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: 10 },
        data: { genero: 'M', colorId: 5, talla: '6', tallaNumero: 6, sku: 'NK-AF1-M-BK-6' },
      });
      expect(tx.tallaProducto.create).not.toHaveBeenCalled();
      expect(tx.tallaProducto.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    { itemsCarrito: 1, itemsPedido: 0 },
    { itemsCarrito: 0, itemsPedido: 1 },
  ])('bloquea cambios reales de talla si hay referencias (%j)', async (_count) => {
    tx.tallaProducto.findMany.mockResolvedValue([{
      id: 10, genero: 'M', colorId: 5, talla: '6', sku: 'NK-AF1-M-BK-6', _count,
    }]);
    await expect(service.actualizar(3, {
      tallas: [{ id: 10, genero: 'M', colorId: 5, talla: '6.5', stock: 4 }],
    })).rejects.toThrow(ConflictException);
    expect(tx.tallaProducto.update).not.toHaveBeenCalled();
  });

  it('detiene la edición si la base ya tiene tallas equivalentes duplicadas', async () => {
    tx.tallaProducto.findMany.mockResolvedValue(['06', '6'].map((talla, indice) => ({
      id: indice + 10, genero: 'M', colorId: 5, talla, sku: `NK-AF1-M-BK-${talla}`,
      _count: { itemsCarrito: 0, itemsPedido: 1 },
    })));
    await expect(service.actualizar(3, {
      tallas: [{ id: 10, genero: 'M', colorId: 5, talla: '6', stock: 4 }],
    })).rejects.toThrow('Hay variantes con tallas equivalentes');
    expect(tx.tallaProducto.update).not.toHaveBeenCalled();
    expect(tx.tallaProducto.deleteMany).not.toHaveBeenCalled();
  });

  it('rechaza reutilizar el mismo identificador para tallas diferentes', async () => {
    await expect(service.actualizar(3, {
      tallas: [
        { id: 10, genero: 'M', colorId: 5, talla: '6', stock: 4 },
        { id: 10, genero: 'M', colorId: 5, talla: '6.5', stock: 4 },
      ],
    })).rejects.toThrow('No se puede repetir el identificador');
    expect(tx.producto.findUnique).not.toHaveBeenCalled();
  });

  describe('ProductosService admin product listing', () => {
    it('returns inactive products when the admin selects the inactive state', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const count = vi.fn().mockResolvedValue(0);
      const service = new ProductosService(
        { producto: { findMany, count } } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await service.buscarTodosAdmin({
        estado: 'inactivos',
        pagina: 1,
        limite: 10,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { activo: false } }),
      );
      expect(count).toHaveBeenCalledWith({ where: { activo: false } });
    });

    it('includes both active and inactive products when the admin selects all', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const count = vi.fn().mockResolvedValue(0);
      const service = new ProductosService(
        { producto: { findMany, count } } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await service.buscarTodosAdmin({
        estado: 'todos',
        pagina: 1,
        limite: 10,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(count).toHaveBeenCalledWith({ where: {} });
    });
  });

  it('rechaza quitar tallas vinculadas a carritos o pedidos', async () => {
    tx.tallaProducto.findMany.mockResolvedValue([
      {
        id: 10,
        genero: 'M',
        colorId: 5,
        talla: '38',
        sku: 'NK-AF1-M-BK-38',
        _count: { itemsCarrito: 0, itemsPedido: 1 },
      },
    ]);

    await expect(service.actualizar(3, { tallas: [] })).rejects.toThrow(
      ConflictException,
    );
    expect(tx.tallaProducto.deleteMany).not.toHaveBeenCalled();
    expect(tx.producto.update).not.toHaveBeenCalled();
  });

  it('rechaza nombres de talla repetidos sin distinguir mayúsculas', async () => {
    await expect(
      service.actualizar(3, {
        tallas: [
          { genero: 'M', colorId: 5, talla: '38', stock: 4 },
          { genero: 'M', colorId: 5, talla: '38', stock: 2 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.producto.findUnique).not.toHaveBeenCalled();
  });

  it('sube las fotos juntas en una carpeta basada en el nombre del producto', async () => {
    const archivo = { buffer: Buffer.from('image') } as Express.Multer.File;
    vi.spyOn(service, 'buscarPorId').mockResolvedValue(productoConImagenes());
    cloudinary.subirImagen.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v2/SOHO/productos/nike-air-max-90-rojo/photo.jpg',
      publicId: 'SOHO/productos/nike-air-max-90-rojo/photo',
    });

    await service.subirImagenes(3, [archivo]);

    expect(cloudinary.subirImagen).toHaveBeenCalledWith(
      archivo,
      'SOHO/productos/nike-air-max-90-rojo',
    );
    expect(prisma.imagenProducto.createMany).toHaveBeenCalledWith({
      data: [
        {
          url: 'https://res.cloudinary.com/demo/image/upload/v2/SOHO/productos/nike-air-max-90-rojo/photo.jpg',
          publicId: 'SOHO/productos/nike-air-max-90-rojo/photo',
          productoId: 3,
        },
      ],
    });
  });

  it('rechaza subir más de diez imágenes por producto', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue(productoConImagenes(
      Array.from({ length: 9 }, (_, id) => ({ id, url: `https://example.test/${id}.jpg`, publicId: `foto-${id}` })),
    ));

    await expect(
      service.subirImagenes(3, [
        { buffer: Buffer.from('first') },
        { buffer: Buffer.from('second') },
      ] as Express.Multer.File[]),
    ).rejects.toThrow(
      new BadRequestException(
        'Este producto admite hasta 10 imágenes. Puedes agregar 1 más.',
      ),
    );

    expect(cloudinary.subirImagen).not.toHaveBeenCalled();
  });

  it('limpia las subidas completadas cuando falla una carga parcial', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue(productoConImagenes());
    cloudinary.subirImagen
      .mockResolvedValueOnce({
        url: 'https://example.test/image.jpg',
        publicId: 'SOHO/productos/nike/image',
      })
      .mockRejectedValueOnce(new Error('Cloudinary unavailable'));

    await expect(
      service.subirImagenes(3, [
        { buffer: Buffer.from('first') },
        { buffer: Buffer.from('second') },
      ] as Express.Multer.File[]),
    ).rejects.toThrow('Cloudinary unavailable');

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'SOHO/productos/nike/image',
    );
    expect(prisma.imagenProducto.createMany).not.toHaveBeenCalled();
  });

  it('limpia los archivos subidos si falla su persistencia en la base de datos', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue(productoConImagenes());
    cloudinary.subirImagen.mockResolvedValue({
      url: 'https://example.test/image.jpg',
      publicId: 'SOHO/productos/nike/image',
    });
    prisma.imagenProducto.createMany.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(
      service.subirImagenes(3, [
        { buffer: Buffer.from('first') },
      ] as Express.Multer.File[]),
    ).rejects.toThrow('Database unavailable');

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'SOHO/productos/nike/image',
    );
  });
});

describe('ProductosService actualizar stock de talla', () => {
  it.each([0, 8])('persiste stock no negativo válido %i', async (stock) => {
    const findUnique = vi.fn().mockResolvedValue({ id: 10, productoId: 3, stock });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new ProductosService(
      { tallaProducto: { findUnique, updateMany } } as unknown as PrismaService,
      {} as CloudinaryService,
    );
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      id: 3,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.actualizarStockTalla(3, 10, stock, 3),
    ).resolves.toEqual({ id: 10, productoId: 3, stock });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 10, productoId: 3, stock: 3 },
      data: { stock },
    });
  });

  it('rechaza una escritura de stock obsoleta y devuelve el valor actual', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 10, productoId: 3, stock: 3 })
      .mockResolvedValueOnce({ id: 10, productoId: 3, stock: 2 });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new ProductosService(
      { tallaProducto: { findUnique, updateMany } } as unknown as PrismaService,
      {} as CloudinaryService,
    );
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      id: 3,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.actualizarStockTalla(3, 10, 4, 3),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ stockActual: 2 }),
    });
  });
});

  describe('ProductosService búsqueda pública por id', () => {
    it('devuelve un producto activo con stock oculto', async () => {
      const producto = {
        id: 3,
        activo: true,
        tallas: [{ stock: 4 }, { stock: 0 }],
      };
      const findUnique = vi.fn().mockResolvedValue(producto);
      const service = new ProductosService(
        { producto: { findUnique } } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await expect(service.buscarPorIdPublico(3)).resolves.toEqual({
        id: 3,
        activo: true,
        tallas: [{ disponible: true }, { disponible: false }],
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 3 },
        include: expect.any(Object),
      });
    });

    it('no expone un producto inactivo', async () => {
      const findUnique = vi.fn().mockResolvedValue({ id: 3, activo: false });
      const service = new ProductosService(
        { producto: { findUnique } } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await expect(service.buscarPorIdPublico(3)).rejects.toThrow(
        'Producto con id 3 no encontrado',
      );
    });
  });

  describe('ProductosService variantes e inventario', () => {
    it('almacena una media talla legible y construye el SKU solo en el servidor', async () => {
      const tx = {
        marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
          categoria: { findUnique: vi.fn().mockResolvedValue({ id: 3 }) },
          color: { findUnique: vi.fn().mockResolvedValue({ codigo: 'BK' }) },
          producto: {
            create: vi.fn().mockResolvedValue({ id: 7, codigoModelo: 'AF1' }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 7 }),
          },
          tallaProducto: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        const prisma = {
          $transaction: vi.fn((callback) => callback(tx)),
        };
        const service = new ProductosService(
          prisma as unknown as PrismaService,
          {} as CloudinaryService,
        );

        await service.crear({
          nombre: 'Air Force 1',
          codigoModelo: 'AF1',
          precio: 100,
          marcaId: 2,
          categoriaId: 3,
          tallas: [{ genero: 'M', colorId: 5, talla: '42.5', stock: 4 }],
        });

        expect(tx.tallaProducto.create).toHaveBeenCalledWith({
          data: {
            genero: 'M',
            colorId: 5,
            talla: '42.5',
            tallaNumero: 42.5,
            stock: 4,
            sku: 'NK-AF1-M-BK-42P5',
            productoId: 7,
          },
        });
      });

      it.each(['42,5', '4.25', '-42', '4e1'])(
        'rechaza talla inválida %s al previsualizar un SKU',
        async (talla) => {
          const prisma = {
            marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
            color: { findUnique: vi.fn().mockResolvedValue({ codigo: 'BK' }) },
          };
          const service = new ProductosService(
            prisma as unknown as PrismaService,
            {} as CloudinaryService,
          );

          await expect(
            service.previsualizarSku({
              marcaId: 2,
              codigoModelo: 'AF1',
              genero: 'M',
              colorId: 5,
              talla,
            }),
          ).rejects.toThrow(BadRequestException);
        },
      );

      it.each([
        ['42.0', '42'], ['06', '6'], ['06.0', '6'], ['6', '6'],
        ['06.5', '6P5'], ['3.5', '3P5'], ['35', '35'],
      ])('previsualiza la talla %s con el sufijo %s', async (talla, sufijo) => {
        const service = new ProductosService(
          {
            marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
            color: { findUnique: vi.fn().mockResolvedValue({ codigo: 'BK' }) },
          } as unknown as PrismaService,
          {} as CloudinaryService,
        );

        await expect(
          service.previsualizarSku({
            marcaId: 2,
            codigoModelo: 'AF1',
            genero: 'M',
            colorId: 5,
            talla,
          }),
        ).resolves.toEqual({ sku: `NK-AF1-M-BK-${sufijo}` });
      });

      it('aplica filtros de producto activo a todas las consultas de métricas de inventario', async () => {
        const whereContainsActiveProduct = { producto: { activo: true } };
        const findMany = vi.fn().mockResolvedValue([]);
        const aggregate = vi.fn().mockResolvedValue({ _sum: { stock: 0 } });
        const countVariante = vi.fn().mockResolvedValue(0);
        const countProduct = vi.fn().mockResolvedValue(0);
        const service = new ProductosService(
          {
            tallaProducto: {
              aggregate,
              count: countVariante,
              findMany,
            },
            producto: { count: countProduct },
          } as unknown as PrismaService,
          {} as CloudinaryService,
        );

        await service.resumenInventarioActivo();

        expect(aggregate).toHaveBeenCalledWith({
          where: whereContainsActiveProduct,
          _sum: { stock: true },
        });
        expect(countProduct).toHaveBeenCalledWith({ where: { activo: true } });
        expect(countVariante).toHaveBeenCalledTimes(4);
        for (const [arguments_] of countVariante.mock.calls) {
          expect(arguments_.where.producto.activo).toBe(true);
        }
        expect(findMany.mock.calls[0][0].where.producto.activo).toBe(true);
      });

      it('filters products and returned variants by the selected gender and color', async () => {
        const findMany = vi.fn().mockResolvedValue([]);
        const count = vi.fn().mockResolvedValue(0);
        const service = new ProductosService(
          { producto: { findMany, count } } as unknown as PrismaService,
          {} as CloudinaryService,
        );

        await service.buscarTodos({
          genero: 'W',
          colorId: 9,
          pagina: 1,
          limite: 12,
        });

        expect(findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              activo: true,
              tallas: { some: { genero: 'W', colorId: 9 } },
            },
            include: expect.objectContaining({
              tallas: expect.objectContaining({
                where: { genero: 'W', colorId: 9 },
              }),
            }),
          }),
        );
        expect(count).toHaveBeenCalledWith({
          where: {
            activo: true,
            tallas: { some: { genero: 'W', colorId: 9 } },
          },
        });
      });

      it('returns a clear conflict when the generated SKU violates a unique constraint', async () => {
        const duplicateSku = new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          { code: 'P2002', clientVersion: 'test' },
        );
        const tx = {
          marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
          categoria: { findUnique: vi.fn().mockResolvedValue({ id: 3 }) },
          color: { findUnique: vi.fn().mockResolvedValue({ codigo: 'BK' }) },
          producto: {
            create: vi.fn().mockResolvedValue({ id: 7, codigoModelo: 'AF1' }),
          },
          tallaProducto: { create: vi.fn().mockRejectedValue(duplicateSku) },
        };
        const service = new ProductosService(
          {
            $transaction: vi.fn((callback) => callback(tx)),
          } as unknown as PrismaService,
          {} as CloudinaryService,
        );

        await expect(
          service.crear({
            nombre: 'Air Force 1',
            codigoModelo: 'AF1',
            precio: 100,
            marcaId: 2,
            categoriaId: 3,
            tallas: [{ genero: 'M', colorId: 5, talla: '42', stock: 4 }],
          }),
        ).rejects.toThrow(
          'La variante o su SKU ya existe; revisa la combinación de producto, género, color y talla',
        );
      });

      it('paginates only active product variants in the dedicated low-stock range', async () => {
        const variante = {
          id: 12,
          genero: 'W',
          talla: '38',
          stock: 3,
          sku: 'NK-AF1-W-WH-38',
          color: { id: 4, nombre: 'Blanco', codigo: 'WH' },
          producto: {
            id: 7,
            nombre: 'Air Force 1',
            marca: { nombre: 'Nike' },
            imagenes: [{ url: 'https://example.test/shoe.png' }],
          },
        };
        const findMany = vi.fn().mockResolvedValue([variante]);
        const count = vi.fn().mockResolvedValue(21);
        const service = new ProductosService(
          { tallaProducto: { findMany, count } } as unknown as PrismaService,
          {} as CloudinaryService,
        );

        await expect(
          service.buscarVariantesInventario({
            estado: 'bajo',
            busqueda: 'Air',
            pagina: 2,
            limite: 10,
          }),
        ).resolves.toEqual({
          datos: [
            {
              id: 12,
              genero: 'W',
              talla: '38',
              stock: 3,
              sku: 'NK-AF1-W-WH-38',
              color: { id: 4, nombre: 'Blanco', codigo: 'WH' },
              producto: {
                id: 7,
                nombre: 'Air Force 1',
                marca: 'Nike',
                imagen: 'https://example.test/shoe.png',
              },
            },
          ],
          meta: { total: 21, pagina: 2, limite: 10, totalPaginas: 3 },
        });

        const expectedWhere = {
          producto: { activo: true },
          stock: { gte: 1, lte: 5 },
          OR: [
            { sku: { contains: 'Air' } },
            { talla: { contains: 'Air' } },
            { producto: { nombre: { contains: 'Air' }, activo: true } },
            { color: { nombre: { contains: 'Air' } } },
            { color: { codigo: { contains: 'Air' } } },
          ],
        };
        expect(findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expectedWhere,
            skip: 10,
            take: 10,
          }),
        );
        expect(count).toHaveBeenCalledWith({ where: expectedWhere });
      });
    });

  describe('ProductosService validación de categorías', () => {
    it('crear lanza NotFoundException si la categoriaId no existe', async () => {
      const tx = {
        marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
        categoria: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      const service = new ProductosService(
        {
          $transaction: vi.fn((callback) => callback(tx)),
        } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await expect(
        service.crear({
          nombre: 'Air Force 1',
          codigoModelo: 'AF1',
          precio: 100,
          marcaId: 2,
          categoriaId: 999,
          tallas: [],
        }),
      ).rejects.toThrow('Categoría con id 999 no encontrada');
    });

    it('actualizar lanza NotFoundException si la nueva categoriaId no existe', async () => {
      const tx = {
        producto: {
          findUnique: vi.fn().mockResolvedValue({
            id: 3,
            marcaId: 2,
            codigoModelo: 'AF1',
          }),
        },
        tallaProducto: { findMany: vi.fn().mockResolvedValue([]) },
        marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
        categoria: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      const service = new ProductosService(
        {
          $transaction: vi.fn((callback) => callback(tx)),
        } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await expect(
        service.actualizar(3, {
          categoriaId: 999,
        }),
      ).rejects.toThrow('Categoría con id 999 no encontrada');
    });

    it('maneja error de clave foránea P2003 de Prisma para categoriaId', async () => {
      const fkError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: 'test',
          meta: { field_name: 'categoriaId' },
        },
      );
      const tx = {
        marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
        categoria: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
        producto: { create: vi.fn().mockRejectedValue(fkError) },
      };
      const service = new ProductosService(
        {
          $transaction: vi.fn((callback) => callback(tx)),
        } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await expect(
        service.crear({
          nombre: 'Air Force 1',
          codigoModelo: 'AF1',
          precio: 100,
          marcaId: 2,
          categoriaId: 1,
          tallas: [],
        }),
      ).rejects.toThrow('Categoría no encontrada');
    });
  });
