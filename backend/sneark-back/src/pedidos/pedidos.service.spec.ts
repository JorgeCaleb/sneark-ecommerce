import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CarritoService } from '../carrito/carrito.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PedidosService } from './pedidos.service.js';

describe('PedidosService ownership lookup', () => {
  let service: PedidosService;
  let findFirst: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findFirst = vi.fn();
    service = new PedidosService(
      { pedido: { findFirst } } as unknown as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );
  });

  it('returns the order when it belongs to the requesting user', async () => {
    const order = { id: 12, usuarioId: 7 };
    findFirst.mockResolvedValue(order);

    await expect(service.buscarPorUsuario(12, 7)).resolves.toBe(order);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 12, usuarioId: 7 },
      include: expect.any(Object),
    });
  });

  it('does not return an order owned by another user', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.buscarPorUsuario(12, 9)).rejects.toThrow(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 12, usuarioId: 9 },
      include: expect.any(Object),
    });
  });
});

describe('PedidosService order creation inventory reservation', () => {
  const item = {
    tallaProductoId: 21,
    cantidad: 2,
    subtotal: 200,
    tallaProducto: {
      talla: '42',
      producto: { nombre: 'Sneark One', precio: 100 },
    },
  };

  let service: PedidosService;
  let actualizarStock: ReturnType<typeof vi.fn>;
  let crearPedido: ReturnType<typeof vi.fn>;
  let vaciarCarrito: ReturnType<typeof vi.fn>;
  let carritoService: { obtener: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    actualizarStock = vi.fn();
    crearPedido = vi.fn().mockResolvedValue({ id: 35 });
    vaciarCarrito = vi.fn().mockResolvedValue({ count: 1 });
    carritoService = {
      obtener: vi.fn().mockResolvedValue({
        id: 9,
        total: 200,
        items: [item],
      }),
    };
    const tx = {
      tallaProducto: { updateMany: actualizarStock },
      pedido: { create: crearPedido },
      itemCarrito: { deleteMany: vaciarCarrito },
    };
    const prisma = {
      $transaction: vi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    service = new PedidosService(
      prisma as unknown as PrismaService,
      {} as CloudinaryService,
      carritoService as unknown as CarritoService,
    );
  });

  it('conditionally reserves stock before creating the order', async () => {
    actualizarStock.mockResolvedValue({ count: 1 });

    await expect(
      service.crear(7, {
        metodoPago: 'YAPE',
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).resolves.toEqual({ id: 35 });

    expect(actualizarStock).toHaveBeenCalledWith({
      where: { id: 21, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(vaciarCarrito).toHaveBeenCalledWith({ where: { carritoId: 9 } });
    expect(vaciarCarrito.mock.invocationCallOrder[0]).toBeLessThan(
      actualizarStock.mock.invocationCallOrder[0],
    );
    expect(crearPedido).toHaveBeenCalledOnce();
  });

  it('rejects a concurrent request that can no longer consume the cart', async () => {
    vaciarCarrito.mockResolvedValue({ count: 0 });

    await expect(
      service.crear(7, {
        metodoPago: 'YAPE',
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('El carrito cambió durante la compra');

    expect(actualizarStock).not.toHaveBeenCalled();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('aborts the transaction if a later size has insufficient stock', async () => {
    carritoService.obtener.mockResolvedValue({
      id: 9,
      total: 400,
      items: [
        item,
        {
          ...item,
          tallaProductoId: 22,
          tallaProducto: {
            talla: '43',
            producto: { nombre: 'Sneark One', precio: 100 },
          },
        },
      ],
    });
    vaciarCarrito.mockResolvedValue({ count: 2 });
    actualizarStock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.crear(7, {
        metodoPago: 'YAPE',
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('Stock insuficiente para "Sneark One" talla 43');

    expect(actualizarStock).toHaveBeenCalledTimes(2);
    expect(crearPedido).not.toHaveBeenCalled();
    expect(vaciarCarrito).toHaveBeenCalledOnce();
  });
});

describe('PedidosService receipt replacement conflicts', () => {
  it('removes the uploaded receipt when the order changes during upload', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      pedido: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((callback) =>
        callback({
          pedido: { updateMany, findUniqueOrThrow: vi.fn() },
        }),
      ),
    };
    const cloudinary = {
      subirImagen: vi.fn().mockResolvedValue({
        url: 'https://example.test/receipt.png',
        publicId: 'sneark/comprobantes/42/receipt',
      }),
      eliminarImagen: vi.fn().mockResolvedValue(undefined),
    };
    const service = new PedidosService(
      prisma as unknown as PrismaService,
      cloudinary as unknown as CloudinaryService,
      {} as CarritoService,
    );
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      id: 42,
      estado: 'PENDIENTE',
      usuario: { id: 7 },
      comprobante: null,
      comprobantePublicId: null,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.subirComprobante(
        7,
        42,
        { buffer: Buffer.from('receipt') } as Express.Multer.File,
        { numeroOperacion: ' OP-1 ' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: 'PENDIENTE',
          comprobantePublicId: null,
        }),
        data: expect.objectContaining({ numeroOperacion: 'OP-1' }),
      }),
    );
    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'sneark/comprobantes/42/receipt',
    );
  });
});

describe('PedidosService admin pagination', () => {
  it('filters, orders and paginates pedidos while returning total metadata', async () => {
    const pedidos = [{ id: 8 }, { id: 7 }];
    const findMany = vi.fn().mockResolvedValue(pedidos);
    const count = vi.fn().mockResolvedValue(42);
    const service = new PedidosService(
      { pedido: { findMany, count } } as unknown as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );

    await expect(
      service.buscarPagina({
        estado: 'PENDIENTE',
        pagina: 2,
        limite: 20,
      }),
    ).resolves.toEqual({
      datos: pedidos,
      meta: { total: 42, pagina: 2, limite: 20, totalPaginas: 3 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: 'PENDIENTE' },
        skip: 20,
        take: 20,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { estado: 'PENDIENTE' } });
  });
});

describe('PedidosService dashboard summary', () => {
  it('aggregates sales and top products in the backend, with only five recent orders', async () => {
    const recientes = [{ id: 3 }];
    const findMany = vi.fn().mockResolvedValue(recientes);
    const count = vi.fn().mockResolvedValue(74);
    const aggregate = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { total: { toString: () => '820.50' } } })
      .mockResolvedValueOnce({ _sum: { total: { toString: () => '400.00' } } });
    const queryRaw = vi.fn((query: Prisma.Sql) =>
      query.sql.includes('DATE_FORMAT')
        ? Promise.resolve([
            { fecha: '2026-10-06', total: { toString: () => '820.50' } },
          ])
        : Promise.resolve([{ productoId: 8, cantidad: 12n }]),
    );
    const productoFindMany = vi.fn().mockResolvedValue([
      {
        id: 8,
        nombre: 'Sneaker',
        precio: { toString: () => '250.00' },
        marca: { nombre: 'SNEARK' },
        imagenes: [{ url: 'https://example.test/shoe.jpg' }],
      },
    ]);
    const service = new PedidosService(
      {
        pedido: { findMany, count, aggregate },
        producto: { findMany: productoFindMany },
        $queryRaw: queryRaw,
      } as unknown as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );

    const resultado = await service.obtenerResumenDashboard({
      inicioAnterior: '2026-08-07T05:00:00.000Z',
      inicioActual: '2026-09-06T05:00:00.000Z',
      finActual: '2026-10-06T05:00:00.000Z',
      desfaseZonaHoraria: -300,
    });

    expect(resultado).toEqual({
      totalPedidos: 74,
      pedidosRecientes: recientes,
      totalVentasPeriodo: 820.5,
      ventasPeriodoAnterior: 400,
      ventasDiarias: [{ fecha: '2026-10-06', total: 820.5 }],
      productosMasVendidos: [
        {
          id: 8,
          nombre: 'Sneaker',
          marca: 'SNEARK',
          imagen: 'https://example.test/shoe.jpg',
          precio: 250,
          cantidad: 12,
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(count).toHaveBeenCalledOnce();
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid or excessively wide dashboard date intervals', async () => {
    const service = new PedidosService(
      {} as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );

    await expect(
      service.obtenerResumenDashboard({
        inicioAnterior: '2026-01-01T00:00:00.000Z',
        inicioActual: '2026-01-01T00:00:00.000Z',
        finActual: '2026-03-15T00:00:00.000Z',
        desfaseZonaHoraria: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unbounded previous-period range', async () => {
    const service = new PedidosService(
      {} as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );

    await expect(
      service.obtenerResumenDashboard({
        inicioAnterior: '2020-01-01T00:00:00.000Z',
        inicioActual: '2026-09-06T05:00:00.000Z',
        finActual: '2026-10-06T05:00:00.000Z',
        desfaseZonaHoraria: -300,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
