import { Component, OnChanges, inject, signal, Input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PedidosService, Pedido } from '../../core/services/pedidos.service';
import { DATOS_PAGO } from '../../core/config/datos-pago';

@Component({
  selector: 'app-comprobante',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './comprobante.component.html',
  styleUrl: './comprobante.component.css',
})
export class ComprobanteComponent implements OnChanges {
  @Input() id!: string;

  private pedidosService = inject(PedidosService);
  private router         = inject(Router);
  private solicitudPedido = 0;
  private solicitudArchivo = 0;

  readonly pedido       = signal<Pedido | null>(null);
  readonly cargando     = signal(true);
  readonly subiendo     = signal(false);
  readonly exito        = signal(false);
  readonly error        = signal('');

  // Archivo seleccionado
  readonly preview      = signal<string | null>(null);
  readonly archivo      = signal<File | null>(null);

  // Número de operación opcional
  numeroOperacion = '';

  readonly datosYape = DATOS_PAGO.YAPE;
  readonly datosPlin = DATOS_PAGO.PLIN;

  ngOnChanges() {
    const solicitud = ++this.solicitudPedido;
    this.pedido.set(null);
    this.solicitudArchivo++;
    this.cargando.set(true);
    this.subiendo.set(false);
    this.exito.set(false);
    this.error.set('');
    this.preview.set(null);
    this.archivo.set(null);
    this.numeroOperacion = '';

    this.pedidosService.buscarPorId(Number(this.id)).subscribe({
      next: (p) => {
        if (solicitud !== this.solicitudPedido) return;
        this.pedido.set(p);
        this.cargando.set(false);
        // Si el pedido ya tiene comprobante o no está PENDIENTE, redirigir
        if (p.comprobante || p.estado !== 'PENDIENTE') {
          this.router.navigate(['/mis-pedidos']);
        }
      },
      error: () => {
        if (solicitud !== this.solicitudPedido) return;
        this.cargando.set(false);
        this.router.navigate(['/mis-pedidos']);
      },
    });
  }

  onArchivoSeleccionado(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    const solicitud = ++this.solicitudArchivo;
    this.archivo.set(null);
    this.preview.set(null);

    // Validar tipo
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(file.type)) {
      this.error.set('Solo se permiten imágenes JPG, PNG o WEBP.');
      input.value = '';
      return;
    }

    // Validar tamaño (10MB)
    if (file.size > 10 * 1024 * 1024) {
      this.error.set('La imagen no puede superar 10MB.');
      input.value = '';
      return;
    }

    this.error.set('');
    this.archivo.set(file);

    // Generar preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (solicitud === this.solicitudArchivo) {
        this.preview.set(e.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  }

  quitarArchivo() {
    this.solicitudArchivo++;
    this.archivo.set(null);
    this.preview.set(null);
    this.error.set('');
  }

  enviar() {
    if (!this.archivo()) {
      this.error.set('Por favor seleccioná una imagen del comprobante.');
      return;
    }

    this.subiendo.set(true);
    this.error.set('');

    const formData = new FormData();
    formData.append('comprobante', this.archivo()!);
    const solicitud = this.solicitudPedido;
    const pedidoId = Number(this.id);
    if (this.numeroOperacion.trim()) {
      formData.append('numeroOperacion', this.numeroOperacion.trim());
    }

    this.pedidosService.subirComprobante(pedidoId, formData).subscribe({
      next: () => {
        if (solicitud !== this.solicitudPedido) return;
        this.subiendo.set(false);
        this.exito.set(true);
      },
      error: (err) => {
        if (solicitud !== this.solicitudPedido) return;
        this.subiendo.set(false);
        this.error.set(err?.error?.message ?? 'Error al enviar el comprobante.');
      },
    });
  }

  formatearPrecio(precio: number | string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(Number(precio));
  }
}
