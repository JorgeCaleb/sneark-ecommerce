import { BadRequestException } from '@nestjs/common';

export const PATRON_TALLA = /^(?:\d{1,2}|[1-9]\d{2})(?:\.0|\.5)?$/;

export function normalizarTalla(talla: string): string {
  const valor = talla.trim();
  if (!PATRON_TALLA.test(valor)) {
    throw new BadRequestException(
      'La talla debe ser un número entre 0 y 999.5, entero o terminado en .0 o .5',
    );
  }
  return String(Number(valor));
}

export function generarSku(
  codigoMarca: string,
  codigoModelo: string,
  genero: string,
  codigoColor: string,
  talla: string,
): string {
  const tallaSku = normalizarTalla(talla).replace('.', 'P');
  const sku = `${codigoMarca}-${codigoModelo}-${genero}-${codigoColor}-${tallaSku}`;
  if (sku.length > 60) {
    throw new BadRequestException(
      'Los códigos son demasiado largos para generar un SKU válido',
    );
  }
  return sku;
}
