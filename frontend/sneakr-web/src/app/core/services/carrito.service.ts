import { DestroyRef, Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  ReplaySubject,
  Subject,
  catchError,
  concatMap,
  defer,
  finalize,
  takeUntil,
  tap,
  throwIfEmpty,
} from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { AuthService } from './auth.service';
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
    disponible: boolean;
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

interface ContextoCarrito {
  sesion: number;
  cancelar: Subject<void>;
}

interface MutacionCarrito {
  contexto: ContextoCarrito;
  request: () => Observable<Carrito>;
  response: ReplaySubject<Carrito>;
}

function errorSesionCarrito(): Error {
  return new Error('La sesión del carrito cambió. Vuelve a intentarlo.');
}

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly API = inject(ApiUrlService).endpoint('carrito');
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private contexto = this.crearContexto();
  private revision = 0;
  private lecturaActual = 0;
  private readonly pendientes = new Set<MutacionCarrito>();
  private readonly colaMutaciones = new Subject<MutacionCarrito>();

  // Signal reactivo del carrito — accesible en toda la app
  readonly carrito = signal<Carrito | null>(null);

  // Computed: cantidad de items para el badge del navbar
  readonly cantidadItems = computed(() => this.carrito()?.cantidadItems ?? 0);
  readonly total = computed(() => this.carrito()?.total ?? 0);

  constructor(private http: HttpClient) {
    this.destroyRef.onDestroy(() => this.limpiarLocal());
    this.auth.cambiosSesion$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.limpiarLocal());
    this.colaMutaciones
      .pipe(
        concatMap((operacion) => {
          const { contexto, request, response } = operacion;
          return defer(() => {
            this.exigirContexto(contexto);
            return request();
          }).pipe(
            takeUntil(contexto.cancelar),
            tap((carrito) => {
              this.exigirContexto(contexto);
              this.revision++;
              this.carrito.set(carrito);
              response.next(carrito);
            }),
            catchError((error: unknown) => {
              response.error(error);
              return EMPTY;
            }),
            finalize(() => {
              this.pendientes.delete(operacion);
              response.complete();
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  obtener() {
    const contexto = this.contexto;
    return defer(() => {
      this.exigirContexto(contexto);
      const revision = this.revision;
      const lectura = ++this.lecturaActual;
      return this.http.get<Carrito>(this.API).pipe(
        takeUntil(contexto.cancelar),
        tap((carrito) => {
          this.exigirContexto(contexto);
          if (revision === this.revision && lectura === this.lecturaActual) {
            this.carrito.set(carrito);
          }
        }),
        throwIfEmpty(errorSesionCarrito),
      );
    });
  }

  agregar(tallaProductoId: number, cantidad: number) {
    return this.mutar(() =>
      this.http.post<Carrito>(`${this.API}/items`, { tallaProductoId, cantidad }),
    );
  }

  actualizarCantidad(itemId: number, cantidad: number) {
    return this.mutar(() => this.http.patch<Carrito>(`${this.API}/items/${itemId}`, { cantidad }));
  }

  eliminarItem(itemId: number) {
    return this.mutar(() => this.http.delete<Carrito>(`${this.API}/items/${itemId}`));
  }

  vaciar() {
    return this.mutar(() => this.http.delete<Carrito>(this.API));
  }

  limpiarLocal() {
    const anterior = this.contexto;
    this.contexto = this.crearContexto();
    this.revision++;
    this.carrito.set(null);
    const pendientes = [...this.pendientes];
    this.pendientes.clear();
    for (const operacion of pendientes) operacion.response.error(errorSesionCarrito());
    anterior.cancelar.next();
    anterior.cancelar.complete();
  }

  private crearContexto(): ContextoCarrito {
    return { sesion: this.auth.idSesion, cancelar: new Subject<void>() };
  }

  private exigirContexto(contexto: ContextoCarrito): void {
    if (
      this.destroyRef.destroyed ||
      contexto !== this.contexto ||
      contexto.sesion !== this.auth.idSesion ||
      !this.auth.sesionValida()
    ) {
      throw errorSesionCarrito();
    }
  }

  private mutar(request: () => Observable<Carrito>): Observable<Carrito> {
    const contexto = this.contexto;
    return new Observable((subscriber) => {
      try {
        this.exigirContexto(contexto);
      } catch (error) {
        subscriber.error(error);
        return;
      }
      const response = new ReplaySubject<Carrito>(1);
      const subscription = response.subscribe(subscriber);
      const operacion = { contexto, request, response };
      this.pendientes.add(operacion);
      this.colaMutaciones.next(operacion);
      return subscription;
    });
  }
}
