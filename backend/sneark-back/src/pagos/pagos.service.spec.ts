import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPedido, MetodoPago, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PagosService } from './pagos.service.js';
import { createHmac } from 'node:crypto';

const mercadoPago = vi.hoisted(() => ({
  crearPreferencia: vi.fn(),
  obtenerPago: vi.fn(),
  obtenerOrden: vi.fn(),
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
  MerchantOrder: class {
    get = mercadoPago.obtenerOrden;
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
    mpEstadoPago: null,
    mpMontoReembolsado: new Prisma.Decimal(0),
    mpActualizadoEn: null,
    mpRequiereRevision: false,
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

function crearServicio(
  opciones: {
    pedido?: ReturnType<typeof crearPedido>;
    token?: string;
    prisma?: Record<string, unknown>;
    secreto?: string;
  } = {},
) {
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
      findUnique: vi.fn().mockResolvedValue(pedido),
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
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    ...opciones.prisma,
  };
  return {
    service: new PagosService(prisma as unknown as PrismaService, config),
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

    expect(
      mercadoPago.crearPreferencia.mock.calls[0][0].body.items,
    ).toContainEqual({
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

  function prepararPago(
    id = 123,
    cambios: Record<string, unknown> = {},
    cambiosOrden: Record<string, unknown> = {},
  ) {
    mercadoPago.obtenerPago.mockResolvedValue({
      id,
      status: 'approved',
      external_reference: '7',
      order: { id: 90, type: 'mercadopago' },
      transaction_amount: 125,
      transaction_amount_refunded: 0,
      currency_id: 'PEN',
      date_approved: '2026-10-10T12:00:00.000Z',
      date_last_updated: '2026-10-10T12:01:00.000Z',
      ...cambios,
    });
    mercadoPago.obtenerOrden.mockResolvedValue({
      id: 90,
      preference_id: 'pref-7',
      external_reference: '7',
      payments: [{ id }],
      ...cambiosOrden,
    });
  }
  function enviarWebhook(service: PagosService, id = '123') {
    return service.procesarWebhook(
      { type: 'payment', data: { id } },
      crearFirma(id, 'request-1', 'webhook-secret'),
      'request-1',
    );
  }

  it('confirma un pago sin preference_id consultando su orden comercial', async () => {
    prepararPago();
    const { service, tx } = crearServicio();
    await expect(enviarWebhook(service)).resolves.toEqual({ recibido: true });
    expect(mercadoPago.obtenerOrden).toHaveBeenCalledWith({
      merchantOrderId: '90',
    });
    expect(tx.pedido.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoPedido.PAGO_VERIFICADO,
          mpPagoId: '123',
          mpEstadoPago: 'approved',
          mpMontoReembolsado: new Prisma.Decimal(0),
          pagadoEn: new Date('2026-10-10T12:00:00.000Z'),
        }),
      }),
    );
    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
  });
  it('acepta importes decimales serializados como texto', async () => {
    prepararPago(123, { transaction_amount: '125.00' });
    const { service, tx } = crearServicio();
    await enviarWebhook(service);
    expect(tx.pedido.updateMany.mock.calls[0][0].data.estado).toBe(
      EstadoPedido.PAGO_VERIFICADO,
    );
  });
  it.each([
    [{ transaction_amount: 1 }, {}],
    [{ currency_id: 'USD' }, {}],
    [{}, { preference_id: 'otra-preferencia' }],
    [{}, { external_reference: 'otro-pedido' }],
    [{}, { payments: [{ id: 999 }] }],
    [{ order: null }, {}],
  ])('envia a revision una discrepancia (%j)', async (pago, orden) => {
    prepararPago(123, pago, orden);
    const { service, tx } = crearServicio();
    await enviarWebhook(service);
    expect(tx.pedido.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoPedido.PAGO_REQUIERE_REVISION,
          mpPagoId: '123',
          mpRequiereRevision: true,
        }),
      }),
    );
    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
  });
  it.each(['pago', 'orden'])(
    'permite reintentar un fallo temporal en %s sin modificar datos',
    async (recurso) => {
      prepararPago();
      if (recurso === 'pago')
        mercadoPago.obtenerPago.mockRejectedValue(new Error('timeout'));
      else mercadoPago.obtenerOrden.mockRejectedValue(new Error('timeout'));
      const { service, prisma, tx } = crearServicio();
      await expect(enviarWebhook(service)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.pedido.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    { id: 999 },
    { date_last_updated: null },
    { transaction_amount: NaN },
    { transaction_amount_refunded: -1 },
    { transaction_amount_refunded: 126 },
  ])(
    'rechaza una respuesta inconsistente sin modificar el pedido (%j)',
    async (cambios) => {
      prepararPago(123, cambios);
      const { service, prisma } = crearServicio();
      await expect(enviarWebhook(service)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('reintenta cuando la orden aun no tiene los datos necesarios', async () => {
    prepararPago(123, {}, { payments: undefined });
    const { service, prisma } = crearServicio();
    await expect(enviarWebhook(service)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(['pending', 'rejected', 'cancelled'])(
    'no confirma un intento %s',
    async (status) => {
      prepararPago(123, { status });
      const { service, prisma } = crearServicio();
      await enviarWebhook(service);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mercadoPago.obtenerOrden).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['refunded', 125],
    ['charged_back', 0],
    ['in_mediation', 0],
    ['approved', 25],
  ])(
    'registra %s sin borrar la entrega ni reponer stock',
    async (status, reembolso) => {
      prepararPago(123, { status, transaction_amount_refunded: reembolso });
      const { service, tx } = crearServicio({
        pedido: crearPedido(EstadoPedido.ENTREGADO, { mpPagoId: '123' }),
      });
      await enviarWebhook(service);
      const data = tx.pedido.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({
        mpEstadoPago: status,
        mpRequiereRevision: true,
        mpMontoReembolsado: new Prisma.Decimal(reembolso),
      });
      expect(data).not.toHaveProperty('estado');
      expect(tx.tallaProducto.update).not.toHaveBeenCalled();
      expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
    },
  );
  it('marca en revision un reembolso anterior a la confirmacion', async () => {
    prepararPago(123, { status: 'refunded', transaction_amount_refunded: 125 });
    const { service, tx } = crearServicio();
    await enviarWebhook(service);
    expect(tx.pedido.updateMany.mock.calls[0][0].data.estado).toBe(
      EstadoPedido.PAGO_REQUIERE_REVISION,
    );
  });
  it('no sobrescribe un reembolso reciente con una aprobacion atrasada', async () => {
    prepararPago();
    const pedido = crearPedido(EstadoPedido.PAGO_REQUIERE_REVISION, {
      mpPagoId: '123',
      mpEstadoPago: 'refunded',
      mpRequiereRevision: true,
      mpActualizadoEn: new Date('2026-10-11T00:00:00.000Z'),
    });
    const { service, tx } = crearServicio({ pedido });
    tx.pedido.updateMany.mockResolvedValue({ count: 0 });
    await enviarWebhook(service);
    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
  });
  it('ignora un reembolso mas antiguo que el estado financiero guardado', async () => {
    prepararPago(123, { status: 'refunded', transaction_amount_refunded: 125 });
    const pedido = crearPedido(EstadoPedido.ENVIADO, {
      mpPagoId: '123',
      mpActualizadoEn: new Date('2026-10-11T00:00:00.000Z'),
    });
    const { service, tx } = crearServicio({ pedido });
    await enviarWebhook(service);
    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
  });
  it('responde con conflicto si el pedido cambia durante el registro financiero', async () => {
    prepararPago(123, { status: 'charged_back' });
    const { service, tx } = crearServicio();
    tx.pedido.updateMany.mockResolvedValue({ count: 0 });
    await expect(enviarWebhook(service)).rejects.toThrow(ConflictException);
    expect(tx.tallaProducto.update).not.toHaveBeenCalled();
  });
  it('mantiene un pago tardio en revision si no puede reservar todo el inventario', async () => {
    prepararPago();
    const pedido = crearPedido(EstadoPedido.CANCELADO, {
      items: [
        { tallaProductoId: 10, cantidad: 1 },
        { tallaProductoId: 20, cantidad: 2 },
      ],
    });
    const { service, tx } = crearServicio({ pedido });
    tx.pedido.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    tx.tallaProducto.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await enviarWebhook(service);
    expect(tx.pedido.updateMany.mock.calls[1][0].data).toMatchObject({
      estado: EstadoPedido.PAGO_REQUIERE_REVISION,
      mpRequiereRevision: true,
    });
    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.tallaProducto.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { stock: { increment: 1 } },
    });
  });
  it('reactiva un pedido cancelado reservando el inventario una vez', async () => {
    prepararPago();
    const { service, tx } = crearServicio({
      pedido: crearPedido(EstadoPedido.CANCELADO),
    });
    tx.pedido.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    await enviarWebhook(service);
    expect(tx.tallaProducto.updateMany).toHaveBeenCalledOnce();
    expect(tx.pedido.updateMany.mock.calls[2][0].data).toMatchObject({
      estado: EstadoPedido.PAGO_VERIFICADO,
      inventarioReservado: true,
      mpRequiereRevision: false,
    });
  });
  it('trata una notificacion repetida como idempotente', async () => {
    prepararPago();
    const pedido = crearPedido(EstadoPedido.PAGO_VERIFICADO, {
      mpPagoId: '123',
      mpActualizadoEn: new Date('2026-10-10T12:01:00.000Z'),
    });
    const { service, tx } = crearServicio({ pedido });
    tx.pedido.updateMany.mockResolvedValue({ count: 0 });
    await expect(enviarWebhook(service)).resolves.toEqual({ recibido: true });
    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
  });
  it('marca un pago adicional sin reemplazar el pago ni la entrega', async () => {
    prepararPago();
    const { service, tx } = crearServicio({
      pedido: crearPedido(EstadoPedido.ENVIADO, { mpPagoId: '999' }),
    });
    tx.pedido.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    await enviarWebhook(service);
    expect(tx.pedido.updateMany.mock.calls[2][0].data).toEqual({
      mpRequiereRevision: true,
    });
  });
});
