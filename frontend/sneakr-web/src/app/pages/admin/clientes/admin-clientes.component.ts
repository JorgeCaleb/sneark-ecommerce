import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ClienteAdmin, ClientesService } from '../../../core/services/clientes.service';
import { PaginacionComponent } from '../../../shared/components/paginacion/paginacion.component';

@Component({
  selector: 'app-admin-clientes',
  standalone: true,
  imports: [FormsModule, PaginacionComponent],
  templateUrl: './admin-clientes.component.html',
  styleUrl: './admin-clientes.component.css',
})
export class AdminClientesComponent implements OnInit, OnDestroy {
  private readonly clientesService = inject(ClientesService);
  private consulta?: Subscription;

  readonly clientes = signal<ClienteAdmin[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal(false);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly totalPaginas = signal(0);
  readonly limite = 25;
  busqueda = '';

  ngOnInit() {
    this.cargar();
  }

  ngOnDestroy() {
    this.consulta?.unsubscribe();
  }

  cargar() {
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.consulta = this.clientesService
      .buscarPagina(this.pagina(), this.limite, this.busqueda)
      .subscribe({
        next: (respuesta) => {
          this.clientes.set(respuesta.datos);
          this.total.set(respuesta.meta.total);
          this.pagina.set(respuesta.meta.pagina);
          this.totalPaginas.set(respuesta.meta.totalPaginas);
          this.cargando.set(false);
        },
        error: () => {
          this.clientes.set([]);
          this.errorCarga.set(true);
          this.cargando.set(false);
        },
      });
  }

  buscar() {
    this.pagina.set(1);
    this.cargar();
  }

  irAPagina(pagina: number) {
    this.pagina.set(pagina);
    this.cargar();
  }

  formatearFecha(fecha: string) {
    const valor = new Date(fecha);
    if (Number.isNaN(valor.getTime())) return 'Fecha no disponible';
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(valor);
  }
}
