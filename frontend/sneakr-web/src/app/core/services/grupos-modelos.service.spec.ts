import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { GruposModelosService } from './grupos-modelos.service';
import { ProductosService } from './productos.service';

describe('GruposModelosService', () => {
  let service: GruposModelosService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/grupos-modelos/7/productos`;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GruposModelosService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('comparte una lectura de grupo entre tarjetas sin alterar la paginación del catálogo', () => {
    const productos = TestBed.inject(ProductosService);
    const primero = vi.fn(), segundo = vi.fn();
    service.buscarModelos(7).subscribe(primero);
    service.buscarModelos(7).subscribe(segundo);
    const modelos = [{ id: 200, nombre: 'Otro modelo', imagenes: [] }];
    http.expectOne(url).flush(modelos);
    expect(primero).toHaveBeenCalledWith(modelos);
    expect(segundo).toHaveBeenCalledWith(modelos);
    expect(productos.meta()).toBeNull();
    expect(productos.productos()).toEqual([]);
  });

  it('permite reintentar tras un error y renueva la caché después de editar un producto', () => {
    service.buscarModelos(7).subscribe({ error: () => undefined });
    http.expectOne(url).flush({}, { status: 503, statusText: 'Unavailable' });
    service.buscarModelos(7).subscribe();
    http.expectOne(url).flush([]);
    TestBed.inject(ProductosService).actualizar(1, { grupoModeloId: null }).subscribe();
    const cambio = http.expectOne(`${environment.apiUrl}/productos/1`);
    expect(cambio.request.body).toEqual({ grupoModeloId: null });
    cambio.flush({ id: 1 });
    service.buscarModelos(7).subscribe();
    http.expectOne(url).flush([]);
  });
});
