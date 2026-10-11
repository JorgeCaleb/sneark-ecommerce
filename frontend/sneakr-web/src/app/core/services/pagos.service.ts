import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { EstadoPedido, MetodoPago } from './pedidos.service';
import type { ValorMonetario } from '../models/valor-monetario';

export interface PreferenciaPagoResponse {
  preferenciaId: string;
  urlPago: string;
  pedidoId: number;
}

export interface EstadoPagoResponse {
  pedidoId: number;
  estado: EstadoPedido;
  total: ValorMonetario;
  metodoPago: MetodoPago;
  mpPagoId: string | null;
  creadoEn: string;
}

@Injectable({
  providedIn: 'root',
})
export class PagosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/pagos`;

  crearPreferencia(pedidoId: number): Observable<PreferenciaPagoResponse> {
    return this.http.post<PreferenciaPagoResponse>(
      `${this.apiUrl}/preferencia/${pedidoId}`,
      {},
    );
  }

  consultarEstado(pedidoId: number): Observable<EstadoPagoResponse> {
    return this.http.get<EstadoPagoResponse>(`${this.apiUrl}/estado/${pedidoId}`);
  }
}
