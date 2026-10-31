import { Component, DestroyRef, ElementRef, inject, signal, HostListener, ViewChild } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CarritoService } from '../../core/services/carrito.service';
import { FavoritosService } from '../../core/services/favoritos.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, FormsModule, NgIcon],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly carritoService = inject(CarritoService);
  readonly favoritos = inject(FavoritosService);
  private router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  @ViewChild('menuToggle') private menuToggle?: ElementRef<HTMLButtonElement>;

  readonly menuAbierto = signal(false);
  terminoBusqueda = '';

  constructor() {
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(() => this.cerrarMenu());
  }

  @HostListener('document:keydown.escape')
  cerrarConEscape(): void {
    if (this.menuAbierto()) {
      this.cerrarMenu();
      this.menuToggle?.nativeElement.focus();
    }
    const cuenta = this.host.nativeElement.querySelector('details[open]');
    cuenta?.removeAttribute('open');
    cuenta?.querySelector('summary')?.focus();
  }

  @HostListener('document:click', ['$event'])
  cerrarDesdeFuera(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.cerrarMenu();
      this.host.nativeElement.querySelector('details[open]')?.removeAttribute('open');
    }
  }

  @HostListener('window:resize')
  cerrarEnEscritorio(): void {
    if (window.innerWidth > 980) this.cerrarMenu();
  }

  toggleMenu() {
    this.menuAbierto.update((v) => !v);
  }

  cerrarMenu() {
    this.menuAbierto.set(false);
  }

  async abrirFavoritos(event: Event): Promise<void> {
    event.preventDefault();
    this.cerrarMenu();
    await this.router.navigate(['/'], { queryParams: { favoritos: 1 }, fragment: 'favoritos' });
    requestAnimationFrame(() => document.getElementById('favoritos')?.scrollIntoView());
  }

  async irASeccion(event: Event, seccion: string): Promise<void> {
    event.preventDefault();
    this.cerrarMenu();
    await this.router.navigate(['/'], { fragment: seccion });
    requestAnimationFrame(() => document.getElementById(seccion)?.scrollIntoView());
  }

  ejecutarBusqueda() {
    if (this.terminoBusqueda.trim()) {
      this.router.navigate(['/catalogo'], {
        queryParams: { busqueda: this.terminoBusqueda.trim() },
      });
      this.terminoBusqueda = '';
      this.cerrarMenu();
    }
  }

  logout() {
    this.cerrarMenu();
    this.auth.logout();
  }
}
