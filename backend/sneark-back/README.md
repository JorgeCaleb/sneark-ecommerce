# Sneark API

API REST del proyecto Sneark, construida con NestJS, Prisma y MySQL. La API se sirve bajo el prefijo `/api` y gestiona autenticación, catálogo, carrito, pedidos y comprobantes de pago.

## Requisitos y configuración

- Node.js y npm.
- MySQL.
- Credenciales de Cloudinary para subir imágenes.

Desde este directorio, instala las dependencias y crea `.env` a partir de la plantilla:

```bash
npm install
copy .env.example .env
```

Configura en `.env`:

- `DATABASE_URL`: conexión a MySQL.
- `JWT_SECRET`: secreto aleatorio para firmar tokens.
- `JWT_EXPIRES_IN`: duración del token (entero positivo seguido de `s`, `m`, `h`, `d`, `w` o `y`; por defecto `7d`).
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`: credenciales de Cloudinary.
- `PORT` (opcional, por defecto `3000`) y `FRONTEND_ORIGIN` (por defecto `http://localhost:4200`).

No guardes credenciales reales en el repositorio.

## Base de datos

Genera el cliente Prisma y aplica las migraciones versionadas:

```bash
npx prisma generate
npx prisma migrate deploy
```

## Ejecutar

```bash
npm run start:dev
```

La API estará disponible en `http://localhost:3000/api`. Para compilar y ejecutar la salida de producción:

```bash
npm run build
npm run start:prod
```

## Pruebas y lint

```bash
npm test
npm run test:e2e
npm run test:cov
npm run lint
```

Las pruebas se ejecutan con Vitest. `npm run lint` usa Oxlint.
