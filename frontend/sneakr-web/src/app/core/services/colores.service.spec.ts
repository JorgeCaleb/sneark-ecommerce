import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ColoresService, Color } from './colores.service';

describe('ColoresService', () => {
  let service: ColoresService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ColoresService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('solicita la lista completa de colores con GET', () => {
    const mockColores: Color[] = [
      { id: 1, nombre: 'Negro', codigo: 'BK' },
    ];

    service.buscarTodos().subscribe((colores) => {
      expect(colores).toEqual(mockColores);
    });

    const req = http.expectOne(`${environment.apiUrl}/colores`);
    expect(req.request.method).toBe('GET');
    req.flush(mockColores);
  });

  it('crea un color con POST', () => {
    service.crear('Rojo', 'RED').subscribe((color) => {
      expect(color.id).toBe(2);
    });

    const req = http.expectOne(`${environment.apiUrl}/colores`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nombre: 'Rojo', codigo: 'RED' });
    req.flush({ id: 2, nombre: 'Rojo', codigo: 'RED' });
  });

  it('actualiza un color con PATCH', () => {
    service.actualizar(1, { nombre: 'Negro Mate', codigo: 'BKM' }).subscribe((color) => {
      expect(color.codigo).toBe('BKM');
    });

    const req = http.expectOne(`${environment.apiUrl}/colores/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombre: 'Negro Mate', codigo: 'BKM' });
    req.flush({ id: 1, nombre: 'Negro Mate', codigo: 'BKM' });
  });

  it('elimina un color con DELETE', () => {
    service.eliminar(1).subscribe((color) => {
      expect(color.id).toBe(1);
    });

    const req = http.expectOne(`${environment.apiUrl}/colores/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ id: 1, nombre: 'Negro', codigo: 'BK' });
  });
});
