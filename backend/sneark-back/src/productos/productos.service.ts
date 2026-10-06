import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { CrearProductoDto } from './dto/crear-producto.dto.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import { FiltrarProductosDto } from './dto/filtrar-productos.dto.js';

// Campos que siempre se incluyen al devolver un producto
const INCLUDE_PRODUCTO = {
  marca: { select: { id: true, nombre: true, logo: true } },
  categoria: { select: { id: true, nombre: true } },
  imagenes: { select: { id: true, url: true, publicId: true } },
  tallas: {
    select: { id: true, talla: true, stock: true },
    orderBy: { talla: 'asc' as const },
  },
};

@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async crear(dto: CrearProductoDto) {
    const { tallas, ...datos } = dto;

    return this.prisma.producto.create({
      data: {
        ...datos,
        precio: datos.precio,
        tallas: tallas?.length
          ? { create: tallas }
          : undefined,
      },
      include: INCLUDE_PRODUCTO,
    });
  }

  async buscarTodos(filtros: FiltrarProductosDto) {
    const {
      busqueda,
      marcaId,
      categoriaId,
      precioMin,
      precioMax,
      pagina = 1,
      limite = 12,
    } = filtros;

    const where: any = { activo: true };

    if (busqueda) {
      where.nombre = { contains: busqueda };
    }
    if (marcaId) where.marcaId = marcaId;
    if (categoriaId) where.categoriaId = categoriaId;
    if (precioMin !== undefined || precioMax !== undefined) {
      where.precio = {};
      if (precioMin !== undefined) where.precio.gte = precioMin;
      if (precioMax !== undefined) where.precio.lte = precioMax;
    }

    const skip = (pagina - 1) * limite;

    // Ejecutar consulta y conteo en paralelo
    const [productos, total] = await Promise.all([
      this.prisma.producto.findMany({
        where,
        include: INCLUDE_PRODUCTO,
        orderBy: { creadoEn: 'desc' },
        skip,
        take: limite,
      }),
      this.prisma.producto.count({ where }),
    ]);

    return {
      datos: productos,
      meta: {
        total,
        pagina,
        limite,
        totalPaginas: Math.ceil(total / limite),
      },
    };
  }

  async buscarPorId(id: number) {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      include: INCLUDE_PRODUCTO,
    });

    if (!producto) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    return producto;
  }

  async actualizar(id: number, dto: ActualizarProductoDto) {
    await this.buscarPorId(id); // lanza 404 si no existe

    const { tallas, ...datos } = dto;

    return this.prisma.producto.update({
      where: { id },
      data: datos,
      include: INCLUDE_PRODUCTO,
    });
  }

  async desactivar(id: number) {
    await this.buscarPorId(id);

    return this.prisma.producto.update({
      where: { id },
      data: { activo: false },
      include: INCLUDE_PRODUCTO,
    });
  }

  // ─── Imágenes ────────────────────────────────────────────────────────────────

  async subirImagenes(id: number, archivos: Express.Multer.File[]) {
    await this.buscarPorId(id);

    if (!archivos?.length) {
      throw new BadRequestException('Debe enviar al menos una imagen');
    }

    // Subir todas las imágenes a Cloudinary en paralelo
    const subidas = await Promise.all(
      archivos.map((archivo) =>
        this.cloudinary.subirImagen(archivo, `sneark/productos/${id}`),
      ),
    );

    // Guardar las URLs en la base de datos
    await this.prisma.imagenProducto.createMany({
      data: subidas.map((s) => ({ url: s.url, publicId: s.publicId, productoId: id })),
    });

    return this.buscarPorId(id);
  }

  async eliminarImagen(productoId: number, imagenId: number) {
    const imagen = await this.prisma.imagenProducto.findFirst({
      where: { id: imagenId, productoId },
    });

    if (!imagen) {
      throw new NotFoundException('Imagen no encontrada');
    }

    // Eliminar de Cloudinary y de la BD en paralelo
    await Promise.all([
      this.cloudinary.eliminarImagen(imagen.publicId),
      this.prisma.imagenProducto.delete({ where: { id: imagenId } }),
    ]);

    return { mensaje: 'Imagen eliminada correctamente' };
  }

  // ─── Tallas ──────────────────────────────────────────────────────────────────

  async actualizarStockTalla(
    productoId: number,
    tallaId: number,
    stock: number,
  ) {
    await this.buscarPorId(productoId);

    const talla = await this.prisma.tallaProducto.findFirst({
      where: { id: tallaId, productoId },
    });

    if (!talla) {
      throw new NotFoundException('Talla no encontrada');
    }

    return this.prisma.tallaProducto.update({
      where: { id: tallaId },
      data: { stock },
    });
  }
}
