import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductosService, Producto, FiltrosProducto } from '../../core/services/productos.service';
import { MarcasService, Marca } from '../../core/services/marcas.service';
import { CategoriasService, Categoria } from '../../core/services/categorias.service';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css',
})
export class CatalogoComponent implements OnInit {
  private productosService = inject(ProductosService);
  private marcasService    = inject(MarcasService);
  private categoriasService = inject(CategoriasService);
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);

  readonly productos  = this.productosService.productos;
  readonly meta       = this.productosService.meta;
  readonly cargando   = this.productosService.cargando;

  readonly marcas     = signal<Marca[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly filtrosPanelAbierto = signal(false);

  // Filtros activos
  busqueda   = '';
  marcaId    = 0;
  categoriaId = 0;
  precioMin  = 0;
  precioMax  = 0;
  paginaActual = 1;
  readonly LIMITE = 12;

  readonly totalPaginas = computed(() => this.meta()?.totalPaginas ?? 1);
  readonly paginasArray = computed(() =>
    Array.from({ length: this.totalPaginas() }, (_, i) => i + 1)
  );

  ngOnInit() {
    // Leer query params iniciales
    this.route.queryParams.subscribe((params) => {
      this.marcaId     = +params['marcaId']     || 0;
      this.categoriaId = +params['categoriaId'] || 0;
      this.busqueda    = params['busqueda']      || '';
      this.paginaActual = +params['pagina']      || 1;
      this.cargarProductos();
    });

    this.marcasService.buscarTodas().subscribe((m) => this.marcas.set(m));
    this.categoriasService.buscarTodas().subscribe((c) => this.categorias.set(c));
  }

  cargarProductos() {
    const filtros: FiltrosProducto = {
      pagina: this.paginaActual,
      limite: this.LIMITE,
    };
    if (this.busqueda)    filtros.busqueda    = this.busqueda;
    if (this.marcaId)     filtros.marcaId     = this.marcaId;
    if (this.categoriaId) filtros.categoriaId = this.categoriaId;
    if (this.precioMin)   filtros.precioMin   = this.precioMin;
    if (this.precioMax)   filtros.precioMax   = this.precioMax;

    this.productosService.buscarTodos(filtros).subscribe();
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
    const queryParams: any = {};
    if (this.busqueda)      queryParams['busqueda']    = this.busqueda;
    if (this.marcaId)       queryParams['marcaId']     = this.marcaId;
    if (this.categoriaId)   queryParams['categoriaId'] = this.categoriaId;
    if (this.paginaActual > 1) queryParams['pagina']   = this.paginaActual;
    this.router.navigate([], { queryParams, replaceUrl: true });
  }

  hayFiltrosActivos = computed(() =>
    !!this.busqueda || !!this.marcaId || !!this.categoriaId || !!this.precioMin || !!this.precioMax
  );

  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(precio);
  }

  imagenPrincipal(producto: Producto): string {
    return producto.imagenes?.[0]?.url ?? '/placeholder-shoe.jpg';
  }

  tieneStock(producto: Producto): boolean {
    return producto.tallas.some((t) => t.stock > 0);
  }
}
