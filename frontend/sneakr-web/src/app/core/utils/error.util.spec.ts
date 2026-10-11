import { extraerMensajeError } from './error.util';

describe('extraerMensajeError', () => {
  it('formatea un arreglo de errores de validación de NestJS con punto y espacio', () => {
    const error = {
      error: {
        message: ['El precio debe ser un número válido', 'La marca es obligatoria'],
      },
    };
    expect(extraerMensajeError(error)).toBe(
      'El precio debe ser un número válido. La marca es obligatoria',
    );
  });

  it('devuelve el string directo cuando message es un string simple', () => {
    const error = { error: { message: 'Stock insuficiente' } };
    expect(extraerMensajeError(error)).toBe('Stock insuficiente');
  });

  it('devuelve el mensaje por defecto cuando no hay error o viene vacío', () => {
    expect(extraerMensajeError(null, 'Error por defecto')).toBe('Error por defecto');
    expect(extraerMensajeError({}, 'Error por defecto')).toBe('Error por defecto');
    expect(extraerMensajeError({ error: { message: [] } }, 'Error por defecto')).toBe(
      'Error por defecto',
    );
  });
});
