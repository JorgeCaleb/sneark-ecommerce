import { Component, DestroyRef, OnInit, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductosService, Producto, FiltrosProducto } from '../../core/services/productos.service';
import { MarcasService, Marca } from '../../core/services/marcas.service';
import { CategoriasService, Categoria } from '../../core/services/categorias.service';
import { ColoresService, Color } from '../../core/services/colores.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [RouterLink, FormsModule, MonedaPipe],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css',
})
export class CatalogoComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private productosService = inject(ProductosService);
  private marcasService    = inject(MarcasService);
  private categoriasService = inject(CategoriasService);
  private coloresService = inject(ColoresService);
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);

  readonly productos  = this.productosService.productos;
  readonly meta       = this.productosService.meta;
  readonly cargando   = this.productosService.cargando;

  readonly marcas     = signal<Marca[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly colores = signal<Color[]>([]);
  readonly filtrosPanelAbierto = signal(false);
  readonly errorCarga = signal(false);
  private queryParamsInicializados = false;

  // Filtros activos
  busqueda   = '';
  marcaId    = 0;
  categoriaId = 0;
  precioMin  = 0;
  precioMax  = 0;
  genero: 'M' | 'W' | 'X' | '' = '';
  colorId = 0;
  paginaActual = 1;
  readonly LIMITE = 12;

  readonly totalPaginas = computed(() => this.meta()?.totalPaginas ?? 1);
  readonly paginasArray = computed(() =>
    Array.from({ length: this.totalPaginas() }, (_, i) => i + 1)
  );

  ngOnInit() {
    // Leer query params iniciales
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const filtros = {
          marcaId: Number(params['marcaId']) || 0,
          categoriaId: Number(params['categoriaId']) || 0,
          busqueda: params['busqueda'] || '',
          pagina: Number(params['pagina']) || 1,
          precioMin: Number(params['precioMin']) || 0,
          precioMax: Number(params['precioMax']) || 0,
          genero: (params['genero'] === 'M' ||
          params['genero'] === 'W' ||
          params['genero'] === 'X'
            ? params['genero']
            : '') as 'M' | 'W' | 'X' | '',
          colorId: Number(params['colorId']) || 0,
        };
        const cambiaronFiltros =
          !this.queryParamsInicializados ||
          filtros.marcaId !== this.marcaId ||
          filtros.categoriaId !== this.categoriaId ||
          filtros.busqueda !== this.busqueda ||
          filtros.pagina !== this.paginaActual ||
          filtros.precioMin !== this.precioMin ||
          filtros.precioMax !== this.precioMax;
        const cambiaronVariantes =
          filtros.genero !== this.genero || filtros.colorId !== this.colorId;

        this.marcaId = filtros.marcaId;
        this.categoriaId = filtros.categoriaId;
        this.busqueda = filtros.busqueda;
        this.paginaActual = filtros.pagina;
        this.precioMin = filtros.precioMin;
        this.precioMax = filtros.precioMax;
        this.genero = filtros.genero;
        this.colorId = filtros.colorId;
        this.queryParamsInicializados = true;

        if (cambiaronFiltros || cambiaronVariantes) this.cargarProductos();
      });

    this.marcasService.buscarTodas().subscribe((m) => this.marcas.set(m));
    this.categoriasService.buscarTodas().subscribe((c) => this.categorias.set(c));
    this.coloresService.buscarTodos().subscribe((c) => this.colores.set(c));
  }

  cargarProductos() {
    this.errorCarga.set(false);
    const filtros: FiltrosProducto = {
      pagina: this.paginaActual,
      limite: this.LIMITE,
    };
    if (this.busqueda)    filtros.busqueda    = this.busqueda;
    if (this.marcaId)     filtros.marcaId     = this.marcaId;
    if (this.categoriaId) filtros.categoriaId = this.categoriaId;
    if (this.precioMin)   filtros.precioMin   = this.precioMin;
    if (this.precioMax)   filtros.precioMax   = this.precioMax;
    if (this.genero) filtros.genero = this.genero;
    if (this.colorId) filtros.colorId = this.colorId;

    this.productosService
      .buscarTodos(filtros)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => this.errorCarga.set(true) });
    this.actualizarUrl();
  }

  aplicarFiltros() {
    this.paginaActual = 1;
    this.cargarProductos();
    this.filtrosPanelAbierto.set(false);
  }

  limpiarFiltros() {
    this.busqueda    = '';
    this.marcaId     = 0;
    this.categoriaId = 0;
    this.precioMin   = 0;
    this.precioMax   = 0;
    this.genero = '';
    this.colorId = 0;
    this.paginaActual = 1;
    this.cargarProductos();
  }

  irAPagina(pagina: number) {
    if (pagina < 1 || pagina > this.totalPaginas()) return;
    this.paginaActual = pagina;
    this.cargarProductos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleFiltros() {
    this.filtrosPanelAbierto.update((v) => !v);
  }

  private actualizarUrl() {
    const queryParams: Params = {};
    if (this.busqueda)      queryParams['busqueda']    = this.busqueda;
    if (this.marcaId)       queryParams['marcaId']     = this.marcaId;
    if (this.categoriaId)   queryParams['categoriaId'] = this.categoriaId;
    if (this.paginaActual > 1) queryParams['pagina']   = this.paginaActual;
    if (this.precioMin) queryParams['precioMin'] = this.precioMin;
    if (this.precioMax) queryParams['precioMax'] = this.precioMax;
    if (this.genero) queryParams['genero'] = this.genero;
    if (this.colorId) queryParams['colorId'] = this.colorId;
    this.router.navigate([], { queryParams, replaceUrl: true });
  }

  hayFiltrosActivos = computed(() =>
    !!this.busqueda || !!this.marcaId || !!this.categoriaId || !!this.precioMin ||
    !!this.precioMax || !!this.genero || !!this.colorId
  );

  imagenPrincipal(producto: Producto): string {
    return producto.imagenes?.[0]?.url ?? '/placeholder-shoe.jpg';
  }

  tieneStock(producto: Producto): boolean {
    return producto.tallas.some((t) => t.stock > 0);
  }
}
