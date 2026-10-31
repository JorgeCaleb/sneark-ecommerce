import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, takeUntil } from 'rxjs';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { PedidosService, Pedido, EstadoPedido } from '../../core/services/pedidos.service';
import { PagosService } from '../../core/services/pagos.service';
import { AuthService } from '../../core/services/auth.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { extraerMensajeError } from '../../core/utils/error.util';
import { etiquetaIncidenciaPago } from '../../core/utils/estado-pago.util';

@Component({
  selector: 'app-mis-pedidos',
  standalone: true,
  imports: [RouterLink, MonedaPipe, NgIcon],
  templateUrl: './mis-pedidos.component.html',
  styleUrl: './mis-pedidos.component.css',
})
export class MisPedidosComponent implements OnInit {
  readonly etiquetaIncidenciaPago = etiquetaIncidenciaPago;
  private pedidosService = inject(PedidosService);
  private pagosService = inject(PagosService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pedidos = signal<Pedido[]>([]);
  readonly cargando = signal(true);
  readonly pedidoAbierto = signal<number | null>(null);
  readonly errorCancelacion = signal('');
  readonly errorCarga = signal('');
  readonly pagandoId = signal<number | null>(null);

  // Mapa de labels y colores por estado
  readonly estadoConfig: Record<EstadoPedido, { label: string; color: string }> = {
    PENDIENTE: { label: 'Pendiente de pago', color: 'warning' },
    PAGO_VERIFICADO: { label: 'Pago verificado', color: 'info' },
    EN_PREPARACION: { label: 'En preparación', color: 'info' },
    ENVIADO: { label: 'Enviado', color: 'success' },
    ENTREGADO: { label: 'Entregado', color: 'success' },
    CANCELADO: { label: 'Cancelado', color: 'error' },
    PAGO_REQUIERE_REVISION: { label: 'Pago en revisión', color: 'error' },
  };

  ngOnInit() {
    this.cargarPedidos();
  }

  cargarPedidos() {
    this.cargando.set(true);
    this.errorCarga.set('');
    this.pedidosService.misPedidos().subscribe({
      next: (p) => {
        this.pedidos.set(p);
        this.cargando.set(false);
      },
      error: (err) => {
        this.errorCarga.set(
          extraerMensajeError(
            err,
            'No se pudieron cargar tus pedidos. Revisa tu conexión e inténtalo nuevamente.',
          ),
        );
        this.cargando.set(false);
      },
    });
  }

  togglePedido(id: number) {
    this.pedidoAbierto.update((actual) => (actual === id ? null : id));
  }

  formatearFecha(fecha: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(fecha));
  }

  // Devuelve true si el pedido puede pagarse en línea con Mercado Pago
  puedePagarConMercadoPago(pedido: Pedido): boolean {
    return pedido.metodoPago === 'MERCADOPAGO' && pedido.estado === 'PENDIENTE' && !etiquetaIncidenciaPago(pedido);
  }

  // Pagar con Mercado Pago
  pagarConMercadoPago(pedidoId: number) {
    if (this.pagandoId() !== null || !this.auth.sesionValida()) return;
    const sesion = this.auth.idSesion;
    this.pagandoId.set(pedidoId);
    this.pagosService.crearPreferencia(pedidoId).pipe(
      takeUntil(this.auth.cambiosSesion$),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.pagandoId.set(null)),
    ).subscribe({
      next: (res) => {
        if (sesion === this.auth.idSesion && this.auth.sesionValida()) {
          window.location.href = res.urlPago;
        }
      },
      error: (err) => {
        alert(err?.error?.message ?? 'No se pudo iniciar el pago con Mercado Pago.');
      },
    });
  }

  // Devuelve true si el pedido puede ser cancelado
  puedeCancelar(pedido: Pedido): boolean {
    return pedido.estado === 'PENDIENTE';
  }

  cancelar(pedidoId: number) {
    if (!confirm('¿Estás seguro de cancelar este pedido?')) return;
    this.errorCancelacion.set('');
    this.pedidosService.cancelar(pedidoId).subscribe({
      next: (pedidoActualizado) => {
        this.pedidos.update((lista) =>
          lista.map((p) => (p.id === pedidoId ? pedidoActualizado : p)),
        );
      },
      error: (err) => {
        const mensaje = err?.error?.message;
        this.errorCancelacion.set(
          typeof mensaje === 'string'
            ? mensaje
            : 'No se pudo cancelar el pedido. Inténtalo nuevamente.',
        );
      },
    });
  }
}
