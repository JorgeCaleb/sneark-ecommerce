import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ClientesService } from '../../../core/services/clientes.service';
import { AdminClientesComponent } from './admin-clientes.component';

describe('AdminClientesComponent', () => {
  let clientesService: { buscarPagina: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    clientesService = {
      buscarPagina: vi.fn().mockReturnValue(
        of({
          datos: [
            {
              id: 4,
              nombre: 'Ana Cliente',
              email: 'ana@example.test',
              creadoEn: '2026-01-05T00:00:00.000Z',
              _count: { pedidos: 2 },
            },
          ],
          meta: { total: 1, pagina: 1, limite: 25, totalPaginas: 1 },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [AdminClientesComponent],
      providers: [{ provide: ClientesService, useValue: clientesService }],
    }).compileComponents();
  });

  it('loads customers and displays safe profile and order-count fields', () => {
    const fixture = TestBed.createComponent(AdminClientesComponent);
    fixture.detectChanges();

    expect(clientesService.buscarPagina).toHaveBeenCalledWith(1, 25, '');
    expect(fixture.nativeElement.textContent).toContain('Ana Cliente');
    expect(fixture.nativeElement.textContent).toContain('ana@example.test');
    expect(fixture.nativeElement.textContent).toContain('2');
    expect(fixture.nativeElement.textContent).not.toContain('password');
  });

  it('searches from the first page and exposes load failures with a retry', () => {
    clientesService.buscarPagina.mockReturnValue(
      throwError(() => new Error('Unavailable')),
    );
    const fixture = TestBed.createComponent(AdminClientesComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.pagina.set(3);
    component.busqueda = '  ana  ';
    component.buscar();
    fixture.detectChanges();

    expect(clientesService.buscarPagina).toHaveBeenLastCalledWith(1, 25, '  ana  ');
    expect(component.errorCarga()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'No se pudieron cargar los clientes.',
    );
  });
});
