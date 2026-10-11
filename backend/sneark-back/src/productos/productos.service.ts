import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { nombreCarpetaCloudinary } from '../cloudinary/nombre-carpeta.util.js';
import { CrearProductoDto, TallaDto } from './dto/crear-producto.dto.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import { FiltrarProductosDto } from './dto/filtrar-productos.dto.js';
import { FiltrarProductosAdminDto } from './dto/filtrar-productos-admin.dto.js';
import { PrevisualizarSkuDto } from './dto/previsualizar-sku.dto.js';
import { FiltrarInventarioDto } from './dto/filtrar-inventario.dto.js';
import { esConflictoUnico } from '../prisma/es-conflicto-unico.js';
import { construirMetaPaginacion } from '../common/paginacion.util.js';

// Campos completos para endpoints de ADMIN
const INCLUDE_PRODUCTO = {
  marca: { select: { id: true, nombre: true, codigo: true, logo: true } },
  categoria: { select: { id: true, nombre: true } },
  imagenes: { select: { id: true, url: true, publicId: true } },
  tallas: {
    select: {
      id: true,
      genero: true,
      colorId: true,
      color: { select: { id: true, nombre: true, codigo: true } },
      talla: true,
      stock: true,
      sku: true,
    },
    orderBy: { tallaNumero: 'asc' as const },
  },
};

