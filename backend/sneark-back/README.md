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

Para probar sin cobros reales, crea las cuentas de vendedor y comprador de prueba y utiliza las credenciales que Mercado Pago indique para ese vendedor, junto con tarjetas de prueba. Sigue la [guía de compras de prueba de Checkout Pro](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases). La aplicación utiliza `sandbox_init_point` con tokens `TEST-...` e `init_point` para los demás tokens, incluidos los que correspondan a vendedores de prueba.

En producción configura ambos orígenes públicos con HTTPS:

- `FRONTEND_ORIGIN`: origen raíz del frontend (sin ruta, consulta ni fragmento). Se usa tanto en CORS como en las URLs de retorno de Mercado Pago.
- `BACKEND_URL`: origen raíz del backend; Mercado Pago recibe notificaciones en `${BACKEND_URL}/api/pagos/webhook`.

No se usan valores `localhost` por defecto en producción. Si falta una URL pública o no es HTTPS, la API falla al configurar CORS o al crear la preferencia, en lugar de generar enlaces locales. `MP_ACCESS_TOKEN` puede omitirse para desarrollo sin pagos y para pruebas e2e.

Las preferencias vencen a los 15 minutos de creado el pedido. El backend reutiliza la preferencia ya emitida y valida su ID, importe y moneda al recibir la notificación. Si un pago aprobado llega después de cancelar el pedido, solo se reactiva si todo el inventario se puede reservar de nuevo; de lo contrario queda como `PAGO_REQUIERE_REVISION` para revisar el pedido o tramitar un reembolso.

El costo de envío se calcula en backend según el distrito elegido; `La Esperanza` es gratis y los demás distritos usan `DELIVERY_FLAT_RATE_PEN`. El total del pedido y la preferencia de Mercado Pago incluyen ese cargo. Las ventas del dashboard se agrupan por la fecha de aprobación verificada (`pagadoEn`); pedidos anteriores sin esa fecha no se asignan artificialmente a un período.

Los pagos aprobados con una preferencia, importe o moneda inesperados también quedan marcados para revisión. No confirmes un nuevo pago desde el frontend en esos estados; revisa la operación en Mercado Pago y resuelve manualmente.

La validación consulta el pago y su orden comercial (`payment.order.id`). Compara la preferencia de la orden con `mpPreferenciaId`, comprueba que la orden incluya el pago recibido y verifica la referencia del pedido, el importe y la moneda. `preference_id` se obtiene de la [orden comercial](https://www.mercadopago.com.pe/developers/es/reference/online-payments/checkout-pro-preferences/merchant-orders/get-merchant-order/get), no del recurso Payment.

Los fallos temporales al consultar Mercado Pago devuelven HTTP 503 sin modificar el pedido, para permitir el reintento de la notificación. Las firmas inválidas devuelven 401. Las aprobaciones duplicadas no descuentan inventario de nuevo. Las actualizaciones financieras anteriores a `date_last_updated` ya registrado se ignoran.

Los reembolsos totales o parciales, contracargos y disputas guardan `mpEstadoPago`, `mpMontoReembolsado`, `mpActualizadoEn` y `mpRequiereRevision`. En pedidos en preparación, enviados o entregados se conserva el avance de entrega; la incidencia se muestra por separado y bloquea el siguiente avance. Estos pedidos aparecen en el filtro de pagos en revisión y se excluyen de las ventas confirmadas del dashboard hasta resolver la incidencia. Un reembolso parcial queda pendiente de revisión; el dashboard no calcula ventas netas por artículo devuelto.

La notificación financiera no repone stock automáticamente. Para pedidos aún cancelables, una cancelación administrativa libera la reserva una sola vez. La devolución física de productos enviados o entregados se gestiona manualmente. Las discrepancias con pago aprobado y sin reembolso pueden confirmarse desde el estado `PAGO_REQUIERE_REVISION` después de revisar la operación. Si una disputa se resuelve y Mercado Pago vuelve a reportar un pago aprobado sin reembolso, el administrador puede usar «Confirmar revisión de pago» conservando el estado de entrega. No se permite confirmar pagos reembolsados o en disputa.

Antes de iniciar esta versión, aplica la migración aditiva `20261027010000_estado_financiero_mercadopago` mediante el procedimiento de migraciones de la siguiente sección. Agrega campos opcionales o con valor predeterminado y conserva los pedidos existentes. Las pruebas HTTP de `test/pagos.e2e-spec.ts` usan servicios simulados y no realizan cobros; la validación final del despliegue requiere una compra con cuentas de prueba y comprobar la recepción del webhook HTTPS.

## Base de datos

Genera el cliente Prisma y aplica las migraciones versionadas:

```bash
npx prisma generate
npx prisma migrate deploy
```

## Normalizar tallas y SKU existentes

Los SKU representan las medias tallas con `P`: `3.5` genera el sufijo `3P5` y `35` genera `35`. La talla visible conserva el punto decimal. Las entradas `06`, `6.0` y `6` representan una única talla `6`.

Para actualizar una base que aún tenga los códigos anteriores, compila esta versión y ejecuta la auditoría antes de iniciar el backend. En PowerShell:

```powershell
npm.cmd run build
npm.cmd run skus:auditar
npm.cmd run skus:auditar -- --aplicar
```

El primer comando de SKU solo informa los cambios. `--aplicar` vuelve a comprobar todas las variantes y actualiza únicamente `talla`, `tallaNumero` y `sku` dentro de una transacción. Conserva identificadores, stock, referencias de carritos y las copias históricas de los pedidos. Es idempotente y no necesita una migración de esquema de Prisma. Ejecuta la conversión sin ediciones de catálogo concurrentes; un conflicto revierte la operación completa.

Si detecta tallas equivalentes duplicadas o SKU finales repetidos, se detiene sin escribir nada. Revisa esos identificadores y sus referencias antes de continuar; el comando no suma stock, fusiona variantes ni borra datos.

## Validación de actualizaciones del catálogo

Los endpoints `PATCH` de productos, categorías, colores y marcas permiten omitir campos para conservar su valor actual. Rechazan `null` en campos obligatorios con HTTP 400 antes de llamar al servicio. En productos, `descripcion: null` borra la descripción y `grupoModeloId: null` quita el grupo; `activo: false` sigue siendo válido.

Las tallas se omiten para conservar las variantes o se envían como un arreglo. `tallas: null` y los identificadores de variante nulos se rechazan tanto al crear como al actualizar. Un arreglo vacío solicita quitar las variantes, respetando las restricciones existentes para las que tienen referencias en carritos o pedidos. Este ajuste de validación no requiere una migración de base de datos.

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
