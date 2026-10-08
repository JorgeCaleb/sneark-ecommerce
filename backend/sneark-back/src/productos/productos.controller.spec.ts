import { ProductosController } from './productos.controller.js';
import { ProductosService } from './productos.service.js';

describe('ProductosController public product detail', () => {
  it('uses the active-only lookup for public product details', async () => {
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
