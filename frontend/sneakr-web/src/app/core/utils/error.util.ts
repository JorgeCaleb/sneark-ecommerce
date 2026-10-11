export function extraerMensajeError(
  err: unknown,
  fallback = 'Ocurrió un error inesperado.',
): string {
  const message = (err as any)?.error?.message;
  if (Array.isArray(message)) {
    const formatted = message.filter(Boolean).join('. ');
    return formatted.length > 0 ? formatted : fallback;
  }
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
}
