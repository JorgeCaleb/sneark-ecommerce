import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProductosService, VarianteInventario } from '../../../core/services/productos.service';

@Component({
  selector: 'app-admin-inventario',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-inventario.component.html',
  styleUrl: './admin-inventario.component.css',
})
export class AdminInventarioComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly productosService = inject(ProductosService);
  private readonly acciones = new Subscription();
  private consulta?: Subscription;

  readonly soloStockBajo = this.route.snapshot.data['soloStockBajo'] === true;
  readonly variantes = signal<VarianteInventario[]>([]);
  readonly stockDraft = signal<Record<number, number>>({});
  readonly guardandoIds = signal<Set<number>>(new Set());
  readonly erroresStock = signal<Record<number, string>>({});
  readonly actualizadoId = signal<number | null>(null);
  readonly cargando = signal(true);
  readonly errorCarga = signal(false);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly totalPaginas = signal(0);
  readonly limite = 25;
  readonly estado = signal<'todos' | 'bajo' | 'agotado' | 'disponible'>(
    this.soloStockBajo ? 'bajo' : 'todos',
  );
  busqueda = '';

  ngOnInit() {
    this.cargar();
  }

  ngOnDestroy() {
    this.consulta?.unsubscribe();
    this.acciones.unsubscribe();
  }

  cargar() {
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.errorCarga.set(false);
    const estadoSeleccionado = this.estado();
    const estado =
      estadoSeleccionado === 'todos' ? undefined : estadoSeleccionado;
    this.consulta = this.productosService
      .buscarVariantesInventario(this.pagina(), this.limite, this.busqueda, estado)
      .subscribe({
        next: (respuesta) => {
          this.variantes.set(respuesta.datos);
          this.stockDraft.set(
            Object.fromEntries(respuesta.datos.map((variante) => [variante.id, variante.stock])),
          );
          this.total.set(respuesta.meta.total);
          this.pagina.set(respuesta.meta.pagina);
          this.totalPaginas.set(respuesta.meta.totalPaginas);
          this.cargando.set(false);
        },
        error: () => {
          this.variantes.set([]);
          this.errorCarga.set(true);
          this.cargando.set(false);
        },
      });
  }

  buscar() {
    this.pagina.set(1);
    this.cargar();
  }

  cambiarEstado(estado: 'todos' | 'bajo' | 'agotado' | 'disponible') {
    this.estado.set(estado);
    this.pagina.set(1);
    this.cargar();
  }

  irAPagina(pagina: number) {
    if (pagina < 1 || pagina > this.totalPaginas()) return;
    this.pagina.set(pagina);
    this.cargar();
  }

  cambiarStock(id: number, valor: number | string) {
    const stock = Number(valor);
    this.stockDraft.update((draft) => ({ ...draft, [id]: stock }));
  }

  guardarStock(variante: VarianteInventario) {
    const stock = this.stockDraft()[variante.id];
    if (!Number.isInteger(stock) || stock < 0) {
      this.erroresStock.update((errores) => ({
        ...errores,
        [variante.id]: 'Ingresa un stock entero igual o mayor que cero.',
      }));
      return;
    }
    if (stock === variante.stock) return;

    this.erroresStock.update((errores) => ({
      ...errores,
      [variante.id]: '',
    }));
    this.actualizadoId.set(null);
    this.guardandoIds.update((ids) => new Set(ids).add(variante.id));
    this.acciones.add(
      this.productosService
        .actualizarStockTalla(variante.producto.id, variante.id, stock)
        .subscribe({
          next: () => {
            this.guardandoIds.update((ids) => {
              const siguientes = new Set(ids);
              siguientes.delete(variante.id);
              return siguientes;
            });
            this.actualizadoId.set(variante.id);
            this.cargar();
          },
          error: (error) => {
            this.guardandoIds.update((ids) => {
              const siguientes = new Set(ids);
              siguientes.delete(variante.id);
              return siguientes;
            });
            this.erroresStock.update((errores) => ({
              ...errores,
              [variante.id]: error?.error?.message ?? 'No se pudo actualizar el stock.',
            }));
          },
        }),
    );
  }
}
