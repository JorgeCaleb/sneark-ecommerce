import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize } from 'rxjs/operators';
import { forkJoin, of, Subscription } from 'rxjs';
import {
  ProductosService,
  Producto,
  ProductoInput,
  FiltrosProducto,
} from '../../../core/services/productos.service';
import { MarcasService, Marca } from '../../../core/services/marcas.service';
import { CategoriasService, Categoria } from '../../../core/services/categorias.service';

interface TallaForm {
  talla: string;
  stock: number;
}

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
export class AdminProductosComponent implements OnInit, OnDestroy {
  private productosService = inject(ProductosService);
  private marcasService = inject(MarcasService);
  private categoriasService = inject(CategoriasService);

  readonly productos = this.productosService.productos;
  readonly metaProd = this.productosService.meta;
  readonly cargando = this.productosService.cargando;
  readonly errorCarga = signal(false);
  readonly errorDependencias = signal(false);
  readonly cargandoDependencias = signal(true);
  readonly errorAccion = signal('');
  readonly desactivandoId = signal<number | null>(null);
  readonly marcas = signal<Marca[]>([]);
  readonly categorias = signal<Categoria[]>([]);

  // Modal crear/editar
  readonly modalAbierto = signal(false);
  readonly guardando = signal(false);
  readonly errorForm = signal('');
  readonly productoEditar = signal<Producto | null>(null);

  // Modal imágenes
  readonly modalImagenes = signal(false);
  readonly productoImagenes = signal<Producto | null>(null);
  readonly subiendoImg = signal(false);
  readonly archivosImg = signal<File[]>([]);
  readonly previews = signal<string[]>([]);
  readonly errorImagenes = signal('');

  // Búsqueda
  busqueda = '';
  paginaActual = 1;
  private productosSubscription?: Subscription;

  form: ProductoForm = this.formVacio();

  ngOnInit() {
    this.cargar();
    this.cargarDependencias();
  }

  ngOnDestroy() {
    this.productosSubscription?.unsubscribe();
    this.limpiarPreviews();
  }

  cargar() {
    const filtros: FiltrosProducto = {
      pagina: this.paginaActual,
      limite: 10,
      ...(this.busqueda ? { busqueda: this.busqueda } : {}),
    };
    this.productosSubscription?.unsubscribe();
    this.errorCarga.set(false);
    this.productosSubscription = this.productosService.buscarTodos(filtros).subscribe({
      error: () => this.errorCarga.set(true),
    });
  }

  cargarDependencias() {
    this.cargandoDependencias.set(true);
    this.errorDependencias.set(false);
    forkJoin({
      marcas: this.marcasService.buscarTodas().pipe(
        catchError(() => {
          this.errorDependencias.set(true);
          return of(null);
        }),
      ),
      categorias: this.categoriasService.buscarTodas().pipe(
        catchError(() => {
          this.errorDependencias.set(true);
          return of(null);
        }),
      ),
    })
      .pipe(finalize(() => this.cargandoDependencias.set(false)))
      .subscribe(({ marcas, categorias }) => {
        if (marcas) this.marcas.set(marcas);
        if (categorias) this.categorias.set(categorias);
      });
  }

