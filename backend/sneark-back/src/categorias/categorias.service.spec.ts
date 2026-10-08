import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoriasService } from './categorias.service.js';

function prismaP2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('CategoriasService unique names', () => {
  it('translates a concurrent duplicate create into a conflict', async () => {
    const categoria = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockRejectedValue(prismaP2002()),
    };
    const service = new CategoriasService({
      categoria,
    } as unknown as PrismaService);

    await expect(service.crear({ nombre: 'Running' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('translates a concurrent duplicate rename into a conflict', async () => {
    const categoria = {
      findUnique: vi.fn().mockResolvedValue({ id: 2 }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockRejectedValue(prismaP2002()),
    };
    const service = new CategoriasService({
      categoria,
    } as unknown as PrismaService);

    await expect(service.actualizar(2, { nombre: 'Running' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('propagates non-unique database failures', async () => {
    const databaseError = new Error('Database unavailable');
    const service = new CategoriasService({
      categoria: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(databaseError),
      },
    } as unknown as PrismaService);

    await expect(service.crear({ nombre: 'Running' })).rejects.toBe(
      databaseError,
    );
  });
});
