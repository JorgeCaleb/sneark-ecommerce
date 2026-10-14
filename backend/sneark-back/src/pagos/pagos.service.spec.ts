import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPedido, MetodoPago } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PagosService } from './pagos.service.js';
import { createHmac } from 'node:crypto';

const mercadoPago = vi.hoisted(() => ({
  crearPreferencia: vi.fn(),
  obtenerPago: vi.fn(),
}));

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {
    constructor(_options: { accessToken: string }) {}
  },
  Preference: class {
    create = mercadoPago.crearPreferencia;
  },
  Payment: class {
    get = mercadoPago.obtenerPago;
  },
}));

function crearPedido(
  estado: EstadoPedido = EstadoPedido.PENDIENTE,
  extra: Record<string, unknown> = {},
) {
  return {
    id: 7,
    usuarioId: 3,
    estado,
    metodoPago: MetodoPago.MERCADOPAGO,
    total: 125,
    mpPreferenciaId: 'pref-7',
    mpCheckoutUrl: null,
    mpPagoId: null,
    costoEnvio: 0,
    ciudad: 'La Esperanza',
    inventarioReservado: estado !== EstadoPedido.CANCELADO,
    creadoEn: new Date(Date.now() - 4 * 60 * 1000),
    items: [{ tallaProductoId: 10, cantidad: 1 }],
    usuario: { email: 'cliente@example.com', nombre: 'Cliente' },
    ...extra,
  };
}

