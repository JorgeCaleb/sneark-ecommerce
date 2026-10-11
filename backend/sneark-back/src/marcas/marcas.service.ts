import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { nombreCarpetaCloudinary } from '../cloudinary/nombre-carpeta.util.js';
import { CrearMarcaDto } from './dto/crear-marca.dto.js';
import { ActualizarMarcaDto } from './dto/actualizar-marca.dto.js';
import { publicIdDesdeUrlCloudinary } from '../cloudinary/public-id-cloudinary.util.js';
import { esConflictoUnico } from '../prisma/es-conflicto-unico.js';

@Injectable()
export class MarcasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async crear(dto: CrearMarcaDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const datos = {
      nombre: dto.nombre,
      codigo,
      ...(dto.logo !== undefined ? { logo: dto.logo } : {}),
    };
    const existe = await this.prisma.marca.findUnique({
      where: { nombre: dto.nombre },
    });

    if (existe) {
      throw new ConflictException(`La marca "${dto.nombre}" ya existe`);
    }

    try {
      return await this.prisma.marca.create({ data: datos });
    } catch (error) {
      this.lanzarConflictoDuplicado(error, dto.nombre, codigo);
    }
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
    const codigo = dto.codigo?.trim().toUpperCase();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const marca = await tx.marca.findUnique({
            where: { id },
            select: { id: true, codigo: true },
          });
          if (!marca) {
            throw new NotFoundException(`Marca con id ${id} no encontrada`);
          }

          if (codigo && codigo !== marca.codigo) {
            const variantes = await tx.tallaProducto.count({
              where: { producto: { marcaId: id } },
            });
            if (variantes > 0) {
              throw new ConflictException(
                'No se puede cambiar el código de una marca con variantes asociadas',
              );
            }
          }

          if (dto.nombre) {
            const duplicado = await tx.marca.findFirst({
              where: { nombre: dto.nombre, NOT: { id } },
            });
            if (duplicado) {
              throw new ConflictException(`La marca "${dto.nombre}" ya existe`);
            }
          }

          // `logo` y `logoPublicId` se modifican ÚNICAMENTE via subirLogo().
          // No se exponen aquí para evitar que una URL arbitraria deje
          // un archivo huérfano en Cloudinary.
          return tx.marca.update({
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
      this.lanzarConflictoDuplicado(error, dto.nombre, codigo);
    }
  }

  async subirLogo(id: number, archivo: Express.Multer.File) {
    const marca = await this.buscarPorId(id);

    if (!archivo) {
      throw new BadRequestException('Debes adjuntar el archivo del logo');
    }

    const anteriorPublicId =
      marca.logoPublicId ?? this.publicIdDesdeLogoCloudinary(marca.logo);
    const subido = await this.cloudinary.subirLogo(
      archivo,
      `SOHO/marcas/${nombreCarpetaCloudinary(marca.nombre)}`,
    );

    let actualizada;
    try {
      actualizada = await this.prisma.marca.update({
        where: { id },
        data: { logo: subido.url, logoPublicId: subido.publicId },
      });
    } catch (error) {
      try {
        await this.cloudinary.eliminarImagen(subido.publicId);
      } catch (cleanupError) {
        const detalle =
          cleanupError instanceof Error
            ? cleanupError.message
            : 'Error desconocido';
        throw new BadGatewayException(
          `No se pudo guardar el logo y tampoco eliminar el archivo subido: ${detalle}`,
        );
      }
      throw error;
    }

    if (anteriorPublicId) {
      try {
        await this.cloudinary.eliminarImagen(anteriorPublicId);
      } catch (error) {
        const detalle =
          error instanceof Error ? error.message : 'Error desconocido';
        throw new BadGatewayException(
          `El logo nuevo se guardó, pero no se pudo eliminar el anterior: ${detalle}`,
        );
      }
    }

    return actualizada;
  }

  async eliminar(id: number) {
    const marca = await this.buscarPorId(id);

    // Verificar que no tenga productos asociados antes de eliminar
    const conProductos = await this.prisma.producto.count({
      where: { marcaId: id },
    });

    if (conProductos > 0) {
      throw new ConflictException(
        `No se puede eliminar: la marca tiene ${conProductos} producto(s) asociado(s)`,
      );
    }

    const logoPublicId =
      marca.logoPublicId ?? this.publicIdDesdeLogoCloudinary(marca.logo);
    let eliminada;
    try {
      eliminada = await this.prisma.marca.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException('La marca está siendo utilizada');
      }
      throw error;
    }
    if (logoPublicId) {
      try {
        await this.cloudinary.eliminarImagen(logoPublicId);
      } catch (error) {
        const detalle =
          error instanceof Error ? error.message : 'Error desconocido';
        throw new BadGatewayException(
          `La marca se eliminó, pero no se pudo eliminar su logo de Cloudinary: ${detalle}`,
        );
      }
    }

    return eliminada;
  }

  private lanzarConflictoDuplicado(
    error: unknown,
    nombre?: string,
    codigo?: string,
  ): never {
    if (esConflictoUnico(error)) {
      throw new ConflictException(
        error.meta?.target?.toString().includes('codigo')
          ? `El código de marca${codigo ? ` "${codigo}"` : ''} ya existe`
          : `La marca${nombre ? ` "${nombre}"` : ''} ya existe`,
      );
    }
    throw error;
  }

  private publicIdDesdeLogoCloudinary(logo: string | null): string | null {
    return publicIdDesdeUrlCloudinary(logo, 'SOHO/marcas');
  }
}
