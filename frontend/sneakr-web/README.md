# Sneark Web

Aplicación web de comercio electrónico desarrollada con Angular. El frontend se comunica con la API del backend Sneark.

## Requisitos y configuración

- Node.js compatible con Angular CLI 22.
- npm.

Instala las dependencias desde este directorio:

```bash
npm install
```

La URL de la API se define en los archivos de entorno bajo `src/environments/`.

> **Antes de operar:** los datos actuales de pago para Yape y Plin están pendientes de confirmación. Se mantienen centralizados en `src/app/core/config/datos-pago.ts`.

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
