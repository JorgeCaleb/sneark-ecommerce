import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ProductosService, ProductosPaginados } from './productos.service';

describe('ProductosService paginated requests', () => {
  let service: ProductosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps dashboard pagination requests free from shared catalog state changes', () => {
    service.productos.set([]);
    service.meta.set(null);

    service.buscarPagina({ pagina: 1, limite: 100 }).subscribe();
    const request = http.expectOne(
      (req) =>
        req.url === `${environment.apiUrl}/productos` &&
        req.params.get('pagina') === '1' &&
        req.params.get('limite') === '100',
    );
    request.flush({
      datos: [],
      meta: { total: 0, pagina: 1, limite: 100, totalPaginas: 0 },
    } satisfies ProductosPaginados);

    expect(service.productos()).toEqual([]);
    expect(service.meta()).toBeNull();
    expect(service.cargando()).toBe(false);
  });

  it('updates shared list state and clears loading after a request fails', () => {
    service.buscarTodos().subscribe({ error: () => undefined });
    expect(service.cargando()).toBe(true);

    http.expectOne(`${environment.apiUrl}/productos`).flush(
      { message: 'Unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(service.cargando()).toBe(false);
  });
});
