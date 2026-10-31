import { BadRequestException, ConflictException } from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import { CarritoService } from '../carrito/carrito.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PedidosService } from './pedidos.service.js';

function prepararPedido(
  estado: EstadoPedido,
  mpEstadoPago: string,
  reembolso = 0,
) {
  const pedido = {
    id: 7,
    usuarioId: 3,
    estado,
    mpEstadoPago,
    mpRequiereRevision: true,
    mpMontoReembolsado: new Prisma.Decimal(reembolso),
    mpActualizadoEn: new Date('2026-10-10T12:01:00Z'),
    pagadoEn: new Date('2026-10-10T12:00:00Z'),
    inventarioReservado: true,
    items: [{ tallaProductoId: 10, cantidad: 1 }],
  };
  const tx = {
    pedido: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tallaProducto: { update: vi.fn(), updateMany: vi.fn() },
  };
  const transaction = vi.fn((callback) => callback(tx));
  const service = new PedidosService(
    { $transaction: transaction } as unknown as PrismaService,
    {} as CarritoService,
  );
  vi.spyOn(service, 'buscarPorId').mockResolvedValue(
    pedido as Awaited<ReturnType<typeof service.buscarPorId>>,
  );
  return { service, tx, transaction, pedido };
}

describe('Incidencias financieras y avance del pedido', () => {
  it.each([
    [EstadoPedido.EN_PREPARACION, EstadoPedido.ENVIADO, 'charged_back', 0],
    [EstadoPedido.ENVIADO, EstadoPedido.ENTREGADO, 'in_mediation', 0],
    [
      EstadoPedido.PAGO_REQUIERE_REVISION,
      EstadoPedido.PAGO_VERIFICADO,
      'refunded',
      125,
    ],
    [
      EstadoPedido.PAGO_REQUIERE_REVISION,
      EstadoPedido.PAGO_VERIFICADO,
      'approved',
      25,
    ],
  ])(
    'bloquea %s a %s con pago %s',
    async (estado, destino, pago, reembolso) => {
      const { service, transaction } = prepararPedido(estado, pago, reembolso);
      await expect(
        service.actualizarEstado(7, { estado: destino }),
      ).rejects.toThrow(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('permite resolver manualmente una revision aprobada sin reembolso y sin reservar dos veces', async () => {
    const { service, tx, pedido } = prepararPedido(
      EstadoPedido.PAGO_REQUIERE_REVISION,
      'approved',
    );
    await service.actualizarEstado(7, { estado: EstadoPedido.PAGO_VERIFICADO });
    expect(tx.pedido.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mpRequiereRevision: true,
          mpActualizadoEn: pedido.mpActualizadoEn,
        }),
        data: expect.objectContaining({
          mpRequiereRevision: false,
          pagadoEn: pedido.pagadoEn,
        }),
      }),
    );
    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza una transicion si un webhook modifica las finanzas mientras se guarda', async () => {
    const { service, tx } = prepararPedido(
      EstadoPedido.PAGO_REQUIERE_REVISION,
      'approved',
    );
    tx.pedido.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.actualizarEstado(7, { estado: EstadoPedido.PAGO_VERIFICADO }),
    ).rejects.toThrow(ConflictException);
    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
  });

  it('permite confirmar una disputa resuelta conservando la entrega y el inventario', async () => {
    const { service, tx } = prepararPedido(EstadoPedido.ENTREGADO, 'approved');
    await service.actualizarEstado(7, { estado: EstadoPedido.ENTREGADO });
    expect(tx.pedido.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estado: EstadoPedido.ENTREGADO, mpRequiereRevision: false },
      }),
    );
    expect(tx.tallaProducto.update).not.toHaveBeenCalled();
    expect(tx.tallaProducto.updateMany).not.toHaveBeenCalled();
  });

  it('no permite limpiar la incidencia de un pedido entregado con dinero reembolsado', async () => {
    const { service, transaction } = prepararPedido(
      EstadoPedido.ENTREGADO,
      'refunded',
      125,
    );
    await expect(
      service.actualizarEstado(7, { estado: EstadoPedido.ENTREGADO }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('incluye pedidos enviados con incidencia al filtrar pagos en revision', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new PedidosService(
      {
        pedido: { findMany, count: vi.fn().mockResolvedValue(0) },
      } as unknown as PrismaService,
      {} as CarritoService,
    );
    await service.buscarPagina({
      estado: EstadoPedido.PAGO_REQUIERE_REVISION,
      pagina: 1,
      limite: 25,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { estado: EstadoPedido.PAGO_REQUIERE_REVISION },
            { mpRequiereRevision: true },
          ],
        },
      }),
    );
  });
});
