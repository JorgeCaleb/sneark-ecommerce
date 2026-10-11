import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ColoresService } from '../../../core/services/colores.service';
import { AdminColoresComponent } from './admin-colores.component';

describe('AdminColoresComponent', () => {
  let coloresService: {
    buscarTodos: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    actualizar: ReturnType<typeof vi.fn>;
    eliminar: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    coloresService = {
      buscarTodos: vi.fn().mockReturnValue(
        of([
          { id: 1, nombre: 'Negro', codigo: 'BK' },
          { id: 2, nombre: 'Blanco', codigo: 'WH' },
        ]),
      ),
      crear: vi.fn().mockReturnValue(of({ id: 3, nombre: 'Rojo', codigo: 'RED' })),
      actualizar: vi.fn().mockReturnValue(of({ id: 1, nombre: 'Negro Mate', codigo: 'BKM' })),
      eliminar: vi.fn().mockReturnValue(of({ id: 2, nombre: 'Blanco', codigo: 'WH' })),
    };

    await TestBed.configureTestingModule({
      imports: [AdminColoresComponent],
      providers: [{ provide: ColoresService, useValue: coloresService }],
    }).compileComponents();
  });

  it('renderiza la lista de colores cargados', () => {
    const fixture = TestBed.createComponent(AdminColoresComponent);
    fixture.detectChanges();

    expect(coloresService.buscarTodos).toHaveBeenCalled();
    expect(fixture.componentInstance.colores().length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Negro');
    expect(fixture.nativeElement.textContent).toContain('BK');
  });

  it('permite crear un nuevo color llamando al servicio', () => {
    const fixture = TestBed.createComponent(AdminColoresComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.abrirCrear();
    expect(component.modalAbierto()).toBe(true);

    component.nombre = 'Rojo';
    component.codigo = 'red';
    component.guardar();

    expect(coloresService.crear).toHaveBeenCalledWith('Rojo', 'RED');
    expect(component.modalAbierto()).toBe(false);
  });

  it('permite editar un color llamando a actualizar (PATCH)', () => {
    const fixture = TestBed.createComponent(AdminColoresComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const color = { id: 1, nombre: 'Negro', codigo: 'BK' };
    component.abrirEditar(color);
    expect(component.colorEditar()).toEqual(color);

    component.nombre = 'Negro Mate';
    component.codigo = 'BKM';
    component.guardar();

    expect(coloresService.actualizar).toHaveBeenCalledWith(1, {
      nombre: 'Negro Mate',
      codigo: 'BKM',
    });
    expect(component.modalAbierto()).toBe(false);
  });

  it('elimina un color cuando el usuario confirma la acción (DELETE)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = TestBed.createComponent(AdminColoresComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.eliminar({ id: 2, nombre: 'Blanco', codigo: 'WH' });

    expect(coloresService.eliminar).toHaveBeenCalledWith(2);
  });
});
