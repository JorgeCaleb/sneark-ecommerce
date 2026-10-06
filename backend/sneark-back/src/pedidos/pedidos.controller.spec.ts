import { PedidosController } from './pedidos.controller.js';
import { PedidosService } from './pedidos.service.js';

describe('PedidosController', () => {
  let controller: PedidosController;
  let pedidosService: {
    buscarPorId: ReturnType<typeof vi.fn>;
    buscarPorUsuario: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    pedidosService = {
      buscarPorId: vi.fn(),
      buscarPorUsuario: vi.fn(),
    };
    controller = new PedidosController(
      pedidosService as unknown as PedidosService,
    );
  });

  it('limita la consulta de un cliente a sus propios pedidos', async () => {
    await controller.buscarPorId({ user: { id: 7, rol: 'CLIENTE' } }, 12);

    expect(pedidosService.buscarPorUsuario).toHaveBeenCalledWith(12, 7);
    expect(pedidosService.buscarPorId).not.toHaveBeenCalled();
  });

  it('permite a un administrador consultar cualquier pedido', async () => {
    await controller.buscarPorId({ user: { id: 7, rol: 'ADMIN' } }, 12);

    expect(pedidosService.buscarPorId).toHaveBeenCalledWith(12);
    expect(pedidosService.buscarPorUsuario).not.toHaveBeenCalled();
  });
});
