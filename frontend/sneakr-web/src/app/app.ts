import { Component, inject, computed } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavbarComponent } from './shared/navbar/navbar.component';
import { FooterComponent } from './shared/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent],
  template: `
    <a class="skip-link" href="#contenido-principal">Saltar al contenido</a>
    @if (!esAdmin()) {
      <app-navbar />
    }
    <main id="contenido-principal" tabindex="-1" [class.main--full]="esAdmin()" [class.main--home]="esInicio() || esCatalogo() || esProducto() || esCarrito()">
      <router-outlet />
    </main>
    @if (!esAdmin()) {
      <app-footer [esInicio]="esInicio()" [esCatalogo]="!esInicio()" />
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100dvh; }
    main {
      flex: 1;
      min-height: 0;
    }
    main.main--full {
      min-height: 100dvh;
    }
    main.main--home { min-height: 0; }
  `],
})
export class App {
  private router = inject(Router);

  // Signal que detecta si la ruta activa es del admin
  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly esAdmin = computed(() => this.url().startsWith('/admin'));
  readonly esInicio = computed(() => this.url().split(/[?#]/)[0] === '/');
  readonly esCatalogo = computed(() => this.url().split(/[?#]/)[0] === '/catalogo');
  readonly esProducto = computed(() => /^\/producto\/[^/?#]+/.test(this.url()));
  readonly esCarrito = computed(() => this.url().split(/[?#]/)[0] === '/carrito');
}