// Campos para endpoints PÚBLICOS — sin publicId de Cloudinary ni SKU interno
const INCLUDE_PRODUCTO_PUBLICO = {
  marca: { select: { id: true, nombre: true, codigo: true, logo: true } },
  categoria: { select: { id: true, nombre: true } },
  imagenes: { select: { id: true, url: true } },
  tallas: {
    select: {
      id: true,
      genero: true,
      colorId: true,
      color: { select: { id: true, nombre: true, codigo: true } },
      talla: true,
      stock: true,
    },
    orderBy: { tallaNumero: 'asc' as const },
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
    const variantes = this.normalizarVariantes(tallas);
    this.validarVariantesDuplicadas(variantes);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [marca, categoria] = await Promise.all([
            tx.marca.findUnique({
              where: { id: datos.marcaId },
              select: { codigo: true },
            }),
            tx.categoria.findUnique({
              where: { id: datos.categoriaId },
              select: { id: true },
            }),
          ]);
          if (!marca) {
            throw new NotFoundException(
              `Marca con id ${datos.marcaId} no encontrada`,
            );
          }
          if (!categoria) {
            throw new NotFoundException(
              `Categoría con id ${datos.categoriaId} no encontrada`,
            );
          }

          const producto = await tx.producto.create({
            data: {
              ...datos,
              codigoModelo: datos.codigoModelo.trim().toUpperCase(),
            },
          });

          for (const variante of variantes ?? []) {
            const color = await tx.color.findUnique({
              where: { id: variante.colorId },
              select: { codigo: true },
            });
            if (!color) {
              throw new NotFoundException(
                `Color con id ${variante.colorId} no encontrado`,
              );
            }
            await tx.tallaProducto.create({
              data: {
                genero: variante.genero,
                colorId: variante.colorId,
                talla: variante.talla,
                tallaNumero: this.tallaANumero(variante.talla),
                stock: variante.stock,
                sku: this.generarSku(
                  marca.codigo,
                  producto.codigoModelo,
                  variante.genero,
                  color.codigo,
                  variante.talla,
                ),
                productoId: producto.id,
              },
            });
          }

          return tx.producto.findUniqueOrThrow({
            where: { id: producto.id },
            include: INCLUDE_PRODUCTO,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.lanzarConflictoUnico(error);
    }
  }

  async buscarTodos(filtros: FiltrarProductosDto) {
    return this.listarProductos(filtros, true, true);
  }

  async buscarTodosAdmin(filtros: FiltrarProductosAdminDto) {
    const activo =
      filtros.estado === 'activos'
        ? true
        : filtros.estado === 'inactivos'
          ? false
          : undefined;
    return this.listarProductos(filtros, activo, false);
  }

  private async listarProductos(
    filtros: FiltrarProductosDto,
    activo?: boolean,
    esPublico = false,
  ) {
    const {
      busqueda,
      marcaId,
      categoriaId,
      precioMin,
      precioMax,
      genero,
      colorId,
      pagina = 1,
      limite = 12,
    } = filtros;

    const where: Prisma.ProductoWhereInput =
      activo === undefined ? {} : { activo };

    if (busqueda) {
      where.nombre = { contains: busqueda };
    }
    if (marcaId) where.marcaId = marcaId;
    if (categoriaId) where.categoriaId = categoriaId;
    if (genero || colorId) {
      where.tallas = {
        some: {
          ...(genero ? { genero } : {}),
          ...(colorId ? { colorId } : {}),
        },
      };
    }
    if (precioMin !== undefined || precioMax !== undefined) {
      where.precio = {};
      if (precioMin !== undefined) where.precio.gte = precioMin;
      if (precioMax !== undefined) where.precio.lte = precioMax;
    }

    const skip = (pagina - 1) * limite;

    // Ejecutar consulta y conteo en paralelo
    const filtroVariante: Prisma.TallaProductoWhereInput = {
      ...(genero ? { genero } : {}),
      ...(colorId ? { colorId } : {}),
    };
    const baseInclude = esPublico ? INCLUDE_PRODUCTO_PUBLICO : INCLUDE_PRODUCTO;
    const incluir = {
      ...baseInclude,
      ...(genero || colorId
        ? { tallas: { ...baseInclude.tallas, where: filtroVariante } }
        : {}),
    } satisfies Prisma.ProductoInclude;

    const [productos, total] = await Promise.all([
      this.prisma.producto.findMany({
        where,
        include: incluir,
        orderBy: { creadoEn: 'desc' },
        skip,
        take: limite,
      }),
      this.prisma.producto.count({ where }),
    ]);

    return {
      datos: productos,
      meta: construirMetaPaginacion(total, pagina, limite),
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
      include: INCLUDE_PRODUCTO_PUBLICO,
    });

    if (!producto) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    return producto;
  }

  async actualizar(id: number, dto: ActualizarProductoDto) {
    const { tallas, ...datos } = dto;
    const variantes = this.normalizarVariantes(tallas);
    this.validarVariantesDuplicadas(variantes);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const producto = await tx.producto.findUnique({
            where: { id },
            include: { marca: { select: { codigo: true } } },
          });

          if (!producto) {
            throw new NotFoundException(`Producto con id ${id} no encontrado`);
          }

          const variantesActuales = await tx.tallaProducto.findMany({
            where: { productoId: id },
            include: {
              _count: {
                select: { itemsCarrito: true, itemsPedido: true },
              },
            },
          });

          const codigoModelo = datos.codigoModelo?.trim().toUpperCase();
          const marcaId = datos.marcaId ?? producto.marcaId;
          if (
            variantesActuales.length &&
            codigoModelo !== undefined &&
            codigoModelo !== producto.codigoModelo
          ) {
            throw new ConflictException(
              'No se puede cambiar el código de modelo de un producto con variantes',
            );
          }
          if (variantesActuales.length && marcaId !== producto.marcaId) {
            throw new ConflictException(
              'No se puede cambiar la marca de un producto con variantes',
            );
          }

          const [marca, categoria] = await Promise.all([
            tx.marca.findUnique({
              where: { id: marcaId },
              select: { codigo: true },
            }),
            datos.categoriaId !== undefined
              ? tx.categoria.findUnique({
                  where: { id: datos.categoriaId },
                  select: { id: true },
                })
              : Promise.resolve(true),
          ]);
          if (!marca) {
            throw new NotFoundException(
              `Marca con id ${marcaId} no encontrada`,
            );
          }
          if (!categoria) {
            throw new NotFoundException(
              `Categoría con id ${datos.categoriaId} no encontrada`,
            );
          }
          const modeloFinal = codigoModelo ?? producto.codigoModelo;

          if (variantes !== undefined) {
            const actualesPorId = new Map(
              variantesActuales.map((v) => [v.id, v]),
            );
            const actualesPorIdentidad = new Map(
              variantesActuales.map((v) => [this.claveIdentidad(v), v]),
            );
            const conservadas = new Set<number>();

            for (const variante of variantes) {
              const actual = variante.id
                ? actualesPorId.get(variante.id)
                : actualesPorIdentidad.get(this.claveIdentidad(variante));
              if (variante.id && !actual) {
                throw new BadRequestException(
                  'La variante indicada no pertenece a este producto',
                );
              }

              const color = await tx.color.findUnique({
                where: { id: variante.colorId },
                select: { codigo: true },
              });
              if (!color) {
                throw new NotFoundException(
                  `Color con id ${variante.colorId} no encontrado`,
                );
              }

              if (actual) {
                conservadas.add(actual.id);
                const identidadCambia =
                  actual.genero !== variante.genero ||
                  actual.colorId !== variante.colorId ||
                  actual.talla !== variante.talla;
                if (
                  identidadCambia &&
                  (actual._count.itemsCarrito > 0 ||
                    actual._count.itemsPedido > 0)
                ) {
                  throw new ConflictException(
                    `No se puede cambiar la identidad de la variante ${actual.sku} porque está en un carrito o pedido`,
                  );
                }
                await tx.tallaProducto.update({
                  where: { id: actual.id },
                  data: {
                    genero: variante.genero,
                    colorId: variante.colorId,
                    talla: variante.talla,
                    tallaNumero: this.tallaANumero(variante.talla),
                    sku: this.generarSku(
                      marca.codigo,
                      modeloFinal,
                      variante.genero,
                      color.codigo,
                      variante.talla,
                    ),
                  },
                });
              } else {
                await tx.tallaProducto.create({
                  data: {
                    genero: variante.genero,
                    colorId: variante.colorId,
                    talla: variante.talla,
                    tallaNumero: this.tallaANumero(variante.talla),
                    stock: variante.stock,
                    sku: this.generarSku(
                      marca.codigo,
                      modeloFinal,
                      variante.genero,
                      color.codigo,
                      variante.talla,
                    ),
                    productoId: id,
                  },
                });
              }
            }

            const quitadas = variantesActuales.filter(
              (v) => !conservadas.has(v.id),
            );
            const enUso = quitadas.filter(
              (v) => v._count.itemsPedido > 0 || v._count.itemsCarrito > 0,
            );
            if (enUso.length) {
              throw new ConflictException(
                `No se pueden eliminar variantes en carritos o pedidos: ${enUso.map((v) => v.sku).join(', ')}. Asignales stock 0.`,
              );
            }
            if (quitadas.length) {
              await tx.tallaProducto.deleteMany({
                where: { id: { in: quitadas.map((v) => v.id) } },
              });
            }
          }

          return await tx.producto.update({
            where: { id },
            data: {
              ...datos,
              ...(codigoModelo ? { codigoModelo } : {}),
            },
            include: INCLUDE_PRODUCTO,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.lanzarConflictoUnico(error);
    }
  }

  private validarVariantesDuplicadas(
    variantes: { genero: string; colorId: number; talla: string }[] | undefined,
  ) {
    if (!variantes) return;
    const claves = variantes.map((variante) => this.claveIdentidad(variante));
    if (new Set(claves).size !== claves.length) {
      throw new BadRequestException('No se pueden repetir variantes');
    }
  }

  private normalizarVariantes(tallas: TallaDto[] | undefined) {
    return tallas?.map(({ id, genero, colorId, talla, stock }) => ({
      ...(id !== undefined ? { id } : {}),
      genero,
      colorId,
      talla: this.normalizarTalla(talla),
      stock,
    }));
  }

  private claveIdentidad(variante: {
    genero: string;
    colorId: number;
    talla: string;
  }) {
    return `${variante.genero}:${variante.colorId}:${this.normalizarTalla(variante.talla)}`;
  }

  private normalizarTalla(talla: string) {
    const valor = talla.trim();
    if (!/^\d+(?:\.0|\.5)?$/.test(valor)) {
      throw new BadRequestException(
        'La talla debe ser un número entero o una media talla positiva',
      );
    }
    return valor.endsWith('.0') ? valor.slice(0, -2) : valor;
  }

  // Convierte la talla normalizada a Decimal numérico para ordenación correcta.
  // Ej: '10' → 10.0, '10.5' → 10.5, '6' → 6.0
  private tallaANumero(talla: string): number {
    return parseFloat(talla);
  }

  private generarSku(
    codigoMarca: string,
    codigoModelo: string,
    genero: string,
    codigoColor: string,
    talla: string,
  ) {
    const tallaSku = talla.replace('.5', '5');
    const sku = `${codigoMarca}-${codigoModelo}-${genero}-${codigoColor}-${tallaSku}`;
    if (sku.length > 60) {
      throw new BadRequestException(
        'Los códigos son demasiado largos para generar un SKU válido',
      );
    }
    return sku;
  }

  async previsualizarSku(dto: PrevisualizarSkuDto) {
    const [marca, color] = await Promise.all([
      this.prisma.marca.findUnique({
        where: { id: dto.marcaId },
        select: { codigo: true },
      }),
      this.prisma.color.findUnique({
        where: { id: dto.colorId },
        select: { codigo: true },
      }),
    ]);
    if (!marca) {
      throw new NotFoundException(`Marca con id ${dto.marcaId} no encontrada`);
    }
    if (!color) {
      throw new NotFoundException(`Color con id ${dto.colorId} no encontrado`);
    }
    const talla = this.normalizarTalla(dto.talla);
    return {
      sku: this.generarSku(
        marca.codigo,
        dto.codigoModelo.trim().toUpperCase(),
        dto.genero,
        color.codigo,
        talla,
      ),
    };
  }

  private lanzarConflictoUnico(error: unknown): never {
    if (esConflictoUnico(error)) {
      const targetMetadata = error.meta?.target;
      const target = Array.isArray(targetMetadata)
        ? targetMetadata.join(',')
        : typeof targetMetadata === 'string'
          ? targetMetadata
          : '';
      if (target.includes('marcaId') && target.includes('codigoModelo')) {
        throw new ConflictException(
          'Ya existe ese código de modelo para la marca seleccionada',
        );
      }
      throw new ConflictException(
        'La variante o su SKU ya existe; revisa la combinación de producto, género, color y talla',
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {

      if (error.code === 'P2003') {
        const fieldName = String(error.meta?.field_name ?? '');
        if (fieldName.includes('categoriaId')) {
          throw new NotFoundException('Categoría no encontrada');
        }
        if (fieldName.includes('marcaId')) {
          throw new NotFoundException('Marca no encontrada');
        }
        throw new BadRequestException('Referencia foránea no válida');
      }
    }
    throw error;
  }

  async resumenInventarioActivo() {
    const whereActivo = { producto: { activo: true } };
    const [
      agregado,
      productosActivos,
      variantesTotales,
      disponibles,
      bajas,
      agotadas,
      variantesStockBajo,
    ] = await Promise.all([
      this.prisma.tallaProducto.aggregate({
        where: whereActivo,
        _sum: { stock: true },
      }),
      this.prisma.producto.count({ where: { activo: true } }),
      this.prisma.tallaProducto.count({ where: whereActivo }),
      this.prisma.tallaProducto.count({
        where: { ...whereActivo, stock: { gt: 5 } },
      }),
      this.prisma.tallaProducto.count({
        where: { ...whereActivo, stock: { gte: 1, lte: 5 } },
      }),
      this.prisma.tallaProducto.count({
        where: { ...whereActivo, stock: 0 },
      }),
      this.prisma.tallaProducto.findMany({
        where: { ...whereActivo, stock: { gte: 1, lte: 5 } },
        select: {
          id: true,
          genero: true,
          talla: true,
          sku: true,
          stock: true,
          color: { select: { nombre: true, codigo: true } },
          producto: {
            select: {
              id: true,
              nombre: true,
              marca: { select: { nombre: true } },
              imagenes: {
                select: { url: true },
                take: 1,
                orderBy: { id: 'asc' },
              },
            },
          },
        },
        orderBy: [{ stock: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      productosActivos,
      stockTotal: agregado._sum.stock ?? 0,
      variantesTotales,
      disponibles,
      bajas,
      agotadas,
      variantesStockBajo: variantesStockBajo.map((variante) => ({
        id: variante.id,
        productoId: variante.producto.id,
        producto: variante.producto.nombre,
        marca: variante.producto.marca.nombre,
        imagen: variante.producto.imagenes[0]?.url ?? null,
        genero: variante.genero,
        color: variante.color.nombre,
        codigoColor: variante.color.codigo,
        talla: variante.talla,
        sku: variante.sku,
        stock: variante.stock,
      })),
    };
  }

  async buscarVariantesInventario({
    busqueda,
    estado,
    pagina,
    limite,
  }: FiltrarInventarioDto) {
    const where: Prisma.TallaProductoWhereInput = {
      producto: { activo: true },
      ...(estado === 'bajo' ? { stock: { gte: 1, lte: 5 } } : {}),
      ...(estado === 'agotado' ? { stock: 0 } : {}),
      ...(estado === 'disponible' ? { stock: { gt: 5 } } : {}),
      ...(busqueda
        ? {
            OR: [
              { sku: { contains: busqueda } },
              { talla: { contains: busqueda } },
              { producto: { nombre: { contains: busqueda }, activo: true } },
              { color: { nombre: { contains: busqueda } } },
              { color: { codigo: { contains: busqueda } } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.tallaProducto.findMany({
        where,
        select: {
          id: true,
          genero: true,
          talla: true,
          stock: true,
          sku: true,
          color: { select: { id: true, nombre: true, codigo: true } },
          producto: {
            select: {
              id: true,
              nombre: true,
              marca: { select: { nombre: true } },
              imagenes: {
                select: { url: true },
                take: 1,
                orderBy: { id: 'asc' },
              },
            },
          },
        },
        orderBy: [
          { producto: { nombre: 'asc' } },
          { genero: 'asc' },
          { color: { nombre: 'asc' } },
          { tallaNumero: 'asc' },
        ],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      this.prisma.tallaProducto.count({ where }),
    ]);

    return {
      datos: datos.map((variante) => ({
        id: variante.id,
        genero: variante.genero,
        talla: variante.talla,
        stock: variante.stock,
        sku: variante.sku,
        color: variante.color,
        producto: {
          id: variante.producto.id,
          nombre: variante.producto.nombre,
          marca: variante.producto.marca.nombre,
          imagen: variante.producto.imagenes[0]?.url ?? null,
        },
      })),
      meta: construirMetaPaginacion(total, pagina, limite),
    };
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
          `SOHO/productos/${nombreCarpetaCloudinary(producto.nombre)}`,
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
    stockEsperado: number,
  ) {
    if (
      !Number.isInteger(stock) ||
      stock < 0 ||
      !Number.isInteger(stockEsperado) ||
      stockEsperado < 0
    ) {
      throw new BadRequestException('El stock debe ser un entero no negativo');
    }

    await this.buscarPorId(productoId);

    const talla = await this.prisma.tallaProducto.findFirst({
      where: { id: tallaId, productoId },
    });

    if (!talla) {
      throw new NotFoundException('Talla no encontrada');
    }

    const actualizacion = await this.prisma.tallaProducto.updateMany({
      where: { id: tallaId, productoId, stock: stockEsperado },
      data: { stock },
    });
    if (actualizacion.count !== 1) {
      const tallaActual = await this.prisma.tallaProducto.findFirst({
        where: { id: tallaId, productoId },
      });
      if (!tallaActual) {
        throw new NotFoundException('Talla no encontrada');
      }
      throw new ConflictException({
        message:
          'El stock cambió desde que se cargó. Se actualizó el valor mostrado; revisa el stock e inténtalo de nuevo.',
        stockActual: tallaActual.stock,
      });
    }

    const tallaActualizada = await this.prisma.tallaProducto.findFirst({
      where: { id: tallaId, productoId },
    });
    if (!tallaActualizada) {
      throw new NotFoundException('Talla no encontrada');
    }
    return tallaActualizada;
  }
}
