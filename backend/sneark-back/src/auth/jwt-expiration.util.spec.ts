import { obtenerExpiracionJwt } from './jwt-expiration.util.js';

describe('obtenerExpiracionJwt', () => {
  it('usa siete días cuando el valor está ausente o en blanco', () => {
    expect(obtenerExpiracionJwt(undefined)).toBe('7d');
    expect(obtenerExpiracionJwt('  ')).toBe('7d');
  });

  it('acepta duraciones positivas válidas', () => {
    expect(obtenerExpiracionJwt('30m')).toBe('30m');
    expect(obtenerExpiracionJwt('1Y')).toBe('1Y');
  });

  it.each(['0d', '-1d', '7', '7 days', 'abc'])(
    'rechaza una duración inválida: %s',
    (value) => {
      expect(() => obtenerExpiracionJwt(value)).toThrow('JWT_EXPIRES_IN');
    },
  );
});
