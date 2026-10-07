import { PedidosController } from './pedidos.controller.js';
import { PedidosService } from './pedidos.service.js';

describe('PedidosController', () => {
  let controller: PedidosController;
  let pedidosService: {
    buscarPorId: ReturnType<typeof vi.fn>;
    buscarPorUsuario: ReturnType<typeof vi.fn>;
    buscarPagina: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    pedidosService = {
      buscarPorId: vi.fn(),
      buscarPorUsuario: vi.fn(),
      buscarPagina: vi.fn(),
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

  it('mantiene GET /pedidos paginado y pasa los filtros al servicio', async () => {
    const filtros = { pagina: 3, limite: 25 };
    pedidosService.buscarPagina.mockResolvedValue({
      datos: [],
      meta: { total: 51, pagina: 3, limite: 25, totalPaginas: 3 },
    });

    await expect(controller.buscarTodos(filtros)).resolves.toEqual({
      datos: [],
      meta: { total: 51, pagina: 3, limite: 25, totalPaginas: 3 },
    });
    expect(pedidosService.buscarPagina).toHaveBeenCalledWith(filtros);
  });
});
