import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

interface RuntimeConfig {
  apiUrl?: unknown;
}

export function validarApiUrlProduccion(valor: unknown): string {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error(
      'Falta apiUrl en runtime-config.json. Configura la URL HTTPS pública de la API antes de iniciar el frontend.',
    );
  }

  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    throw new Error('apiUrl debe ser una URL absoluta válida.');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !pathname.endsWith('/api') ||
    url.search ||
    url.hash ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  ) {
    throw new Error(
      'apiUrl debe ser una URL HTTPS pública, sin credenciales, consulta ni fragmento.',
    );
  }

  return `${url.origin}${pathname}`;
}

@Injectable({ providedIn: 'root' })
export class ApiUrlService {
  private apiUrl = environment.apiUrl;

  async load(): Promise<void> {
    if (!environment.production) return;

    let response: Response;
    try {
      response = await fetch(
        new URL('runtime-config.json', document.baseURI),
        { cache: 'no-store' },
      );
    } catch (error) {
      throw new Error(
        'No se pudo cargar runtime-config.json para configurar la URL de la API.',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new Error(
        `No se pudo cargar runtime-config.json (HTTP ${response.status}).`,
      );
    }

    let config: RuntimeConfig;
    try {
      config = (await response.json()) as RuntimeConfig;
    } catch (error) {
      throw new Error('runtime-config.json no contiene JSON válido.', {
        cause: error,
      });
    }

    this.apiUrl = validarApiUrlProduccion(config.apiUrl);
  }

  endpoint(recurso: string): string {
    if (!this.apiUrl) {
      throw new Error('La URL base de la API no está configurada.');
    }
    return `${this.apiUrl}/${recurso.replace(/^\/+/, '')}`;
  }
}
