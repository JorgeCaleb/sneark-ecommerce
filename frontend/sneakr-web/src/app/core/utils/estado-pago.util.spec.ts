import { etiquetaIncidenciaPago } from './estado-pago.util';

describe('Incidencias de pago', () => {
  it.each([
    [{ mpEstadoPago: 'refunded' }, 'Pago reembolsado'],
    [{ mpEstadoPago: 'charged_back' }, 'Contracargo en revisión'],
    [{ mpEstadoPago: 'in_mediation' }, 'Pago en disputa'],
    [{ mpEstadoPago: 'approved', mpMontoReembolsado: '25.00' }, 'Reembolso parcial en revisión'],
    [{ mpRequiereRevision: true }, 'Pago en revisión'],
    [{ mpEstadoPago: 'approved', mpMontoReembolsado: '0.00' }, ''],
  ])('describe %j', (pago, etiqueta) => {
    expect(etiquetaIncidenciaPago(pago)).toBe(etiqueta);
  });
});
