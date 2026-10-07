import { BadRequestException } from '@nestjs/common';

export function aceptarTipoArchivo(
  tipo: string,
  permitidos: readonly string[],
  mensajeError: string,
  callback: (error: Error | null, aceptar: boolean) => void,
): void {
  if (permitidos.includes(tipo)) {
    callback(null, true);
    return;
  }

  callback(new BadRequestException(mensajeError), false);
}
