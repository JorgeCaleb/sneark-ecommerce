import type { JwtModuleOptions } from '@nestjs/jwt';

type ExpiracionJwt = NonNullable<
  NonNullable<JwtModuleOptions['signOptions']>['expiresIn']
>;

const EXPIRACION_POR_DEFECTO = '7d';
const FORMATO_EXPIRACION = /^[1-9]\d*(s|m|h|d|w|y)$/i;

export function obtenerExpiracionJwt(valor: string | undefined): ExpiracionJwt {
  const expiracion = valor?.trim() || EXPIRACION_POR_DEFECTO;
  if (!FORMATO_EXPIRACION.test(expiracion)) {
    throw new Error(
      'JWT_EXPIRES_IN debe ser un entero positivo seguido de s, m, h, d, w o y (por ejemplo, 7d)',
    );
  }
  return expiracion as ExpiracionJwt;
}
