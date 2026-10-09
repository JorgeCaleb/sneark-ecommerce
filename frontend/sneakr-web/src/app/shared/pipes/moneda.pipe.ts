import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'moneda',
  standalone: true,
})
export class MonedaPipe implements PipeTransform {
  transform(
    valor: number | string | null | undefined,
    decimalesFijos = false,
  ): string {
    const numero =
      typeof valor === 'string' && valor.trim() === '' ? Number.NaN : Number(valor);
    if (valor === null || valor === undefined || !Number.isFinite(numero)) {
      return '—';
    }

    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: decimalesFijos ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(numero);
  }
}
