import { Component, OnInit, inject, signal } from '@angular/core';
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

  // Formulario
  telefono   = '';
  ciudad     = '';
  direccion  = '';
  metodoPago: MetodoPago = 'YAPE';

  ngOnInit() {
    // Si el carrito está vacío redirigir
    if (!this.carrito() || this.carrito()!.items.length === 0) {
      this.carritoService.obtener().subscribe({
        next: (c) => {
          if (c.items.length === 0) this.router.navigate(['/carrito']);
        },
      });
    }
  }

  seleccionarMetodo(metodo: MetodoPago) {
    this.metodoPago = metodo;
  }

  confirmar() {
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
        this.router.navigate(['/comprobante', pedido.id]);
      },
      error: (err) => {
        this.enviando.set(false);
        this.error.set(err?.error?.message ?? 'Error al confirmar el pedido.');
      },
    });
  }

  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(precio);
  }
}
