import { Component, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
})
export class AdminLayoutComponent {
  readonly auth          = inject(AuthService);

  readonly sidebarAbierto = signal(false);

  toggleSidebar() {
    this.sidebarAbierto.update((v) => !v);
  }

  cerrarSidebar() {
    this.sidebarAbierto.set(false);
  }

  logout() {
    this.auth.logout();
  }
}
