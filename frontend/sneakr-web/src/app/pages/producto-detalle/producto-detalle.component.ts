import { Component, OnInit, inject, signal, computed, Input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProductosService, Producto, TallaProducto } from '../../core/services/productos.service';
import { CarritoService } from '../../core/services/carrito.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-producto-detalle',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './producto-detalle.component.html',
  styleUrl: './producto-detalle.component.css',
})
export class ProductoDetalleComponent implements OnInit {
  // El id llega como @Input gracias a withComponentInputBinding()
  @Input() id!: string;

  private productosService = inject(ProductosService);
  private carritoService   = inject(CarritoService);
  private authService      = inject(AuthService);
  private router           = inject(Router);

  readonly producto      = signal<Producto | null>(null);
  readonly cargando      = signal(true);
  readonly imagenActiva  = signal(0);
  readonly tallaSeleccionada = signal<TallaProducto | null>(null);
  readonly cantidad      = signal(1);
  readonly agregando     = signal(false);
  readonly mensajeExito  = signal(false);
  readonly error         = signal('');

  readonly stockDisponible = computed(() =>
    this.tallaSeleccionada()?.stock ?? 0
  );

  readonly puedeAgregar = computed(() =>
    !!this.tallaSeleccionada() &&
    this.tallaSeleccionada()!.stock > 0 &&
    this.cantidad() <= this.tallaSeleccionada()!.stock
  );

  ngOnInit() {
    this.productosService.buscarPorId(+this.id).subscribe({
      next: (p) => {
        this.producto.set(p);
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.router.navigate(['/catalogo']);
      },
    });
  }

  seleccionarImagen(index: number) {
    this.imagenActiva.set(index);
  }

  seleccionarTalla(talla: TallaProducto) {
    if (talla.stock === 0) return;
    this.tallaSeleccionada.set(talla);
    this.cantidad.set(1);
    this.error.set('');
  }

  incrementar() {
    if (this.cantidad() < this.stockDisponible()) {
      this.cantidad.update((v) => v + 1);
    }
  }

  decrementar() {
    if (this.cantidad() > 1) {
      this.cantidad.update((v) => v - 1);
    }
  }

  agregarAlCarrito() {
    if (!this.authService.estaAutenticado()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    const talla = this.tallaSeleccionada();
    if (!talla) {
      this.error.set('Por favor seleccioná una talla.');
      return;
    }

    this.agregando.set(true);
    this.error.set('');

    this.carritoService.agregar(talla.id, this.cantidad()).subscribe({
      next: () => {
        this.agregando.set(false);
        this.mensajeExito.set(true);
        setTimeout(() => this.mensajeExito.set(false), 3000);
      },
      error: (err) => {
        this.agregando.set(false);
        this.error.set(err?.error?.message ?? 'Error al agregar al carrito.');
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
