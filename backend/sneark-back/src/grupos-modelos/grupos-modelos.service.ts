import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { esConflictoUnico } from '../prisma/es-conflicto-unico.js';
import { CrearGrupoModeloDto } from './dto/crear-grupo-modelo.dto.js';

@Injectable()
export class GruposModelosService {
  constructor(private readonly prisma: PrismaService) {}

  buscarTodos() {
    return this.prisma.grupoModelo.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { productos: true } } },
    });
  }

  async crear(dto: CrearGrupoModeloDto) {
    try {
      return await this.prisma.grupoModelo.create({
        data: { nombre: dto.nombre.trim() },
      });
    } catch (error) {
      if (esConflictoUnico(error)) {
        throw new ConflictException(
          'Ya existe un grupo con ese nombre. Selecciónalo de la lista.',
        );
      }
      throw error;
    }
  }

  async buscarModelos(id: number) {
    const grupo = await this.prisma.grupoModelo.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!grupo) throw new NotFoundException('Grupo de modelos no encontrado');
    return this.prisma.producto.findMany({
      where: { grupoModeloId: id, activo: true },
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
  }

  async actualizar(id: number, dto: CrearGrupoModeloDto) {
    try {
      return await this.prisma.grupoModelo.update({
        where: { id },
        data: { nombre: dto.nombre.trim() },
        include: { _count: { select: { productos: true } } },
      });
    } catch (error) {
      if (esConflictoUnico(error)) {
        throw new ConflictException('Ya existe un grupo con ese nombre.');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Grupo de modelos no encontrado');
      }
      throw error;
    }
  }
}
