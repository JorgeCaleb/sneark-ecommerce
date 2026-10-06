import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ItemPedido {
  id: number;
  nombreProducto: string;
  talla: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  tallaProducto: {
    producto: {
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
  | 'CANCELADO';

export type MetodoPago = 'YAPE' | 'PLIN';

export interface Pedido {
  id: number;
  total: number;
  estado: EstadoPedido;
  metodoPago: MetodoPago;
  comprobante: string | null;
  numeroOperacion: string | null;
  telefono: string;
  ciudad: string;
  direccion: string;
  creadoEn: string;
  items: ItemPedido[];
  usuario: { id: number; nombre: string; email: string };
}

export interface CrearPedidoData {
  metodoPago: MetodoPago;
  telefono: string;
  ciudad: string;
  direccion: string;
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly API = `${environment.apiUrl}/pedidos`;

  constructor(private http: HttpClient) {}

  crear(data: CrearPedidoData) {
    return this.http.post<Pedido>(this.API, data);
  }

  misPedidos() {
    return this.http.get<Pedido[]>(`${this.API}/mis-pedidos`);
  }

  buscarPorId(id: number) {
    return this.http.get<Pedido>(`${this.API}/${id}`);
  }

  subirComprobante(pedidoId: number, formData: FormData) {
    return this.http.post<Pedido>(`${this.API}/${pedidoId}/comprobante`, formData);
  }

  cancelar(pedidoId: number) {
    return this.http.patch<Pedido>(`${this.API}/${pedidoId}/cancelar`, {});
  }

  // Solo ADMIN
  buscarTodos(estado?: EstadoPedido) {
    const url = estado ? `${this.API}?estado=${estado}` : this.API;
    return this.http.get<Pedido[]>(url);
  }

  actualizarEstado(pedidoId: number, estado: EstadoPedido) {
    return this.http.patch<Pedido>(`${this.API}/${pedidoId}/estado`, { estado });
  }
}