  buscar() {
    this.paginaActual = 1;
    this.cargar();
  }

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
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: Number(p.precio),
      marcaId: p.marca.id,
      categoriaId: p.categoria.id,
      tallas: p.tallas.map((t) => ({ talla: t.talla, stock: t.stock })),
    };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
  }

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

    const precio = this.form.precio;
    if (precio === null) {
      this.guardando.set(false);
      this.errorForm.set('El precio es obligatorio.');
      return;
    }

    const data: ProductoInput = {
      nombre: this.form.nombre,
      descripcion: this.form.descripcion || undefined,
      precio,
      marcaId: this.form.marcaId,
      categoriaId: this.form.categoriaId,
      tallas: this.form.tallas.filter((t) => t.talla.trim()),
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
    this.errorAccion.set('');
    this.desactivandoId.set(id);
    this.productosService.actualizar(id, { activo: false }).subscribe({
      next: () => {
        this.desactivandoId.set(null);
        this.cargar();
      },
      error: (err) => {
        this.desactivandoId.set(null);
        this.errorAccion.set(
          err?.error?.message ?? 'No se pudo desactivar el producto.',
        );
      },
    });
  }

  // ── Modal imágenes ───────────────────────────────────────
  abrirImagenes(p: Producto) {
    this.productoImagenes.set(p);
    this.archivosImg.set([]);
    this.limpiarPreviews();
    this.previews.set([]);
    this.errorImagenes.set('');
    this.modalImagenes.set(true);
  }

  cerrarImagenes() {
    this.modalImagenes.set(false);
    this.limpiarPreviews();
    this.archivosImg.set([]);
  }

  onImagenesSeleccionadas(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.limpiarPreviews();
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    const tamanoMaximo = 5 * 1024 * 1024;

    this.errorImagenes.set('');
    if (files.length > 5) {
      this.errorImagenes.set('Puedes seleccionar hasta 5 imágenes por subida.');
      input.value = '';
      this.archivosImg.set([]);
      this.previews.set([]);
      return;
    }

    const archivoInvalido = files.find(
      (file) => !tiposPermitidos.includes(file.type) || file.size > tamanoMaximo,
    );
    if (archivoInvalido) {
      this.errorImagenes.set(
        !tiposPermitidos.includes(archivoInvalido.type)
          ? 'Formato no permitido. Usa JPG, PNG, WEBP o AVIF.'
          : 'Cada imagen debe pesar 5 MB o menos.',
      );
      input.value = '';
      this.archivosImg.set([]);
      this.previews.set([]);
      return;
    }

    this.archivosImg.set(files);
    this.previews.set(files.map((f) => URL.createObjectURL(f)));
  }

  quitarImagenSeleccionada(indice: number) {
    const preview = this.previews()[indice];
    if (preview) URL.revokeObjectURL(preview);
    this.archivosImg.update((archivos) =>
      archivos.filter((_, index) => index !== indice),
    );
    this.previews.update((previews) =>
      previews.filter((_, index) => index !== indice),
    );
  }

  subirImagenes() {
    const producto = this.productoImagenes();
    if (!producto || !this.archivosImg().length || this.subiendoImg()) return;

    this.subiendoImg.set(true);
    this.errorImagenes.set('');
    const fd = new FormData();
    this.archivosImg().forEach((f) => fd.append('imagenes', f));

    this.productosService.subirImagenes(producto.id, fd).subscribe({
      next: (p) => {
        this.subiendoImg.set(false);
        this.productoImagenes.set(p);
        this.archivosImg.set([]);
        this.limpiarPreviews();
        this.previews.set([]);
        this.errorImagenes.set('');
        this.cargar();
      },
      error: (err) => {
        this.subiendoImg.set(false);
        const mensaje = err?.error?.message;
        this.errorImagenes.set(
          Array.isArray(mensaje)
            ? mensaje.join(' ')
            : (mensaje ??
                'No se pudieron subir las imágenes. Revisa la conexión e inténtalo otra vez.'),
        );
      },
    });
  }

  eliminarImagen(imagenId: number) {
    const producto = this.productoImagenes();
    if (!producto) return;
    this.productosService.eliminarImagen(producto.id, imagenId).subscribe(() => {
      this.productosService.buscarPorId(producto.id).subscribe((p) => this.productoImagenes.set(p));
      this.cargar();
    }, (err) => {
      this.errorImagenes.set(err?.error?.message ?? 'No se pudo eliminar la imagen.');
      this.productosService.buscarPorId(producto.id).subscribe({
        next: (actualizado) => this.productoImagenes.set(actualizado),
      });
      this.cargar();
    });
  }

  formatearPrecio(precio: number | string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(Number(precio));
  }

  private limpiarPreviews() {
    for (const preview of this.previews()) {
      URL.revokeObjectURL(preview);
    }
  }

  private formVacio(): ProductoForm {
    return { nombre: '', descripcion: '', precio: null, marcaId: 0, categoriaId: 0, tallas: [] };
  }

  get paginasArray(): number[] {
    const total = this.metaProd()?.totalPaginas ?? 1;
    return Array.from({ length: total }, (_, i) => i + 1);
  }
}
