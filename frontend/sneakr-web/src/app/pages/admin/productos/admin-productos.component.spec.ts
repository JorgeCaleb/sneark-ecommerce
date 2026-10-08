import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CategoriasService } from '../../../core/services/categorias.service';
import { ColoresService } from '../../../core/services/colores.service';
import { MarcasService } from '../../../core/services/marcas.service';
import { ProductosService } from '../../../core/services/productos.service';
import { AdminProductosComponent } from './admin-productos.component';

describe('AdminProductosComponent request errors', () => {
  let productosService: {
    productos: ReturnType<typeof signal>;
    meta: ReturnType<typeof signal>;
    cargando: ReturnType<typeof signal>;
    buscarTodos: ReturnType<typeof vi.fn>;
    actualizar: ReturnType<typeof vi.fn>;
  };
  let marcasService: { buscarTodas: ReturnType<typeof vi.fn> };
  let categoriasService: { buscarTodas: ReturnType<typeof vi.fn> };
  let coloresService: { buscarTodos: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    productosService = {
      productos: signal([]),
      meta: signal(null),
      cargando: signal(false),
      buscarTodos: vi.fn().mockReturnValue(
        of({
          datos: [],
          meta: { total: 0, pagina: 1, limite: 10, totalPaginas: 0 },
        }),
      ),
      actualizar: vi.fn(),
    };
    marcasService = { buscarTodas: vi.fn().mockReturnValue(of([])) };
    categoriasService = { buscarTodas: vi.fn().mockReturnValue(of([])) };
    coloresService = { buscarTodos: vi.fn().mockReturnValue(of([])) };

    await TestBed.configureTestingModule({
      imports: [AdminProductosComponent],
      providers: [
        { provide: ProductosService, useValue: productosService },
        { provide: MarcasService, useValue: marcasService },
        { provide: CategoriasService, useValue: categoriasService },
        { provide: ColoresService, useValue: coloresService },
      ],
    }).compileComponents();
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

  it('shows a failed deactivation instead of silently ignoring it', () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    productosService.actualizar.mockReturnValue(
      throwError(() => ({ error: { message: 'No se pudo desactivar.' } })),
    );

    const fixture = TestBed.createComponent(AdminProductosComponent);
    fixture.detectChanges();
    fixture.componentInstance.desactivar(12);

    expect(fixture.componentInstance.desactivandoId()).toBeNull();
    expect(fixture.componentInstance.errorAccion()).toBe(
      'No se pudo desactivar.',
    );
    vi.unstubAllGlobals();
  });
});
