import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { nombreCarpetaCloudinary } from '../cloudinary/nombre-carpeta.util.js';
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
    const tallasNormalizadas = tallas?.map((talla) => ({
      talla: talla.talla.trim(),
      stock: talla.stock,
    }));
    this.validarTallasDuplicadas(tallasNormalizadas);

    return this.prisma.producto.create({
      data: {
        ...datos,
        precio: datos.precio,
        tallas: tallasNormalizadas?.length
          ? { create: tallasNormalizadas }
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

    const where: Prisma.ProductoWhereInput = { activo: true };

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

  async buscarPorIdPublico(id: number) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, activo: true },
      include: INCLUDE_PRODUCTO,
    });

    if (!producto) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    return producto;
  }

  async actualizar(id: number, dto: ActualizarProductoDto) {
    const { tallas, ...datos } = dto;
    const tallasNormalizadas = tallas?.map((talla) => ({
      talla: talla.talla.trim(),
      stock: talla.stock,
    }));
    this.validarTallasDuplicadas(tallasNormalizadas);

    return this.prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!producto) {
        throw new NotFoundException(`Producto con id ${id} no encontrado`);
      }

      if (tallasNormalizadas !== undefined) {
        const tallasActuales = await tx.tallaProducto.findMany({
          where: { productoId: id },
          include: {
            _count: {
              select: { itemsCarrito: true, itemsPedido: true },
            },
          },
        });
        const nombresSolicitados = new Set(
          tallasNormalizadas.map((talla) =>
            this.normalizarNombreTalla(talla.talla),
          ),
        );
        const tallasQuitadas = tallasActuales.filter(
          (talla) =>
            !nombresSolicitados.has(this.normalizarNombreTalla(talla.talla)),
        );
        const tallasEnUso = tallasQuitadas.filter(
          (talla) =>
            talla._count.itemsCarrito > 0 || talla._count.itemsPedido > 0,
        );

        if (tallasEnUso.length) {
          throw new BadRequestException(
            `No se pueden quitar las tallas ${tallasEnUso
              .map((talla) => talla.talla)
              .join(
                ', ',
              )} porque están en carritos o pedidos. Conservá esas tallas y asignales stock 0.`,
          );
        }

        if (tallasQuitadas.length) {
          await tx.tallaProducto.deleteMany({
            where: { id: { in: tallasQuitadas.map((talla) => talla.id) } },
          });
        }

        const tallasPorNombre = new Map(
          tallasActuales.map((talla) => [
            this.normalizarNombreTalla(talla.talla),
            talla,
          ]),
        );

        for (const talla of tallasNormalizadas) {
          const tallaActual = tallasPorNombre.get(
            this.normalizarNombreTalla(talla.talla),
          );

          if (tallaActual) {
            await tx.tallaProducto.update({
              where: { id: tallaActual.id },
              data: { stock: talla.stock },
            });
          } else {
            await tx.tallaProducto.create({
              data: { ...talla, productoId: id },
            });
          }
        }
      }

      return tx.producto.update({
        where: { id },
        data: datos,
        include: INCLUDE_PRODUCTO,
      });
    });
  }

  private validarTallasDuplicadas(
    tallas: { talla: string; stock: number }[] | undefined,
  ) {
    if (!tallas) return;

    const nombres = tallas.map((talla) =>
      this.normalizarNombreTalla(talla.talla),
    );
    if (new Set(nombres).size !== nombres.length) {
      throw new BadRequestException('No se pueden repetir las tallas');
    }
  }

  private normalizarNombreTalla(talla: string) {
    return talla.trim().toLocaleLowerCase();
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
    const producto = await this.buscarPorId(id);

    if (!archivos?.length) {
      throw new BadRequestException('Debe enviar al menos una imagen');
    }

    const resultados = await Promise.allSettled(
      archivos.map((archivo) =>
        this.cloudinary.subirImagen(
          archivo,
          `sneark/productos/${nombreCarpetaCloudinary(producto.nombre)}`,
        ),
      ),
    );
    const subidas = resultados.flatMap((resultado) =>
      resultado.status === 'fulfilled' ? [resultado.value] : [],
    );
    const falloSubida = resultados.find(
      (resultado) => resultado.status === 'rejected',
    );

    if (falloSubida?.status === 'rejected') {
      await this.limpiarImagenesCloudinary(subidas);
      throw falloSubida.reason;
    }

    try {
      await this.prisma.imagenProducto.createMany({
        data: subidas.map((subida) => ({
          url: subida.url,
          publicId: subida.publicId,
          productoId: id,
        })),
      });
    } catch (error) {
      await this.limpiarImagenesCloudinary(subidas);
      throw error;
    }

    return this.buscarPorId(id);
  }

  async eliminarImagen(productoId: number, imagenId: number) {
    const imagen = await this.prisma.imagenProducto.findFirst({
      where: { id: imagenId, productoId },
    });

    if (!imagen) {
      throw new NotFoundException('Imagen no encontrada');
    }

    await this.prisma.imagenProducto.delete({ where: { id: imagenId } });
    try {
      await this.cloudinary.eliminarImagen(imagen.publicId);
    } catch (error) {
      const detalle =
        error instanceof Error ? error.message : 'Error desconocido';
      throw new BadGatewayException(
        `La imagen se quitó del producto, pero no se pudo eliminar de Cloudinary: ${detalle}`,
      );
    }

    return { mensaje: 'Imagen eliminada correctamente' };
  }

  private async limpiarImagenesCloudinary(
    imagenes: { publicId: string }[],
  ): Promise<void> {
    const resultados = await Promise.allSettled(
      imagenes.map((imagen) => this.cloudinary.eliminarImagen(imagen.publicId)),
    );
    const errores = resultados.flatMap((resultado) =>
      resultado.status === 'rejected'
        ? [
            resultado.reason instanceof Error
              ? resultado.reason.message
              : 'Error desconocido',
          ]
        : [],
    );

    if (errores.length) {
      throw new BadGatewayException(
        `No se pudieron guardar las imágenes y falló la limpieza de Cloudinary: ${errores.join('; ')}`,
      );
    }
  }

  // ─── Tallas ──────────────────────────────────────────────────────────────────

  async actualizarStockTalla(
    productoId: number,
    tallaId: number,
    stock: number,
  ) {
    if (!Number.isInteger(stock) || stock < 0) {
      throw new BadRequestException('El stock debe ser un entero no negativo');
    }

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
