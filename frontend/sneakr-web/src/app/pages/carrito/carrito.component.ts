import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CarritoService, ItemCarrito } from '../../core/services/carrito.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { extraerMensajeError } from '../../core/utils/error.util';

@Component({
  selector: 'app-carrito',
  standalone: true,
  imports: [RouterLink, MonedaPipe],
  templateUrl: './carrito.component.html',
  styleUrl: './carrito.component.css',
})
export class CarritoComponent implements OnInit {
  private carritoService = inject(CarritoService);

  readonly carrito = this.carritoService.carrito;
  readonly total = this.carritoService.total;
  readonly cargando = signal(true);
  readonly errorCarga = signal('');
  readonly errorAccion = signal('');
  readonly actualizando = signal<ReadonlySet<number>>(new Set());
  readonly vaciando = signal(false);

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.errorCarga.set('');
    this.carritoService.obtener().subscribe({
      next: () => this.cargando.set(false),
      error: (err) => {
        this.cargando.set(false);
        this.errorCarga.set(
          extraerMensajeError(err, 'No se pudo cargar el carrito. Revisa tu conexión e intenta de nuevo.'),
        );
      },
    });
  }

  incrementar(item: ItemCarrito) {
    const maxStock = item.tallaProducto.stock;
    if (!item.tallaProducto.producto.activo || item.cantidad >= maxStock) return;
    this.errorAccion.set('');
    this.marcarActualizando(item.id, true);
    this.carritoService.actualizarCantidad(item.id, item.cantidad + 1).subscribe({
      next: () => this.marcarActualizando(item.id, false),
      error: (err) => {
        this.marcarActualizando(item.id, false);
        this.errorAccion.set(
          extraerMensajeError(err, 'No se pudo incrementar la cantidad del producto.'),
        );
      },
    });
  }

  decrementar(item: ItemCarrito) {
    if (!item.tallaProducto.producto.activo || item.cantidad <= 1) return;
    this.errorAccion.set('');
    this.marcarActualizando(item.id, true);
    this.carritoService.actualizarCantidad(item.id, item.cantidad - 1).subscribe({
      next: () => this.marcarActualizando(item.id, false),
      error: (err) => {
        this.marcarActualizando(item.id, false);
        this.errorAccion.set(
          extraerMensajeError(err, 'No se pudo decrementar la cantidad del producto.'),
        );
      },
    });
  }

  eliminar(item: ItemCarrito) {
    this.errorAccion.set('');
    this.marcarActualizando(item.id, true);
    this.carritoService.eliminarItem(item.id).subscribe({
      next: () => this.marcarActualizando(item.id, false),
      error: (err) => {
        this.marcarActualizando(item.id, false);
        this.errorAccion.set(
          extraerMensajeError(err, 'No se pudo eliminar el producto del carrito.'),
        );
      },
    });
  }

  vaciar() {
    this.errorAccion.set('');
    this.vaciando.set(true);
    this.carritoService.vaciar().subscribe({
      next: () => this.vaciando.set(false),
      error: (err) => {
        this.vaciando.set(false);
        this.errorAccion.set(
          extraerMensajeError(err, 'No se pudo vaciar el carrito.'),
        );
      },
    });
  }

  descartarErrorAccion() {
    this.errorAccion.set('');
  }

  imagenItem(item: ItemCarrito): string {
    return item.tallaProducto.producto.imagenes?.[0]?.url ?? '/placeholder-shoe.svg';
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

