import { obtenerExpiracionJwt } from './jwt-expiration.util.js';

describe('obtenerExpiracionJwt', () => {
  it('uses seven days when the value is missing or blank', () => {
    expect(obtenerExpiracionJwt(undefined)).toBe('7d');
    expect(obtenerExpiracionJwt('  ')).toBe('7d');
  });

  it('accepts supported positive durations', () => {
    expect(obtenerExpiracionJwt('30m')).toBe('30m');
    expect(obtenerExpiracionJwt('1Y')).toBe('1Y');
  });

  it.each(['0d', '-1d', '7', '7 days', 'abc'])(
    'rejects an invalid duration: %s',
    (value) => {
      expect(() => obtenerExpiracionJwt(value)).toThrow('JWT_EXPIRES_IN');
    },
  );
});
