import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ActualizarStockTallaDto } from './actualizar-stock-talla.dto.js';

describe('ActualizarStockTallaDto', () => {
  const pipe = new ValidationPipe();
  const metadata = {
    type: 'body' as const,
    metatype: ActualizarStockTallaDto,
  };

  it.each([0, 8])('accepts non-negative integer stock %i', async (stock) => {
    await expect(pipe.transform({ stock }, metadata)).resolves.toMatchObject({
      stock,
    });
  });

  it.each([-1, 1.5, '8'])(
    'rejects invalid stock value %p',
    async (stock) => {
      await expect(pipe.transform({ stock }, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});
