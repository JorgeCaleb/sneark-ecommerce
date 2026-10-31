import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription, finalize } from 'rxjs';
import { Carrito, CarritoService, ItemCarrito } from '../../core/services/carrito.service';
import { extraerMensajeError } from '../../core/utils/error.util';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';

@Component({
  selector: 'app-carrito',
  standalone: true,
  imports: [RouterLink, MonedaPipe, NgIcon],
  templateUrl: './carrito.component.html',
  styleUrl: './carrito.component.css',
})
export class CarritoComponent implements OnInit {
  private readonly carritoService = inject(CarritoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private lectura?: Subscription;
  readonly carrito = this.carritoService.carrito;
  readonly total = this.carritoService.total;
  readonly cargando = signal(true);
  readonly errorCarga = signal('');
  readonly errorAccion = signal('');
  readonly mensajeAccion = signal('');
  readonly actualizando = signal<ReadonlySet<number>>(new Set());
  readonly vaciando = signal(false);
  readonly ocupado = computed(
    () => this.cargando() || this.vaciando() || this.actualizando().size > 0,
  );
  readonly productosNoDisponibles = computed(
    () => this.carrito()?.items.some((item) => !this.disponible(item)) ?? false,
  );
  readonly puedeContinuar = computed(
    () =>
      !this.ocupado() &&
      !this.errorCarga() &&
      (this.carrito()?.items.length ?? 0) > 0 &&
      !this.productosNoDisponibles(),
  );

  ngOnInit(): void {
    this.cargar();
  }
  cargar(): void {
    this.lectura?.unsubscribe();
    this.cargando.set(true);
    this.errorCarga.set('');
    this.errorAccion.set('');
    this.lectura = this.carritoService
      .obtener()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.cargando.set(false)),
      )
      .subscribe({
        error: (err) =>
          this.errorCarga.set(
            extraerMensajeError(
              err,
              'No se pudo cargar el carrito. Revisa tu conexión e intenta de nuevo.',
            ),
          ),
      });
  }
  disponible(item: ItemCarrito): boolean {
    return item.tallaProducto.producto.activo && item.tallaProducto.disponible;
  }
  incrementar(item: ItemCarrito): void {
    const actual = this.itemActual(item.id);
    if (!actual || !this.disponible(actual) || actual.cantidad >= 2_147_483_647) return;
    this.mutarItem(
      actual,
      () => this.carritoService.actualizarCantidad(actual.id, actual.cantidad + 1),
      'Cantidad actualizada.',
      'No se pudo incrementar la cantidad del producto.',
    );
  }
  decrementar(item: ItemCarrito): void {
    const actual = this.itemActual(item.id);
    if (!actual || !this.disponible(actual) || actual.cantidad <= 1) return;
    this.mutarItem(
      actual,
      () => this.carritoService.actualizarCantidad(actual.id, actual.cantidad - 1),
      'Cantidad actualizada.',
      'No se pudo reducir la cantidad del producto.',
    );
  }
  eliminar(item: ItemCarrito): void {
    const actual = this.itemActual(item.id);
    if (!actual) return;
    this.mutarItem(
      actual,
      () => this.carritoService.eliminarItem(actual.id),
      'Producto eliminado del carrito.',
      'No se pudo eliminar el producto del carrito.',
      true,
    );
  }
  vaciar(): void {
    if (this.ocupado() || !this.carrito()?.items.length) return;
    this.errorAccion.set('');
    this.mensajeAccion.set('');
    this.vaciando.set(true);
    this.carritoService
      .vaciar()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.vaciando.set(false)),
      )
      .subscribe({
        next: () => {
          this.mensajeAccion.set('Carrito vacío.');
          this.enfocarCarrito();
        },
        error: (err) =>
          this.errorAccion.set(extraerMensajeError(err, 'No se pudo vaciar el carrito.')),
      });
  }
  continuarCompra(): void {
    if (this.puedeContinuar()) void this.router.navigate(['/checkout']);
  }
  descartarErrorAccion(): void {
    this.errorAccion.set('');
    this.enfocarCarrito();
  }
  imagenItem(item: ItemCarrito): string {
    return item.tallaProducto.producto.imagenes[0]?.url || 'placeholder-shoe.svg';
  }
  imagenAlternativa(event: Event): void {
    const imagen = event.target as HTMLImageElement;
    if (!imagen.src.endsWith('/placeholder-shoe.svg')) imagen.src = 'placeholder-shoe.svg';
  }
  private itemActual(id: number): ItemCarrito | undefined {
    return this.carrito()?.items.find((item) => item.id === id);
  }
  private mutarItem(
    item: ItemCarrito,
    accion: () => Observable<Carrito>,
    mensaje: string,
    fallback: string,
    enfocar = false,
  ): void {
    if (this.cargando() || this.vaciando() || this.actualizando().has(item.id)) return;
    this.errorAccion.set('');
    this.mensajeAccion.set('');
    this.marcarActualizando(item.id, true);
    accion()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.marcarActualizando(item.id, false)),
      )
      .subscribe({
        next: () => {
          this.mensajeAccion.set(mensaje);
          if (enfocar) this.enfocarCarrito();
        },
        error: (err) => this.errorAccion.set(extraerMensajeError(err, fallback)),
      });
  }
  private marcarActualizando(id: number, activo: boolean): void {
    this.actualizando.update((actuales) => {
      const siguientes = new Set(actuales);
      if (activo) siguientes.add(id);
      else siguientes.delete(id);
      return siguientes;
    });
  }
  private enfocarCarrito(): void {
    globalThis.requestAnimationFrame?.(
      () =>
        document.getElementById('cart-products-heading')?.focus() ??
        document.getElementById('cart-state-title')?.focus(),
    );
  }
}
