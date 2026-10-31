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

El checkout usa Mercado Pago. Para probarlo sin cobros reales, configura en el backend las credenciales del vendedor de prueba y usa un comprador y tarjetas de prueba siguiendo la [guía de Checkout Pro](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases). Los tokens `TEST-...` dirigen al sandbox; las demás credenciales utilizan la URL `init_point` devuelta por Mercado Pago.

## Ventas del dashboard

El gráfico muestra hoy y los 29 días anteriores según el calendario local utilizado en la consulta. Comparte la fecha inicial con la petición al backend y conserva ese período si la respuesta llega después de medianoche; al actualizar se calcula un período nuevo. Cada venta se ubica por la fecha de aprobación del pago, los días sin ventas muestran cero y las fechas externas al período no se dibujan.

## Sesión y carrito

Cada solicitud del carrito conserva la sesión en la que se creó. Al iniciar otra sesión, cerrar sesión, expirar el token o recibir un 401 de la sesión actual, se limpia el carrito y se cancelan las solicitudes pendientes en el navegador. Las operaciones que seguían en cola no se envían con las credenciales del siguiente usuario. Una respuesta 401 de una sesión anterior no cierra la nueva sesión, incluso si ambos inicios de sesión recibieron el mismo JWT.

`limpiarLocal()` también invalida las operaciones pendientes después de crear un pedido. La cancelación en el navegador no revierte modificaciones que el backend ya haya procesado para el usuario original. Este cambio no requiere migraciones de base de datos.

La confirmación del checkout también se cancela al cambiar de sesión o salir de la pantalla: una respuesta antigua no puede vaciar el carrito de la cuenta nueva ni iniciar o redirigir su pago.

Las acciones de pago en Mis pedidos y Resultado del pago también cancelan la espera al salir de la pantalla o cambiar de sesión y comprueban la sesión antes de redirigir a Mercado Pago. Mientras se genera el enlace, no envían solicitudes duplicadas. Si la solicitud falla, permiten reintentar. Cancelar la espera del navegador no cancela el pedido ni una preferencia que el backend ya haya creado.

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
