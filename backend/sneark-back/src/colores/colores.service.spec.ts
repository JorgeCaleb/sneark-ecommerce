import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ColoresService } from './colores.service.js';

describe('ColoresService', () => {
  it('normaliza los códigos de color al crear', async () => {
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

  it('bloquea el cambio de código de color cuando hay variantes que dependen de él', async () => {
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

  it('reporta nombres o códigos duplicados como conflicto', async () => {
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
