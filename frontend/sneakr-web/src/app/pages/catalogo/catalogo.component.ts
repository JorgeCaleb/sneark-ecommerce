import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import {
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  combineLatest,
  forkJoin,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { ProductosService, FiltrosProducto } from '../../core/services/productos.service';
import { MarcasService, Marca } from '../../core/services/marcas.service';
import { CategoriasService, Categoria } from '../../core/services/categorias.service';
import { ColoresService, Color } from '../../core/services/colores.service';
import { colorVisual } from '../../core/utils/color-visual.util';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { PaginacionComponent } from '../../shared/components/paginacion/paginacion.component';
import { ProductoCardComponent } from '../../shared/components/producto-card/producto-card.component';

type Genero = 'M' | 'W' | 'X';
type Disponibilidad = 'disponible' | 'agotado';
type Orden = NonNullable<FiltrosProducto['orden']>;
interface EstadoCatalogo {
  busqueda: string;
  marcaIds: number[];
  colorIds: number[];
  generos: Genero[];
  disponibilidad: Disponibilidad[];
  talla: string;
  categoriaId?: number;
  precioMin?: number;
  precioMax?: number;
  pagina: number;
  orden: Orden;
}
type FiltroAplicado =
  | { tipo: 'busqueda' | 'talla'; valor: string; etiqueta: string }
  | { tipo: 'marca' | 'color' | 'categoria'; valor: number; etiqueta: string }
  | { tipo: 'genero'; valor: Genero; etiqueta: string }
  | { tipo: 'disponibilidad'; valor: Disponibilidad; etiqueta: string }
  | { tipo: 'precio'; valor: null; etiqueta: string };
const inicial = (): EstadoCatalogo => ({
  busqueda: '',
  marcaIds: [],
  colorIds: [],
  generos: [],
  disponibilidad: [],
  talla: '',
  pagina: 1,
  orden: 'relevancia',
  categoriaId: undefined,
  precioMin: undefined,
  precioMax: undefined,
});
const alternar = <T>(lista: T[], valor: T): T[] =>
  lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, NgIcon, MonedaPipe, PaginacionComponent, ProductoCardComponent],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css',
})
export class CatalogoComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly productosService = inject(ProductosService);
  private readonly marcasService = inject(MarcasService);
  private readonly categoriasService = inject(CategoriasService);
  private readonly coloresService = inject(ColoresService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reintentos = new Subject<void>();
  private cargaFiltros?: Subscription;
  private overflowAnterior = '';
  private focoAnterior: HTMLElement | null = null;
  @ViewChild('panelFiltros') private panelFiltros?: ElementRef<HTMLDialogElement>;

  readonly LIMITE = 8;
  readonly productos = this.productosService.productos;
  readonly meta = this.productosService.meta;
  readonly cargando = this.productosService.cargando;
  readonly errorCarga = signal(false);
  readonly errorFiltros = signal(false);
  readonly marcas = signal<Marca[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly colores = signal<Color[]>([]);
  readonly facetas = signal({ tallas: [] as string[], precioMax: 0 });
  readonly filtros = signal<EstadoCatalogo>(inicial());
  readonly filtrosPanelAbierto = signal(false);
  readonly precioMinBorrador = signal(0);
  readonly precioMaxBorrador = signal(0);
  readonly colorVisual = colorVisual;
  readonly opcionesGenero: { valor: Genero; nombre: string }[] = [
    { valor: 'M', nombre: 'Hombre' },
    { valor: 'W', nombre: 'Mujer' },
    { valor: 'X', nombre: 'Unisex' },
  ];
  readonly opcionesDisponibilidad: { valor: Disponibilidad; nombre: string }[] = [
    { valor: 'disponible', nombre: 'Con disponibilidad' },
    { valor: 'agotado', nombre: 'Sin disponibilidad' },
  ];
  readonly categoriaNinos = computed(() =>
    this.categorias().find((categoria) => /niñ|infantil|kids/i.test(categoria.nombre)),
  );
  readonly filtrosAplicados = computed<FiltroAplicado[]>(() => {
    const f = this.filtros();
    const chips: FiltroAplicado[] = [];
    if (f.busqueda) chips.push({ tipo: 'busqueda', valor: f.busqueda, etiqueta: f.busqueda });
    for (const id of f.marcaIds) {
      chips.push({
        tipo: 'marca',
        valor: id,
        etiqueta: this.marcas().find((marca) => marca.id === id)?.nombre ?? `Marca ${id}`,
      });
    }
    for (const id of f.colorIds) {
      chips.push({
        tipo: 'color',
        valor: id,
        etiqueta: this.colores().find((color) => color.id === id)?.nombre ?? `Color ${id}`,
      });
    }
    for (const genero of f.generos) {
      chips.push({
        tipo: 'genero',
        valor: genero,
        etiqueta: this.opcionesGenero.find((opcion) => opcion.valor === genero)?.nombre ?? genero,
      });
    }
    for (const estado of f.disponibilidad) {
      chips.push({
        tipo: 'disponibilidad',
        valor: estado,
        etiqueta:
          this.opcionesDisponibilidad.find((opcion) => opcion.valor === estado)?.nombre ?? estado,
      });
    }
    if (f.talla) chips.push({ tipo: 'talla', valor: f.talla, etiqueta: `Talla ${f.talla}` });
    if (f.categoriaId) {
      chips.push({
        tipo: 'categoria',
        valor: f.categoriaId,
        etiqueta:
          this.categorias().find((categoria) => categoria.id === f.categoriaId)?.nombre ??
          'Categoría',
      });
    }
    if (f.precioMin !== undefined || f.precioMax !== undefined) {
      chips.push({
        tipo: 'precio',
        valor: null,
        etiqueta: `S/ ${f.precioMin ?? 0} – S/ ${f.precioMax ?? this.facetas().precioMax}`,
      });
    }
    return chips;
  });
  readonly categoriasAdicionales = computed(() =>
    this.categorias().filter((categoria) => categoria.id !== this.categoriaNinos()?.id),
  );
  readonly total = computed(() => this.meta()?.total ?? 0);
  readonly totalPaginas = computed(() => Math.max(1, this.meta()?.totalPaginas ?? 1));
  readonly desde = computed(() =>
    this.total() ? (this.filtros().pagina - 1) * this.LIMITE + 1 : 0,
  );
  readonly hasta = computed(() => Math.min(this.filtros().pagina * this.LIMITE, this.total()));
  readonly limitePrecio = computed(() =>
    Math.max(
      this.facetas().precioMax,
      this.filtros().precioMax ?? 0,
      this.filtros().precioMin ?? 0,
      1,
    ),
  );
  readonly cantidadFiltros = computed(() => {
    const f = this.filtros();
    return (
      f.marcaIds.length +
      f.colorIds.length +
      f.generos.length +
      f.disponibilidad.length +
      Number(!!f.busqueda) +
      Number(!!f.talla) +
      Number(!!f.categoriaId) +
      Number(f.precioMin !== undefined || f.precioMax !== undefined)
    );
  });

  constructor() {
    effect(() => {
      const f = this.filtros();
      this.precioMinBorrador.set(f.precioMin ?? 0);
      this.precioMaxBorrador.set(f.precioMax ?? this.limitePrecio());
    });
    this.destroyRef.onDestroy(() => this.restaurarScroll());
  }

  ngOnInit(): void {
    this.cargarFiltros();
    combineLatest([this.route.queryParamMap, this.reintentos.pipe(startWith(undefined))])
      .pipe(
        tap(([params]) => {
          this.filtros.set(this.leerFiltros(params));
          this.errorCarga.set(false);
        }),
        switchMap(() =>
          this.productosService.buscarTodos(this.parametrosApi()).pipe(
            tap((res) => {
              const ultima = Math.max(1, res.meta.totalPaginas);
              if (this.filtros().pagina > ultima) this.cambiar({ pagina: ultima }, false);
            }),
            catchError(() => {
              this.errorCarga.set(true);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private recuperar<T>(fuente: Observable<T>, valor: T): Observable<T> {
    return fuente.pipe(
      catchError(() => {
        this.errorFiltros.set(true);
        return of(valor);
      }),
    );
  }

  cargarFiltros(): void {
    this.cargaFiltros?.unsubscribe();
    this.errorFiltros.set(false);
    this.cargaFiltros = forkJoin({
      marcas: this.recuperar(this.marcasService.buscarTodas(), []),
      colores: this.recuperar(this.coloresService.buscarTodos(), []),
      categorias: this.recuperar(this.categoriasService.buscarTodas(), []),
      facetas: this.recuperar(this.productosService.facetas(), { tallas: [], precioMax: 0 }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => {
        this.marcas.set(res.marcas);
        this.colores.set(res.colores);
        this.categorias.set(res.categorias);
        this.facetas.set(res.facetas);
      });
  }

  private leerFiltros(params: ParamMap): EstadoCatalogo {
    const lista = (nombre: string, anterior?: string): string[] =>
      (params.get(nombre) ?? (anterior ? params.get(anterior) : '') ?? '')
        .split(',')
        .filter(Boolean);
    const ids = (nombre: string, anterior?: string): number[] =>
      [
        ...new Set(
          lista(nombre, anterior)
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
        ),
      ].slice(0, 50);
    const precio = (nombre: string): number | undefined => {
      const raw = params.get(nombre);
      const n = raw?.trim() ? Number(raw) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const orden = params.get('orden');
    const talla = params.get('talla') ?? '';
    const min = precio('precioMin'),
      max = precio('precioMax');
    return {
      busqueda: (params.get('busqueda') ?? '').trim(),
      marcaIds: ids('marcaIds', 'marcaId'),
      colorIds: ids('colorIds', 'colorId'),
      generos: [
        ...new Set(
          lista('generos', 'genero').filter((g): g is Genero => ['M', 'W', 'X'].includes(g)),
        ),
      ],
      disponibilidad: [
        ...new Set(
          lista('disponibilidad').filter((d): d is Disponibilidad =>
            ['disponible', 'agotado'].includes(d),
          ),
        ),
      ],
      talla: /^(?:\d{1,2}|[1-9]\d{2})(?:\.0|\.5)?$/.test(talla) ? talla : '',
      categoriaId: ids('categoriaId')[0],
      precioMin: min !== undefined && max !== undefined ? Math.min(min, max) : min,
      precioMax: min !== undefined && max !== undefined ? Math.max(min, max) : max,
      pagina: Math.max(1, Math.floor(Number(params.get('pagina')) || 1)),
      orden: ['precio-asc', 'precio-desc', 'nombre-asc'].includes(orden ?? '')
        ? (orden as Orden)
        : 'relevancia',
    };
  }

  private parametrosApi(): FiltrosProducto {
    const f = this.filtros();
    return {
      ...f,
      busqueda: f.busqueda || undefined,
      talla: f.talla || undefined,
      limite: this.LIMITE,
    };
  }

  private cambiar(cambio: Partial<EstadoCatalogo>, reiniciarPagina = true): void {
    const f = { ...this.filtros(), ...cambio, ...(reiniciarPagina ? { pagina: 1 } : {}) };
    this.filtros.set(f);
    const params: Params = {};
    if (f.busqueda) params['busqueda'] = f.busqueda;
    for (const clave of ['marcaIds', 'colorIds', 'generos', 'disponibilidad'] as const) {
      if (f[clave].length) params[clave] = f[clave].join(',');
    }
    if (f.talla) params['talla'] = f.talla;
    if (f.categoriaId) params['categoriaId'] = f.categoriaId;
    if (f.precioMin !== undefined) params['precioMin'] = f.precioMin;
    if (f.precioMax !== undefined) params['precioMax'] = f.precioMax;
    if (f.pagina > 1) params['pagina'] = f.pagina;
    if (f.orden !== 'relevancia') params['orden'] = f.orden;
    void this.router.navigate([], { relativeTo: this.route, queryParams: params });
  }

  alternarMarca(id: number): void {
    this.cambiar({ marcaIds: alternar(this.filtros().marcaIds, id) });
  }
  alternarColor(id: number): void {
    this.cambiar({ colorIds: alternar(this.filtros().colorIds, id) });
  }
  alternarGenero(genero: Genero): void {
    this.cambiar({ generos: alternar(this.filtros().generos, genero) });
  }
  alternarDisponibilidad(estado: Disponibilidad): void {
    this.cambiar({ disponibilidad: alternar(this.filtros().disponibilidad, estado) });
  }
  seleccionarTalla(talla: string): void {
    this.cambiar({ talla: this.filtros().talla === talla ? '' : talla });
  }
  seleccionarCategoria(id?: number): void {
    this.cambiar({ categoriaId: this.filtros().categoriaId === id ? undefined : id });
  }
  limpiarFiltros(): void {
    this.cambiar(inicial());
  }
  quitarFiltroAplicado(filtro: FiltroAplicado): void {
    switch (filtro.tipo) {
      case 'busqueda':
        this.cambiar({ busqueda: '' });
        break;
      case 'marca':
        this.cambiar({ marcaIds: alternar(this.filtros().marcaIds, filtro.valor) });
        break;
      case 'color':
        this.cambiar({ colorIds: alternar(this.filtros().colorIds, filtro.valor) });
        break;
      case 'genero':
        this.cambiar({ generos: alternar(this.filtros().generos, filtro.valor) });
        break;
      case 'disponibilidad':
        this.cambiar({ disponibilidad: alternar(this.filtros().disponibilidad, filtro.valor) });
        break;
      case 'talla':
        this.cambiar({ talla: '' });
        break;
      case 'categoria':
        this.cambiar({ categoriaId: undefined });
        break;
      case 'precio':
        this.cambiar({ precioMin: undefined, precioMax: undefined });
        break;
    }
  }
  quitarBusqueda(): void {
    this.cambiar({ busqueda: '' });
  }
  reintentar(): void {
    this.reintentos.next();
  }

  cambiarOrden(event: Event): void {
    this.cambiar({ orden: (event.target as HTMLSelectElement).value as Orden });
  }

  cambiarPrecio(event: Event, extremo: 'min' | 'max'): void {
    const numero = Number((event.target as HTMLInputElement).value);
    if (extremo === 'min') this.precioMinBorrador.set(Math.min(numero, this.precioMaxBorrador()));
    else this.precioMaxBorrador.set(Math.max(numero, this.precioMinBorrador()));
  }

  aplicarPrecio(): void {
    this.cambiar({
      precioMin: this.precioMinBorrador() > 0 ? this.precioMinBorrador() : undefined,
      precioMax:
        this.precioMaxBorrador() < this.facetas().precioMax ? this.precioMaxBorrador() : undefined,
    });
  }

  irAPagina(pagina: number): void {
    this.cambiar({ pagina }, false);
    document.getElementById('catalogo-resultados')?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  abrirFiltros(): void {
    const dialog = this.panelFiltros?.nativeElement;
    if (!dialog || dialog.open) return;
    this.focoAnterior = document.activeElement as HTMLElement;
    this.overflowAnterior = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    this.filtrosPanelAbierto.set(true);
  }

  cerrarFiltros(): void {
    this.panelFiltros?.nativeElement.close();
  }

  restaurarScroll(): void {
    if (!this.filtrosPanelAbierto()) return;
    document.body.style.overflow = this.overflowAnterior;
    this.filtrosPanelAbierto.set(false);
    this.focoAnterior?.focus();
  }

  cerrarDesdeFondo(event: MouseEvent): void {
    const dialog = this.panelFiltros?.nativeElement;
    if (event.target !== dialog || !dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
}
