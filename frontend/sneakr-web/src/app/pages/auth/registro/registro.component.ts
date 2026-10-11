import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { CarritoService } from '../../../core/services/carrito.service';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './registro.component.html',
  styleUrl: './registro.component.css',
})
export class RegistroComponent {
  private authService    = inject(AuthService);
  private carritoService = inject(CarritoService);
  private router         = inject(Router);

  nombre    = '';
  email     = '';
  password  = '';
  confirmar = '';

  readonly enviando    = signal(false);
  readonly error       = signal('');
  readonly mostrarPass = signal(false);

  togglePass() {
    this.mostrarPass.update((v) => !v);
  }

  submit() {
    if (!this.nombre || !this.email || !this.password || !this.confirmar) {
      this.error.set('Completá todos los campos.');
      return;
    }

    if (this.password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (this.password !== this.confirmar) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }

    this.enviando.set(true);
    this.error.set('');

    this.authService.registro(this.nombre, this.email, this.password).subscribe({
      next: () => {
        this.carritoService.obtener().subscribe();
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.enviando.set(false);
        this.error.set(err?.error?.message ?? 'Error al crear la cuenta.');
      },
    });
  }
}
