import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearCategoriaDto } from './dto/crear-categoria.dto.js';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto.js';
import { esConflictoUnico } from '../prisma/es-conflicto-unico.js';

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearCategoriaDto) {
    const existe = await this.prisma.categoria.findUnique({
      where: { nombre: dto.nombre },
    });

    if (existe) {
      throw new ConflictException(`La categoría "${dto.nombre}" ya existe`);
    }

    try {
      return await this.prisma.categoria.create({ data: dto });
    } catch (error) {
      if (esConflictoUnico(error)) {
        throw new ConflictException(`La categoría "${dto.nombre}" ya existe`);
      }
      throw error;
    }
  }

  async buscarTodas() {
    return this.prisma.categoria.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        _count: { select: { productos: true } },
      },
    });
  }

  async buscarPorId(id: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id },
      include: {
        _count: { select: { productos: true } },
      },
    });

    if (!categoria) {
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    }

    return categoria;
  }

  async actualizar(id: number, dto: ActualizarCategoriaDto) {
    await this.buscarPorId(id);

    if (dto.nombre) {
      const duplicado = await this.prisma.categoria.findFirst({
        where: { nombre: dto.nombre, NOT: { id } },
      });
      if (duplicado) {
        throw new ConflictException(`La categoría "${dto.nombre}" ya existe`);
      }
    }

    try {
      return await this.prisma.categoria.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (esConflictoUnico(error) && dto.nombre) {
        throw new ConflictException(`La categoría "${dto.nombre}" ya existe`);
      }
      throw error;
    }
  }

  async eliminar(id: number) {
    await this.buscarPorId(id);

    const conProductos = await this.prisma.producto.count({
      where: { categoriaId: id },
    });

    if (conProductos > 0) {
      throw new ConflictException(
        `No se puede eliminar: la categoría tiene ${conProductos} producto(s) asociado(s)`,
      );
    }

    return this.prisma.categoria.delete({ where: { id } });
  }
}
