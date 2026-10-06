import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearMarcaDto } from './dto/crear-marca.dto.js';
import { ActualizarMarcaDto } from './dto/actualizar-marca.dto.js';

@Injectable()
export class MarcasService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearMarcaDto) {
    const existe = await this.prisma.marca.findUnique({
      where: { nombre: dto.nombre },
    });

    if (existe) {
      throw new ConflictException(`La marca "${dto.nombre}" ya existe`);
    }

    return this.prisma.marca.create({ data: dto });
  }

  async buscarTodas() {
    return this.prisma.marca.findMany({
      orderBy: { nombre: 'asc' },
    });
  }

  async buscarPorId(id: number) {
    const marca = await this.prisma.marca.findUnique({
      where: { id },
      include: {
        // Incluye cuántos productos tiene cada marca
        _count: { select: { productos: true } },
      },
    });

    if (!marca) {
      throw new NotFoundException(`Marca con id ${id} no encontrada`);
    }

    return marca;
  }

  async actualizar(id: number, dto: ActualizarMarcaDto) {
    await this.buscarPorId(id); // lanza 404 si no existe

    // Si viene un nuevo nombre, verificar que no esté en uso por otra marca
    if (dto.nombre) {
      const duplicado = await this.prisma.marca.findFirst({
        where: { nombre: dto.nombre, NOT: { id } },
      });
      if (duplicado) {
        throw new ConflictException(`La marca "${dto.nombre}" ya existe`);
      }
    }

    return this.prisma.marca.update({
      where: { id },
      data: dto,
    });
  }

  async eliminar(id: number) {
    await this.buscarPorId(id); // lanza 404 si no existe

    // Verificar que no tenga productos asociados antes de eliminar
    const conProductos = await this.prisma.producto.count({
      where: { marcaId: id },
    });

    if (conProductos > 0) {
      throw new ConflictException(
        `No se puede eliminar: la marca tiene ${conProductos} producto(s) asociado(s)`,
      );
    }

    return this.prisma.marca.delete({ where: { id } });
  }
}
