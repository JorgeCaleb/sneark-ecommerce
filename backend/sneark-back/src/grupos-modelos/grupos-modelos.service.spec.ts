import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearGrupoModeloDto } from './dto/crear-grupo-modelo.dto.js';
import { GruposModelosService } from './grupos-modelos.service.js';

describe('Grupos de modelos', () => {
  const montar = () => {
    const prisma = {
      grupoModelo: {
        findUnique: vi.fn().mockResolvedValue({ id: 7 }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi
          .fn()
          .mockResolvedValue({ id: 7, nombre: 'Adidas Superstar' }),
        update: vi
          .fn()
          .mockResolvedValue({ id: 7, nombre: 'Adidas Superstar II' }),
      },
      producto: { findMany: vi.fn().mockResolvedValue([]) },
    };
    return {
      prisma,
      service: new GruposModelosService(prisma as unknown as PrismaService),
    };
  };

  it('normaliza el nombre y rechaza nombres vacíos o demasiado largos', async () => {
    const dto = plainToInstance(CrearGrupoModeloDto, {
      nombre: '  Adidas Superstar  ',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.nombre).toBe('Adidas Superstar');
    for (const nombre of ['   ', 'a'.repeat(101), 42]) {
      expect(
        (await validate(plainToInstance(CrearGrupoModeloDto, { nombre })))
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it('obtiene solo productos activos del grupo sin depender de la página del catálogo ni exponer stock', async () => {
    const { prisma, service } = montar();
    await service.buscarModelos(7);
    expect(prisma.producto.findMany).toHaveBeenCalledWith({
      where: { grupoModeloId: 7, activo: true },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        nombre: true,
        imagenes: {
          take: 1,
          orderBy: { id: 'asc' },
          select: { id: true, url: true },
        },
      },
    });
  });

  it('devuelve 404 si el grupo no existe', async () => {
    const { prisma, service } = montar();
    prisma.grupoModelo.findUnique.mockResolvedValue(null);
    await expect(service.buscarModelos(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.producto.findMany).not.toHaveBeenCalled();
  });

  it('permite reutilizar un grupo existente ante un nombre duplicado', async () => {
    const { prisma, service } = montar();
    prisma.grupoModelo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicado', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    await expect(service.crear({ nombre: 'Superstar' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lista los grupos ordenados y con el número de fichas asignadas', async () => {
    const { prisma, service } = montar();
    await service.buscarTodos();
    expect(prisma.grupoModelo.findMany).toHaveBeenCalledWith({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { productos: true } } },
    });
  });

  it('renombra el grupo sin modificar los productos asignados', async () => {
    const { prisma, service } = montar();
    await service.actualizar(7, { nombre: '  Adidas Superstar II  ' });
    expect(prisma.grupoModelo.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { nombre: 'Adidas Superstar II' },
      include: { _count: { select: { productos: true } } },
    });
  });

  it.each([
    ['P2002', ConflictException],
    ['P2025', NotFoundException],
  ])('responde a %s al renombrar un grupo', async (code, Exception) => {
    const { prisma, service } = montar();
    prisma.grupoModelo.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Error', {
        code,
        clientVersion: '6',
      }),
    );
    await expect(
      service.actualizar(7, { nombre: 'Superstar II' }),
    ).rejects.toBeInstanceOf(Exception);
  });
});