function crearFirma(pagoId: string, requestId: string, secreto: string) {
  const timestamp = '1700000000';
  const manifiesto = `id:${pagoId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const v1 = createHmac('sha256', secreto).update(manifiesto).digest('hex');
  return `ts=${timestamp},v1=${v1}`;
}

function crearServicio(opciones: {
  pedido?: ReturnType<typeof crearPedido>;
  token?: string;
  prisma?: Record<string, unknown>;
  secreto?: string;
} = {}) {
  const configuracion: Record<string, string | undefined> = {
    MP_ACCESS_TOKEN: opciones.token ?? 'APP_USR-token',
    MP_WEBHOOK_SECRET: opciones.secreto ?? 'webhook-secret',
    FRONTEND_ORIGIN: 'https://shop.example',
    BACKEND_URL: 'https://api.example',
  };
  const config = {
    get: vi.fn((key: string) => configuracion[key]),
  } as unknown as ConfigService;
  const pedido = opciones.pedido ?? crearPedido();
  const tx = {
    pedido: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
    tallaProducto: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    pedido: {
      findFirst: vi.fn().mockResolvedValue(pedido),
      findUnique: vi.fn().mockResolvedValue(pedido),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
    ...opciones.prisma,
  };
  return {
    service: new PagosService(
      prisma as unknown as PrismaService,
      config,
    ),
    config,
    prisma,
    tx,
  };
}

describe('PagosService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('alinea la expiración de la preferencia con el plazo del pedido y usa la URL de producción', async () => {
    const pedido = crearPedido(EstadoPedido.PENDIENTE, {
      mpPreferenciaId: null,
      creadoEn: new Date(Date.now() - 4 * 60 * 1000),
    });
    const { service, prisma } = crearServicio({ pedido });
    mercadoPago.crearPreferencia.mockResolvedValue({
      id: 'pref-7',
      init_point: 'https://checkout.example/production',
      sandbox_init_point: 'https://checkout.example/sandbox',
    });

    await expect(service.crearPreferencia(7, 3)).resolves.toEqual({
      preferenciaId: 'pref-7',
      urlPago: 'https://checkout.example/production',
    });

    const body = mercadoPago.crearPreferencia.mock.calls[0][0].body;
    expect(new Date(body.expiration_date_to).getTime()).toBe(
      pedido.creadoEn.getTime() + 15 * 60 * 1000,
    );
    expect(body.items).toHaveLength(1);
    expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 7,
        estado: EstadoPedido.PENDIENTE,
        mpPreferenciaId: null,
        creadoEn: { gt: expect.any(Date) },
      },
      data: {
        mpPreferenciaId: 'pref-7',
        mpCheckoutUrl: 'https://checkout.example/production',
      },
    });
  });

  it('agrega el costo de envío no nulo a la preferencia de Mercado Pago', async () => {
    const pedido = crearPedido(EstadoPedido.PENDIENTE, {
      mpPreferenciaId: null,
      costoEnvio: 15,
      ciudad: 'Trujillo',
    });
    const { service } = crearServicio({ pedido });
    mercadoPago.crearPreferencia.mockResolvedValue({
      id: 'pref-7',
      init_point: 'https://checkout.example/production',
    });

    await service.crearPreferencia(7, 3);

    expect(mercadoPago.crearPreferencia.mock.calls[0][0].body.items).toContainEqual({
      id: 'envio-local',
      title: 'Envío a Trujillo',
      quantity: 1,
      unit_price: 15,
      currency_id: 'PEN',
    });
  });

  it('selecciona el checkout sandbox solo para credenciales de prueba', async () => {
    const { service } = crearServicio({
      token: 'TEST-token',
      pedido: crearPedido(EstadoPedido.PENDIENTE, {
        mpPreferenciaId: null,
      }),
    });
    mercadoPago.crearPreferencia.mockResolvedValue({
      id: 'pref-test',
      init_point: 'https://checkout.example/production',
      sandbox_init_point: 'https://checkout.example/sandbox',
    });

    await expect(service.crearPreferencia(7, 3)).resolves.toMatchObject({
      urlPago: 'https://checkout.example/sandbox',
    });
  });

  it('no usa la URL sandbox con credenciales de producción', async () => {
    const { service } = crearServicio({
      pedido: crearPedido(EstadoPedido.PENDIENTE, {
        mpPreferenciaId: null,
      }),
    });
    mercadoPago.crearPreferencia.mockResolvedValue({
      id: 'pref-7',
      sandbox_init_point: 'https://checkout.example/sandbox',
    });

    await expect(service.crearPreferencia(7, 3)).rejects.toThrow(
      'Mercado Pago no devolvió una preferencia y una URL de checkout válidas.',
    );
  });

  it('no crea una preferencia para un pedido vencido', async () => {
    const pedido = crearPedido(EstadoPedido.PENDIENTE, {
      creadoEn: new Date(Date.now() - 16 * 60 * 1000),
    });
    const { service } = crearServicio({ pedido });

    await expect(service.crearPreferencia(7, 3)).rejects.toThrow(
      BadRequestException,
    );
    expect(mercadoPago.crearPreferencia).not.toHaveBeenCalled();
  });

  it('arranca sin access token pero reporta error de configuración al usarlo', async () => {
    const { service } = crearServicio({
      token: '',
      pedido: crearPedido(EstadoPedido.PENDIENTE, {
        mpPreferenciaId: null,
      }),
    });
    const config = service as unknown as { mp?: unknown };
    expect(config.mp).toBeUndefined();
    await expect(service.crearPreferencia(7, 3)).rejects.toThrow(
      'Mercado Pago no está configurado',
    );
  });

  it('rechaza una firma de webhook inválida antes de consultar Mercado Pago', async () => {
    const { service } = crearServicio();

    await expect(
      service.procesarWebhook(
        { type: 'payment', data: { id: '123' } },
        'ts=1,v1=invalid',
        'request-1',
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(mercadoPago.obtenerPago).not.toHaveBeenCalled();
  });

  it('verifica el pago y marca una aprobación válida como pagado', async () => {
    const pedido = crearPedido(EstadoPedido.PENDIENTE);
    pedido.mpPreferenciaId = 'pref-7';
    const { service, tx } = crearServicio({ pedido });
    mercadoPago.obtenerPago.mockResolvedValue({
      status: 'approved',
      external_reference: '7',
      preference_id: 'pref-7',
      transaction_amount: 125,
      currency_id: 'PEN',
      date_approved: '2026-10-10T12:00:00.000Z',
    });

    await expect(
      service.procesarWebhook(
        { type: 'payment', data: { id: '123' } },
        crearFirma('123', 'request-1', 'webhook-secret'),
        'request-1',
      ),
    ).resolves.toEqual({ recibido: true });

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 7,
        estado: EstadoPedido.PENDIENTE,
        mpPagoId: null,
      },
      data: {
        estado: EstadoPedido.PAGO_VERIFICADO,
        mpPagoId: '123',
        pagadoEn: new Date('2026-10-10T12:00:00.000Z'),
      },
    });
  });

  it('registra un pago aprobado con importe incorrecto para revisión manual', async () => {
    const pedido = crearPedido(EstadoPedido.PENDIENTE);
    const { service, prisma } = crearServicio({ pedido });
    mercadoPago.obtenerPago.mockResolvedValue({
      status: 'approved',
      external_reference: '7',
      preference_id: 'pref-7',
      transaction_amount: 1,
      currency_id: 'PEN',
    });

    await service.procesarWebhook(
      { type: 'payment', data: { id: '124' } },
      crearFirma('124', 'request-1', 'webhook-secret'),
      'request-1',
    );

    expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
      where: {
        id: 7,
        estado: {
          in: [
            EstadoPedido.PENDIENTE,
            EstadoPedido.CANCELADO,
            EstadoPedido.PAGO_VERIFICADO,
          ],
        },
        mpPagoId: null,
      },
      data: {
        estado: EstadoPedido.PAGO_REQUIERE_REVISION,
        mpPagoId: '124',
      },
    });
  });

  it('mantiene un pago aprobado tardío en revisión cuando no se puede reservar inventario', async () => {
    const pedido = crearPedido(EstadoPedido.CANCELADO);
    const { service, tx } = crearServicio({ pedido });
    tx.pedido.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    tx.tallaProducto.updateMany.mockResolvedValue({ count: 0 });
    mercadoPago.obtenerPago.mockResolvedValue({
      status: 'approved',
      external_reference: '7',
      preference_id: 'pref-7',
      transaction_amount: 125,
      currency_id: 'PEN',
    });

    await service.procesarWebhook(
      { type: 'payment', data: { id: '125' } },
      crearFirma('125', 'request-1', 'webhook-secret'),
      'request-1',
    );

    expect(tx.pedido.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 7,
        estado: EstadoPedido.CANCELADO,
        mpPagoId: null,
      },
      data: {
        estado: EstadoPedido.PAGO_REQUIERE_REVISION,
        mpPagoId: '125',
      },
    });
    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(2);
  });

  it('reactiva un pedido cancelado atómicamente cuando todo el inventario está disponible', async () => {
    const pedido = crearPedido(EstadoPedido.CANCELADO);
    const { service, tx } = crearServicio({ pedido });
    tx.pedido.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mercadoPago.obtenerPago.mockResolvedValue({
      status: 'approved',
      external_reference: '7',
      preference_id: 'pref-7',
      transaction_amount: 125,
      currency_id: 'PEN',
    });

    await service.procesarWebhook(
      { type: 'payment', data: { id: '126' } },
      crearFirma('126', 'request-1', 'webhook-secret'),
      'request-1',
    );

    expect(tx.tallaProducto.updateMany).toHaveBeenCalledWith({
      where: { id: 10, stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    expect(tx.pedido.updateMany).toHaveBeenNthCalledWith(3, {
      where: {
        id: 7,
        estado: EstadoPedido.PAGO_REQUIERE_REVISION,
        mpPagoId: '126',
      },
      data: {
        estado: EstadoPedido.PAGO_VERIFICADO,
        inventarioReservado: true,
        pagadoEn: expect.any(Date),
      },
    });
  });

  it('trata las notificaciones de pago duplicadas como idempotentes', async () => {
    const pedido = crearPedido(EstadoPedido.PAGO_VERIFICADO, {
      mpPagoId: '127',
    });
    const { service, tx } = crearServicio({ pedido });
    tx.pedido.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    tx.pedido.findUnique.mockResolvedValue({
      estado: EstadoPedido.PAGO_VERIFICADO,
      mpPagoId: '127',
    });
    mercadoPago.obtenerPago.mockResolvedValue({
      status: 'approved',
      external_reference: '7',
      preference_id: 'pref-7',
      transaction_amount: 125,
      currency_id: 'PEN',
    });

    await expect(
      service.procesarWebhook(
        { type: 'payment', data: { id: '127' } },
        crearFirma('127', 'request-1', 'webhook-secret'),
        'request-1',
      ),
    ).resolves.toEqual({ recibido: true });

    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
    expect(tx.pedido.findUnique).toHaveBeenCalledOnce();
  });
});
