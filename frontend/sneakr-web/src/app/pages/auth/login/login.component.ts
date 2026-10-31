import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { CarritoService } from '../../../core/services/carrito.service';
import { EMPTY, catchError } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule, NgIcon],
  templateUrl: './login.component.html',
  styleUrls: ['../auth-shared.css', './login.component.css'],
})
export class LoginComponent {
  private authService    = inject(AuthService);
  private carritoService = inject(CarritoService);
  private router         = inject(Router);
  private route          = inject(ActivatedRoute);
  readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';

  email     = '';
  password  = '';
  readonly enviando     = signal(false);
  readonly error        = signal('');
  readonly mostrarPass  = signal(false);

  togglePass() {
    this.mostrarPass.update((v) => !v);
  }

  submit(form: NgForm) {
    if (this.enviando()) return;
    form.control.markAllAsTouched();
    if (form.invalid || !this.email.trim() || !this.password) {
      this.error.set('Revisa los campos indicados para continuar.');
      return;
    }

    this.enviando.set(true);
    this.error.set('');

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        // Cargar el carrito del usuario después de login
        this.carritoService.obtener().pipe(catchError(() => EMPTY)).subscribe();
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err) => {
        this.enviando.set(false);
        this.error.set(err?.error?.message ?? 'Credenciales incorrectas.');
      },
    });
  }
}
