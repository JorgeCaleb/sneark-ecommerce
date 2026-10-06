import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductosService, Producto } from '../../../core/services/productos.service';
import { MarcasService, Marca } from '../../../core/services/marcas.service';
import { CategoriasService, Categoria } from '../../../core/services/categorias.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface TallaForm { talla: string; stock: number; }

interface ProductoForm {
  nombre: string;
  descripcion: string;
  precio: number | null;
  marcaId: number;
  categoriaId: number;
  tallas: TallaForm[];
}

@Component({
  selector: 'app-admin-productos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-productos.component.html',
  styleUrl: './admin-productos.component.css',
})
export class AdminProductosComponent implements OnInit {
  private productosService  = inject(ProductosService);
  private marcasService     = inject(MarcasService);
  private categoriasService = inject(CategoriasService);
  private http              = inject(HttpClient);

  readonly productos   = this.productosService.productos;
  readonly metaProd    = this.productosService.meta;
  readonly cargando    = this.productosService.cargando;
  readonly marcas      = signal<Marca[]>([]);
  readonly categorias  = signal<Categoria[]>([]);

  // Modal crear/editar
  readonly modalAbierto   = signal(false);
  readonly guardando      = signal(false);
  readonly errorForm      = signal('');
  readonly productoEditar = signal<Producto | null>(null);

  // Modal imágenes
  readonly modalImagenes    = signal(false);
  readonly productoImagenes = signal<Producto | null>(null);
  readonly subiendoImg      = signal(false);
  readonly archivosImg      = signal<File[]>([]);
  readonly previews         = signal<string[]>([]);

  // Búsqueda
  busqueda = '';
  paginaActual = 1;

  form: ProductoForm = this.formVacio();

  ngOnInit() {
    this.cargar();
    this.marcasService.buscarTodas().subscribe((m) => this.marcas.set(m));
    this.categoriasService.buscarTodas().subscribe((c) => this.categorias.set(c));
  }

  cargar() {
    const filtros: any = { pagina: this.paginaActual, limite: 10 };
    if (this.busqueda) filtros.busqueda = this.busqueda;
    this.productosService.buscarTodos(filtros).subscribe();
  }

  buscar() { this.paginaActual = 1; this.cargar(); }

  irAPagina(p: number) {
    const total = this.metaProd()?.totalPaginas ?? 1;
    if (p < 1 || p > total) return;
    this.paginaActual = p;
    this.cargar();
  }

  // ── Modal crear/editar ───────────────────────────────────
  abrirCrear() {
    this.productoEditar.set(null);
    this.form = this.formVacio();
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(p: Producto) {
    this.productoEditar.set(p);
    this.form = {
      nombre:      p.nombre,
      descripcion: p.descripcion ?? '',
      precio:      p.precio,
      marcaId:     p.marca.id,
      categoriaId: p.categoria.id,
      tallas:      p.tallas.map((t) => ({ talla: t.talla, stock: t.stock })),
    };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() { this.modalAbierto.set(false); }

  agregarTalla() {
    this.form.tallas.push({ talla: '', stock: 0 });
  }

  quitarTalla(i: number) {
    this.form.tallas.splice(i, 1);
  }

  guardar() {
    if (!this.form.nombre || !this.form.precio || !this.form.marcaId || !this.form.categoriaId) {
      this.errorForm.set('Completá todos los campos obligatorios.');
      return;
    }

    this.guardando.set(true);
    this.errorForm.set('');

    const data: any = {
      nombre:      this.form.nombre,
      descripcion: this.form.descripcion || undefined,
      precio:      this.form.precio,
      marcaId:     this.form.marcaId,
      categoriaId: this.form.categoriaId,
      tallas:      this.form.tallas.filter((t) => t.talla.trim()),
    };

    const editando = this.productoEditar();
    const req$ = editando
      ? this.productosService.actualizar(editando.id, data)
      : this.productosService.crear(data);

    req$.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modalAbierto.set(false);
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorForm.set(err?.error?.message ?? 'Error al guardar.');
      },
    });
  }

  desactivar(id: number) {
    if (!confirm('¿Desactivar este producto?')) return;
    this.productosService.actualizar(id, { activo: false } as any).subscribe(() => this.cargar());
  }

  // ── Modal imágenes ───────────────────────────────────────
  abrirImagenes(p: Producto) {
    this.productoImagenes.set(p);
    this.archivosImg.set([]);
    this.previews.set([]);
    this.modalImagenes.set(true);
  }

  cerrarImagenes() { this.modalImagenes.set(false); }

  onImagenesSeleccionadas(event: Event) {
    const input = event.target as HTMLInputElement;
    const files  = Array.from(input.files ?? []).slice(0, 5);
    this.archivosImg.set(files);
    this.previews.set(files.map((f) => URL.createObjectURL(f)));
  }

  subirImagenes() {
    const producto = this.productoImagenes();
    if (!producto || !this.archivosImg().length) return;

    this.subiendoImg.set(true);
    const fd = new FormData();
    this.archivosImg().forEach((f) => fd.append('imagenes', f));

    this.productosService.subirImagenes(producto.id, fd).subscribe({
      next: (p) => {
        this.subiendoImg.set(false);
        this.productoImagenes.set(p);
        this.archivosImg.set([]);
        this.previews.set([]);
        this.cargar();
      },
      error: () => this.subiendoImg.set(false),
    });
  }

  eliminarImagen(imagenId: number) {
    const producto = this.productoImagenes();
    if (!producto) return;
    this.productosService.eliminarImagen(producto.id, imagenId).subscribe(() => {
      this.productosService.buscarPorId(producto.id).subscribe((p) =>
        this.productoImagenes.set(p)
      );
      this.cargar();
    });
  }

  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(precio);
  }

  private formVacio(): ProductoForm {
    return { nombre: '', descripcion: '', precio: null, marcaId: 0, categoriaId: 0, tallas: [] };
  }

  get paginasArray(): number[] {
    const total = this.metaProd()?.totalPaginas ?? 1;
    return Array.from({ length: total }, (_, i) => i + 1);
  }
}
