import { Component, inject, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, NgIcon],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  private readonly router = inject(Router);
  readonly esInicio = input(false);
  readonly esCatalogo = input(false);
  readonly anio = new Date().getFullYear();

  async abrirAyuda(event: Event): Promise<void> {
    event.preventDefault();
    await this.router.navigate(['/'], { fragment: 'ayuda' });
    requestAnimationFrame(() => document.getElementById('ayuda')?.scrollIntoView());
  }
}
