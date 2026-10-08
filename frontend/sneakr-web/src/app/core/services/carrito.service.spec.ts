import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { Carrito, CarritoService } from './carrito.service';

function carrito(cantidadItems: number): Carrito {
  return {
    id: 1,
    items: [],
    total: 0,
    cantidadItems,
  };
}

describe('CarritoService mutation ordering', () => {
  let service: CarritoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CarritoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('serializes concurrent mutations so an older response cannot overwrite a newer cart', () => {
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();

    service.actualizarCantidad(10, 2).subscribe(firstResponse);
    service.actualizarCantidad(20, 3).subscribe(secondResponse);

    const firstRequest = http.expectOne(`${environment.apiUrl}/carrito/items/10`);
    expect(firstRequest.request.method).toBe('PATCH');
    http.expectNone(`${environment.apiUrl}/carrito/items/20`);

    firstRequest.flush(carrito(2));
    expect(service.carrito()).toEqual(carrito(2));
    expect(firstResponse).toHaveBeenCalledWith(carrito(2));

    const secondRequest = http.expectOne(`${environment.apiUrl}/carrito/items/20`);
    expect(secondRequest.request.method).toBe('PATCH');
    secondRequest.flush(carrito(5));

    expect(service.carrito()).toEqual(carrito(5));
    expect(secondResponse).toHaveBeenCalledWith(carrito(5));
  });

  it('does not let a cart read started before a mutation overwrite its response', () => {
    service.obtener().subscribe();
    const readRequest = http.expectOne(`${environment.apiUrl}/carrito`);

    service.actualizarCantidad(10, 2).subscribe();
    const mutationRequest = http.expectOne(
      `${environment.apiUrl}/carrito/items/10`,
    );
    mutationRequest.flush(carrito(2));
    readRequest.flush(carrito(1));

    expect(service.carrito()).toEqual(carrito(2));
  });

  it('ignores an older cart read that responds after a newer read', () => {
    service.obtener().subscribe();
    const olderRead = http.expectOne(`${environment.apiUrl}/carrito`);
    service.obtener().subscribe();
    const newerRead = http.expectOne(`${environment.apiUrl}/carrito`);

    newerRead.flush(carrito(2));
    olderRead.flush(carrito(1));

    expect(service.carrito()).toEqual(carrito(2));
  });
});
