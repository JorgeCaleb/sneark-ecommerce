import { Component, DestroyRef, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  ProductosService,
  ProductoPublico,
  TallaProductoPublica,
} from '../../core/services/productos.service';
import { CarritoService } from '../../core/services/carrito.service';
import { AuthService } from '../../core/services/auth.service';
import { FavoritosService } from '../../core/services/favoritos.service';
import { GruposModelosService, ModeloRelacionado } from '../../core/services/grupos-modelos.service';
import { colorVisual } from '../../core/utils/color-visual.util';
import { ProductoCardComponent } from '../../shared/components/producto-card/producto-card.component';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';

@Component({
  selector: 'app-producto-detalle',
  standalone: true,
  imports: [RouterLink, MonedaPipe, ProductoCardComponent, NgIcon],
  templateUrl: './producto-detalle.component.html',
  styleUrl: './producto-detalle.component.css',
})
export class ProductoDetalleComponent implements OnChanges {
  @Input() id!: string;
  @Input() colorId?: string;
  private readonly productosService = inject(ProductosService);
  private readonly carritoService = inject(CarritoService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly favoritos = inject(FavoritosService);
  private readonly grupos = inject(GruposModelosService);
  private lecturaProducto?: Subscription;
  private lecturaRelacionados?: Subscription;
  private lecturaModelos?: Subscription;
  private solicitudProducto = 0;

  readonly producto = signal<ProductoPublico | null>(null);
  readonly relacionados = signal<ProductoPublico[]>([]);
  readonly modelosGrupo = signal<ModeloRelacionado[]>([]);
  readonly cargandoModelos = signal(false);
  readonly errorModelos = signal(false);
  readonly cargando = signal(true);
  readonly errorCarga = signal('');
  readonly noEncontrado = signal(false);
  readonly cargandoRelacionados = signal(false);
  readonly errorRelacionados = signal(false);
  readonly imagenActiva = signal(0);
  readonly tallaSeleccionada = signal<TallaProductoPublica | null>(null);
  readonly generoSeleccionado = signal<'M' | 'W' | 'X' | null>(null);
  readonly colorSeleccionadoId = signal<number | null>(null);
  readonly cantidad = signal(1);
  readonly agregando = signal(false);
  readonly mensajeExito = signal(false);
  readonly error = signal('');
  readonly colorVisual = colorVisual;
  readonly favorito = computed(() => this.favoritos.contiene(this.producto()?.id ?? -1));
  readonly agotado = computed(() => !this.producto()?.tallas.some((t) => t.disponible));
  readonly imagenes = computed(() => this.producto()?.imagenes ?? []);
  readonly tieneVariosColores = computed(
    () => new Set(this.producto()?.tallas.map((variante) => variante.colorId) ?? []).size > 1,
  );
  readonly imagenesComplementarias = computed(() =>
    this.imagenes()
      .map((imagen, index) => ({ ...imagen, index }))
      .filter((imagen) => imagen.index !== this.imagenActiva()),
  );
  readonly generosDisponibles = computed(() => [
    ...new Set(this.producto()?.tallas.map((v) => v.genero) ?? []),
  ]);
  readonly nombresGeneros = computed(() =>
    this.generosDisponibles()
      .map((g) => this.etiquetaGenero(g))
      .join(' / '),
  );
  readonly nombresColores = computed(() =>
    [...new Set(this.producto()?.tallas.map((v) => v.color.nombre) ?? [])].join(' / '),
  );
  readonly coloresDisponibles = computed(() => {
    const variantes =
      this.producto()?.tallas.filter((v) => v.genero === this.generoSeleccionado()) ?? [];
    const colores = new Map<
      number,
      { id: number; nombre: string; codigo: string; disponible: boolean }
    >();
    for (const variante of variantes)
      colores.set(variante.color.id, {
        ...variante.color,
        disponible: (colores.get(variante.color.id)?.disponible ?? false) || variante.disponible,
      });
    return [...colores.values()];
  });
  readonly tallasDisponibles = computed(() =>
    (this.producto()?.tallas ?? [])
      .filter(
        (v) => v.genero === this.generoSeleccionado() && v.colorId === this.colorSeleccionadoId(),
      )
      .sort((a, b) => Number(a.talla) - Number(b.talla)),
  );
  readonly colorActualNombre = computed(
    () => this.coloresDisponibles().find((c) => c.id === this.colorSeleccionadoId())?.nombre ?? '',
  );
  readonly hayStockSeleccionado = computed(() => this.tallaSeleccionada()?.disponible ?? false);
  readonly puedeAgregar = computed(
    () => this.hayStockSeleccionado() && Number.isInteger(this.cantidad()) && this.cantidad() > 0,
  );

  ngOnChanges(): void {
    this.cargarProducto();
  }
  cargarProducto(): void {
    const solicitud = ++this.solicitudProducto;
    this.lecturaProducto?.unsubscribe();
    this.lecturaRelacionados?.unsubscribe();
    this.lecturaModelos?.unsubscribe();
    this.modelosGrupo.set([]);
    this.cargandoModelos.set(false);
    this.errorModelos.set(false);
    this.producto.set(null);
    this.relacionados.set([]);
    this.cargando.set(true);
    this.errorCarga.set('');
    this.noEncontrado.set(false);
    this.cargandoRelacionados.set(false);
    this.errorRelacionados.set(false);
    this.imagenActiva.set(0);
    this.tallaSeleccionada.set(null);
    this.generoSeleccionado.set(null);
    this.colorSeleccionadoId.set(null);
    this.cantidad.set(1);
    this.agregando.set(false);
    this.mensajeExito.set(false);
    this.error.set('');
    const id = Number(this.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      this.noEncontrado.set(true);
      this.cargando.set(false);
      return;
    }
    this.lecturaProducto = this.productosService
      .buscarPorId(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (producto) => {
          if (solicitud !== this.solicitudProducto) return;
          this.producto.set(producto);
          this.cargando.set(false);
          const colorPreferido = Number(this.colorId);
          const inicial = producto.tallas.find((t) => t.colorId === colorPreferido && t.disponible)
            ?? producto.tallas.find((t) => t.colorId === colorPreferido)
            ?? producto.tallas.find((t) => t.disponible) ?? producto.tallas[0];
          if (inicial) {
            this.seleccionarGenero(inicial.genero);
            this.seleccionarColor(inicial.colorId);
          }
          this.cargarRelacionados();
          this.cargarModelosGrupo();
        },
        error: (err) => {
          if (solicitud !== this.solicitudProducto) return;
          this.cargando.set(false);
          this.noEncontrado.set(err?.status === 404);
          this.errorCarga.set('No pudimos cargar este producto. Inténtalo nuevamente.');
        },
      });
  }
  cargarModelosGrupo(): void {
    this.lecturaModelos?.unsubscribe();
    const producto = this.producto();
    const grupoId = producto?.grupoModeloId ?? producto?.grupoModelo?.id;
    if (!grupoId) return;
    const solicitud = this.solicitudProducto;
    this.cargandoModelos.set(true);
    this.errorModelos.set(false);
    this.lecturaModelos = this.grupos.buscarModelos(grupoId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (modelos) => {
        if (solicitud !== this.solicitudProducto) return;
        this.modelosGrupo.set(modelos);
        this.cargandoModelos.set(false);
      },
      error: () => {
        if (solicitud !== this.solicitudProducto) return;
        this.errorModelos.set(true);
        this.cargandoModelos.set(false);
      },
    });
  }

  cargarRelacionados(): void {
    const producto = this.producto();
    if (!producto) return;
    this.lecturaRelacionados?.unsubscribe();
    const grupoModeloId = producto.grupoModeloId ?? producto.grupoModelo?.id;
    if (!grupoModeloId) {
      this.relacionados.set([]);
      this.cargandoRelacionados.set(false);
      this.errorRelacionados.set(false);
      return;
    }
    const solicitud = this.solicitudProducto;
    this.cargandoRelacionados.set(true);
    this.errorRelacionados.set(false);
    this.lecturaRelacionados = this.productosService
      .buscarPagina({ limite: 5, grupoModeloId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (solicitud !== this.solicitudProducto) return;
          this.relacionados.set(res.datos.filter((item) => item.id !== producto.id).slice(0, 4));
          this.cargandoRelacionados.set(false);
        },
        error: () => {
          if (solicitud !== this.solicitudProducto) return;
          this.cargandoRelacionados.set(false);
          this.errorRelacionados.set(true);
        },
      });
  }
  seleccionarImagen(index: number): void {
    if (index >= 0 && index < this.imagenes().length) this.imagenActiva.set(index);
  }
  imagenAlternativa(event: Event): void {
    const imagen = event.target as HTMLImageElement;
    if (!imagen.src.endsWith('/placeholder-shoe.svg')) imagen.src = 'placeholder-shoe.svg';
  }
  seleccionarTalla(talla: TallaProductoPublica): void {
    if (
      this.agregando() ||
      !talla.disponible ||
      !this.tallasDisponibles().some((t) => t.id === talla.id)
    )
      return;
    this.tallaSeleccionada.set(talla);
    this.cantidad.set(1);
    this.error.set('');
    this.mensajeExito.set(false);
  }
  seleccionarGenero(genero: 'M' | 'W' | 'X'): void {
    if (this.agregando() || !this.generosDisponibles().includes(genero)) return;
    this.generoSeleccionado.set(genero);
    const colores = this.coloresDisponibles();
    this.colorSeleccionadoId.set((colores.find((c) => c.disponible) ?? colores[0])?.id ?? null);
    this.reiniciarSeleccion();
  }
  seleccionarColor(colorId: number): void {
    if (this.agregando() || !this.coloresDisponibles().some((c) => c.id === colorId)) return;
    this.colorSeleccionadoId.set(colorId);
    this.reiniciarSeleccion();
  }
  private reiniciarSeleccion(): void {
    this.tallaSeleccionada.set(null);
    this.cantidad.set(1);
    this.error.set('');
    this.mensajeExito.set(false);
  }
  etiquetaGenero(genero: 'M' | 'W' | 'X'): string {
    return { M: 'Hombre', W: 'Mujer', X: 'Unisex' }[genero];
  }
  incrementar(): void {
    if (!this.agregando() && this.cantidad() < 2_147_483_647) this.cantidad.update((v) => v + 1);
  }
  decrementar(): void {
    if (!this.agregando() && this.cantidad() > 1) this.cantidad.update((v) => v - 1);
  }
  toggleFavorito(): void {
    const producto = this.producto();
    if (producto) this.favoritos.alternar(producto);
  }
  agregarAlCarrito(): void {
    if (this.agregando() || this.agotado()) return;
    const talla = this.tallaSeleccionada();
    if (
      !talla ||
      !this.puedeAgregar() ||
      !this.tallasDisponibles().some((t) => t.id === talla.id && t.disponible)
    ) {
      this.error.set('Selecciona una talla disponible antes de continuar.');
      return;
    }
    if (!this.authService.estaAutenticado()) {
      void this.router.navigate(['/auth/login']);
      return;
    }
    const solicitud = this.solicitudProducto;
    this.agregando.set(true);
    this.error.set('');
    this.mensajeExito.set(false);
    this.carritoService
      .agregar(talla.id, this.cantidad())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (solicitud !== this.solicitudProducto) return;
          this.agregando.set(false);
          this.mensajeExito.set(true);
        },
        error: (err) => {
          if (solicitud !== this.solicitudProducto) return;
          this.agregando.set(false);
          const mensaje: unknown = err?.error?.message;
          this.error.set(
            typeof mensaje === 'string'
              ? mensaje
              : 'No pudimos añadir el producto. Revisa la disponibilidad e inténtalo de nuevo.',
          );
        },
      });
  }
}
