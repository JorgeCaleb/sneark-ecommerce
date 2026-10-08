import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import { CarritoService } from '../carrito/carrito.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetodoPagoDto } from './dto/crear-pedido.dto.js';
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
    id: 14,
    tallaProductoId: 21,
    cantidad: 2,
    subtotal: 200,
    tallaProducto: {
      genero: 'M',
      sku: 'SN-ONE-M-BK-42',
      color: { nombre: 'Negro', codigo: 'BK' },
      talla: '42',
      producto: { id: 13, nombre: 'Sneark One', precio: 100, activo: true },
    },
  };

  let service: PedidosService;
  let actualizarStock: ReturnType<typeof vi.fn>;
  let crearPedido: ReturnType<typeof vi.fn>;
  let vaciarCarrito: ReturnType<typeof vi.fn>;
  let contarArticulosRestantes: ReturnType<typeof vi.fn>;
  let carritoService: { obtenerEnTransaccion: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    actualizarStock = vi.fn();
    crearPedido = vi.fn().mockResolvedValue({ id: 35 });
    vaciarCarrito = vi.fn().mockResolvedValue({ count: 1 });
    contarArticulosRestantes = vi.fn().mockResolvedValue(0);
    carritoService = {
      obtenerEnTransaccion: vi.fn().mockResolvedValue({
        id: 9,
        total: 200,
        items: [item],
      }),
    };
    const tx = {
      tallaProducto: { updateMany: actualizarStock },
      producto: { findMany: vi.fn().mockResolvedValue([]) },
      pedido: { create: crearPedido },
      itemCarrito: {
        deleteMany: vaciarCarrito,
        count: contarArticulosRestantes,
      },
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

  it('reports serialization conflicts as a retryable checkout error', async () => {
    const transaction = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    const service = new PedidosService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );

    await expect(
      service.crear(7, {
        metodoPago: MetodoPagoDto.YAPE,
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('conditionally reserves stock before creating the order', async () => {
    actualizarStock.mockResolvedValue({ count: 1 });

    await expect(
      service.crear(7, {
        metodoPago: MetodoPagoDto.YAPE,
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).resolves.toEqual({ id: 35 });

    expect(actualizarStock).toHaveBeenCalledWith({
      where: { id: 21, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(vaciarCarrito).toHaveBeenCalledWith({
      where: {
        carritoId: 9,
        OR: [{ id: 14, cantidad: 2 }],
      },
    });
    expect(contarArticulosRestantes).toHaveBeenCalledWith({
      where: { carritoId: 9 },
    });
    expect(vaciarCarrito.mock.invocationCallOrder[0]).toBeLessThan(
      actualizarStock.mock.invocationCallOrder[0],
    );
    expect(crearPedido).toHaveBeenCalledOnce();
    expect(crearPedido.mock.calls[0][0].data.items.create).toEqual([
      {
        tallaProductoId: 21,
        nombreProducto: 'Sneark One',
        genero: 'M',
        nombreColor: 'Negro',
        codigoColor: 'BK',
        sku: 'SN-ONE-M-BK-42',
        talla: '42',
        cantidad: 2,
        precio: 100,
        subtotal: 200,
      },
    ]);
  });

  it('rejects a concurrent request that can no longer consume the cart', async () => {
    vaciarCarrito.mockResolvedValue({ count: 0 });

    await expect(
      service.crear(7, {
        metodoPago: MetodoPagoDto.YAPE,
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('El carrito cambió durante la compra');

    expect(actualizarStock).not.toHaveBeenCalled();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('rejects checkout if another item remains after consuming the snapshot', async () => {
    actualizarStock.mockResolvedValue({ count: 1 });
    contarArticulosRestantes.mockResolvedValue(1);

    await expect(
      service.crear(7, {
        metodoPago: MetodoPagoDto.YAPE,
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('El carrito cambió durante la compra');

    expect(actualizarStock).not.toHaveBeenCalled();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('rejects disabled products inside the transaction without consuming the cart or stock', async () => {
    const productosInactivos = [{ nombre: 'Sneark One' }];
    const encontrarInactivos = vi.fn().mockResolvedValue(productosInactivos);
    const carritoConsumido = vi.fn();
    const reservarStock = vi.fn();
    const crearPedido = vi.fn();
    const tx = {
      producto: { findMany: encontrarInactivos },
      itemCarrito: {
        deleteMany: carritoConsumido,
        count: vi.fn().mockResolvedValue(0),
      },
      tallaProducto: { updateMany: reservarStock },
      pedido: { create: crearPedido },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const carritoService = {
      obtenerEnTransaccion: vi.fn().mockResolvedValue({
        id: 9,
        total: 200,
        items: [item],
      }),
    };
    const service = new PedidosService(
      prisma as unknown as PrismaService,
      {} as CloudinaryService,
      carritoService as unknown as CarritoService,
    );

    await expect(
      service.crear(7, {
        metodoPago: MetodoPagoDto.YAPE,
        telefono: '999999999',
        ciudad: 'Lima',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('Productos no disponibles: "Sneark One"');

    expect(encontrarInactivos).toHaveBeenCalledWith({
      where: { id: { in: [13] }, activo: false },
      select: { nombre: true },
    });
    expect(carritoConsumido).not.toHaveBeenCalled();
    expect(reservarStock).not.toHaveBeenCalled();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('aborts the transaction if a later size has insufficient stock', async () => {
    carritoService.obtenerEnTransaccion.mockResolvedValue({
      id: 9,
      total: 400,
      items: [
        item,
        {
          ...item,
          id: 15,
          tallaProductoId: 22,
          tallaProducto: {
            talla: '43',
            producto: {
              id: 13,
              nombre: 'Sneark One',
              precio: 100,
              activo: true,
            },
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
        metodoPago: MetodoPagoDto.YAPE,
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

describe('PedidosService admin order state transitions', () => {
  const order = {
    id: 42,
    usuarioId: 7,
    estado: EstadoPedido.PENDIENTE,
    items: [{ tallaProductoId: 21, cantidad: 2 }],
  };

  let service: PedidosService;
  let updateMany: ReturnType<typeof vi.fn>;
  let updateStock: ReturnType<typeof vi.fn>;
  let findUniqueOrThrow: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateMany = vi.fn().mockResolvedValue({ count: 1 });
    updateStock = vi.fn().mockResolvedValue({});
    findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ ...order, estado: EstadoPedido.CANCELADO });
    const tx = {
      pedido: { updateMany, findUniqueOrThrow },
      tallaProducto: { update: updateStock },
    };
    transaction = vi.fn((callback) => callback(tx));
    service = new PedidosService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );
    vi.spyOn(service, 'buscarPorId').mockResolvedValue(
      order as Awaited<ReturnType<typeof service.buscarPorId>>,
    );
  });

  it('cancels an eligible order and restores stock after claiming the state transition', async () => {
    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.CANCELADO }),
    ).resolves.toEqual({ ...order, estado: EstadoPedido.CANCELADO });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 42, estado: EstadoPedido.PENDIENTE },
      data: { estado: EstadoPedido.CANCELADO },
    });
    expect(updateStock).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { stock: { increment: 2 } },
    });
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      updateStock.mock.invocationCallOrder[0],
    );
  });

  it('treats a request for the current state as idempotent', async () => {
    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.PENDIENTE }),
    ).resolves.toBe(order);

    expect(transaction).not.toHaveBeenCalled();
    expect(updateStock).not.toHaveBeenCalled();
  });

  it('does not restore stock when an already-cancelled state is requested again', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      ...order,
      estado: EstadoPedido.CANCELADO,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.CANCELADO }),
    ).resolves.toMatchObject({ estado: EstadoPedido.CANCELADO });

    expect(transaction).not.toHaveBeenCalled();
    expect(updateStock).not.toHaveBeenCalled();
  });

  it('does not reactivate a cancelled order', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      ...order,
      estado: EstadoPedido.CANCELADO,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.PENDIENTE }),
    ).rejects.toThrow('Un pedido cancelado no se puede reactivar');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not change stock for other administrative state transitions', async () => {
    findUniqueOrThrow.mockResolvedValue({
      ...order,
      estado: EstadoPedido.EN_PREPARACION,
    });

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.EN_PREPARACION }),
    ).resolves.toMatchObject({ estado: EstadoPedido.EN_PREPARACION });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 42, estado: EstadoPedido.PENDIENTE },
      data: { estado: EstadoPedido.EN_PREPARACION },
    });
    expect(updateStock).not.toHaveBeenCalled();
  });

  it('does not cancel an order outside the allowed states', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      ...order,
      estado: EstadoPedido.EN_PREPARACION,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.CANCELADO }),
    ).rejects.toThrow(
      'No se puede cancelar un pedido en estado EN_PREPARACION',
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not restore stock if another request already changed the state', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.CANCELADO }),
    ).rejects.toThrow('El pedido cambió durante la actualización');

    expect(updateStock).not.toHaveBeenCalled();
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('returns the current order when a concurrent request already applied the requested state', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    vi.spyOn(service, 'buscarPorId')
      .mockReset()
      .mockResolvedValueOnce(
        order as Awaited<ReturnType<typeof service.buscarPorId>>,
      )
      .mockResolvedValueOnce({
        ...order,
        estado: EstadoPedido.CANCELADO,
      } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.CANCELADO }),
    ).resolves.toMatchObject({ estado: EstadoPedido.CANCELADO });

    expect(updateStock).not.toHaveBeenCalled();
  });

  it('aborts the state transition if restoring stock fails', async () => {
    updateStock.mockRejectedValue(new Error('Inventory update failed'));

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.CANCELADO }),
    ).rejects.toThrow('Inventory update failed');

    expect(updateMany).toHaveBeenCalledOnce();
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('PedidosService customer order cancellation', () => {
  const order = {
    id: 42,
    usuarioId: 7,
    estado: EstadoPedido.PAGO_VERIFICADO,
    usuario: { id: 7 },
    items: [{ tallaProductoId: 21, cantidad: 2 }],
  };

  let service: PedidosService;
  let updateMany: ReturnType<typeof vi.fn>;
  let updateStock: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateMany = vi.fn().mockResolvedValue({ count: 1 });
    updateStock = vi.fn().mockResolvedValue({});
    const tx = {
      pedido: { updateMany },
      tallaProducto: { update: updateStock },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    transaction = prisma.$transaction;
    service = new PedidosService(
      prisma as unknown as PrismaService,
      {} as CloudinaryService,
      {} as CarritoService,
    );
    vi.spyOn(service, 'buscarPorId')
      .mockResolvedValueOnce(
        order as Awaited<ReturnType<typeof service.buscarPorId>>,
      )
      .mockResolvedValueOnce({
        ...order,
        estado: EstadoPedido.CANCELADO,
      } as Awaited<ReturnType<typeof service.buscarPorId>>);
  });

  it('conditionally changes the order state before restoring stock', async () => {
    await expect(service.cancelar(7, 42)).resolves.toMatchObject({
      estado: EstadoPedido.CANCELADO,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 42,
        usuarioId: 7,
        estado: {
          in: [EstadoPedido.PENDIENTE, EstadoPedido.PAGO_VERIFICADO],
        },
      },
      data: { estado: EstadoPedido.CANCELADO },
    });
    expect(updateStock).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { stock: { increment: 2 } },
    });
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      updateStock.mock.invocationCallOrder[0],
    );
  });

  it('does not restore stock when a concurrent cancellation already won', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancelar(7, 42)).rejects.toThrow(
      'El pedido cambió durante la cancelación',
    );

    expect(updateStock).not.toHaveBeenCalled();
  });

  it('rejects customer cancellation from a non-cancellable state', async () => {
    vi.spyOn(service, 'buscarPorId')
      .mockReset()
      .mockResolvedValue({
        ...order,
        estado: EstadoPedido.EN_PREPARACION,
      } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(service.cancelar(7, 42)).rejects.toThrow(
      'No se puede cancelar un pedido en estado EN_PREPARACION',
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(updateStock).not.toHaveBeenCalled();
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

describe('PedidosService missing receipt file', () => {
  it('returns a client error before looking up the order or uploading to Cloudinary', async () => {
    const buscarPorId = vi.fn();
    const subirImagen = vi.fn();
    const service = new PedidosService(
      { pedido: { findFirst: buscarPorId } } as unknown as PrismaService,
      { subirImagen } as unknown as CloudinaryService,
      {} as CarritoService,
    );
    const lookup = vi.spyOn(service, 'buscarPorId');

    await expect(
      service.subirComprobante(7, 42, undefined, {
        numeroOperacion: undefined,
      }),
    ).rejects.toThrow('Debes adjuntar el archivo del comprobante');

    expect(lookup).not.toHaveBeenCalled();
    expect(subirImagen).not.toHaveBeenCalled();
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
