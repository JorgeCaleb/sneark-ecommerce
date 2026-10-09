import { Component, OnChanges, inject, signal, computed, Input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProductosService, Producto, TallaProducto } from '../../core/services/productos.service';
import { CarritoService } from '../../core/services/carrito.service';
import { AuthService } from '../../core/services/auth.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';

@Component({
  selector: 'app-producto-detalle',
  standalone: true,
  imports: [RouterLink, MonedaPipe],
  templateUrl: './producto-detalle.component.html',
  styleUrl: './producto-detalle.component.css',
})
export class ProductoDetalleComponent implements OnChanges {
  // El id llega como @Input gracias a withComponentInputBinding()
  @Input() id!: string;

  private productosService = inject(ProductosService);
  private carritoService   = inject(CarritoService);
  private authService      = inject(AuthService);
  private router           = inject(Router);
  private solicitudProducto = 0;

  readonly producto      = signal<Producto | null>(null);
  readonly cargando      = signal(true);
  readonly imagenActiva  = signal(0);
  readonly tallaSeleccionada = signal<TallaProducto | null>(null);
  readonly generoSeleccionado = signal<'M' | 'W' | 'X' | null>(null);
  readonly colorSeleccionadoId = signal<number | null>(null);
  readonly cantidad      = signal(1);
  readonly agregando     = signal(false);
  readonly mensajeExito  = signal(false);
  readonly error         = signal('');

  readonly stockDisponible = computed(() =>
    this.tallaSeleccionada()?.stock ?? 0
  );
  readonly generosDisponibles = computed(() => [
    ...new Set(this.producto()?.tallas.map((variante) => variante.genero) ?? []),
  ]);
  readonly coloresDisponibles = computed(() => {
    const genero = this.generoSeleccionado();
    if (!genero) return [];
    const variantes = this.producto()?.tallas.filter((v) => v.genero === genero) ?? [];
    const colores = new Map<number, { id: number; nombre: string; codigo: string; stock: number }>();
    for (const variante of variantes) {
      const color = colores.get(variante.color.id);
      colores.set(variante.color.id, {
        ...variante.color,
        stock: (color?.stock ?? 0) + variante.stock,
      });
    }
    return [...colores.values()];
  });
  readonly tallasDisponibles = computed(() => {
    const genero = this.generoSeleccionado();
    const colorId = this.colorSeleccionadoId();
    if (!genero || !colorId) return [];
    return (this.producto()?.tallas ?? [])
      .filter((v) => v.genero === genero && v.colorId === colorId)
      .sort((a, b) => Number(a.talla) - Number(b.talla));
  });

  readonly puedeAgregar = computed(() =>
    !!this.tallaSeleccionada() &&
    this.tallaSeleccionada()!.stock > 0 &&
    this.cantidad() <= this.tallaSeleccionada()!.stock
  );

  ngOnChanges() {
    const solicitud = ++this.solicitudProducto;
    this.producto.set(null);
    this.cargando.set(true);
    this.imagenActiva.set(0);
    this.tallaSeleccionada.set(null);
    this.generoSeleccionado.set(null);
    this.colorSeleccionadoId.set(null);
    this.cantidad.set(1);
    this.mensajeExito.set(false);
    this.error.set('');

    this.productosService.buscarPorId(Number(this.id)).subscribe({
      next: (p) => {
        if (solicitud !== this.solicitudProducto) return;
        this.producto.set(p);
        this.cargando.set(false);
      },
      error: () => {
        if (solicitud !== this.solicitudProducto) return;
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

  seleccionarGenero(genero: 'M' | 'W' | 'X') {
    this.generoSeleccionado.set(genero);
    this.colorSeleccionadoId.set(null);
    this.tallaSeleccionada.set(null);
    this.error.set('');
  }

  seleccionarColor(colorId: number) {
    this.colorSeleccionadoId.set(colorId);
    this.tallaSeleccionada.set(null);
    this.error.set('');
  }

  etiquetaGenero(genero: 'M' | 'W' | 'X') {
    return { M: 'Hombre', W: 'Mujer', X: 'Unisex' }[genero];
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

}
