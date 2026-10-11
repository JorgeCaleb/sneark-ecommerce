export function obtenerOrigenPublico(
  valor: string | undefined,
  nombreVariable: string,
  esProduccion = process.env.NODE_ENV === 'production',
  valorLocal?: string,
): string {
  const configurado = valor?.trim() || (esProduccion ? undefined : valorLocal);
  if (!configurado) {
    throw new Error(
      `${nombreVariable} es obligatorio en producción y debe ser un origen HTTPS público.`,
    );
  }

  let url: URL;
  try {
    url = new URL(configurado);
  } catch {
    throw new Error(`${nombreVariable} debe ser una URL absoluta válida.`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${nombreVariable} debe contener solo un origen HTTP(S).`);
  }

  if (esProduccion) {
    const nombreHost = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') {
      throw new Error(`${nombreVariable} debe usar HTTPS en producción.`);
    }
    if (
      nombreHost === 'localhost' ||
      nombreHost.endsWith('.localhost') ||
      nombreHost === '127.0.0.1' ||
      nombreHost === '[::1]'
    ) {
      throw new Error(`${nombreVariable} no puede apuntar a localhost en producción.`);
    }
  }

  return url.origin;
}
