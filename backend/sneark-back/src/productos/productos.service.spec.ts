import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductosService } from './productos.service.js';

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
        stock: 4,
        sku: 'NK-AF1-M-BK-38',
      },
    });
    expect(tx.tallaProducto.create).toHaveBeenCalledWith({
      data: {
        genero: 'M',
        colorId: 5,
        talla: '39',
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
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      id: 3,
      nombre: 'Nike Air Max 90 Rojo',
    } as Awaited<ReturnType<typeof service.buscarPorId>>);
    cloudinary.subirImagen.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v2/sneark/productos/nike-air-max-90-rojo/photo.jpg',
      publicId: 'sneark/productos/nike-air-max-90-rojo/photo',
    });

    await service.subirImagenes(3, [archivo]);

    expect(cloudinary.subirImagen).toHaveBeenCalledWith(
      archivo,
      'sneark/productos/nike-air-max-90-rojo',
    );
    expect(prisma.imagenProducto.createMany).toHaveBeenCalledWith({
      data: [
        {
          url: 'https://res.cloudinary.com/demo/image/upload/v2/sneark/productos/nike-air-max-90-rojo/photo.jpg',
          publicId: 'sneark/productos/nike-air-max-90-rojo/photo',
          productoId: 3,
        },
      ],
    });
  });

  it('limpia las subidas completadas cuando falla una carga parcial', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      id: 3,
      nombre: 'Nike Air Max 90 Rojo',
    } as Awaited<ReturnType<typeof service.buscarPorId>>);
    cloudinary.subirImagen
      .mockResolvedValueOnce({
        url: 'https://example.test/image.jpg',
        publicId: 'sneark/productos/nike/image',
      })
      .mockRejectedValueOnce(new Error('Cloudinary unavailable'));

    await expect(
      service.subirImagenes(3, [
        { buffer: Buffer.from('first') },
        { buffer: Buffer.from('second') },
      ] as Express.Multer.File[]),
    ).rejects.toThrow('Cloudinary unavailable');

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'sneark/productos/nike/image',
    );
    expect(prisma.imagenProducto.createMany).not.toHaveBeenCalled();
  });

  it('limpia los archivos subidos si falla su persistencia en la base de datos', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      id: 3,
      nombre: 'Nike Air Max 90 Rojo',
    } as Awaited<ReturnType<typeof service.buscarPorId>>);
    cloudinary.subirImagen.mockResolvedValue({
      url: 'https://example.test/image.jpg',
      publicId: 'sneark/productos/nike/image',
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
      'sneark/productos/nike/image',
    );
  });
});

describe('ProductosService actualizar stock de talla', () => {
  it.each([-1, 1.5])(
    'rejects invalid stock %p before accessing the database',
    async (stock) => {
      const findFirst = vi.fn();
      const update = vi.fn();
      const service = new ProductosService(
        { tallaProducto: { findFirst, update } } as unknown as PrismaService,
        {} as CloudinaryService,
      );
      vi.spyOn(service, 'buscarPorId').mockResolvedValue({
        id: 3,
      } as Awaited<ReturnType<typeof service.buscarPorId>>);

      await expect(service.actualizarStockTalla(3, 10, stock)).rejects.toThrow(
        BadRequestException,
      );

      expect(findFirst).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each([0, 8])('persists valid non-negative stock %i', async (stock) => {
    const findFirst = vi.fn().mockResolvedValue({ id: 10 });
    const update = vi.fn().mockResolvedValue({ id: 10, stock });
    const service = new ProductosService(
      { tallaProducto: { findFirst, update } } as unknown as PrismaService,
      {} as CloudinaryService,
    );
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      id: 3,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(service.actualizarStockTalla(3, 10, stock)).resolves.toEqual({
      id: 10,
      stock,
    });
  });

  describe('ProductosService búsqueda pública por id', () => {
    it('returns an active product', async () => {
      const producto = { id: 3, activo: true };
      const findFirst = vi.fn().mockResolvedValue(producto);
      const service = new ProductosService(
        { producto: { findFirst } } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await expect(service.buscarPorIdPublico(3)).resolves.toBe(producto);
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 3, activo: true },
        include: expect.any(Object),
      });
    });

    describe('ProductosService variants and inventory', () => {
      it('stores a readable half-size and builds the SKU only on the server', async () => {
        const tx = {
          marca: { findUnique: vi.fn().mockResolvedValue({ codigo: 'NK' }) },
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
            stock: 4,
            sku: 'NK-AF1-M-BK-425',
            productoId: 7,
          },
        });
      });

      it.each(['42,5', '4.25', '-42', '4e1'])(
        'rejects invalid size %s when previewing a SKU',
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

      it('normalizes whole sizes ending in .0 for the generated SKU', async () => {
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
            talla: '42.0',
          }),
        ).resolves.toEqual({ sku: 'NK-AF1-M-BK-42' });
      });

      it('applies active-product filters to every inventory metric query', async () => {
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

    it('does not expose an inactive product', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const service = new ProductosService(
        { producto: { findFirst } } as unknown as PrismaService,
        {} as CloudinaryService,
      );

      await expect(service.buscarPorIdPublico(3)).rejects.toThrow(
        'Producto con id 3 no encontrado',
      );
    });
  });
});
