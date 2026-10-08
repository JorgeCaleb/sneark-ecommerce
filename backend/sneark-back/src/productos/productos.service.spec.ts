import { BadRequestException } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductosService } from './productos.service.js';

describe('ProductosService actualizar tallas', () => {
  let service: ProductosService;
  let tx: {
    producto: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
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
        findUnique: vi.fn().mockResolvedValue({ id: 3 }),
        update: vi.fn().mockResolvedValue({ id: 3 }),
      },
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
        talla: '38',
        _count: { itemsCarrito: 0, itemsPedido: 0 },
      },
    ]);

    await service.actualizar(3, {
      tallas: [
        { talla: '38', stock: 4 },
        { talla: '39', stock: 2 },
      ],
    });

    expect(tx.tallaProducto.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { stock: 4 },
    });
    expect(tx.tallaProducto.create).toHaveBeenCalledWith({
      data: { talla: '39', stock: 2, productoId: 3 },
    });
    expect(tx.producto.update).toHaveBeenCalled();
  });

  it('elimina tallas omitidas cuando no tienen referencias', async () => {
    tx.tallaProducto.findMany.mockResolvedValue([
      {
        id: 10,
        talla: '38',
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
        talla: '38',
        _count: { itemsCarrito: 0, itemsPedido: 1 },
      },
    ]);

    await expect(service.actualizar(3, { tallas: [] })).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.tallaProducto.deleteMany).not.toHaveBeenCalled();
    expect(tx.producto.update).not.toHaveBeenCalled();
  });

  it('rechaza nombres de talla repetidos sin distinguir mayúsculas', async () => {
    await expect(
      service.actualizar(3, {
        tallas: [
          { talla: ' 38 ', stock: 4 },
          { talla: '38', stock: 2 },
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
