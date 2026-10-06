import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CarritoService, ItemCarrito } from '../../core/services/carrito.service';

@Component({
  selector: 'app-carrito',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './carrito.component.html',
  styleUrl: './carrito.component.css',
})
export class CarritoComponent implements OnInit {
  private carritoService = inject(CarritoService);

  readonly carrito   = this.carritoService.carrito;
  readonly total     = this.carritoService.total;
  readonly cargando  = signal(true);
  readonly actualizando = signal<number | null>(null); // id del item en proceso

  ngOnInit() {
    this.carritoService.obtener().subscribe({
      next:  () => this.cargando.set(false),
      error: () => this.cargando.set(false),
    });
  }

  incrementar(item: ItemCarrito) {
    const maxStock = item.tallaProducto.stock;
    if (item.cantidad >= maxStock) return;
    this.actualizando.set(item.id);
    this.carritoService.actualizarCantidad(item.id, item.cantidad + 1).subscribe({
      next:  () => this.actualizando.set(null),
      error: () => this.actualizando.set(null),
    });
  }

  decrementar(item: ItemCarrito) {
    if (item.cantidad <= 1) return;
    this.actualizando.set(item.id);
    this.carritoService.actualizarCantidad(item.id, item.cantidad - 1).subscribe({
      next:  () => this.actualizando.set(null),
      error: () => this.actualizando.set(null),
    });
  }

  eliminar(item: ItemCarrito) {
    this.actualizando.set(item.id);
    this.carritoService.eliminarItem(item.id).subscribe({
      next:  () => this.actualizando.set(null),
      error: () => this.actualizando.set(null),
    });
  }

  vaciar() {
    this.carritoService.vaciar().subscribe();
  }

  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(precio);
  }

  imagenItem(item: ItemCarrito): string {
    return item.tallaProducto.producto.imagenes?.[0]?.url ?? '/placeholder-shoe.jpg';
  }
}
