import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PagosService, EstadoPagoResponse } from '../../core/services/pagos.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { DatePipe } from '@angular/common';
import {
  Subject,
  Subscription,
  catchError,
  exhaustMap,
  of,
  takeUntil,
  takeWhile,
  timer,
} from 'rxjs';

type TipoResultado = 'exitoso' | 'pendiente' | 'fallido' | 'revision' | 'desconocido';

@Component({
  selector: 'app-pago-resultado',
  standalone: true,
  imports: [RouterLink, MonedaPipe, DatePipe],
  templateUrl: './pago-resultado.component.html',
  styleUrl: './pago-resultado.component.css',
})
export class PagoResultadoComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private pagosService = inject(PagosService);

  readonly cargando = signal(true);
  readonly resultado = signal<TipoResultado>('desconocido');
  readonly pedidoId = signal<number | null>(null);
  readonly detalle = signal<EstadoPagoResponse | null>(null);
  readonly mpPagoId = signal<string | null>(null);
  readonly errorConsulta = signal('');
  readonly reintentandoPago = signal(false);
  private estadoRetorno: string | null = null;
  private readonly destruir$ = new Subject<void>();
  private seguimiento?: Subscription;

  ngOnInit() {
    this.route.queryParams.pipe(takeUntil(this.destruir$)).subscribe((params) => {
      const pedidoParam = params['pedido'] ?? params['external_reference'];
      this.estadoRetorno =
        params['estado'] === 'fallido' ||
        params['estado'] === 'pendiente' ||
        params['estado'] === 'exitoso'
          ? params['estado']
          : null;

      const id = Number(pedidoParam);
      if (!Number.isSafeInteger(id) || id <= 0) {
        this.seguimiento?.unsubscribe();
        this.pedidoId.set(null);
        this.detalle.set(null);
        this.mpPagoId.set(null);
        this.resultado.set('desconocido');
        this.cargando.set(false);
        return;
      }

      this.pedidoId.set(id);
      this.detalle.set(null);
      this.mpPagoId.set(null);
      this.resultado.set('pendiente');
      this.consultarEstado(id);
    });
  }

  ngOnDestroy() {
    this.destruir$.next();
    this.destruir$.complete();
    this.seguimiento?.unsubscribe();
  }

  consultarEstado(id = this.pedidoId()) {
    if (!id) return;
    this.seguimiento?.unsubscribe();
    this.cargando.set(true);
    this.errorConsulta.set('');
    this.seguimiento = timer(0, 3_000)
      .pipe(
        exhaustMap(() =>
          this.pagosService.consultarEstado(id).pipe(
            catchError(() => {
              this.errorConsulta.set(
                'No se pudo consultar el pedido en este momento. Seguiremos intentando; también puedes volver a consultar manualmente.',
              );
              return of(null);
            }),
          ),
        ),
        takeWhile((info, intento) => intento < 20 && (!info || info.estado === 'PENDIENTE'), true),
        takeUntil(this.destruir$),
      )
      .subscribe((info) => {
        this.cargando.set(false);
        if (!info) return;
        this.errorConsulta.set('');
        this.detalle.set(info);
        if (info.mpPagoId) {
          this.mpPagoId.set(info.mpPagoId);
        }
        if (
          info.estado === 'PAGO_VERIFICADO' ||
          info.estado === 'EN_PREPARACION' ||
          info.estado === 'ENVIADO' ||
          info.estado === 'ENTREGADO'
        ) {
          this.resultado.set('exitoso');
        } else if (info.estado === 'PAGO_REQUIERE_REVISION') {
          this.resultado.set('revision');
        } else if (info.estado === 'CANCELADO') {
          this.resultado.set('fallido');
        } else if (info.estado === 'PENDIENTE') {
          this.resultado.set(
            this.estadoRetorno === 'fallido' ? 'fallido' : 'pendiente',
          );
        }
      });
  }

  reintentarPago() {
    const pedidoId = this.pedidoId();
    if (!pedidoId || this.detalle()?.estado !== 'PENDIENTE') return;
    this.reintentandoPago.set(true);
    this.errorConsulta.set('');
    this.pagosService.crearPreferencia(pedidoId).subscribe({
      next: (respuesta) => {
        window.location.href = respuesta.urlPago;
      },
      error: (err) => {
        this.reintentandoPago.set(false);
        this.errorConsulta.set(
          typeof err?.error?.message === 'string'
            ? err.error.message
            : 'No se pudo reiniciar el pago. Inténtalo desde Mis pedidos.',
        );
      },
    });
  }
}
