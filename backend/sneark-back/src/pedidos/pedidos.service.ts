import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EstadoPedido, MetodoPago, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CarritoService } from '../carrito/carrito.service.js';
import { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import { ActualizarEstadoDto } from './dto/actualizar-estado.dto.js';
import { FiltrarPedidosDto } from './dto/filtrar-pedidos.dto.js';
import { DashboardPedidosDto } from './dto/dashboard-pedidos.dto.js';
import { INCLUDE_PRODUCTO_RESUMEN } from '../prisma/selecciones.js';
import { construirMetaPaginacion } from '../common/paginacion.util.js';
import { MINUTOS_EXPIRACION_PEDIDO } from './pedidos.constants.js';
import {
  calcularCostoEnvio,
  DISTRITOS_ENVIO,
  type DistritoEnvio,
} from './envio.util.js';

export { MINUTOS_EXPIRACION_PEDIDO } from './pedidos.constants.js';

const MAXIMO_DECIMAL_PEDIDO = new Prisma.Decimal('99999999.99');

// Campos incluidos al devolver un pedido
const INCLUDE_PEDIDO = {
  items: {
    include: {
      tallaProducto: {
        select: {
          id: true,
          genero: true,
          colorId: true,
          talla: true,
          color: { select: { id: true, nombre: true, codigo: true } },
          producto: {
            include: INCLUDE_PRODUCTO_RESUMEN,
          },
        },
      },
    },
  },
  usuario: { select: { id: true, nombre: true, email: true } },
} satisfies Prisma.PedidoInclude;

const TRANSICIONES_PEDIDO: Record<EstadoPedido, readonly EstadoPedido[]> = {
  [EstadoPedido.PENDIENTE]: [EstadoPedido.CANCELADO],
  [EstadoPedido.PAGO_VERIFICADO]: [
    EstadoPedido.EN_PREPARACION,
    EstadoPedido.CANCELADO,
  ],
  [EstadoPedido.EN_PREPARACION]: [EstadoPedido.ENVIADO],
  [EstadoPedido.ENVIADO]: [EstadoPedido.ENTREGADO],
  [EstadoPedido.ENTREGADO]: [],
  [EstadoPedido.CANCELADO]: [],
  [EstadoPedido.PAGO_REQUIERE_REVISION]: [
    EstadoPedido.PAGO_VERIFICADO,
    EstadoPedido.CANCELADO,
  ],
};

type PedidoParaTransicion = {
  id: number;
  estado: EstadoPedido;
  usuarioId: number;
  inventarioReservado: boolean;
  pagadoEn: Date | null;
  items: { tallaProductoId: number; cantidad: number }[];
};

@Injectable()
export class PedidosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PedidosService.name);
  private workerExpiracion?: NodeJS.Timeout;
  private procesandoExpiraciones = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly carritoService: CarritoService,
  ) {}

  onModuleInit() {
    this.workerExpiracion = setInterval(() => {
      void this.cancelarPedidosExpirados();
    }, 60_000);
    if (typeof this.workerExpiracion.unref === 'function') {
      this.workerExpiracion.unref();
    }
    void this.cancelarPedidosExpirados();
  }

  onModuleDestroy() {
    if (this.workerExpiracion) clearInterval(this.workerExpiracion);
  }

  // ─── Crear pedido desde el carrito ───────────────────────────────────────────
  async crear(usuarioId: number, dto: CrearPedidoDto) {
    const costoEnvio = calcularCostoEnvio(dto.distrito);
    try {
      // Crear el pedido y sus items en una transacción atómica
      return await this.prisma.$transaction(
        async (tx) => {
          const carrito = await this.carritoService.obtenerEnTransaccion(
            tx,
            usuarioId,
          );

          if (!carrito?.items.length) {
            throw new BadRequestException('El carrito está vacío');
          }

          // Evitar pedidos duplicados mientras el cliente aún puede pagar el pendiente.
          const pedidoPendiente = await tx.pedido.findFirst({
            where: {
              usuarioId,
              estado: EstadoPedido.PENDIENTE,
              metodoPago: MetodoPago.MERCADOPAGO,
            },
            include: {
              items: {
                select: { tallaProductoId: true, cantidad: true },
              },
            },
          });

          if (pedidoPendiente) {
            const fechaLimite = new Date(
              Date.now() - MINUTOS_EXPIRACION_PEDIDO * 60 * 1000,
            );
            if (pedidoPendiente.creadoEn <= fechaLimite) {
              const cancelado = await tx.pedido.updateMany({
                where: {
                  id: pedidoPendiente.id,
                  estado: EstadoPedido.PENDIENTE,
                  creadoEn: { lte: fechaLimite },
                },
                data: {
                  estado: EstadoPedido.CANCELADO,
                  inventarioReservado: false,
                },
              });
              if (cancelado.count === 1) {
                for (const item of pedidoPendiente.items) {
                  await tx.tallaProducto.update({
                    where: { id: item.tallaProductoId },
                    data: { stock: { increment: item.cantidad } },
                  });
                }
              }
            } else {
              throw new BadRequestException(
                `Ya tienes el pedido #${pedidoPendiente.id} pendiente de pago. Continúa el pago desde Mis pedidos o cancélalo antes de realizar uno nuevo.`,
              );
            }
          }

          const productosNoDisponibles = await tx.producto.findMany({
            where: {
              id: {
                in: [
                  ...new Set(
                    carrito.items.map((item) => item.tallaProducto.producto.id),
                  ),
                ],
              },
              activo: false,
            },
            select: { nombre: true },
          });

          if (productosNoDisponibles.length) {
            throw new BadRequestException(
              `Productos no disponibles: ${productosNoDisponibles.map((producto) => `"${producto.nombre}"`).join(', ')}`,
            );
          }

          const totalProductos = carrito.items.reduce((total, item) => {
            const subtotal = new Prisma.Decimal(
              item.tallaProducto.producto.precio,
            ).mul(item.cantidad);
            if (subtotal.gt(MAXIMO_DECIMAL_PEDIDO)) {
              throw new BadRequestException(
                'El subtotal de un producto supera el máximo permitido para el pedido.',
              );
            }
            return total.plus(subtotal);
          }, new Prisma.Decimal(0));
          const totalPedido = totalProductos.plus(costoEnvio);
          if (totalPedido.gt(MAXIMO_DECIMAL_PEDIDO)) {
            throw new BadRequestException(
              'El total del pedido supera el máximo permitido.',
            );
          }

          const carritoConsumido = await tx.itemCarrito.deleteMany({
            where: {
              carritoId: carrito.id,
              OR: carrito.items.map((item) => ({
                id: item.id,
                cantidad: item.cantidad,
              })),
            },
          });
          if (carritoConsumido.count !== carrito.items.length) {
            throw new BadRequestException(
              'El carrito cambió durante la compra. Revísalo e inténtalo nuevamente.',
            );
          }
          const articulosRestantes = await tx.itemCarrito.count({
            where: { carritoId: carrito.id },
          });
          if (articulosRestantes !== 0) {
            throw new BadRequestException(
              'El carrito cambió durante la compra. Revísalo e inténtalo nuevamente.',
            );
          }

          // Reservar cada talla de forma condicional para evitar sobreventa concurrente.
          for (const item of carrito.items) {
            const actualizacion = await tx.tallaProducto.updateMany({
              where: {
                id: item.tallaProductoId,
                stock: { gte: item.cantidad },
              },
              data: { stock: { decrement: item.cantidad } },
            });

            if (actualizacion.count !== 1) {
              throw new BadRequestException(
                `Stock insuficiente para "${item.tallaProducto.producto.nombre}" talla ${item.tallaProducto.talla}`,
              );
            }
          }

          // Crear el pedido solo después de reservar correctamente todas las tallas.
          return tx.pedido.create({
            data: {
              usuarioId,
              total: totalPedido,
              costoEnvio,
              metodoPago: MetodoPago.MERCADOPAGO,
              telefono: dto.telefono,
              ciudad: dto.distrito,
              direccion: dto.direccion,
              // Crear todos los items del pedido como snapshot
              items: {
                create: carrito.items.map((item) => ({
                  tallaProductoId: item.tallaProductoId,
                  nombreProducto: item.tallaProducto.producto.nombre,
                  genero: item.tallaProducto.genero,
                  nombreColor: item.tallaProducto.color.nombre,
                  codigoColor: item.tallaProducto.color.codigo,
                  sku: item.tallaProducto.sku,
                  talla: item.tallaProducto.talla,
                  cantidad: item.cantidad,
                  precio: item.tallaProducto.producto.precio,
                  subtotal: new Prisma.Decimal(
                    item.tallaProducto.producto.precio,
                  )
                    .mul(item.cantidad)
                    .toNumber(),
                })),
              },
            },
            include: INCLUDE_PEDIDO,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new BadRequestException(
          'El carrito o el inventario cambió durante la compra. Revísalo e inténtalo nuevamente.',
        );
      }
      throw error;
    }
  }

  obtenerOpcionesEnvio() {
    return DISTRITOS_ENVIO.map((distrito) => ({
      distrito,
      costoEnvio: calcularCostoEnvio(distrito),
    }));
  }

  cotizarEnvio(distrito: DistritoEnvio) {
    return { distrito, costoEnvio: calcularCostoEnvio(distrito) };
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  async buscarPorId(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: INCLUDE_PEDIDO,
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido #${id} no encontrado`);
    }

    return pedido;
  }

  async buscarPorUsuario(id: number, usuarioId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, usuarioId },
      include: INCLUDE_PEDIDO,
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido #${id} no encontrado`);
    }

    return pedido;
  }

  // Mis pedidos (cliente)
  async misPedidos(usuarioId: number) {
    return this.prisma.pedido.findMany({
      where: { usuarioId },
      include: INCLUDE_PEDIDO,
      orderBy: { creadoEn: 'desc' },
    });
  }

  async buscarPagina(filtros: FiltrarPedidosDto) {
    const { estado, pagina, limite } = filtros;
    const where: Prisma.PedidoWhereInput = estado ? { estado } : {};
    const [datos, total] = await Promise.all([
      this.prisma.pedido.findMany({
        where,
        include: INCLUDE_PEDIDO,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      this.prisma.pedido.count({ where }),
    ]);

    return {
      datos,
      meta: construirMetaPaginacion(total, pagina, limite),
    };
  }

  async obtenerResumenDashboard(filtros: DashboardPedidosDto) {
    const inicioAnterior = new Date(filtros.inicioAnterior);
    const inicioActual = new Date(filtros.inicioActual);
    const finActual = new Date(filtros.finActual);
    const duracionActual = finActual.getTime() - inicioActual.getTime();
    const duracionAnterior = inicioActual.getTime() - inicioAnterior.getTime();
    if (
      !Number.isFinite(duracionActual) ||
      !Number.isFinite(duracionAnterior) ||
      inicioAnterior >= inicioActual ||
      inicioActual >= finActual ||
      duracionActual > 31 * 24 * 60 * 60_000 ||
      duracionAnterior > 31 * 24 * 60 * 60_000
    ) {
      throw new BadRequestException(
        'El intervalo de fechas del dashboard no es válido',
      );
    }

    const estadosConfirmados = [
      EstadoPedido.PAGO_VERIFICADO,
      EstadoPedido.EN_PREPARACION,
      EstadoPedido.ENVIADO,
      EstadoPedido.ENTREGADO,
    ];
    const whereVentasActuales: Prisma.PedidoWhereInput = {
      estado: { in: estadosConfirmados },
      pagadoEn: { gte: inicioActual, lt: finActual },
    };
    const whereVentasAnteriores: Prisma.PedidoWhereInput = {
      estado: { in: estadosConfirmados },
      pagadoEn: { gte: inicioAnterior, lt: inicioActual },
    };
    const [
      totalPedidos,
      pedidosRecientes,
      ventasActuales,
      ventasAnteriores,
      ventasDiarias,
      topProductos,
    ] = await Promise.all([
      this.prisma.pedido.count({
        where: { estado: { not: EstadoPedido.CANCELADO } },
      }),
      this.prisma.pedido.findMany({
        take: 5,
        include: INCLUDE_PEDIDO,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.pedido.aggregate({
        where: whereVentasActuales,
        _sum: { total: true },
      }),
      this.prisma.pedido.aggregate({
        where: whereVentasAnteriores,
        _sum: { total: true },
      }),
      this.prisma.$queryRaw<{ fecha: string; total: Prisma.Decimal }[]>(
        Prisma.sql`
            SELECT DATE_FORMAT(
              DATE_ADD(\`pagadoEn\`, INTERVAL ${filtros.desfaseZonaHoraria} MINUTE),
              '%Y-%m-%d'
            ) AS fecha, SUM(\`total\`) AS total
            FROM \`pedidos\`
            WHERE \`estado\` IN (${Prisma.join(estadosConfirmados)})
              AND \`pagadoEn\` >= ${inicioActual}
              AND \`pagadoEn\` < ${finActual}
            GROUP BY fecha
          `,
      ),
      this.prisma.$queryRaw<{ productoId: number; cantidad: bigint }[]>(
        Prisma.sql`
            SELECT tallas.\`productoId\` AS productoId,
                   SUM(items.\`cantidad\`) AS cantidad
            FROM \`items_pedido\` AS items
            INNER JOIN \`pedidos\` AS pedidos
              ON pedidos.\`id\` = items.\`pedidoId\`
            INNER JOIN \`tallas_producto\` AS tallas
              ON tallas.\`id\` = items.\`tallaProductoId\`
            WHERE pedidos.\`estado\` IN (${Prisma.join(estadosConfirmados)})
              AND pedidos.\`pagadoEn\` >= ${inicioActual}
              AND pedidos.\`pagadoEn\` < ${finActual}
            GROUP BY tallas.\`productoId\`
            ORDER BY cantidad DESC, productoId ASC
            LIMIT 5
          `,
      ),
    ]);

    const productos = topProductos.length
      ? await this.prisma.producto.findMany({
          where: {
            id: { in: topProductos.map((producto) => producto.productoId) },
          },
          select: {
            id: true,
            nombre: true,
            precio: true,
            marca: { select: { nombre: true } },
            imagenes: {
              select: { url: true },
              take: 1,
              orderBy: { id: 'asc' },
            },
          },
        })
      : [];
    const productosPorId = new Map(
      productos.map((producto) => [producto.id, producto]),
    );

    return {
      totalPedidos,
      pedidosRecientes,
      totalVentasPeriodo: Number(ventasActuales._sum.total ?? 0),
      ventasPeriodoAnterior: Number(ventasAnteriores._sum.total ?? 0),
      ventasDiarias: ventasDiarias.map((venta) => ({
        fecha: venta.fecha,
        total: Number(venta.total),
      })),
      productosMasVendidos: topProductos.flatMap((vendido) => {
        const producto = productosPorId.get(vendido.productoId);
        return producto
          ? [
              {
                id: producto.id,
                nombre: producto.nombre,
                marca: producto.marca.nombre,
                imagen: producto.imagenes[0]?.url ?? null,
                precio: Number(producto.precio),
                cantidad: Number(vendido.cantidad),
              },
            ]
          : [];
      }),
    };
  }

  // ─── Gestión ADMIN ────────────────────────────────────────────────────────────

  async actualizarEstado(id: number, dto: ActualizarEstadoDto) {
    const pedido = await this.buscarPorId(id);
    if (
      dto.estado === EstadoPedido.PAGO_VERIFICADO &&
      pedido.estado === EstadoPedido.PENDIENTE
    ) {
      throw new BadRequestException(
        'El pago de Mercado Pago solo se confirma automáticamente tras validar su notificación.',
      );
    }
    this.validarTransicion(pedido.estado, dto.estado);

    if (!(await this.aplicarTransicion(pedido, dto.estado))) {
      const estadoActual = await this.buscarPorId(id);
      throw new ConflictException(
        `El pedido cambió de estado ${pedido.estado} a ${estadoActual.estado}; no se aplicó la transición solicitada a ${dto.estado}.`,
      );
    }

    return this.buscarPorId(id);
  }

  async cancelar(usuarioId: number, pedidoId: number) {
    const pedido = await this.buscarPorId(pedidoId);

    // Solo el dueño puede cancelar su pedido.
    // Respondemos 404 para evitar que un atacante enumere IDs ajenos (en lugar de 403).
    if (pedido.usuario.id !== usuarioId) {
      throw new NotFoundException(`Pedido #${pedidoId} no encontrado`);
    }

    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new BadRequestException(
        'Solo puedes cancelar pedidos en estado PENDIENTE. Si tu pago ya fue verificado o el pedido está en proceso, comunícate con soporte.',
      );
    }

    this.validarTransicion(pedido.estado, EstadoPedido.CANCELADO);

    if (
      !(await this.aplicarTransicion(pedido, EstadoPedido.CANCELADO, usuarioId))
    ) {
      const estadoActual = await this.buscarPorId(pedidoId);
      throw new ConflictException(
        `El pedido cambió de estado ${pedido.estado} a ${estadoActual.estado}; no se aplicó la transición solicitada a ${EstadoPedido.CANCELADO}.`,
      );
    }

    return this.buscarPorId(pedidoId);
  }

  private validarTransicion(
    estadoActual: EstadoPedido,
    estadoSolicitado: EstadoPedido,
  ) {
    if (!TRANSICIONES_PEDIDO[estadoActual].includes(estadoSolicitado)) {
      throw new BadRequestException(
        `No se permite cambiar el pedido del estado ${estadoActual} al estado ${estadoSolicitado}.`,
      );
    }
  }

  private async aplicarTransicion(
    pedido: PedidoParaTransicion,
    estadoSolicitado: EstadoPedido,
    usuarioId?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const actualizacion = await tx.pedido.updateMany({
        where: {
          id: pedido.id,
          estado: pedido.estado,
          ...(usuarioId !== undefined ? { usuarioId } : {}),
        },
        data: {
          estado: estadoSolicitado,
          ...(estadoSolicitado === EstadoPedido.CANCELADO
            ? { inventarioReservado: false }
            : {}),
          ...(estadoSolicitado === EstadoPedido.PAGO_VERIFICADO &&
          pedido.estado === EstadoPedido.PAGO_REQUIERE_REVISION
            ? {
                inventarioReservado: true,
                pagadoEn: pedido.pagadoEn ?? new Date(),
              }
            : {}),
        },
      });

      if (actualizacion.count !== 1) {
        return false;
      }

      if (
        estadoSolicitado === EstadoPedido.CANCELADO &&
        pedido.inventarioReservado
      ) {
        for (const item of pedido.items) {
          await tx.tallaProducto.update({
            where: { id: item.tallaProductoId },
            data: { stock: { increment: item.cantidad } },
          });
        }
      }

      if (
        estadoSolicitado === EstadoPedido.PAGO_VERIFICADO &&
        pedido.estado === EstadoPedido.PAGO_REQUIERE_REVISION &&
        !pedido.inventarioReservado
      ) {
        for (const item of pedido.items) {
          const reserva = await tx.tallaProducto.updateMany({
            where: {
              id: item.tallaProductoId,
              stock: { gte: item.cantidad },
            },
            data: { stock: { decrement: item.cantidad } },
          });
          if (reserva.count !== 1) {
            throw new BadRequestException(
              `No hay stock suficiente para reactivar el pedido #${pedido.id}.`,
            );
          }
        }
      }

      return true;
    });
  }

  async cancelarPedidosExpirados(): Promise<number> {
    if (this.procesandoExpiraciones) return 0;
    this.procesandoExpiraciones = true;
    try {
      const fechaLimite = new Date(
        Date.now() - MINUTOS_EXPIRACION_PEDIDO * 60 * 1000,
      );
      const pedidosExpirados = await this.prisma.pedido.findMany({
        where: {
          estado: EstadoPedido.PENDIENTE,
          creadoEn: { lte: fechaLimite },
        },
        include: {
          items: {
            select: { tallaProductoId: true, cantidad: true },
          },
        },
        take: 50,
      });

      let cancelados = 0;
      for (const pedido of pedidosExpirados) {
        try {
          const resultado = await this.prisma.$transaction(async (tx) => {
            const actualizacion = await tx.pedido.updateMany({
              where: {
                id: pedido.id,
                estado: EstadoPedido.PENDIENTE,
              },
              data: {
                estado: EstadoPedido.CANCELADO,
                inventarioReservado: false,
              },
            });

            if (actualizacion.count !== 1) {
              return false;
            }

            for (const item of pedido.items) {
              await tx.tallaProducto.update({
                where: { id: item.tallaProductoId },
                data: { stock: { increment: item.cantidad } },
              });
            }

            return true;
          });

          if (resultado) {
            cancelados++;
          }
        } catch (error) {
          this.logger.error(
            `No se pudo cancelar el pedido expirado #${pedido.id}.`,
            error,
          );
        }
      }

      return cancelados;
    } finally {
      this.procesandoExpiraciones = false;
    }
  }

  private async cancelarPedidoExpirado(pedido: {
    id: number;
    items: { tallaProductoId: number; cantidad: number }[];
  }) {
    await this.prisma.$transaction(async (tx) => {
      const actualizacion = await tx.pedido.updateMany({
        where: {
          id: pedido.id,
          estado: EstadoPedido.PENDIENTE,
        },
        data: {
          estado: EstadoPedido.CANCELADO,
          inventarioReservado: false,
        },
      });

      if (actualizacion.count === 1) {
        for (const item of pedido.items) {
          await tx.tallaProducto.update({
            where: { id: item.tallaProductoId },
            data: { stock: { increment: item.cantidad } },
          });
        }
      }
    });
  }
}
