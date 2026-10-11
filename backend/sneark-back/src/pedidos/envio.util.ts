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

const TARIFA_ENVIO_PREDETERMINADA = 15;
const DISTRITO_GRATIS_PREDETERMINADO: DistritoEnvio = 'La Esperanza';

function tarifaEnvio(config: NodeJS.ProcessEnv): number {
  const valor =
    config['DELIVERY_FLAT_RATE_PEN'] ??
    String(TARIFA_ENVIO_PREDETERMINADA);
  if (!/^\d+(?:\.\d{1,2})?$/.test(valor)) {
    throw new ServiceUnavailableException(
      'DELIVERY_FLAT_RATE_PEN debe ser un monto no negativo con hasta dos decimales.',
    );
  }

  const tarifa = Number(valor);
  if (!Number.isFinite(tarifa) || tarifa > 99_999_999.99) {
    throw new ServiceUnavailableException(
      'DELIVERY_FLAT_RATE_PEN supera el máximo permitido.',
    );
  }
  return tarifa;
}

function distritoGratis(config: NodeJS.ProcessEnv): DistritoEnvio {
  const valor =
    config['DELIVERY_FREE_DISTRICT'] ?? DISTRITO_GRATIS_PREDETERMINADO;
  if (!DISTRITOS_ENVIO.includes(valor as DistritoEnvio)) {
    throw new ServiceUnavailableException(
      'DELIVERY_FREE_DISTRICT debe ser uno de los distritos de envío permitidos.',
    );
  }
  return valor as DistritoEnvio;
}

export function calcularCostoEnvio(
  distrito: string,
  config: NodeJS.ProcessEnv = process.env,
): number {
  if (!DISTRITOS_ENVIO.includes(distrito as DistritoEnvio)) {
    throw new ServiceUnavailableException(
      'El distrito de envío no está configurado como permitido.',
    );
  }
  return distrito === distritoGratis(config) ? 0 : tarifaEnvio(config);
}
