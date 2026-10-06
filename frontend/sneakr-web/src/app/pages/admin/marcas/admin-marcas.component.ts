import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarcasService, Marca } from '../../../core/services/marcas.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface MarcaForm { nombre: string; }

@Component({
  selector: 'app-admin-marcas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-marcas.component.html',
  styleUrl: './admin-marcas.component.css',
})
export class AdminMarcasComponent implements OnInit {
  private marcasService = inject(MarcasService);
  private http          = inject(HttpClient);
  private API           = `${environment.apiUrl}/marcas`;

  readonly marcas      = signal<Marca[]>([]);
  readonly cargando    = signal(true);
  readonly modalAbierto = signal(false);
  readonly guardando   = signal(false);
  readonly errorForm   = signal('');
  readonly marcaEditar = signal<Marca | null>(null);
  readonly archivoLogo = signal<File | null>(null);

  form: MarcaForm = { nombre: '' };

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando.set(true);
    this.marcasService.buscarTodas().subscribe({
      next: (m) => { this.marcas.set(m); this.cargando.set(false); },
      error: ()  => this.cargando.set(false),
    });
  }

  abrirCrear() {
    this.marcaEditar.set(null);
    this.form = { nombre: '' };
    this.archivoLogo.set(null);
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(m: Marca) {
    this.marcaEditar.set(m);
    this.form = { nombre: m.nombre };
    this.archivoLogo.set(null);
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() { this.modalAbierto.set(false); }

  seleccionarLogo(event: Event) {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    if (!archivo) return;

    const tiposPermitidos = [
      'image/svg+xml',
      'image/png',
      'image/jpeg',
      'image/webp',
    ];
    if (!tiposPermitidos.includes(archivo.type)) {
      this.errorForm.set('El logo debe estar en formato SVG, PNG, JPG o WEBP.');
      input.value = '';
      this.archivoLogo.set(null);
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      this.errorForm.set('El logo debe pesar 2 MB o menos.');
      input.value = '';
      this.archivoLogo.set(null);
      return;
    }

    this.errorForm.set('');
    this.archivoLogo.set(archivo);
  }

  guardar() {
    if (!this.form.nombre.trim()) {
      this.errorForm.set('El nombre es obligatorio.');
      return;
    }

    this.guardando.set(true);
    this.errorForm.set('');
    const archivoLogo = this.archivoLogo();
    const data = { nombre: this.form.nombre.trim() };

    const req$ = this.marcaEditar()
      ? this.http.patch<Marca>(`${this.API}/${this.marcaEditar()!.id}`, data)
      : this.http.post<Marca>(this.API, data);

    req$.subscribe({
      next: (marca) => {
        if (!archivoLogo) {
          this.guardando.set(false);
          this.modalAbierto.set(false);
          this.cargar();
          return;
        }

        this.marcaEditar.set(marca);
        this.marcasService.subirLogo(marca.id, archivoLogo).subscribe({
          next: () => {
            this.guardando.set(false);
            this.modalAbierto.set(false);
            this.cargar();
          },
          error: (err) => {
            this.guardando.set(false);
            this.errorForm.set(
              err?.error?.message ?? 'No se pudo completar la operación del logo.',
            );
            this.cargar();
          },
        });
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorForm.set(err?.error?.message ?? 'Error al guardar.');
      },
    });
  }

  eliminar(id: number) {
    if (!confirm('¿Eliminar esta marca? Solo es posible si no tiene productos.')) return;
    this.http.delete(`${this.API}/${id}`).subscribe({
      next:  () => this.cargar(),
      error: (err) => alert(err?.error?.message ?? 'No se pudo eliminar.'),
    });
  }
}
