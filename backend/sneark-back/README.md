# Sneark API

API REST del proyecto Sneark, construida con NestJS, Prisma y MySQL. La API se sirve bajo el prefijo `/api` y gestiona autenticación, catálogo, carrito, pedidos y pagos con Mercado Pago.

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
- `PORT` (opcional, por defecto `3000`), `FRONTEND_ORIGIN` (por defecto local `http://localhost:4200`) y `BACKEND_URL` (por defecto local `http://localhost:3000`).
- `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`: credenciales de Mercado Pago. Son opcionales para iniciar la API y ejecutar e2e; los endpoints de pago devuelven un error explícito si faltan.
- `DELIVERY_FREE_DISTRICT` (por defecto `La Esperanza`) y `DELIVERY_FLAT_RATE_PEN` (por defecto `15`): configuración del envío local. Los distritos permitidos se mantienen en backend: La Esperanza, Trujillo, Víctor Larco, El Porvenir, Florencia de Mora, Huanchaco y Moche.
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: credenciales temporales para crear o promover al administrador inicial.

No guardes credenciales reales en el repositorio.

### Mercado Pago y despliegue

Para habilitar pagos, configura `MP_ACCESS_TOKEN` con las credenciales correspondientes al entorno. Configura `MP_WEBHOOK_SECRET` con el secreto de firma de Webhooks que proporciona Mercado Pago; el endpoint `/api/pagos/webhook` verifica `x-signature` y `x-request-id` antes de consultar el pago.

Para probar sin cobros reales, usa el access token de prueba `TEST-...` y las cuentas de prueba/tarjetas de prueba creadas desde Mercado Pago Developers. Con ese token la aplicación redirige al checkout sandbox. No uses credenciales `APP_USR-...` para pruebas.

En producción configura ambos orígenes públicos con HTTPS:

- `FRONTEND_ORIGIN`: origen raíz del frontend (sin ruta, consulta ni fragmento). Se usa tanto en CORS como en las URLs de retorno de Mercado Pago.
- `BACKEND_URL`: origen raíz del backend; Mercado Pago recibe notificaciones en `${BACKEND_URL}/api/pagos/webhook`.

No se usan valores `localhost` por defecto en producción. Si falta una URL pública o no es HTTPS, la API falla al configurar CORS o al crear la preferencia, en lugar de generar enlaces locales. `MP_ACCESS_TOKEN` puede omitirse para desarrollo sin pagos y para pruebas e2e.

Las preferencias vencen a los 15 minutos de creado el pedido. El backend reutiliza la preferencia ya emitida y valida su ID, importe y moneda al recibir la notificación. Si un pago aprobado llega después de cancelar el pedido, solo se reactiva si todo el inventario se puede reservar de nuevo; de lo contrario queda como `PAGO_REQUIERE_REVISION` para revisar el pedido o tramitar un reembolso.

El costo de envío se calcula en backend según el distrito elegido; `La Esperanza` es gratis y los demás distritos usan `DELIVERY_FLAT_RATE_PEN`. El total del pedido y la preferencia de Mercado Pago incluyen ese cargo. Las ventas del dashboard se agrupan por la fecha de aprobación verificada (`pagadoEn`); pedidos anteriores sin esa fecha no se asignan artificialmente a un período.

Los pagos aprobados con una preferencia, importe o moneda inesperados también quedan marcados para revisión. No confirmes un nuevo pago desde el frontend en esos estados; revisa la operación en Mercado Pago y resuelve manualmente.

## Base de datos

Genera el cliente Prisma y aplica las migraciones versionadas:

```bash
npx prisma generate
npx prisma migrate deploy
```

## Crear el primer administrador

1. Coloca temporalmente `ADMIN_EMAIL` y `ADMIN_PASSWORD` en el archivo `.env` ignorado por Git o defínelas en el entorno.
2. Desde este directorio, ejecuta:

```bash
npm run seed:admin
```

El comando crea la cuenta con el rol `ADMIN` si el correo no existe; si ya existe, promueve esa cuenta sin duplicarla ni cambiar su contraseña actual. La contraseña de una cuenta nueva se almacena con bcrypt. El comando no imprime el correo, la contraseña ni el hash.

Después de ejecutarlo, elimina `ADMIN_EMAIL` y `ADMIN_PASSWORD` del entorno y borra sus valores temporales de `.env`. El registro público no permite seleccionar el rol.

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

## Antes del primer despliegue con datos reales

La migración `20261008163800_product_variants_inventory_filters` agrega columnas obligatorias sin rellenarlas primero. Antes de aplicarla a una base con datos, debe reescribirse en pasos: agregar las columnas como opcionales, rellenar los valores existentes y luego volverlas obligatorias. Prueba la migración con una copia de datos reales antes del despliegue.
