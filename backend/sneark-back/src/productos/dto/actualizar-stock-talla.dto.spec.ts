import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ActualizarStockTallaDto } from './actualizar-stock-talla.dto.js';

describe('ActualizarStockTallaDto', () => {
  const pipe = new ValidationPipe();
  const metadata = {
    type: 'body' as const,
    metatype: ActualizarStockTallaDto,
  };

  it.each([0, 8])(
    'accepts non-negative integer stock %i with its expected value',
    async (stock) => {
      await expect(
        pipe.transform({ stock, stockEsperado: 3 }, metadata),
      ).resolves.toMatchObject({ stock, stockEsperado: 3 });
    },
  );

  it.each([-1, 1.5, '8'])(
    'rejects invalid stock value %p',
    async (stock) => {
      await expect(
        pipe.transform({ stock, stockEsperado: 3 }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('requires the expected stock value', async () => {
    await expect(
      pipe.transform({ stock: 4 }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([-1, 1.5])(
    'rejects invalid expected stock value %p',
    async (stockEsperado) => {
      await expect(
        pipe.transform({ stock: 4, stockEsperado }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
