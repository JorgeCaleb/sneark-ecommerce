import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PedidosService, Pedido, EstadoPedido } from '../../../core/services/pedidos.service';
import { Subscription } from 'rxjs';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';

@Component({
  selector: 'app-admin-pedidos',
  standalone: true,
  imports: [FormsModule, MonedaPipe],
  templateUrl: './admin-pedidos.component.html',
  styleUrl: './admin-pedidos.component.css',
})
export class AdminPedidosComponent implements OnInit, OnDestroy {
  private pedidosService = inject(PedidosService);

  readonly todosLosPedidos = signal<Pedido[]>([]);
  readonly cargando        = signal(true);
  readonly pedidoDetalle   = signal<Pedido | null>(null);
  readonly cambiandoEstado = signal(false);
  readonly nuevoEstado     = signal<EstadoPedido | ''>('');
  readonly totalPedidos = signal(0);
  readonly pagina = signal(1);
  readonly totalPaginas = signal(0);
  readonly errorCarga = signal(false);
  readonly errorEstado = signal('');
  readonly LIMITE_PAGINA = 25;
  private cargaSubscription?: Subscription;

  filtroEstado: EstadoPedido | '' = '';

  readonly estadoConfig: Record<EstadoPedido, { label: string; color: string }> = {
    PENDIENTE:       { label: 'Pendiente',       color: 'warning' },
    PAGO_VERIFICADO: { label: 'Pago verificado',  color: 'info'    },
    EN_PREPARACION:  { label: 'En preparación',   color: 'info'    },
    ENVIADO:         { label: 'Enviado',           color: 'success' },
    ENTREGADO:       { label: 'Entregado',         color: 'success' },
    CANCELADO:       { label: 'Cancelado',         color: 'error'   },
  };

  readonly estados: EstadoPedido[] = [
    'PENDIENTE', 'PAGO_VERIFICADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO',
  ];

  readonly pedidosFiltrados = computed(() => this.todosLosPedidos());

  ngOnInit() {
    this.cargar();
  }

  ngOnDestroy() {
    this.cargaSubscription?.unsubscribe();
  }

  cargar() {
    this.cargaSubscription?.unsubscribe();
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.cargaSubscription = this.pedidosService.buscarPagina(
      this.pagina(),
      this.LIMITE_PAGINA,
      this.filtroEstado || undefined,
    ).subscribe({
      next: (resultado) => {
        this.todosLosPedidos.set(resultado.datos);
        this.totalPedidos.set(resultado.meta.total);
        this.pagina.set(resultado.meta.pagina);
        this.totalPaginas.set(resultado.meta.totalPaginas);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set(true);
        this.cargando.set(false);
      },
    });
  }

  filtrar() {
    this.pagina.set(1);
    this.cargar();
  }

  irAPagina(nuevaPagina: number) {
    if (nuevaPagina < 1 || nuevaPagina > this.totalPaginas()) return;
    this.pagina.set(nuevaPagina);
    this.cargar();
  }

  abrirDetalle(pedido: Pedido) {
    this.pedidoDetalle.set(pedido);
    this.nuevoEstado.set(pedido.estado);
  }

  cerrarDetalle() {
    this.pedidoDetalle.set(null);
    this.nuevoEstado.set('');
  }

  cambiarEstado() {
    const pedido = this.pedidoDetalle();
    const estado = this.nuevoEstado() as EstadoPedido;
    if (!pedido || !estado || estado === pedido.estado) return;

    this.cambiandoEstado.set(true);
    this.errorEstado.set('');
    this.pedidosService.actualizarEstado(pedido.id, estado).subscribe({
      next: (p) => {
        this.cambiandoEstado.set(false);
        this.pedidoDetalle.set(p);
        this.cargar();
      },
      error: (error) => {
        this.cambiandoEstado.set(false);
        this.errorEstado.set(error?.error?.message ?? 'No se pudo actualizar el estado.');
      },
    });
  }

  formatearFecha(fecha: string): string {
    const fechaPedido = new Date(fecha);
    if (Number.isNaN(fechaPedido.getTime())) return 'Fecha no disponible';
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(fechaPedido);
  }
}
