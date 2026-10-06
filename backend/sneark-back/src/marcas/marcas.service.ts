import {
  BadGatewayException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
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

  async subirLogo(id: number, archivo: Express.Multer.File) {
    const marca = await this.buscarPorId(id);

    if (!archivo) {
      throw new NotFoundException('No se recibió el archivo del logo');
    }

    const anteriorPublicId =
      marca.logoPublicId ?? this.publicIdDesdeLogoCloudinary(marca.logo, id);
    const subido = await this.cloudinary.subirLogo(
      archivo,
      `sneark/marcas/${id}`,
    );

    const actualizada = await this.prisma.marca.update({
      where: { id },
      data: { logo: subido.url, logoPublicId: subido.publicId },
    });

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
      marca.logoPublicId ?? this.publicIdDesdeLogoCloudinary(marca.logo, id);
    if (logoPublicId) {
      await this.cloudinary.eliminarImagen(logoPublicId);
    }

    return this.prisma.marca.delete({ where: { id } });
  }

  private publicIdDesdeLogoCloudinary(
    logo: string | null,
    marcaId: number,
  ): string | null {
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

    const rutaCarpeta = `sneark/marcas/${marcaId}/`;
    const publicIdConExtension = assetSegments.join('/');
    if (!publicIdConExtension.startsWith(rutaCarpeta)) {
      return null;
    }

    const extensionIndex = publicIdConExtension.lastIndexOf('.');
    if (extensionIndex <= rutaCarpeta.length) {
      return null;
    }

    return publicIdConExtension.slice(0, extensionIndex);
  }
}
