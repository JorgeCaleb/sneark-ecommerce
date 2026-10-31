import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { CarritoService } from '../../../core/services/carrito.service';
import { EMPTY, catchError } from 'rxjs';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [RouterLink, FormsModule, NgIcon],
  templateUrl: './registro.component.html',
  styleUrls: ['../auth-shared.css', './registro.component.css'],
})
export class RegistroComponent {
  private authService    = inject(AuthService);
  private carritoService = inject(CarritoService);
  private router         = inject(Router);
  private route          = inject(ActivatedRoute);
  readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';

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

  submit(form: NgForm) {
    if (this.enviando()) return;
    form.control.markAllAsTouched();
    if (form.invalid || !this.nombre.trim() || !this.email.trim() || !this.password || !this.confirmar) {
      this.error.set('Revisa los campos indicados para continuar.');
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
        this.carritoService.obtener().pipe(catchError(() => EMPTY)).subscribe();
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err) => {
        this.enviando.set(false);
        this.error.set(err?.error?.message ?? 'Error al crear la cuenta.');
      },
    });
  }
}
