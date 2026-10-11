import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import * as bcrypt from 'bcrypt';
import { esConflictoUnico } from '../prisma/es-conflicto-unico.js';
import { construirMetaPaginacion } from '../common/paginacion.util.js';

export interface FiltrosClientes {
  busqueda?: string;
  pagina: number;
  limite: number;
}

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearUsuarioDto) {
    // Verificar que el email no esté en uso
    const existe = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (existe) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hashear la contraseña antes de guardar
    const hash = await bcrypt.hash(dto.password, 10);

    try {
      const usuario = await this.prisma.usuario.create({
        data: {
          nombre: dto.nombre,
          email: dto.email,
          password: hash,
        },
      });

      // Nunca devolver el password, ni hasheado
      const { password: _, ...resultado } = usuario;
      return resultado;
    } catch (error) {
      if (esConflictoUnico(error)) {
        throw new ConflictException('El email ya está registrado');
      }
      throw error;
    }
  }

  async buscarPorEmail(email: string) {
    return this.prisma.usuario.findUnique({
      where: { email },
    });
  }

  async buscarPorId(id: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        creadoEn: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  async buscarClientes({ busqueda, pagina, limite }: FiltrosClientes) {
    const where = {
      rol: 'CLIENTE' as const,
      ...(busqueda
        ? {
            OR: [
              { nombre: { contains: busqueda } },
              { email: { contains: busqueda } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          email: true,
          creadoEn: true,
          _count: { select: { pedidos: true } },
        },
        orderBy: { creadoEn: 'desc' },
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return {
      datos,
      meta: construirMetaPaginacion(total, pagina, limite),
    };
  }
}
