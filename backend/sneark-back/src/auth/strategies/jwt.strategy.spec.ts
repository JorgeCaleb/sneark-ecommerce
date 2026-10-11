import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Rol } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let findUnique: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findUnique = vi.fn();
    const config = {
      getOrThrow: vi.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    const prisma = {
      usuario: { findUnique },
    } as unknown as PrismaService;

    strategy = new JwtStrategy(config, prisma);
  });

  it('retorna el usuario y su rol actual desde la base de datos', async () => {
    findUnique.mockResolvedValue({
      id: 5,
      email: 'usuario@example.test',
      rol: Rol.CLIENTE,
    });

    const resultado = await strategy.validate({
      sub: 5,
      email: 'usuario@example.test',
      rol: 'CLIENTE',
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { id: true, email: true, rol: true },
    });
    expect(resultado).toEqual({
      id: 5,
      email: 'usuario@example.test',
      rol: Rol.CLIENTE,
    });
  });

  it('devuelve el rol actualizado de la base de datos si un admin fue degradado', async () => {
    // El token decía ADMIN, pero en la base de datos ya es CLIENTE
    findUnique.mockResolvedValue({
      id: 8,
      email: 'exadmin@example.test',
      rol: Rol.CLIENTE,
    });

    const resultado = await strategy.validate({
      sub: 8,
      email: 'exadmin@example.test',
      rol: 'ADMIN', // Rol viejo en el JWT
    });

    expect(resultado.rol).toBe(Rol.CLIENTE);
  });

  it('lanza UnauthorizedException si el usuario ya no existe en la base de datos', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 99,
        email: 'eliminado@example.test',
        rol: 'CLIENTE',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
