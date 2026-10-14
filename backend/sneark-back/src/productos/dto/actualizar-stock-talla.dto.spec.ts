import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ActualizarStockTallaDto } from './actualizar-stock-talla.dto.js';

describe('ActualizarStockTallaDto', () => {
  const pipe = new ValidationPipe();
  const metadata = {
    type: 'body' as const,
    metatype: ActualizarStockTallaDto,
  };

  it.each([0, 8])(
    'acepta stock entero no negativo %i con su valor esperado',
    async (stock) => {
      await expect(
        pipe.transform({ stock, stockEsperado: 3 }, metadata),
      ).resolves.toMatchObject({ stock, stockEsperado: 3 });
    },
  );

  it.each([-1, 1.5, '8'])(
    'rechaza un valor de stock inválido: %p',
    async (stock) => {
      await expect(
        pipe.transform({ stock, stockEsperado: 3 }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('requiere el valor de stock esperado', async () => {
    await expect(
      pipe.transform({ stock: 4 }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([-1, 1.5])(
    'rechaza un valor de stock esperado inválido: %p',
    async (stockEsperado) => {
      await expect(
        pipe.transform({ stock: 4, stockEsperado }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
