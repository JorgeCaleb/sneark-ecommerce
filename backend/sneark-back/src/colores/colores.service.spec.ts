import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ColoresService } from './colores.service.js';

describe('ColoresService', () => {
  it('normalizes color codes when creating a color', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 1, nombre: 'Negro', codigo: 'BK' });
    const service = new ColoresService({
      color: { create },
    } as unknown as PrismaService);

    await service.crear({ nombre: 'Negro', codigo: ' bk ' });

    expect(create).toHaveBeenCalledWith({
      data: { nombre: 'Negro', codigo: 'BK' },
    });
  });

  it('blocks changing a color code while variants depend on it', async () => {
    const color = { id: 2, codigo: 'BK' };
    const tx = {
      color: {
        findUnique: vi.fn().mockResolvedValue(color),
        update: vi.fn(),
      },
      tallaProducto: { count: vi.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ColoresService(prisma as unknown as PrismaService);

    await expect(service.actualizar(2, { codigo: 'BL' })).rejects.toThrow(
      ConflictException,
    );
    expect(tx.color.update).not.toHaveBeenCalled();
  });

  it('reports duplicate color names or codes as a conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    const service = new ColoresService({
      color: { create: vi.fn().mockRejectedValue(duplicate) },
    } as unknown as PrismaService);

    await expect(
      service.crear({ nombre: 'Negro', codigo: 'BK' }),
    ).rejects.toThrow(ConflictException);
  });
});
