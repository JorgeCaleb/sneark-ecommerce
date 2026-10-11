import { createHmac, timingSafeEqual } from 'node:crypto';

export function validarFirmaMercadoPago(
  firma: string | undefined,
  requestId: string | undefined,
  pagoId: string,
  secreto: string,
): boolean {
  if (!firma || !requestId || !pagoId || !secreto) return false;

  const partes = new Map(
    firma.split(',').map((parte) => {
      const separador = parte.indexOf('=');
      return separador < 0
        ? [parte.trim(), '']
        : [
            parte.slice(0, separador).trim(),
            parte.slice(separador + 1).trim(),
          ];
    }),
  );
  const timestamp = partes.get('ts');
  const firmaV1 = partes.get('v1');
  if (
    !timestamp ||
    !firmaV1 ||
    !/^[a-f\d]{64}$/i.test(firmaV1)
  ) {
    return false;
  }

  const manifiesto = `id:${pagoId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const esperada = createHmac('sha256', secreto)
    .update(manifiesto)
    .digest();
  const recibida = Buffer.from(firmaV1, 'hex');

  return recibida.length === esperada.length &&
    timingSafeEqual(recibida, esperada);
}
