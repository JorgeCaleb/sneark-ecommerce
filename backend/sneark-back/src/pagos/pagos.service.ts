import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MercadoPagoConfig,
  MerchantOrder,
  Preference,
  Payment,
} from 'mercadopago';
import { PrismaService } from '../prisma/prisma.service.js';
import { EstadoPedido, MetodoPago, Prisma } from '@prisma/client';
import { MINUTOS_EXPIRACION_PEDIDO } from '../pedidos/pedidos.constants.js';
import { obtenerOrigenPublico } from '../common/origen-publico.util.js';
import { validarFirmaMercadoPago } from './validar-firma-mercadopago.util.js';

type ItemParaReservar = { tallaProductoId: number; cantidad: number };
type DatosFinancieros = {
  mpEstadoPago: string;
  mpMontoReembolsado: Prisma.Decimal;
  mpActualizadoEn: Date;
};

const SELECCION_PAGO = {
  id: true,
  estado: true,
  mpPagoId: true,
  mpEstadoPago: true,
  mpMontoReembolsado: true,
  mpActualizadoEn: true,
  mpRequiereRevision: true,
} satisfies Prisma.PedidoSelect;
type PedidoConPago = Prisma.PedidoGetPayload<{ select: typeof SELECCION_PAGO }>;

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);
  private mp?: MercadoPagoConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private clienteMercadoPago(): MercadoPagoConfig {
    if (this.mp) return this.mp;
    const accessToken = this.config.get<string>('MP_ACCESS_TOKEN')?.trim();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'Mercado Pago no está configurado. Define MP_ACCESS_TOKEN antes de iniciar un pago.',
      );
    }
    this.mp = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 5_000 },
    });
    return this.mp;
  }

  private origenConfigurado(nombre: 'FRONTEND_ORIGIN' | 'BACKEND_URL') {
    const valorLocal =
      nombre === 'FRONTEND_ORIGIN'
        ? 'http://localhost:4200'
        : 'http://localhost:3000';
    try {
      return obtenerOrigenPublico(
        this.config.get<string>(nombre),
        nombre,
        this.config.get<string>('NODE_ENV') === 'production' ||
          process.env.NODE_ENV === 'production',
        valorLocal,
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? error.message
          : `Configuración inválida: ${nombre}`,
      );
    }
  }

  async crearPreferencia(pedidoId: number, usuarioId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id: pedidoId, usuarioId },
      include: {
        items: true,
        usuario: { select: { email: true, nombre: true } },
      },
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido #${pedidoId} no encontrado`);
    }
    if (pedido.metodoPago !== MetodoPago.MERCADOPAGO) {
      throw new BadRequestException(
        'Este pedido no usa Mercado Pago como método de pago',
      );
    }
    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new BadRequestException(
        'Solo se puede iniciar el pago en pedidos PENDIENTES',
      );
    }

    const fechaExpiracion = new Date(
      pedido.creadoEn.getTime() + MINUTOS_EXPIRACION_PEDIDO * 60 * 1000,
    );
    if (fechaExpiracion.getTime() <= Date.now()) {
      throw new BadRequestException(
        `El pedido venció después de ${MINUTOS_EXPIRACION_PEDIDO} minutos y ya no admite pagos.`,
      );
    }

    if (pedido.mpPreferenciaId && pedido.mpCheckoutUrl) {
      return {
        preferenciaId: pedido.mpPreferenciaId,
        urlPago: pedido.mpCheckoutUrl,
      };
    }
    if (pedido.mpPreferenciaId) {
      throw new ServiceUnavailableException(
        'El checkout anterior no puede recuperarse de forma segura. Contacta a soporte antes de volver a pagar.',
      );
    }

    const cliente = this.clienteMercadoPago();
    const frontendUrl = this.origenConfigurado('FRONTEND_ORIGIN');
    const backendUrl = this.origenConfigurado('BACKEND_URL');
    const preference = new Preference(cliente);
    const resultado = await preference.create({
      body: {
        external_reference: String(pedidoId),
        items: [
          ...pedido.items.map((item) => ({
            id: String(item.tallaProductoId),
            title: item.nombreProducto,
            description: `Talla ${item.talla} · ${item.nombreColor}`,
            quantity: item.cantidad,
            unit_price: Number(item.precio),
            currency_id: 'PEN',
          })),
          ...(Number(pedido.costoEnvio) > 0
            ? [
                {
                  id: 'envio-local',
                  title: `Envío a ${pedido.ciudad}`,
                  quantity: 1,
                  unit_price: Number(pedido.costoEnvio),
                  currency_id: 'PEN',
                },
              ]
            : []),
        ],
        payer: {
          email: pedido.usuario.email,
          name: pedido.usuario.nombre,
        },
        back_urls: {
          success: `${frontendUrl}/pago/resultado?estado=exitoso&pedido=${pedidoId}`,
          failure: `${frontendUrl}/pago/resultado?estado=fallido&pedido=${pedidoId}`,
          pending: `${frontendUrl}/pago/resultado?estado=pendiente&pedido=${pedidoId}`,
        },
        auto_return: 'approved',
        notification_url: `${backendUrl}/api/pagos/webhook`,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: fechaExpiracion.toISOString(),
      },
    });

    const usaSandbox =
      this.config.get<string>('MP_ACCESS_TOKEN')?.trim().startsWith('TEST-') ??
      false;
    const urlPago = usaSandbox
      ? resultado.sandbox_init_point
      : resultado.init_point;
    if (!resultado.id || !urlPago) {
      throw new ServiceUnavailableException(
        'Mercado Pago no devolvió una preferencia y una URL de checkout válidas.',
      );
    }

    const guardada = await this.prisma.pedido.updateMany({
      where: {
        id: pedidoId,
        estado: EstadoPedido.PENDIENTE,
        mpPreferenciaId: null,
        creadoEn: {
          gt: new Date(Date.now() - MINUTOS_EXPIRACION_PEDIDO * 60 * 1000),
        },
      },
      data: { mpPreferenciaId: resultado.id, mpCheckoutUrl: urlPago },
    });
    if (guardada.count !== 1) {
      throw new ConflictException(
        'El pedido cambió o venció al preparar el checkout. Actualiza el estado antes de volver a intentarlo.',
      );
    }

    return { preferenciaId: resultado.id, urlPago };
  }

  async procesarWebhook(
    body: Record<string, unknown>,
    firma?: string,
    requestId?: string,
    idConsulta?: string,
  ) {
    if (body['type'] !== 'payment') return { recibido: true };

    const data = body['data'] as { id?: string | number } | undefined;
    const idCuerpo = data?.id === undefined ? undefined : String(data.id);
    const pagoId = idConsulta ?? idCuerpo;
    if (!pagoId || !/^\d+$/.test(pagoId) || (idCuerpo && idCuerpo !== pagoId)) {
      throw new BadRequestException('Notificación de pago inválida.');
    }

    const secreto = this.config.get<string>('MP_WEBHOOK_SECRET')?.trim();
    if (!secreto) {
      throw new ServiceUnavailableException(
        'El webhook de Mercado Pago no está configurado. Define MP_WEBHOOK_SECRET.',
      );
    }
    if (!validarFirmaMercadoPago(firma, requestId, pagoId, secreto)) {
      throw new UnauthorizedException(
        'Firma de notificación de Mercado Pago inválida.',
      );
    }

    const cliente = this.clienteMercadoPago();
    const pago = await this.consultarMercadoPago(() =>
      new Payment(cliente).get({ id: pagoId }),
    );
    if (this.idMercadoPago(pago.id) !== pagoId) {
      throw new ServiceUnavailableException(
        'Mercado Pago devolvió un pago inconsistente.',
      );
    }
    const estadoPago = pago.status;
    if (
      !estadoPago ||
      !['approved', 'refunded', 'charged_back', 'in_mediation'].includes(
        estadoPago,
      )
    ) {
      return { recibido: true };
    }

    const pedidoId = Number(pago.external_reference);
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      this.logger.warn(`Webhook MP sin external_reference válido: ${pagoId}`);
      return { recibido: true };
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        items: { select: { tallaProductoId: true, cantidad: true } },
      },
    });
    if (!pedido) {
      this.logger.warn(`Webhook MP: pedido #${pedidoId} no encontrado`);
      return { recibido: true };
    }
    if (pedido.metodoPago !== MetodoPago.MERCADOPAGO) {
      this.logger.error(
        `Pago MP aprobado asociado a un pedido que no usa MP: #${pedidoId}`,
      );
      return { recibido: true };
    }

    const importe = this.importeMercadoPago(pago.transaction_amount);
    const reembolsado = this.importeMercadoPago(
      pago.transaction_amount_refunded ??
        (pago.status === 'refunded' ? importe.toString() : 0),
    );
    const actualizadoEn = new Date(pago.date_last_updated ?? '');
    if (reembolsado.gt(importe) || !Number.isFinite(actualizadoEn.getTime())) {
      throw new ServiceUnavailableException(
        'Mercado Pago devolvió datos financieros incompletos.',
      );
    }
    const financiero: DatosFinancieros = {
      mpEstadoPago: estadoPago,
      mpMontoReembolsado: reembolsado,
      mpActualizadoEn: actualizadoEn,
    };

    // La preferencia pertenece a la orden comercial, no al recurso Payment.
    const ordenId = this.idMercadoPago(pago.order?.id);
    let coincidePreferencia = false;
    if (ordenId && pago.order?.type === 'mercadopago') {
      const orden = await this.consultarMercadoPago(() =>
        new MerchantOrder(cliente).get({ merchantOrderId: ordenId }),
      );
      if (
        this.idMercadoPago(orden.id) !== ordenId ||
        !orden.preference_id ||
        !orden.payments?.length
      ) {
        throw new ServiceUnavailableException(
          'La orden de Mercado Pago aún no puede verificarse.',
        );
      }
      coincidePreferencia =
        orden.preference_id === pedido.mpPreferenciaId &&
        orden.external_reference === String(pedidoId) &&
        orden.payments.some((item) => this.idMercadoPago(item.id) === pagoId);
    }
    const coincideImporte = importe.eq(pedido.total);
    const coincideMoneda = pago.currency_id === 'PEN';

    if (!coincidePreferencia || !coincideImporte || !coincideMoneda) {
      this.logger.error(
        `Pago MP aprobado requiere revisión para pedido #${pedidoId}: preferencia, importe o moneda no coinciden (pago ${pagoId}).`,
      );
      await this.marcarParaRevision(pedidoId, pagoId, financiero);
      return { recibido: true };
    }

    if (pago.status !== 'approved' || reembolsado.gt(0)) {
      await this.marcarParaRevision(pedidoId, pagoId, financiero);
      return { recibido: true };
    }

    const fechaAprobacion = this.fechaAprobacion(pago);
    const resultado = await this.registrarPagoAprobado(
      pedidoId,
      pagoId,
      pedido.items,
      fechaAprobacion,
      financiero,
    );
    if (resultado === 'revision') {
      this.logger.error(
        `Pago MP aprobado requiere revisión del inventario o del pago asociado al pedido #${pedidoId} (pago ${pagoId}).`,
      );
    } else if (resultado === 'registrado') {
      this.logger.log(`Pago MP aprobado → Pedido #${pedidoId} verificado`);
    }
    return { recibido: true };
  }

  private async consultarMercadoPago<T>(
    consulta: () => Promise<T>,
  ): Promise<T> {
    try {
      return await consulta();
    } catch {
      // Un fallo de la API debe provocar el reintento del webhook, sin alterar el pedido.
      throw new ServiceUnavailableException(
        'No se pudo verificar el pago con Mercado Pago.',
      );
    }
  }

  private idMercadoPago(id: unknown): string | null {
    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
      return String(id);
    return typeof id === 'string' && /^[1-9]\d*$/.test(id) ? id : null;
  }

  private importeMercadoPago(valor: unknown): Prisma.Decimal {
    if (
      (typeof valor === 'number' && Number.isFinite(valor)) ||
      (typeof valor === 'string' && /^\d+(?:\.\d{1,2})?$/.test(valor))
    ) {
      const importe = new Prisma.Decimal(valor);
      if (
        importe.gte(0) &&
        importe.lte('99999999.99') &&
        importe.decimalPlaces() <= 2
      ) {
        return importe;
      }
    }
    throw new ServiceUnavailableException(
      'Mercado Pago devolvió un importe inválido.',
    );
  }

  private async marcarParaRevision(
    pedidoId: number,
    pagoId: string,
    financiero: DatosFinancieros,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.pedido.findUnique({
        where: { id: pedidoId },
        select: SELECCION_PAGO,
      });
      if (actual)
        await this.sincronizarPago(tx, actual, pagoId, financiero, true);
    });
  }

  private async sincronizarPago(
    tx: Prisma.TransactionClient,
    actual: PedidoConPago,
    pagoId: string,
    financiero: DatosFinancieros,
    requiereRevision: boolean,
  ) {
    const mismoPago = !actual.mpPagoId || actual.mpPagoId === pagoId;
    if (mismoPago && actual.mpActualizadoEn) {
      const diferencia =
        financiero.mpActualizadoEn.getTime() - actual.mpActualizadoEn.getTime();
      if (diferencia < 0 || (diferencia === 0 && !requiereRevision)) return;
    }
    const revision =
      requiereRevision || actual.mpRequiereRevision || !mismoPago;
    const sinPreparar = (
      [
        EstadoPedido.PENDIENTE,
        EstadoPedido.CANCELADO,
        EstadoPedido.PAGO_VERIFICADO,
      ] as EstadoPedido[]
    ).includes(actual.estado);
    const actualizado = await tx.pedido.updateMany({
      where: {
        id: actual.id,
        estado: actual.estado,
        mpPagoId: actual.mpPagoId,
        mpActualizadoEn: actual.mpActualizadoEn,
        mpRequiereRevision: actual.mpRequiereRevision,
      },
      data: {
        ...(mismoPago ? { ...financiero, mpPagoId: pagoId } : {}),
        mpRequiereRevision: revision,
        ...(revision && sinPreparar
          ? { estado: EstadoPedido.PAGO_REQUIERE_REVISION }
          : {}),
      },
    });
    if (actualizado.count !== 1) {
      throw new ConflictException(
        'El pedido cambió durante la verificación del pago.',
      );
    }
  }

  private async registrarPagoAprobado(
    pedidoId: number,
    pagoId: string,
    items: ItemParaReservar[],
    pagadoEn: Date,
    financiero: DatosFinancieros,
  ): Promise<'registrado' | 'revision' | 'duplicado'> {
    return this.prisma.$transaction(async (tx) => {
      const pagoPendiente = await tx.pedido.updateMany({
        where: {
          id: pedidoId,
          estado: EstadoPedido.PENDIENTE,
          mpPagoId: null,
          mpRequiereRevision: false,
        },
        data: {
          estado: EstadoPedido.PAGO_VERIFICADO,
          mpPagoId: pagoId,
          pagadoEn,
          ...financiero,
        },
      });
      if (pagoPendiente.count === 1) return 'registrado';

      const cancelado = await tx.pedido.updateMany({
        where: {
          id: pedidoId,
          estado: EstadoPedido.CANCELADO,
          mpPagoId: null,
          mpRequiereRevision: false,
        },
        data: {
          estado: EstadoPedido.PAGO_REQUIERE_REVISION,
          mpPagoId: pagoId,
          ...financiero,
          mpRequiereRevision: true,
        },
      });
      if (cancelado.count === 1) {
        const reservados: ItemParaReservar[] = [];
        for (const item of items) {
          const actualizacion = await tx.tallaProducto.updateMany({
            where: {
              id: item.tallaProductoId,
              stock: { gte: item.cantidad },
            },
            data: { stock: { decrement: item.cantidad } },
          });
          if (actualizacion.count !== 1) {
            for (const reservado of reservados) {
              await tx.tallaProducto.update({
                where: { id: reservado.tallaProductoId },
                data: { stock: { increment: reservado.cantidad } },
              });
            }
            return 'revision';
          }
          reservados.push(item);
        }

        await tx.pedido.updateMany({
          where: {
            id: pedidoId,
            estado: EstadoPedido.PAGO_REQUIERE_REVISION,
            mpPagoId: pagoId,
          },
          data: {
            estado: EstadoPedido.PAGO_VERIFICADO,
            inventarioReservado: true,
            pagadoEn,
            mpRequiereRevision: false,
          },
        });
        return 'registrado';
      }

      const actual = await tx.pedido.findUnique({
        where: { id: pedidoId },
        select: SELECCION_PAGO,
      });
      if (actual?.mpPagoId === pagoId) {
        await this.sincronizarPago(tx, actual, pagoId, financiero, false);
        return 'duplicado';
      }
      if (actual) {
        this.logger.error(
          `Pago MP aprobado adicional para pedido #${pedidoId}; el pedido ya registra otro pago (${actual.mpPagoId}, nuevo ${pagoId}).`,
        );
        await this.sincronizarPago(tx, actual, pagoId, financiero, true);
        return 'revision';
      }
      return 'duplicado';
    });
  }

  private fechaAprobacion(pago: object): Date {
    const fecha = Reflect.get(pago, 'date_approved');
    const fechaAprobacion =
      fecha instanceof Date
        ? fecha
        : typeof fecha === 'string'
          ? new Date(fecha)
          : null;
    if (fechaAprobacion && Number.isFinite(fechaAprobacion.getTime())) {
      return fechaAprobacion;
    }
    this.logger.warn(
      'Mercado Pago no devolvió una fecha de aprobación válida; se registrará la hora de verificación del webhook.',
    );
    return new Date();
  }

  async consultarEstadoPedido(pedidoId: number, usuarioId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id: pedidoId, usuarioId },
      select: {
        id: true,
        estado: true,
        total: true,
        metodoPago: true,
        mpPagoId: true,
        creadoEn: true,
        pagadoEn: true,
        mpEstadoPago: true,
        mpMontoReembolsado: true,
        mpRequiereRevision: true,
      },
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido #${pedidoId} no encontrado`);
    }

    return pedido;
  }
}
