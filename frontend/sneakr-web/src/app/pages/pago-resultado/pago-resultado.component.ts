import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PagosService, EstadoPagoResponse } from '../../core/services/pagos.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { DatePipe } from '@angular/common';

type TipoResultado = 'exitoso' | 'pendiente' | 'fallido' | 'desconocido';

@Component({
  selector: 'app-pago-resultado',
  standalone: true,
  imports: [RouterLink, MonedaPipe, DatePipe],
  templateUrl: './pago-resultado.component.html',
  styleUrl: './pago-resultado.component.css',
})
export class PagoResultadoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private pagosService = inject(PagosService);

  readonly cargando = signal(true);
  readonly resultado = signal<TipoResultado>('desconocido');
  readonly pedidoId = signal<number | null>(null);
  readonly detalle = signal<EstadoPagoResponse | null>(null);
  readonly mpPagoId = signal<string | null>(null);

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const estadoParam = params['estado'] ?? params['collection_status'] ?? params['status'];
      const pedidoParam = params['pedido'] ?? params['external_reference'];
      const pagoIdParam = params['payment_id'] ?? params['collection_id'];

      if (pagoIdParam) {
        this.mpPagoId.set(String(pagoIdParam));
      }

      const id = Number(pedidoParam);
      if (!id || isNaN(id)) {
        this.resultado.set('desconocido');
        this.cargando.set(false);
        return;
      }

      this.pedidoId.set(id);

      // Mapear resultado preliminar desde URL
      if (estadoParam === 'exitoso' || estadoParam === 'approved') {
        this.resultado.set('exitoso');
      } else if (estadoParam === 'pendiente' || estadoParam === 'pending' || estadoParam === 'in_process') {
        this.resultado.set('pendiente');
      } else if (estadoParam === 'fallido' || estadoParam === 'rejected' || estadoParam === 'cancelled') {
        this.resultado.set('fallido');
      } else {
        this.resultado.set('pendiente');
      }

      // Consultar el estado real en la base de datos
      this.consultarEstado(id);
    });
  }

  consultarEstado(id: number) {
    this.cargando.set(true);
    this.pagosService.consultarEstado(id).subscribe({
      next: (info) => {
        this.detalle.set(info);
        if (info.mpPagoId) {
          this.mpPagoId.set(info.mpPagoId);
        }
        if (info.estado === 'PAGO_VERIFICADO') {
          this.resultado.set('exitoso');
        } else if (info.estado === 'CANCELADO') {
          this.resultado.set('fallido');
        } else if (info.estado === 'PENDIENTE') {
          // Si MP aprobó en la URL pero el webhook aún está procesándose, mostramos exitoso con nota
          if (this.resultado() !== 'exitoso') {
            this.resultado.set('pendiente');
          }
        }
        this.cargando.set(false);
      },
      error: () => {
        // Si no se puede obtener el detalle, se mantiene el estado detectado por query params
        this.cargando.set(false);
      },
    });
  }
}
