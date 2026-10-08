import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CarritoService } from '../../core/services/carrito.service';
import { PedidosService, MetodoPago } from '../../core/services/pedidos.service';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css',
})
export class CheckoutComponent implements OnInit {
  private carritoService = inject(CarritoService);
  private pedidosService = inject(PedidosService);
  private router         = inject(Router);

  readonly carrito   = this.carritoService.carrito;
  readonly total     = this.carritoService.total;
  readonly enviando  = signal(false);
  readonly error     = signal('');
  readonly cargandoCarrito = signal(false);
  readonly carritoCargado = signal(false);
  readonly errorCargaCarrito = signal('');
  readonly confirmacionDeshabilitada = computed(
    () =>
      this.cargandoCarrito() ||
      !this.carritoCargado() ||
      (this.carrito()?.items.length ?? 0) === 0 ||
      this.enviando(),
  );

  // Formulario
  telefono   = '';
  ciudad     = '';
  direccion  = '';
  metodoPago: MetodoPago = 'YAPE';

  ngOnInit() {
    this.cargarCarrito();
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

  seleccionarMetodo(metodo: MetodoPago) {
    this.metodoPago = metodo;
  }

  confirmar() {
    if (this.confirmacionDeshabilitada()) return;

    if (!this.telefono || !this.ciudad || !this.direccion) {
      this.error.set('Por favor completá todos los campos.');
      return;
    }

    this.enviando.set(true);
    this.error.set('');

    this.pedidosService.crear({
      metodoPago: this.metodoPago,
      telefono: this.telefono,
      ciudad: this.ciudad,
      direccion: this.direccion,
    }).subscribe({
      next: (pedido) => {
        this.enviando.set(false);
        this.carritoService.limpiarLocal();
        this.router.navigate(['/comprobante', pedido.id]);
      },
      error: (err) => {
        this.enviando.set(false);
        this.error.set(err?.error?.message ?? 'Error al confirmar el pedido.');
      },
    });
  }

  formatearPrecio(precio: number | string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(Number(precio));
  }
}
