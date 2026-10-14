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

  it('traduce un duplicate email concurrente en conflicto', async () => {
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

  it('propaga errores que no son conflictos de unicidad', async () => {
    const errorBD = new Error('Base de datos no disponible');
    const service = new UsuariosService({
      usuario: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(errorBD),
      },
    } as unknown as PrismaService);

    await expect(
      service.crear({
        nombre: 'Cliente',
        email: 'cliente@example.test',
        password: 'password',
      }),
    ).rejects.toBe(errorBD);
  });

  it('crea las cuentas públicas sin elegir rol para que Prisma asigne CLIENTE', async () => {
    const usuarioCreado = {
      id: 12,
      nombre: 'Cliente',
      email: 'cliente@example.test',
      password: 'hash',
      rol: 'CLIENTE',
      creadoEn: new Date('2026-01-01'),
    };
    const crear = vi.fn().mockResolvedValue(usuarioCreado);
    const service = new UsuariosService({
      usuario: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: crear,
      },
    } as unknown as PrismaService);

    await expect(
      service.crear({
        nombre: 'Cliente',
        email: 'cliente@example.test',
        password: 'clave-segura',
      }),
    ).resolves.toMatchObject({ rol: 'CLIENTE' });

    expect(crear.mock.calls[0][0].data).not.toHaveProperty('rol');
  });
});

describe('UsuariosService buscarClientes', () => {
  it('devuelve un directorio paginado de clientes sin campos de contraseña', async () => {
    const clientes = [
      {
        id: 8,
        nombre: 'Cliente',
        email: 'cliente@example.test',
        creadoEn: new Date('2026-01-01'),
        _count: { pedidos: 2 },
      },
    ];
    const findMany = vi.fn().mockResolvedValue(clientes);
    const count = vi.fn().mockResolvedValue(1);
    const service = new UsuariosService({
      usuario: { findMany, count },
    } as unknown as PrismaService);

    await expect(
      service.buscarClientes({ busqueda: 'cliente', pagina: 2, limite: 10 }),
    ).resolves.toEqual({
      datos: clientes,
      meta: { total: 1, pagina: 2, limite: 10, totalPaginas: 1 },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        rol: 'CLIENTE',
        OR: [
          { nombre: { contains: 'cliente' } },
          { email: { contains: 'cliente' } },
        ],
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        creadoEn: true,
        _count: { select: { pedidos: true } },
      },
      orderBy: { creadoEn: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        rol: 'CLIENTE',
        OR: [
          { nombre: { contains: 'cliente' } },
          { email: { contains: 'cliente' } },
        ],
      },
    });
    expect(JSON.stringify(clientes)).not.toContain('password');
  });
});
