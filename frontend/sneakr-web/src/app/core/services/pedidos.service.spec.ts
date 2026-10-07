import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PedidosService } from './pedidos.service';

describe('PedidosService admin pagination', () => {
  let service: PedidosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PedidosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests a bounded page and optional state filter', () => {
    service.buscarPagina(3, 25, 'PENDIENTE').subscribe();
    const request = http.expectOne(
      (req) =>
        req.url === `${environment.apiUrl}/pedidos/admin/list` &&
        req.params.get('pagina') === '3' &&
        req.params.get('limite') === '25' &&
        req.params.get('estado') === 'PENDIENTE',
    );

    expect(request.request.method).toBe('GET');
    request.flush({
      datos: [],
      meta: { total: 53, pagina: 3, limite: 25, totalPaginas: 3 },
    });
  });
});
