# Sneark Web

Aplicación web de comercio electrónico desarrollada con Angular. El frontend se comunica con la API del backend Sneark.

## Requisitos y configuración

- Node.js compatible con Angular CLI 22.
- npm.

Instala las dependencias desde este directorio:

```bash
npm install
```

La URL de desarrollo de la API se define en `src/environments/environment.ts`.

## Configuración de API

El build de producción carga la URL desde `runtime-config.json`, que se sirve junto al frontend y se copia desde `public/runtime-config.json`.

Antes de iniciar la aplicación desplegada, reemplaza ese archivo por un JSON con la URL HTTPS real del backend, por ejemplo:

```json
{
  "apiUrl": "https://tu-dominio-real/api"
}
```

No dejes `apiUrl` vacío en producción: la aplicación detendrá el arranque con un error claro si falta la configuración o no es una URL HTTPS válida. El archivo puede inyectarse o reemplazarse en el servidor de archivos estáticos al desplegar; no hace falta recompilar el frontend cuando solo cambia el dominio de la API.

El checkout usa Mercado Pago. Para probarlo sin cobros reales, configura en el backend credenciales de prueba de Mercado Pago Developers; las preferencias creadas con un token `TEST-...` dirigen al sandbox.

## Desarrollo

```bash
npm start
```

Abre `http://localhost:4200/`. El servidor recarga la aplicación al detectar cambios.

## Comprobaciones

```bash
npm test
npm run build
npm run lint
```

Las pruebas unitarias usan Vitest. El lint revisa código TypeScript y templates Angular.

## Pruebas end-to-end

Las pruebas end-to-end aún no están configuradas: el proyecto no tiene objetivo `e2e` ni framework instalado. Por lo tanto, `ng e2e` no está disponible.
