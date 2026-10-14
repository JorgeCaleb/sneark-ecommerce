import { ServiceUnavailableException } from '@nestjs/common';

export const DISTRITOS_ENVIO = [
  'La Esperanza',
  'Trujillo',
  'Víctor Larco',
  'El Porvenir',
  'Florencia de Mora',
  'Huanchaco',
  'Moche',
] as const;

export type DistritoEnvio = (typeof DISTRITOS_ENVIO)[number];

const TARIFA_ENVIO_PEN = 15;
const DISTRITO_ENVIO_GRATIS: DistritoEnvio = 'La Esperanza';

export function calcularCostoEnvio(distrito: string): number {
  if (!DISTRITOS_ENVIO.includes(distrito as DistritoEnvio)) {
    throw new ServiceUnavailableException(
      'El distrito de envío no está configurado como permitido.',
    );
  }
  return distrito === DISTRITO_ENVIO_GRATIS ? 0 : TARIFA_ENVIO_PEN;
}
