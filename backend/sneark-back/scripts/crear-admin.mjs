import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function ejecutarCreacionAdmin({
  entorno = process.env,
  crearCliente = () => new PrismaClient(),
  informar = (mensaje) => console.log(mensaje),
} = {}) {
  const correo = entorno.ADMIN_EMAIL?.trim();
  const contrasena = entorno.ADMIN_PASSWORD;
  if (!correo || !contrasena) {
    throw new Error(
      'Faltan las variables ADMIN_EMAIL y ADMIN_PASSWORD. Configúralas antes de ejecutar el comando.',
    );
  }

  const prisma = crearCliente();
  try {
    const hash = await bcrypt.hash(contrasena, 10);
    await prisma.usuario.upsert({
      where: { email: correo },
      create: {
        nombre: 'Administrador',
        email: correo,
        password: hash,
        rol: 'ADMIN',
      },
      update: { rol: 'ADMIN' },
    });
    informar('Administrador creado o promovido correctamente.');
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  ejecutarCreacionAdmin().catch((error) => {
    const mensaje =
      error instanceof Error &&
      error.message.startsWith('Faltan las variables ADMIN_EMAIL y ADMIN_PASSWORD.')
        ? error.message
        : 'No se pudo crear o promover el administrador. Verifica la conexión y la configuración de la base de datos.';
    console.error(
      mensaje,
    );
    process.exitCode = 1;
  });
}
