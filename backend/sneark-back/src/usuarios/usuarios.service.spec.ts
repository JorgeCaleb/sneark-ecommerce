import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsuariosService } from './usuarios.service.js';

describe('UsuariosService crear', () => {
  function prismaP2002() {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
  }

  it('translates a concurrent email duplicate into a conflict', async () => {
    const usuario = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockRejectedValue(prismaP2002()),
    };
    const service = new UsuariosService({
      usuario,
    } as unknown as PrismaService);

    await expect(
      service.crear({
        nombre: 'Cliente',
        email: 'cliente@example.test',
        password: 'password',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('propagates errors other than unique constraint conflicts', async () => {
    const databaseError = new Error('Database unavailable');
    const service = new UsuariosService({
      usuario: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(databaseError),
      },
    } as unknown as PrismaService);

    await expect(
      service.crear({
        nombre: 'Cliente',
        email: 'cliente@example.test',
        password: 'password',
      }),
    ).rejects.toBe(databaseError);
  });
});
