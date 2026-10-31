import type { ValorMonetario } from '../models/valor-monetario';

export function etiquetaIncidenciaPago(pago: {
  mpEstadoPago?: string | null;
  mpMontoReembolsado?: ValorMonetario;
  mpRequiereRevision?: boolean;
}): string {
  if (pago.mpEstadoPago === 'refunded') return 'Pago reembolsado';
  if (pago.mpEstadoPago === 'charged_back') return 'Contracargo en revisión';
  if (pago.mpEstadoPago === 'in_mediation') return 'Pago en disputa';
  if (Number(pago.mpMontoReembolsado ?? 0) > 0) return 'Reembolso parcial en revisión';
  return pago.mpRequiereRevision ? 'Pago en revisión' : '';
}
