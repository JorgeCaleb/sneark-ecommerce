import { ProductosController } from './productos.controller.js';
import { ProductosService } from './productos.service.js';

describe('ProductosController detalle público de producto', () => {
  it('usa la búsqueda solo-activos para el detalle público', async () => {
    const productosService = {
      buscarPorIdPublico: vi.fn().mockResolvedValue({ id: 12, activo: true }),
    };
    const controller = new ProductosController(
      productosService as unknown as ProductosService,
    );

    await expect(controller.buscarPorId(12)).resolves.toEqual({
      id: 12,
      activo: true,
    });
    expect(productosService.buscarPorIdPublico).toHaveBeenCalledWith(12);
  });
});

describe('ProductosController listado admin de productos', () => {
  it('delega los filtros de administración al listado admin de productos', async () => {
    const filtros = { estado: 'inactivos' as const, pagina: 2, limite: 10 };
    const productosService = {
      buscarTodosAdmin: vi.fn().mockResolvedValue({ datos: [], meta: {} }),
    };
    const controller = new ProductosController(
      productosService as unknown as ProductosService,
    );

    await controller.buscarTodosAdmin(filtros);

    expect(productosService.buscarTodosAdmin).toHaveBeenCalledWith(filtros);
  });
});
