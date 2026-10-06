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
    @if (!esAdmin()) {
      <app-navbar />
    }
    <main [class.main--full]="esAdmin()">
      <router-outlet />
    </main>
    @if (!esAdmin()) {
      <app-footer />
    }
  `,
  styles: [`
    main {
      min-height: calc(100dvh - 64px);
    }
    main.main--full {
      min-height: 100dvh;
    }
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
}
