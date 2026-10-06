import { NotFoundException } from '@nestjs/common';
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
    const pedido = { id: 12, usuarioId: 7 };
    findFirst.mockResolvedValue(pedido);

    await expect(service.buscarPorUsuario(12, 7)).resolves.toBe(pedido);
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
