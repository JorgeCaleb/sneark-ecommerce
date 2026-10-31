import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const api = vi.hoisted(() => ({ pago: vi.fn(), orden: vi.fn() }));
vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {},
  Payment: class {
    get = api.pago;
  },
  MerchantOrder: class {
    get = api.orden;
  },
  Preference: class {},
}));

describe('Webhook de pagos (HTTP, sin servicios externos)', () => {
  let app: INestApplication;
  let pedido: Record<string, unknown>;
  let stock: ReturnType<typeof vi.fn>;
  let guardar: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    for (const [nombre, valor] of Object.entries({
      NODE_ENV: 'test',
      JWT_SECRET: 'jwt-test',
      MP_ACCESS_TOKEN: 'TEST-fake',
      MP_WEBHOOK_SECRET: 'firma-test',
      CLOUDINARY_CLOUD_NAME: 'test',
      CLOUDINARY_API_KEY: 'test',
      CLOUDINARY_API_SECRET: 'test',
      FRONTEND_ORIGIN: 'http://localhost:4200',
    }))
      vi.stubEnv(nombre, valor);
    pedido = {
      id: 7,
      estado: 'PENDIENTE',
      metodoPago: 'MERCADOPAGO',
      total: new Prisma.Decimal(125),
      mpPreferenciaId: 'pref-7',
      mpPagoId: null,
      mpEstadoPago: null,
      mpActualizadoEn: null,
      mpMontoReembolsado: new Prisma.Decimal(0),
      mpRequiereRevision: false,
      inventarioReservado: true,
      items: [{ tallaProductoId: 10, cantidad: 1 }],
    };
    stock = vi.fn().mockResolvedValue({ count: 1 });
    guardar = vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        for (const [campo, esperado] of Object.entries(where)) {
          const actual = pedido[campo];
          const coincide =
            esperado instanceof Date && actual instanceof Date
              ? esperado.getTime() === actual.getTime()
              : esperado === actual;
          if (!coincide) return { count: 0 };
        }
        Object.assign(pedido, data);
        return { count: 1 };
      },
    );
    const tx = {
      pedido: {
        findUnique: vi.fn(async () => ({ ...pedido })),
        updateMany: guardar,
      },
      tallaProducto: { update: stock, updateMany: stock },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        ...tx,
        pedido: { ...tx.pedido, findMany: vi.fn().mockResolvedValue([]) },
        cloudinaryDeleteJob: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: (callback: (cliente: typeof tx) => Promise<unknown>) =>
          callback(tx),
      })
      .compile();
    app = module.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    api.pago.mockResolvedValue({
      id: 123,
      status: 'approved',
      external_reference: '7',
      transaction_amount: 125,
      currency_id: 'PEN',
      order: { id: 90, type: 'mercadopago' },
      transaction_amount_refunded: 0,
      date_approved: '2026-10-10T12:00:00Z',
      date_last_updated: '2026-10-10T12:01:00Z',
    });
    api.orden.mockResolvedValue({
      id: 90,
      external_reference: '7',
      preference_id: 'pref-7',
      payments: [{ id: 123 }],
    });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  function notificar(firmaValida = true) {
    const ts = '1793034000';
    const firma = createHmac('sha256', 'firma-test')
      .update('id:123;request-id:request-test;ts:' + ts + ';')
      .digest('hex');
    return request(app.getHttpServer())
      .post('/api/pagos/webhook?data.id=123')
      .set('x-request-id', 'request-test')
      .set(
        'x-signature',
        'ts=' + ts + ',v1=' + (firmaValida ? firma : '0'.repeat(64)),
      )
      .send({ type: 'payment', data: { id: '123' } });
  }

  it('confirma por HTTP un pago sin preference_id y acepta su duplicado sin tocar stock', async () => {
    await notificar().expect(200, { recibido: true });
    expect(pedido.estado).toBe('PAGO_VERIFICADO');
    expect(pedido.mpPagoId).toBe('123');
    await notificar().expect(200, { recibido: true });
    expect(pedido.estado).toBe('PAGO_VERIFICADO');
    expect(stock).not.toHaveBeenCalled();
  });

  it('rechaza una firma falsa antes de consultar al proveedor', async () => {
    await notificar(false).expect(401);
    expect(api.pago).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
  });

  it('responde 503 ante un fallo temporal para que Mercado Pago reintente', async () => {
    api.orden.mockRejectedValue(new Error('timeout'));
    await notificar().expect(503);
    expect(pedido.estado).toBe('PENDIENTE');
    expect(guardar).not.toHaveBeenCalled();
  });

  it('registra un reembolso de un pedido entregado manteniendo su entrega e inventario', async () => {
    Object.assign(pedido, { estado: 'ENTREGADO', mpPagoId: '123' });
    api.pago.mockResolvedValue({
      ...(await api.pago()),
      status: 'refunded',
      transaction_amount_refunded: 125,
    });
    await notificar().expect(200);
    expect(pedido.estado).toBe('ENTREGADO');
    expect(pedido.mpEstadoPago).toBe('refunded');
    expect(pedido.mpRequiereRevision).toBe(true);
    expect(stock).not.toHaveBeenCalled();
  });
});
