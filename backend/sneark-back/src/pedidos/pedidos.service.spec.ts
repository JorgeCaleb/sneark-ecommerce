import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import { CarritoService } from '../carrito/carrito.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PedidosService } from './pedidos.service.js';

describe('PedidosService búsqueda por propietario', () => {
  let service: PedidosService;
  let findFirst: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findFirst = vi.fn();
    service = new PedidosService(
      { pedido: { findFirst } } as unknown as PrismaService,
      {} as CarritoService,
    );
  });

  it('devuelve el pedido cuando pertenece al usuario que lo solicita', async () => {
    const order = { id: 12, usuarioId: 7 };
    findFirst.mockResolvedValue(order);

    await expect(service.buscarPorUsuario(12, 7)).resolves.toBe(order);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 12, usuarioId: 7 },
      include: expect.any(Object),
    });
  });

  it('no devuelve un pedido que pertenece a otro usuario', async () => {
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

describe('PedidosService reserva de inventario al crear', () => {
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
      producto: { id: 13, nombre: 'SOHO One', precio: 100, activo: true },
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
      pedido: {
        create: crearPedido,
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
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
      carritoService as unknown as CarritoService,
    );
  });

  it('reporta conflictos de serialización como error de checkout reintentable', async () => {
    const transaction = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    const service = new PedidosService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as CarritoService,
    );

    await expect(
      service.crear(7, {
        telefono: '999999999',
        distrito: 'La Esperanza',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('reserva el stock condicionalmente antes de crear el pedido', async () => {
    actualizarStock.mockResolvedValue({ count: 1 });

    await expect(
      service.crear(7, {
        telefono: '999999999',
        distrito: 'La Esperanza',
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
    expect(crearPedido.mock.calls[0][0].data.metodoPago).toBe('MERCADOPAGO');
    expect(crearPedido.mock.calls[0][0].data.items.create).toEqual([
      {
        tallaProductoId: 21,
        nombreProducto: 'SOHO One',
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

  it('rechaza una solicitud concurrente que ya no puede consumir el carrito', async () => {
    vaciarCarrito.mockResolvedValue({ count: 0 });

    await expect(
      service.crear(7, {
        telefono: '999999999',
        distrito: 'La Esperanza',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('El carrito cambió durante la compra');

    expect(actualizarStock).not.toHaveBeenCalled();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('rechaza el checkout si queda otro artículo tras consumir el snapshot', async () => {
    actualizarStock.mockResolvedValue({ count: 1 });
    contarArticulosRestantes.mockResolvedValue(1);

    await expect(
      service.crear(7, {
        telefono: '999999999',
        distrito: 'La Esperanza',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('El carrito cambió durante la compra');

    expect(actualizarStock).not.toHaveBeenCalled();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('rechaza productos desactivados dentro de la transacción sin consumir el carrito ni el stock', async () => {
    const productosInactivos = [{ nombre: 'SOHO One' }];
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
      pedido: {
        create: crearPedido,
        findFirst: vi.fn().mockResolvedValue(null),
      },
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
      carritoService as unknown as CarritoService,
    );

    await expect(
      service.crear(7, {
        telefono: '999999999',
        distrito: 'La Esperanza',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('Productos no disponibles: "SOHO One"');

    expect(encontrarInactivos).toHaveBeenCalledWith({
      where: { id: { in: [13] }, activo: false },
      select: { nombre: true },
    });
    expect(carritoConsumido).not.toHaveBeenCalled();
    expect(reservarStock).not.toHaveBeenCalled();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('aborta la transacción si una talla posterior tiene stock insuficiente', async () => {
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
              nombre: 'SOHO One',
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
        telefono: '999999999',
        distrito: 'La Esperanza',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow('Stock insuficiente para "SOHO One" talla 43');

    expect(actualizarStock).toHaveBeenCalledTimes(2);
    expect(crearPedido).not.toHaveBeenCalled();
    expect(vaciarCarrito).toHaveBeenCalledOnce();
  });
});

describe('PedidosService transiciones de estado admin', () => {
  const order = {
    id: 42,
    usuarioId: 7,
    estado: EstadoPedido.PENDIENTE,
    inventarioReservado: true,
    items: [{ tallaProductoId: 21, cantidad: 2 }],
  };

  let service: PedidosService;
  let updateMany: ReturnType<typeof vi.fn>;
  let updateStock: ReturnType<typeof vi.fn>;
  let reservarStock: ReturnType<typeof vi.fn>;
  let findUniqueOrThrow: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateMany = vi.fn().mockResolvedValue({ count: 1 });
    updateStock = vi.fn().mockResolvedValue({});
    reservarStock = vi.fn().mockResolvedValue({ count: 1 });
    findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ ...order, estado: EstadoPedido.CANCELADO });
    const tx = {
      pedido: { updateMany, findUniqueOrThrow },
      tallaProducto: { update: updateStock, updateMany: reservarStock },
    };
    transaction = vi.fn((callback) => callback(tx));
    service = new PedidosService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as CarritoService,
    );
    vi.spyOn(service, 'buscarPorId').mockResolvedValue(
      order as Awaited<ReturnType<typeof service.buscarPorId>>,
    );
  });

  it.each([
    [EstadoPedido.PENDIENTE, EstadoPedido.CANCELADO],
    [EstadoPedido.PAGO_VERIFICADO, EstadoPedido.EN_PREPARACION],
    [EstadoPedido.PAGO_VERIFICADO, EstadoPedido.CANCELADO],
    [EstadoPedido.EN_PREPARACION, EstadoPedido.ENVIADO],
    [EstadoPedido.ENVIADO, EstadoPedido.ENTREGADO],
    [EstadoPedido.PAGO_REQUIERE_REVISION, EstadoPedido.PAGO_VERIFICADO],
    [EstadoPedido.PAGO_REQUIERE_REVISION, EstadoPedido.CANCELADO],
  ])(
    'permite la transición %s → %s',
    async (estadoActual, estadoSolicitado) => {
      const pedidoActual = {
        ...order,
        estado: estadoActual,
        inventarioReservado:
          estadoActual !== EstadoPedido.PAGO_REQUIERE_REVISION,
      };
      vi.spyOn(service, 'buscarPorId')
        .mockReset()
        .mockResolvedValueOnce(
          pedidoActual as Awaited<ReturnType<typeof service.buscarPorId>>,
        )
        .mockResolvedValueOnce({
          ...pedidoActual,
          estado: estadoSolicitado,
        } as Awaited<ReturnType<typeof service.buscarPorId>>);

      await expect(
        service.actualizarEstado(42, { estado: estadoSolicitado }),
      ).resolves.toMatchObject({ estado: estadoSolicitado });

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 42, estado: estadoActual },
        data: {
          estado: estadoSolicitado,
          ...(estadoSolicitado === EstadoPedido.CANCELADO
            ? { inventarioReservado: false }
            : {}),
          ...(estadoSolicitado === EstadoPedido.PAGO_VERIFICADO &&
          estadoActual === EstadoPedido.PAGO_REQUIERE_REVISION
            ? {
                inventarioReservado: true,
                pagadoEn: expect.any(Date),
              }
            : {}),
        },
      });
      if (
        estadoSolicitado === EstadoPedido.CANCELADO &&
        pedidoActual.inventarioReservado
      ) {
        expect(updateStock).toHaveBeenCalledOnce();
      } else {
        expect(updateStock).not.toHaveBeenCalled();
      }
      if (
        estadoSolicitado === EstadoPedido.PAGO_VERIFICADO &&
        estadoActual === EstadoPedido.PAGO_REQUIERE_REVISION
      ) {
        expect(reservarStock).toHaveBeenCalledOnce();
      } else {
        expect(reservarStock).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    [EstadoPedido.ENTREGADO, EstadoPedido.PENDIENTE],
    [EstadoPedido.ENVIADO, EstadoPedido.PAGO_VERIFICADO],
    [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
    [EstadoPedido.CANCELADO, EstadoPedido.PENDIENTE],
    [EstadoPedido.ENTREGADO, EstadoPedido.ENTREGADO],
  ])(
    'rechaza la transición %s → %s',
    async (estadoActual, estadoSolicitado) => {
      vi.spyOn(service, 'buscarPorId').mockResolvedValue({
        ...order,
        estado: estadoActual,
      } as Awaited<ReturnType<typeof service.buscarPorId>>);

      await expect(
        service.actualizarEstado(42, { estado: estadoSolicitado }),
      ).rejects.toThrow(
        `No se permite cambiar el pedido del estado ${estadoActual} al estado ${estadoSolicitado}.`,
      );

      expect(transaction).not.toHaveBeenCalled();
      expect(updateStock).not.toHaveBeenCalled();
    },
  );

  it('no permite a los admins marcar un pedido pendiente como pagado manualmente', async () => {
    vi.spyOn(service, 'buscarPorId').mockResolvedValue({
      ...order,
      estado: EstadoPedido.PENDIENTE,
    } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.PAGO_VERIFICADO }),
    ).rejects.toThrow(
      'El pago de Mercado Pago solo se confirma automáticamente tras validar su notificación.',
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it('conflicta sin reponer stock si otra solicitud ya cambió el estado', async () => {
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
    ).rejects.toThrow(ConflictException);

    expect(updateStock).not.toHaveBeenCalled();
  });

  it('revierte la transición si falla la reposición de stock', async () => {
    updateStock.mockRejectedValue(
      new Error('Falló la actualización del inventario'),
    );

    await expect(
      service.actualizarEstado(42, { estado: EstadoPedido.CANCELADO }),
    ).rejects.toThrow('Falló la actualización del inventario');

    expect(updateMany).toHaveBeenCalledOnce();
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('PedidosService cancelación de pedido por el cliente', () => {
  const order = {
    id: 42,
    usuarioId: 7,
    estado: EstadoPedido.PENDIENTE,
    inventarioReservado: true,
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

  it('cambia el estado del pedido condicionalmente antes de reponer el stock', async () => {
    await expect(service.cancelar(7, 42)).resolves.toMatchObject({
      estado: EstadoPedido.CANCELADO,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 42,
        usuarioId: 7,
        estado: EstadoPedido.PENDIENTE,
      },
      data: {
        estado: EstadoPedido.CANCELADO,
        inventarioReservado: false,
      },
    });
    expect(updateStock).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { stock: { increment: 2 } },
    });
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      updateStock.mock.invocationCallOrder[0],
    );
  });

  it('no repone stock cuando una cancelación concurrente ya ganó', async () => {
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

    await expect(service.cancelar(7, 42)).rejects.toThrow(ConflictException);

    expect(updateStock).not.toHaveBeenCalled();
  });

  it.each([
    EstadoPedido.PAGO_VERIFICADO,
    EstadoPedido.EN_PREPARACION,
    EstadoPedido.ENVIADO,
    EstadoPedido.ENTREGADO,
    EstadoPedido.CANCELADO,
  ])('rechaza la cancelación del cliente desde %s', async (estadoActual) => {
    vi.spyOn(service, 'buscarPorId')
      .mockReset()
      .mockResolvedValue({
        ...order,
        estado: estadoActual,
      } as Awaited<ReturnType<typeof service.buscarPorId>>);

    await expect(service.cancelar(7, 42)).rejects.toThrow(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
    expect(updateStock).not.toHaveBeenCalled();
  });

  it('solo repone stock una vez ante dos cancelaciones concurrentes', async () => {
    let cancelado = false;
    let lecturas = 0;
    updateMany.mockImplementation(async () => {
      if (cancelado) return { count: 0 };
      cancelado = true;
      return { count: 1 };
    });
    vi.spyOn(service, 'buscarPorId')
      .mockReset()
      .mockImplementation(async () => {
        lecturas += 1;
        return {
          ...order,
          estado:
            lecturas <= 2 ? EstadoPedido.PENDIENTE : EstadoPedido.CANCELADO,
        } as Awaited<ReturnType<typeof service.buscarPorId>>;
      });

    const resultados = await Promise.allSettled([
      service.cancelar(7, 42),
      service.cancelar(7, 42),
    ]);

    expect(
      resultados.filter((resultado) => resultado.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      resultados.filter((resultado) => resultado.status === 'rejected'),
    ).toHaveLength(1);
    expect(updateStock).toHaveBeenCalledOnce();
  });
});

describe('PedidosService paginación admin', () => {
  it('filtra, ordena y pagina pedidos devolviendo metadatos de total', async () => {
    const pedidos = [{ id: 8 }, { id: 7 }];
    const findMany = vi.fn().mockResolvedValue(pedidos);
    const count = vi.fn().mockResolvedValue(42);
    const service = new PedidosService(
      { pedido: { findMany, count } } as unknown as PrismaService,
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

describe('PedidosService resumen del dashboard', () => {
  it('agrega ventas y top productos en el backend, con solo cinco pedidos recientes', async () => {
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
        marca: { nombre: 'SOHO' },
        imagenes: [{ url: 'https://example.test/shoe.jpg' }],
      },
    ]);
    const service = new PedidosService(
      {
        pedido: { findMany, count, aggregate },
        producto: { findMany: productoFindMany },
        $queryRaw: queryRaw,
      } as unknown as PrismaService,
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
          marca: 'SOHO',
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
    const [ventasQueryCall, topProductosQueryCall] = queryRaw.mock.calls as [
      [Prisma.Sql],
      [Prisma.Sql],
    ];
    expect(ventasQueryCall[0].sql).toContain('`pagadoEn` >=');
    expect(ventasQueryCall[0].values).toEqual(
      expect.arrayContaining([
        EstadoPedido.PAGO_VERIFICADO,
        EstadoPedido.EN_PREPARACION,
        EstadoPedido.ENVIADO,
        EstadoPedido.ENTREGADO,
        new Date('2026-09-06T05:00:00.000Z'),
        new Date('2026-10-06T05:00:00.000Z'),
      ]),
    );
    expect(topProductosQueryCall[0].sql).toContain('pedidos.`pagadoEn` >= ?');
    expect(topProductosQueryCall[0].sql).toContain('pedidos.`pagadoEn` < ?');
    expect(topProductosQueryCall[0].values).toEqual(
      expect.arrayContaining([
        EstadoPedido.PAGO_VERIFICADO,
        EstadoPedido.EN_PREPARACION,
        EstadoPedido.ENVIADO,
        EstadoPedido.ENTREGADO,
        new Date('2026-09-06T05:00:00.000Z'),
        new Date('2026-10-06T05:00:00.000Z'),
      ]),
    );
  });

  it('rechaza intervalos de fechas del dashboard inválidos o demasiado amplios', async () => {
    const service = new PedidosService(
      {} as PrismaService,
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

  it('rechaza un rango de período anterior sin acotar', async () => {
    const service = new PedidosService(
      {} as PrismaService,
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

describe('PedidosService expiración y límites de reserva de stock', () => {
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
      producto: { id: 13, nombre: 'SOHO One', precio: 100, activo: true },
    },
  };

  it('rechaza crear un nuevo pedido cuando el usuario ya tiene uno pendiente activo sin comprobante', async () => {
    const pedidoPendienteReciente = {
      id: 88,
      creadoEn: new Date(),
      items: [{ tallaProductoId: 21, cantidad: 2 }],
    };
    const tx = {
      pedido: {
        findFirst: vi.fn().mockResolvedValue(pedidoPendienteReciente),
      },
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
      carritoService as unknown as CarritoService,
    );

    await expect(
      service.crear(7, {
        telefono: '999999999',
        distrito: 'La Esperanza',
        direccion: 'Calle 1',
      }),
    ).rejects.toThrow(
      'Ya tienes el pedido #88 pendiente de pago. Continúa el pago desde Mis pedidos o cancélalo antes de realizar uno nuevo.',
    );
  });

  it('auto-cancela y repone el stock de un pedido pendiente expirado al crear uno nuevo', async () => {
    const hace20Minutos = new Date(Date.now() - 20 * 60 * 1000);
    const pedidoPendienteExpirado = {
      id: 88,
      estado: EstadoPedido.PENDIENTE,
      creadoEn: hace20Minutos,
      items: [{ tallaProductoId: 21, cantidad: 2 }],
    };
    const cancelarPedido = vi.fn().mockResolvedValue({ count: 1 });
    const reponerStock = vi.fn().mockResolvedValue({});
    const actualizarStock = vi.fn().mockResolvedValue({ count: 1 });
    const crearPedido = vi.fn().mockResolvedValue({ id: 99 });
    const vaciarCarrito = vi.fn().mockResolvedValue({ count: 1 });

    const tx = {
      pedido: {
        findFirst: vi.fn().mockResolvedValue(pedidoPendienteExpirado),
        updateMany: cancelarPedido,
        create: crearPedido,
      },
      tallaProducto: {
        update: reponerStock,
        updateMany: actualizarStock,
      },
      producto: { findMany: vi.fn().mockResolvedValue([]) },
      itemCarrito: {
        deleteMany: vaciarCarrito,
        count: vi.fn().mockResolvedValue(0),
      },
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
      carritoService as unknown as CarritoService,
    );

    const resultado = await service.crear(7, {
      telefono: '999999999',
      distrito: 'La Esperanza',
      direccion: 'Calle 1',
    });

    expect(resultado).toEqual({ id: 99 });
    expect(cancelarPedido).toHaveBeenCalledWith({
      where: {
        id: 88,
        estado: EstadoPedido.PENDIENTE,
        creadoEn: { lte: expect.any(Date) },
      },
      data: {
        estado: EstadoPedido.CANCELADO,
        inventarioReservado: false,
      },
    });
    expect(reponerStock).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { stock: { increment: 2 } },
    });
  });

  it('cancelarPedidosExpirados cancela pedidos vencidos y repone el stock', async () => {
    const pedidoExpirado = {
      id: 105,
      items: [{ tallaProductoId: 30, cantidad: 1 }],
    };
    const findMany = vi.fn().mockResolvedValue([pedidoExpirado]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateStock = vi.fn().mockResolvedValue({});
    const tx = {
      pedido: { updateMany },
      tallaProducto: { update: updateStock },
    };
    const prisma = {
      pedido: { findMany },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new PedidosService(
      prisma as unknown as PrismaService,
      {} as CarritoService,
    );

    const cancelados = await service.cancelarPedidosExpirados();

    expect(cancelados).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 105,
        estado: EstadoPedido.PENDIENTE,
      },
      data: {
        estado: EstadoPedido.CANCELADO,
        inventarioReservado: false,
      },
    });
    expect(updateStock).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { stock: { increment: 1 } },
    });
  });
});
