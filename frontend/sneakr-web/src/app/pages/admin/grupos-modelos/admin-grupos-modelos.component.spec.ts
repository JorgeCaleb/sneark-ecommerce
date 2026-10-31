import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucidePlus, lucidePencil, lucideX, lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { of, Subject, throwError } from 'rxjs';
import { GrupoModelo, GruposModelosService } from '../../../core/services/grupos-modelos.service';
import { ProductosPaginados, ProductosService } from '../../../core/services/productos.service';
import { AdminGruposModelosComponent } from './admin-grupos-modelos.component';

describe('Administración de grupos de modelos', () => {
  const grupo = { id: 7, nombre: 'Adidas Superstar', _count: { productos: 2 } };
  let grupos: { buscarTodos: ReturnType<typeof vi.fn>; crear: ReturnType<typeof vi.fn>; actualizar: ReturnType<typeof vi.fn> };
  let productos: { buscarAdminPagina: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    grupos = { buscarTodos: vi.fn(() => of([grupo])), crear: vi.fn(), actualizar: vi.fn() };
    productos = { buscarAdminPagina: vi.fn(() => of({ datos: [], meta: { total: 0, totalPaginas: 0, pagina: 1, limite: 10 } })) };
    TestBed.configureTestingModule({
      imports: [AdminGruposModelosComponent],
      providers: [
        provideRouter([]),
        provideIcons({ lucidePlus, lucidePencil, lucideX, lucideChevronLeft, lucideChevronRight }),
        { provide: GruposModelosService, useValue: grupos },
        { provide: ProductosService, useValue: productos },
      ],
    });
  });

  it('crea un grupo antes de asignar productos y evita envíos duplicados', async () => {
    const fixture = TestBed.createComponent(AdminGruposModelosComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const pendiente = new Subject<GrupoModelo>();
    grupos.crear.mockReturnValue(pendiente);
    component.abrirFormulario(null);
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('grupo-nombre');
    component.nombre = '  Adidas Superstar II  ';
    component.guardar(); component.guardar();
    expect(grupos.crear).toHaveBeenCalledExactlyOnceWith('Adidas Superstar II');
    expect(component.guardando()).toBe(true);
    pendiente.next({ id: 8, nombre: 'Adidas Superstar II' }); pendiente.complete();
    await fixture.whenStable();
    expect(component.formularioAbierto()).toBe(false);
    expect(component.mensaje()).toContain('Ya puedes asignarlo');
    expect(productos.buscarAdminPagina).not.toHaveBeenCalled();
  });

  it('renombra un grupo conservando sus integrantes', () => {
    const fixture = TestBed.createComponent(AdminGruposModelosComponent);
    const component = fixture.componentInstance;
    grupos.actualizar.mockReturnValue(of({ ...grupo, nombre: 'Superstar clásico' }));
    component.grupoSeleccionado.set(grupo);
    component.abrirFormulario(grupo);
    component.nombre = 'Superstar clásico';
    component.guardar();
    expect(grupos.actualizar).toHaveBeenCalledWith(7, 'Superstar clásico');
    expect(grupos.crear).not.toHaveBeenCalled();
    expect(component.grupoSeleccionado()?.id).toBe(7);
    expect(productos.buscarAdminPagina).not.toHaveBeenCalled();
  });

  it('mantiene el foco en el nombre al abrir el formulario con los integrantes visibles', async () => {
    const fixture = TestBed.createComponent(AdminGruposModelosComponent);
    await fixture.whenStable();
    fixture.componentInstance.verProductos(grupo);
    await fixture.whenStable();
    fixture.componentInstance.abrirFormulario(null);
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('grupo-nombre');
  });

  it('conserva el formulario al fallar y permite corregir un nombre duplicado', () => {
    const component = TestBed.createComponent(AdminGruposModelosComponent).componentInstance;
    grupos.crear.mockReturnValue(throwError(() => ({ error: { message: 'Ya existe un grupo con ese nombre.' } })));
    component.abrirFormulario(null);
    component.nombre = 'Superstar'; component.guardar();
    expect(component.errorForm()).toContain('Ya existe');
    expect(component.formularioAbierto()).toBe(true);
    expect(component.guardando()).toBe(false);
    component.nombre = '  '; component.guardar();
    expect(grupos.crear).toHaveBeenCalledTimes(1);
  });

  it('consulta los integrantes activos e inactivos y cancela la lectura del grupo anterior', () => {
    const component = TestBed.createComponent(AdminGruposModelosComponent).componentInstance;
    const anterior = new Subject<ProductosPaginados>();
    productos.buscarAdminPagina.mockReturnValueOnce(anterior);
    component.verProductos(grupo);
    expect(productos.buscarAdminPagina).toHaveBeenCalledWith({ grupoModeloId: 7, estado: 'todos', pagina: 1, limite: 10 });
    component.verProductos({ id: 8, nombre: 'Superstar II' });
    expect(anterior.observed).toBe(false);
    expect(component.grupoSeleccionado()?.id).toBe(8);
    component.metaProductos.set({ total: 22, totalPaginas: 3, pagina: 1, limite: 10 });
    component.cambiarPagina(2);
    expect(productos.buscarAdminPagina).toHaveBeenLastCalledWith({ grupoModeloId: 8, estado: 'todos', pagina: 2, limite: 10 });
    component.cerrarProductos();
    expect(component.grupoSeleccionado()).toBeNull();
  });

  it('permite reintentar una carga fallida y muestra el estado vacío real', async () => {
    grupos.buscarTodos.mockReturnValueOnce(throwError(() => new Error('Sin conexión'))).mockReturnValueOnce(of([]));
    const fixture = TestBed.createComponent(AdminGruposModelosComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
    fixture.componentInstance.cargar();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Aún no hay grupos');
    expect(fixture.componentInstance.cargando()).toBe(false);
  });
});
