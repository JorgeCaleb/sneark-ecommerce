import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CarritoService } from '../../core/services/carrito.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { PagosService } from '../../core/services/pagos.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { AuthService } from '../../core/services/auth.service';
import { EMPTY, finalize, switchMap, takeUntil } from 'rxjs';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [RouterLink, FormsModule, MonedaPipe, NgIcon],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css',
})
export class CheckoutComponent implements OnInit {
  private carritoService = inject(CarritoService);
  private pedidosService = inject(PedidosService);
  private pagosService = inject(PagosService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly carrito = this.carritoService.carrito;
  readonly total = this.carritoService.total;
  readonly enviando = signal(false);
  readonly error = signal('');
  readonly pedidoPendientePagoId = signal<number | null>(null);
  readonly mostrarAccesoPedidos = signal(false);
  readonly cargandoCarrito = signal(false);
  readonly carritoCargado = signal(false);
  readonly errorCargaCarrito = signal('');
  readonly opcionesEnvio = signal<{ distrito: string; costoEnvio: number }[]>([]);
  readonly cargandoEnvio = signal(false);
  readonly costoEnvio = signal<number | null>(null);
  readonly errorEnvio = signal('');
  readonly totalCheckout = computed(() =>
    Number((Number(this.total()) + (this.costoEnvio() ?? 0)).toFixed(2)),
  );
  private solicitudEnvio = 0;
  readonly confirmacionDeshabilitada = computed(
    () =>
      this.cargandoCarrito() ||
      this.cargandoEnvio() ||
      this.costoEnvio() === null ||
      !this.carritoCargado() ||
      (this.carrito()?.items.length ?? 0) === 0 ||
      this.enviando(),
  );

  // Formulario
  telefono = '';
  distrito = '';
  direccion = '';

  ngOnInit() {
    this.cargarCarrito();
    this.pedidosService.opcionesEnvio().subscribe({
      next: (opciones) => this.opcionesEnvio.set(opciones),
      error: () =>
        this.errorEnvio.set('No se pudieron cargar los distritos de envío. Inténtalo nuevamente.'),
    });
  }

  seleccionarDistrito(distrito: string) {
    this.distrito = distrito;
    const solicitud = ++this.solicitudEnvio;
    this.costoEnvio.set(null);
    this.errorEnvio.set('');
    if (!distrito) {
      this.cargandoEnvio.set(false);
      return;
    }
    if (!this.opcionesEnvio().some((opcion) => opcion.distrito === distrito)) {
      this.errorEnvio.set('Selecciona un distrito de envío válido.');
      return;
    }

    this.cargandoEnvio.set(true);
    this.pedidosService.cotizarEnvio(distrito).subscribe({
      next: (cotizacion) => {
        if (solicitud !== this.solicitudEnvio) return;
        this.costoEnvio.set(cotizacion.costoEnvio);
        this.cargandoEnvio.set(false);
      },
      error: (err) => {
        if (solicitud !== this.solicitudEnvio) return;
        this.errorEnvio.set(
          err?.error?.message ?? 'No se pudo calcular el costo de envío. Inténtalo nuevamente.',
        );
        this.cargandoEnvio.set(false);
      },
    });
  }

  cargarCarrito() {
    this.cargandoCarrito.set(true);
    this.carritoCargado.set(false);
    this.errorCargaCarrito.set('');

    this.carritoService.obtener().subscribe({
      next: () => {
        this.cargandoCarrito.set(false);
        this.carritoCargado.set(true);
      },
      error: (err) => {
        this.cargandoCarrito.set(false);
        this.errorCargaCarrito.set(
          err?.error?.message ?? 'No se pudo cargar el carrito. Inténtalo nuevamente.',
        );
      },
    });
  }

  reintentarCarga() {
    this.cargarCarrito();
  }

  confirmar() {
    if (this.confirmacionDeshabilitada() || !this.auth.sesionValida()) return;

    if (!this.telefono || !this.distrito || !this.direccion) {
      this.error.set('Por favor completá todos los campos.');
      return;
    }

    this.enviando.set(true);
    this.error.set('');
    this.pedidoPendientePagoId.set(null);
    this.mostrarAccesoPedidos.set(false);
    const sesion = this.auth.idSesion;

    this.pedidosService
      .crear({
        telefono: this.telefono,
        distrito: this.distrito,
        direccion: this.direccion,
      })
      .pipe(
        switchMap((pedido) => {
          if (sesion !== this.auth.idSesion || !this.auth.sesionValida()) return EMPTY;
          this.carritoService.limpiarLocal();
          this.pedidoPendientePagoId.set(pedido.id);
          return this.pagosService.crearPreferencia(pedido.id);
        }),
        takeUntil(this.auth.cambiosSesion$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: (res) => {
          if (sesion === this.auth.idSesion && this.auth.sesionValida()) {
            window.location.href = res.urlPago;
          }
        },
        error: (err) => {
          this.mostrarAccesoPedidos.set(true);
          this.error.set(
            err?.error?.message ??
              (this.pedidoPendientePagoId() !== null
                ? 'No se pudo generar el enlace de pago con Mercado Pago.'
                : 'Error al confirmar el pedido.'),
          );
        },
      });
  }
}
