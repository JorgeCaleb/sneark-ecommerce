import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize } from 'rxjs/operators';
import { forkJoin, of, Subscription } from 'rxjs';
import {
  ProductosService,
  Producto,
  ProductoInput,
  FiltrosProducto,
  EstadoProductosAdmin,
} from '../../../core/services/productos.service';
import { MarcasService, Marca } from '../../../core/services/marcas.service';
import { CategoriasService, Categoria } from '../../../core/services/categorias.service';
import { ColoresService, Color } from '../../../core/services/colores.service';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { PaginacionComponent } from '../../../shared/components/paginacion/paginacion.component';

interface TallaForm {
  id?: number;
  genero: 'M' | 'W' | 'X';
  colorId: number;
  talla: string;
  stock: number;
  sku?: string;
}

interface ProductoForm {
  nombre: string;
  codigoModelo: string;
  descripcion: string;
  precio: number | null;
  marcaId: number;
  categoriaId: number;
  tallas: TallaForm[];
  nuevoColorNombre: string;
  nuevoColorCodigo: string;
}

@Component({
  selector: 'app-admin-productos',
  standalone: true,
  imports: [FormsModule, MonedaPipe, PaginacionComponent],
  templateUrl: './admin-productos.component.html',
  styleUrl: './admin-productos.component.css',
})
export class AdminProductosComponent implements OnInit, OnDestroy {
  private productosService = inject(ProductosService);
  private marcasService = inject(MarcasService);
  private categoriasService = inject(CategoriasService);
  private coloresService = inject(ColoresService);

  readonly productos = this.productosService.productos;
  readonly metaProd = this.productosService.meta;
  readonly cargando = this.productosService.cargando;
  readonly errorCarga = signal(false);
  readonly errorDependencias = signal(false);
  readonly cargandoDependencias = signal(true);
  readonly errorAccion = signal('');
  readonly cambiandoEstadoId = signal<number | null>(null);
  readonly marcas = signal<Marca[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly colores = signal<Color[]>([]);

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
  estado: EstadoProductosAdmin = 'todos';
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
    const filtros: FiltrosProducto & { estado: EstadoProductosAdmin } = {
      pagina: this.paginaActual,
      limite: 10,
      estado: this.estado,
      ...(this.busqueda ? { busqueda: this.busqueda } : {}),
    };
    this.productosSubscription?.unsubscribe();
    this.errorCarga.set(false);
    this.productosSubscription = this.productosService.buscarTodosAdmin(filtros).subscribe({
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
      colores: this.coloresService.buscarTodos().pipe(
        catchError(() => {
          this.errorDependencias.set(true);
          return of(null);
        }),
      ),
    })
      .pipe(finalize(() => this.cargandoDependencias.set(false)))
      .subscribe(({ marcas, categorias, colores }) => {
        if (marcas) this.marcas.set(marcas);
        if (categorias) this.categorias.set(categorias);
        if (colores) this.colores.set(colores);
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
      codigoModelo: p.codigoModelo,
      descripcion: p.descripcion ?? '',
      precio: Number(p.precio),
      marcaId: p.marca.id,
      categoriaId: p.categoria.id,
      tallas: p.tallas.map((t) => ({
        id: t.id,
        genero: t.genero,
        colorId: t.colorId,
        talla: t.talla,
        stock: t.stock,
        sku: t.sku,
      })),
      nuevoColorNombre: '',
      nuevoColorCodigo: '',
    };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
  }

  agregarTalla() {
    this.form.tallas.push({
      genero: 'M',
      colorId: this.colores()[0]?.id ?? 0,
      talla: '',
      stock: 0,
    });
  }

  actualizarSku(indice: number) {
    const variante = this.form.tallas[indice];
    if (!variante) return;
    variante.sku = undefined;
    const marcaId = Number(this.form.marcaId);
    const colorId = Number(variante.colorId);
    if (
      !marcaId ||
      !colorId ||
      !this.form.codigoModelo.trim() ||
      !variante.talla.trim()
    ) {
      return;
    }
    this.productosService
      .previsualizarSku({
        marcaId,
        codigoModelo: this.form.codigoModelo,
        genero: variante.genero,
        colorId,
        talla: variante.talla,
      })
      .subscribe({
        next: ({ sku }) => {
          if (this.form.tallas[indice] === variante) variante.sku = sku;
        },
        error: () => {
          if (this.form.tallas[indice] === variante) variante.sku = undefined;
        },
      });
  }

  actualizarSkus() {
    this.form.tallas.forEach((_, indice) => this.actualizarSku(indice));
  }

  quitarTalla(i: number) {
    this.form.tallas.splice(i, 1);
  }

  guardar() {
    if (!this.form.nombre || !this.form.codigoModelo || !this.form.precio || !this.form.marcaId || !this.form.categoriaId) {
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
      codigoModelo: this.form.codigoModelo,
      descripcion: this.form.descripcion || undefined,
      precio,
      marcaId: this.form.marcaId,
      categoriaId: this.form.categoriaId,
      tallas: this.form.tallas.filter((t) => t.talla.trim()).map((t) => ({
        ...(t.id ? { id: t.id } : {}),
        genero: t.genero,
        colorId: t.colorId,
        talla: t.talla.trim(),
        stock: Number(t.stock),
      })),
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

  crearColor() {
    const nombre = this.form.nuevoColorNombre.trim();
    const codigo = this.form.nuevoColorCodigo.trim().toUpperCase();
    if (!nombre || !codigo) {
      this.errorForm.set('El nombre y código del color son obligatorios.');
      return;
    }
    this.coloresService.crear(nombre, codigo).subscribe({
      next: (color) => {
        this.colores.update((actuales) => [...actuales, color].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        this.form.nuevoColorNombre = '';
        this.form.nuevoColorCodigo = '';
        this.errorForm.set('');
      },
      error: (err) => this.errorForm.set(err?.error?.message ?? 'No se pudo crear el color.'),
    });
  }

  desactivar(id: number) {
    if (!confirm('¿Desactivar este producto?')) return;
    this.cambiarEstado(id, false);
  }

  activar(id: number) {
    this.cambiarEstado(id, true);
  }

  private cambiarEstado(id: number, activo: boolean) {
    this.errorAccion.set('');
    this.cambiandoEstadoId.set(id);
    this.productosService.actualizar(id, { activo }).subscribe({
      next: () => {
        this.cambiandoEstadoId.set(null);
        this.cargar();
      },
      error: (err) => {
        this.cambiandoEstadoId.set(null);
        this.errorAccion.set(
          err?.error?.message ??
            `No se pudo ${activo ? 'activar' : 'desactivar'} el producto.`,
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

  private limpiarPreviews() {
    for (const preview of this.previews()) {
      URL.revokeObjectURL(preview);
    }
  }

  private formVacio(): ProductoForm {
    return {
      nombre: '',
      codigoModelo: '',
      descripcion: '',
      precio: null,
      marcaId: 0,
      categoriaId: 0,
      tallas: [],
      nuevoColorNombre: '',
      nuevoColorCodigo: '',
    };
  }

  get paginasArray(): number[] {
    const total = this.metaProd()?.totalPaginas ?? 1;
    return Array.from({ length: total }, (_, i) => i + 1);
  }
}
