import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CategoriasService } from '../../../core/services/categorias.service';
import { ColoresService } from '../../../core/services/colores.service';
import { GruposModelosService } from '../../../core/services/grupos-modelos.service';
import { MarcasService } from '../../../core/services/marcas.service';
import { Producto, ProductosService } from '../../../core/services/productos.service';
import { AdminProductosComponent } from './admin-productos.component';

describe('AdminProductosComponent request errors', () => {
  let productosService: {
    productos: ReturnType<typeof signal>;
    meta: ReturnType<typeof signal>;
    cargando: ReturnType<typeof signal>;
    buscarTodosAdmin: ReturnType<typeof vi.fn>;
    actualizar: ReturnType<typeof vi.fn>;
    eliminarImagen: ReturnType<typeof vi.fn>;
    buscarPorIdAdmin: ReturnType<typeof vi.fn>;
  };
  let marcasService: { buscarTodas: ReturnType<typeof vi.fn> };
  let categoriasService: { buscarTodas: ReturnType<typeof vi.fn> };
  let coloresService: { buscarTodos: ReturnType<typeof vi.fn> };
  let gruposService: { buscarTodos: ReturnType<typeof vi.fn>; crear: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    productosService = {
      productos: signal([]),
      meta: signal(null),
      cargando: signal(false),
      buscarTodosAdmin: vi.fn().mockReturnValue(
        of({
          datos: [],
          meta: { total: 0, pagina: 1, limite: 10, totalPaginas: 0 },
        }),
      ),
      actualizar: vi.fn(),
      eliminarImagen: vi.fn(),
      buscarPorIdAdmin: vi.fn(),
    };
    marcasService = { buscarTodas: vi.fn().mockReturnValue(of([])) };
    categoriasService = { buscarTodas: vi.fn().mockReturnValue(of([])) };
    coloresService = { buscarTodos: vi.fn().mockReturnValue(of([])) };
    gruposService = { buscarTodos: vi.fn().mockReturnValue(of([{ id: 7, nombre: 'Superstar' }])), crear: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AdminProductosComponent],
      providers: [
        { provide: ProductosService, useValue: productosService },
        { provide: MarcasService, useValue: marcasService },
        { provide: CategoriasService, useValue: categoriasService },
        { provide: ColoresService, useValue: coloresService },
        { provide: GruposModelosService, useValue: gruposService },
      ],
    }).compileComponents();
  });

  it('explica la sesión inválida sin reintentar cargar fotos tras un 401', () => {
    const component = TestBed.createComponent(AdminProductosComponent).componentInstance;
    component.productoImagenes.set({ id: 1, imagenes: [{ id: 9, url: '/foto.png' }] } as Producto);
    productosService.eliminarImagen.mockReturnValue(throwError(() => ({ status: 401, error: { message: 'Unauthorized' } })));
    component.eliminarImagen(9);
    expect(component.errorImagenes()).toContain('Inicia sesión de nuevo');
    expect(productosService.buscarPorIdAdmin).not.toHaveBeenCalled();
    expect(component.productoImagenes()?.imagenes).toHaveLength(1);
  });

  it('maneja el fallo de recarga de fotos después de un error de eliminación', () => {
    const component = TestBed.createComponent(AdminProductosComponent).componentInstance;
    component.productoImagenes.set({ id: 1, imagenes: [] } as unknown as Producto);
    productosService.eliminarImagen.mockReturnValue(throwError(() => ({ status: 502 })));
    productosService.buscarPorIdAdmin.mockReturnValue(throwError(() => ({ status: 401 })));
    component.eliminarImagen(9);
    expect(component.errorImagenes()).toContain('Inicia sesión de nuevo');
  });

  it('asigna un grupo existente sin cambiar los datos de la ficha, y permite quitarlo', async () => {
    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const ficha: Producto = {
      id: 1, nombre: 'Superstar II edición', codigoModelo: 'SUPII', descripcion: 'Detalles de esta edición',
      precio: 359, activo: true, creadoEn: '', actualizadoEn: '', imagenes: [], tallas: [],
      marca: { id: 1, nombre: 'Adidas', codigo: 'AD', logo: null }, categoria: { id: 1, nombre: 'Urbanas' },
      grupoModeloId: 7, grupoModelo: { id: 7, nombre: 'Superstar' },
    };
    component.abrirEditar(ficha);
    expect(component.form.grupoModeloId).toBe(7);
    component.grupos.set([{ id: 7, nombre: 'Superstar' }, { id: 8, nombre: 'Superstar II' }]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#producto-grupo')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#producto-grupo-nuevo')).toBeNull();
    component.form.grupoModeloId = 8;
    expect(gruposService.crear).not.toHaveBeenCalled();
    expect(component.form.grupoModeloId).toBe(8);
    expect(component.form.descripcion).toBe(ficha.descripcion);
    productosService.actualizar.mockReturnValue(of(ficha));
    component.guardar();
    expect(productosService.actualizar).toHaveBeenLastCalledWith(1, expect.objectContaining({ grupoModeloId: 8, descripcion: ficha.descripcion, precio: 359 }));
    component.abrirEditar(ficha);
    component.form.grupoModeloId = null;
    component.guardar();
    expect(productosService.actualizar).toHaveBeenLastCalledWith(1, expect.objectContaining({ grupoModeloId: null }));
  });

  it('conserva el grupo asignado si no se puede cargar la lista', async () => {
    gruposService.buscarTodos.mockReturnValue(throwError(() => new Error('Sin conexión')));
    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.abrirCrear();
    component.form.grupoModeloId = 7;
    await fixture.whenStable();
    expect(component.errorGrupos()).toContain('Reintenta');
    expect((fixture.nativeElement.querySelector('#producto-grupo') as HTMLSelectElement).disabled).toBe(true);
    expect(component.form.grupoModeloId).toBe(7);
  });

  it('shows dependency errors and exits the loading state', () => {
    marcasService.buscarTodas.mockReturnValue(
      throwError(() => new Error('Brands unavailable')),
    );

    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.errorDependencias()).toBe(true);
    expect(fixture.componentInstance.cargandoDependencias()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(
      'No se pudieron cargar las marcas, categorías o colores.',
    );
    const nuevoProducto = fixture.nativeElement.querySelector(
      '.admin-page__header button',
    ) as HTMLButtonElement;
    expect(nuevoProducto.disabled).toBe(false);
    nuevoProducto.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.modalAbierto()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'no podrás guardar hasta cargarlas',
    );
  });

  it('keeps the required model code inside the product modal and names it when missing', () => {
    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.abrirCrear();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog.querySelector('#producto-modelo')).not.toBeNull();

    component.form.nombre = 'Zapatillas';
    component.form.precio = 359;
    component.form.marcaId = 1;
    component.form.categoriaId = 1;
    component.guardar();

    expect(component.errorForm()).toBe(
      'Completá los campos obligatorios: código de modelo.',
    );
  });

  it('shows a useful empty state and applies status filters from the catalog tabs', () => {
    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(fixture.nativeElement.textContent).toContain('Todavía no hay productos');
    expect(fixture.nativeElement.querySelector('.catalogo-empty button')?.textContent)
      .toContain('Crear producto');

    component.paginaActual = 3;
    component.filtrarPorEstado('activos');

    expect(component.estado).toBe('activos');
    expect(component.paginaActual).toBe(1);
    expect(productosService.buscarTodosAdmin).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'activos', pagina: 1 }),
    );
  });

  it('shows a failed deactivation instead of silently ignoring it', () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    productosService.actualizar.mockReturnValue(
      throwError(() => ({ error: { message: 'No se pudo desactivar.' } })),
    );

    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.detectChanges();
    fixture.componentInstance.desactivar(12);

    expect(fixture.componentInstance.cambiandoEstadoId()).toBeNull();
    expect(fixture.componentInstance.errorAccion()).toBe(
      'No se pudo desactivar.',
    );
    vi.unstubAllGlobals();
  });

  it('offers reactivation for an inactive product', () => {
    productosService.actualizar.mockReturnValue(of({}));

    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.componentInstance.activar(12);

    expect(productosService.actualizar).toHaveBeenCalledWith(12, {
      activo: true,
    });
  });

  it('keeps previously selected images when another batch is chosen', () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const fixture = TestBed.createComponent(AdminProductosComponent);
    const component = fixture.componentInstance;
    const producto: Producto = {
      id: 1,
      nombre: 'Zapatillas',
      codigoModelo: 'SUP',
      descripcion: null,
      precio: 359,
      activo: true,
      creadoEn: '',
      actualizadoEn: '',
      marca: { id: 1, nombre: 'Adidas', codigo: 'AD', logo: null },
      categoria: { id: 1, nombre: 'Lifestyle' },
      imagenes: [],
      tallas: [],
    };
    component.productoImagenes.set(producto);

    const primera = new File(['image'], 'frente.png', { type: 'image/png' });
    const segunda = new File(['image'], 'lateral.png', { type: 'image/png' });
    const seleccionarArchivo = (file: File) => {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      const event = new Event('change');
      Object.defineProperty(event, 'target', { value: input });
      component.onImagenesSeleccionadas(event);
    };

    seleccionarArchivo(primera);
    seleccionarArchivo(segunda);

    expect(component.archivosImg().map((file) => file.name)).toEqual([
      'frente.png',
      'lateral.png',
    ]);
    expect(component.previews()).toEqual(['blob:frente.png', 'blob:lateral.png']);

    component.quitarImagenSeleccionada(0);
    expect(component.archivosImg().map((file) => file.name)).toEqual(['lateral.png']);
    expect(component.previews()).toEqual(['blob:lateral.png']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:frente.png');

    fixture.destroy();
    vi.unstubAllGlobals();
  });
});
