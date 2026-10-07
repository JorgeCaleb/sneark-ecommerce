import {
  BadGatewayException,
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

@Injectable()
export class MarcasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async crear(dto: CrearMarcaDto) {
    const existe = await this.prisma.marca.findUnique({
      where: { nombre: dto.nombre },
    });

    if (existe) {
      throw new ConflictException(`La marca "${dto.nombre}" ya existe`);
    }

    try {
      return await this.prisma.marca.create({ data: dto });
    } catch (error) {
      this.lanzarConflictoNombreDuplicado(error, dto.nombre);
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

    try {
      return await this.prisma.marca.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.lanzarConflictoNombreDuplicado(error, dto.nombre);
    }
  }

  async subirLogo(id: number, archivo: Express.Multer.File) {
    const marca = await this.buscarPorId(id);

    if (!archivo) {
      throw new NotFoundException('No se recibió el archivo del logo');
    }

    const anteriorPublicId =
      marca.logoPublicId ?? this.publicIdDesdeLogoCloudinary(marca.logo);
    const subido = await this.cloudinary.subirLogo(
      archivo,
      `sneark/marcas/${nombreCarpetaCloudinary(marca.nombre)}`,
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
    const eliminada = await this.prisma.marca.delete({ where: { id } });
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

  private lanzarConflictoNombreDuplicado(
    error: unknown,
    nombre?: string,
  ): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `La marca${nombre ? ` "${nombre}"` : ''} ya existe`,
      );
    }
    throw error;
  }

  private publicIdDesdeLogoCloudinary(logo: string | null): string | null {
    if (!logo) {
      return null;
    }

    let pathname: string;
    try {
      const url = new URL(logo);
      if (url.hostname !== 'res.cloudinary.com') {
        return null;
      }
      pathname = url.pathname;
    } catch {
      return null;
    }

    const segmentos = pathname.split('/').filter(Boolean);
    const uploadIndex = segmentos.indexOf('upload');
    if (uploadIndex < 0) {
      return null;
    }

    const assetSegments = segmentos.slice(uploadIndex + 1);
    if (assetSegments[0]?.match(/^v\d+$/)) {
      assetSegments.shift();
    }

    const publicIdConExtension = assetSegments.join('/');
    if (!publicIdConExtension.startsWith('sneark/marcas/')) {
      return null;
    }

    const extensionIndex = publicIdConExtension.lastIndexOf('.');
    if (extensionIndex <= 'sneark/marcas/'.length) {
      return null;
    }

    return publicIdConExtension.slice(0, extensionIndex);
  }
}
