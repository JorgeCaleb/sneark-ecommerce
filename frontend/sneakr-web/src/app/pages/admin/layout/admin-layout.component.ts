import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CarritoService } from '../../../core/services/carrito.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
})
export class AdminLayoutComponent {
  readonly auth          = inject(AuthService);
  private carritoService = inject(CarritoService);
  private router         = inject(Router);

  readonly sidebarAbierto = signal(false);

  toggleSidebar() {
    this.sidebarAbierto.update((v) => !v);
  }

  cerrarSidebar() {
    this.sidebarAbierto.set(false);
  }

  logout() {
    this.auth.logout();
    this.carritoService.limpiarLocal();
    this.router.navigate(['/']);
  }
}
