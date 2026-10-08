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
  readonly actualizando = signal<ReadonlySet<number>>(new Set());

  ngOnInit() {
    this.carritoService.obtener().subscribe({
      next:  () => this.cargando.set(false),
      error: () => this.cargando.set(false),
    });
  }

  incrementar(item: ItemCarrito) {
    const maxStock = item.tallaProducto.stock;
    if (!item.tallaProducto.producto.activo || item.cantidad >= maxStock) return;
    this.marcarActualizando(item.id, true);
    this.carritoService.actualizarCantidad(item.id, item.cantidad + 1).subscribe({
      next:  () => this.marcarActualizando(item.id, false),
      error: () => this.marcarActualizando(item.id, false),
    });
  }

  decrementar(item: ItemCarrito) {
    if (!item.tallaProducto.producto.activo || item.cantidad <= 1) return;
    this.marcarActualizando(item.id, true);
    this.carritoService.actualizarCantidad(item.id, item.cantidad - 1).subscribe({
      next:  () => this.marcarActualizando(item.id, false),
      error: () => this.marcarActualizando(item.id, false),
    });
  }

  eliminar(item: ItemCarrito) {
    this.marcarActualizando(item.id, true);
    this.carritoService.eliminarItem(item.id).subscribe({
      next:  () => this.marcarActualizando(item.id, false),
      error: () => this.marcarActualizando(item.id, false),
    });
  }

  vaciar() {
    this.carritoService.vaciar().subscribe();
  }

  formatearPrecio(precio: number | string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(Number(precio));
  }

  imagenItem(item: ItemCarrito): string {
    return item.tallaProducto.producto.imagenes?.[0]?.url ?? '/placeholder-shoe.jpg';
  }

  private marcarActualizando(itemId: number, activo: boolean) {
    this.actualizando.update((actuales) => {
      const siguientes = new Set(actuales);
      if (activo) siguientes.add(itemId);
      else siguientes.delete(itemId);
      return siguientes;
    });
  }
}
