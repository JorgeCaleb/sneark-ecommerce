import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginacionComponent } from './paginacion.component';

describe('PaginacionComponent', () => {
  let component: PaginacionComponent;
  let fixture: ComponentFixture<PaginacionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginacionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginacionComponent);
    component = fixture.componentInstance;
  });

  it('no emite si la página destino es la misma', () => {
    fixture.componentRef.setInput('pagina', 2);
    fixture.componentRef.setInput('totalPaginas', 5);
    fixture.detectChanges();

    const spy = vi.fn();
    component.cambioPagina.subscribe(spy);

    component.irAPagina(2);
    expect(spy).not.toHaveBeenCalled();
  });

  it('emite la nueva página si está en rango válido', () => {
    fixture.componentRef.setInput('pagina', 2);
    fixture.componentRef.setInput('totalPaginas', 5);
    fixture.detectChanges();

    const spy = vi.fn();
    component.cambioPagina.subscribe(spy);

    component.irAPagina(3);
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('no emite si la página destino es menor que 1 o mayor que totalPaginas', () => {
    fixture.componentRef.setInput('pagina', 2);
    fixture.componentRef.setInput('totalPaginas', 5);
    fixture.detectChanges();

    const spy = vi.fn();
    component.cambioPagina.subscribe(spy);

    component.irAPagina(0);
    component.irAPagina(6);
    expect(spy).not.toHaveBeenCalled();
  });
});
