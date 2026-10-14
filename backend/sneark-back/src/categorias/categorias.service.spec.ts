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

describe('CategoriasService nombres únicos', () => {
  it('traduce un duplicate create concurrente en conflicto', async () => {
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

  it('traduce un duplicate rename concurrente en conflicto', async () => {
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

  it('propaga errores de base de datos que no son de unicidad', async () => {
    const errorBD = new Error('Base de datos no disponible');
    const service = new CategoriasService({
      categoria: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(errorBD),
      },
    } as unknown as PrismaService);

    await expect(service.crear({ nombre: 'Running' })).rejects.toBe(errorBD);
  });
});
