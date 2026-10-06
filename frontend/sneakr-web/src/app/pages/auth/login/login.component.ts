import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { CarritoService } from '../../../core/services/carrito.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private authService    = inject(AuthService);
  private carritoService = inject(CarritoService);
  private router         = inject(Router);

  email     = '';
  password  = '';
  readonly enviando     = signal(false);
  readonly error        = signal('');
  readonly mostrarPass  = signal(false);

  togglePass() {
    this.mostrarPass.update((v) => !v);
  }

  submit() {
    if (!this.email || !this.password) {
      this.error.set('Completá todos los campos.');
      return;
    }

    this.enviando.set(true);
    this.error.set('');

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        // Cargar el carrito del usuario después de login
        this.carritoService.obtener().subscribe();
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.enviando.set(false);
        this.error.set(err?.error?.message ?? 'Credenciales incorrectas.');
      },
    });
  }
}
