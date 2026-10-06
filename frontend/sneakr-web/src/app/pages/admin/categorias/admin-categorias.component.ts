import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CategoriasService,
  Categoria,
} from '../../../core/services/categorias.service';

@Component({
  selector: 'app-admin-categorias',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-categorias.component.html',
  styleUrl: './admin-categorias.component.css',
})
export class AdminCategoriasComponent implements OnInit {
  private readonly categoriasService = inject(CategoriasService);

  readonly categorias = signal<Categoria[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal('');
  readonly modalAbierto = signal(false);
  readonly guardando = signal(false);
  readonly errorForm = signal('');
  readonly categoriaEditar = signal<Categoria | null>(null);
  nombre = '';

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.errorCarga.set('');
    this.categoriasService.buscarTodas().subscribe({
      next: (categorias) => {
        this.categorias.set(categorias);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set('No se pudieron cargar las categorías. Intenta de nuevo.');
        this.cargando.set(false);
      },
    });
  }

  abrirCrear() {
    this.categoriaEditar.set(null);
    this.nombre = '';
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(categoria: Categoria) {
    this.categoriaEditar.set(categoria);
    this.nombre = categoria.nombre;
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    if (!this.guardando()) this.modalAbierto.set(false);
  }

  guardar() {
    const nombre = this.nombre.trim();
    if (!nombre) {
      this.errorForm.set('El nombre es obligatorio.');
      return;
    }

    this.guardando.set(true);
    this.errorForm.set('');

    const categoria = this.categoriaEditar();
    const request$ = categoria
      ? this.categoriasService.actualizar(categoria.id, nombre)
      : this.categoriasService.crear(nombre);

    request$.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modalAbierto.set(false);
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorForm.set(err?.error?.message ?? 'No se pudo guardar la categoría.');
      },
    });
  }

  eliminar(categoria: Categoria) {
    if (
      !confirm(
        `¿Eliminar la categoría "${categoria.nombre}"? Solo se puede eliminar si no tiene productos asociados.`,
      )
    ) {
      return;
    }

    this.categoriasService.eliminar(categoria.id).subscribe({
      next: () => this.cargar(),
      error: (err) =>
        alert(err?.error?.message ?? 'No se pudo eliminar la categoría.'),
    });
  }
}
