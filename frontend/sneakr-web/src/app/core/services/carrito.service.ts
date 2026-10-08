import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  EMPTY,
  Observable,
  ReplaySubject,
  Subject,
  catchError,
  concatMap,
  defer,
  finalize,
  tap,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ValorMonetario } from '../models/valor-monetario';

export interface ItemCarrito {
  id: number;
  cantidad: number;
  subtotal: ValorMonetario;
  tallaProductoId: number;
  tallaProducto: {
    genero: 'M' | 'W' | 'X';
    colorId: number;
    color: { id: number; nombre: string; codigo: string };
    talla: string;
    stock: number;
    sku: string;
    producto: {
      id: number;
      nombre: string;
      precio: ValorMonetario;
      activo: boolean;
      marca: { nombre: string };
      imagenes: { url: string }[];
    };
  };
}

export interface Carrito {
  id: number;
  items: ItemCarrito[];
  total: ValorMonetario;
  cantidadItems: number;
}

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly API = `${environment.apiUrl}/carrito`;
  private revision = 0;
  private lecturaActual = 0;
  private readonly colaMutaciones = new Subject<{
    request: () => Observable<Carrito>;
    response: ReplaySubject<Carrito>;
  }>();

  // Signal reactivo del carrito — accesible en toda la app
  readonly carrito = signal<Carrito | null>(null);

  // Computed: cantidad de items para el badge del navbar
  readonly cantidadItems = computed(() => this.carrito()?.cantidadItems ?? 0);
  readonly total = computed(() => this.carrito()?.total ?? 0);

  constructor(private http: HttpClient) {
    this.colaMutaciones
      .pipe(
        concatMap(({ request, response }) =>
          request().pipe(
            tap((carrito) => {
              this.revision++;
              this.carrito.set(carrito);
              response.next(carrito);
            }),
            catchError((error: unknown) => {
              response.error(error);
              return EMPTY;
            }),
            finalize(() => response.complete()),
          ),
        ),
      )
      .subscribe();
  }

  obtener() {
    return defer(() => {
      const revision = this.revision;
      const lectura = ++this.lecturaActual;
      return this.http.get<Carrito>(this.API).pipe(
        tap((carrito) => {
          if (revision === this.revision && lectura === this.lecturaActual) {
            this.carrito.set(carrito);
          }
        }),
      );
    });
  }

  agregar(tallaProductoId: number, cantidad: number) {
    return this.mutar(() =>
      this.http.post<Carrito>(`${this.API}/items`, { tallaProductoId, cantidad }),
    );
  }

  actualizarCantidad(itemId: number, cantidad: number) {
    return this.mutar(() =>
      this.http.patch<Carrito>(`${this.API}/items/${itemId}`, { cantidad }),
    );
  }

  eliminarItem(itemId: number) {
    return this.mutar(() =>
      this.http.delete<Carrito>(`${this.API}/items/${itemId}`),
    );
  }

  vaciar() {
    return this.mutar(() => this.http.delete<Carrito>(this.API));
  }

  limpiarLocal() {
    this.revision++;
    this.carrito.set(null);
  }

  private mutar(request: () => Observable<Carrito>): Observable<Carrito> {
    return new Observable((subscriber) => {
      const response = new ReplaySubject<Carrito>(1);
      const subscription = response.subscribe(subscriber);
      this.colaMutaciones.next({ request, response });
      return subscription;
    });
  }
}
