import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ApiUrlService } from './api-url.service';
import type { ValorMonetario } from '../models/valor-monetario';

export interface ItemPedido {
  id: number;
  nombreProducto: string;
  genero: 'M' | 'W' | 'X';
  nombreColor: string;
  codigoColor: string;
  sku: string;
  talla: string;
  cantidad: number;
  precio: ValorMonetario;
  subtotal: ValorMonetario;
  tallaProducto: {
    producto: {
      id: number;
      nombre: string;
      precio: ValorMonetario;
      marca: { nombre: string };
      imagenes: { url: string }[];
    };
  };
}

export type EstadoPedido =
  | 'PENDIENTE'
  | 'PAGO_VERIFICADO'
  | 'EN_PREPARACION'
  | 'ENVIADO'
  | 'ENTREGADO'
  | 'CANCELADO'
  | 'PAGO_REQUIERE_REVISION';

export type MetodoPago = 'MERCADOPAGO';

export interface Pedido {
  id: number;
  total: ValorMonetario;
  costoEnvio: ValorMonetario;
  estado: EstadoPedido;
  metodoPago: MetodoPago;
  telefono: string;
  ciudad: string;
  direccion: string;
  creadoEn: string;
  items: ItemPedido[];
  usuario: { id: number; nombre: string; email: string };
}

export interface CrearPedidoData {
  telefono: string;
  distrito: string;
  direccion: string;
}

export interface OpcionEnvio {
  distrito: string;
  costoEnvio: number;
}

export interface PedidosPaginados {
  datos: Pedido[];
  meta: {
    total: number;
    pagina: number;
    limite: number;
    totalPaginas: number;
  };
}

export interface ResumenPedidosDashboard {
  totalPedidos: number;
  pedidosRecientes: Pedido[];
  totalVentasPeriodo: number;
  ventasPeriodoAnterior: number;
  ventasDiarias: { fecha: string; total: number }[];
  productosMasVendidos: {
    id: number;
    nombre: string;
    marca: string;
    imagen: string | null;
    precio: number;
    cantidad: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly API = inject(ApiUrlService).endpoint('pedidos');

  constructor(private http: HttpClient) {}

  crear(data: CrearPedidoData) {
    return this.http.post<Pedido>(this.API, data);
  }

  opcionesEnvio() {
    return this.http.get<OpcionEnvio[]>(`${this.API}/envio/opciones`);
  }

  cotizarEnvio(distrito: string) {
    const params = new HttpParams().set('distrito', distrito);
    return this.http.get<OpcionEnvio>(`${this.API}/envio/cotizar`, { params });
  }

  misPedidos() {
    return this.http.get<Pedido[]>(`${this.API}/mis-pedidos`);
  }

  buscarPorId(id: number) {
    return this.http.get<Pedido>(`${this.API}/${id}`);
  }

  cancelar(pedidoId: number) {
    return this.http.patch<Pedido>(`${this.API}/${pedidoId}/cancelar`, {});
  }

  buscarPagina(pagina: number, limite = 25, estado?: EstadoPedido) {
    let params = new HttpParams().set('pagina', pagina).set('limite', limite);
    if (estado) params = params.set('estado', estado);
    return this.http.get<PedidosPaginados>(`${this.API}/admin/list`, { params });
  }

  resumenDashboard(inicioAnterior: Date, inicioActual: Date, finActual: Date) {
    const params = new HttpParams()
      .set('inicioAnterior', inicioAnterior.toISOString())
      .set('inicioActual', inicioActual.toISOString())
      .set('finActual', finActual.toISOString())
      .set('desfaseZonaHoraria', -inicioActual.getTimezoneOffset());
    return this.http.get<ResumenPedidosDashboard>(`${this.API}/admin/dashboard`, {
      params,
    });
  }

  actualizarEstado(pedidoId: number, estado: EstadoPedido) {
    return this.http.patch<Pedido>(`${this.API}/${pedidoId}/estado`, { estado });
  }
}
