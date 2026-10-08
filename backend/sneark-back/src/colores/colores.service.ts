import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { esConflictoUnico } from '../prisma/es-conflicto-unico.js';
import { ActualizarColorDto } from './dto/actualizar-color.dto.js';
import { CrearColorDto } from './dto/crear-color.dto.js';

@Injectable()
export class ColoresService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearColorDto) {
    try {
      return await this.prisma.color.create({
        data: { nombre: dto.nombre, codigo: dto.codigo.trim().toUpperCase() },
      });
    } catch (error) {
      if (esConflictoUnico(error)) {
        throw new ConflictException('El nombre o código de color ya existe');
      }
      throw error;
    }
  }

  buscarTodos() {
    return this.prisma.color.findMany({ orderBy: { nombre: 'asc' } });
  }

  async actualizar(id: number, dto: ActualizarColorDto) {
    const codigo = dto.codigo?.trim().toUpperCase();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const color = await tx.color.findUnique({ where: { id } });
          if (!color) {
            throw new NotFoundException(`Color con id ${id} no encontrado`);
          }
          if (codigo && codigo !== color.codigo) {
            const variantes = await tx.tallaProducto.count({
              where: { colorId: id },
            });
            if (variantes > 0) {
              throw new ConflictException(
                'No se puede cambiar el código de un color con variantes asociadas',
              );
            }
          }
          return tx.color.update({
            where: { id },
            data: {
              ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
              ...(codigo ? { codigo } : {}),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (esConflictoUnico(error)) {
        throw new ConflictException('El nombre o código de color ya existe');
      }
      throw error;
    }
  }

  async eliminar(id: number) {
    const color = await this.prisma.color.findUnique({ where: { id } });
    if (!color) {
      throw new NotFoundException(`Color con id ${id} no encontrado`);
    }

    const variantes = await this.prisma.tallaProducto.count({
      where: { colorId: id },
    });
    if (variantes > 0) {
      throw new ConflictException(
        `No se puede eliminar: el color tiene ${variantes} variante(s) asociada(s)`,
      );
    }

    try {
      return await this.prisma.color.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException('El color está siendo utilizado');
      }
      throw error;
    }
  }
}
