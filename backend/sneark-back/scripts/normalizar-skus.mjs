import { PrismaClient } from '@prisma/client';

const argumentos = process.argv.slice(2);
if (argumentos.some((argumento) => argumento !== '--aplicar')) {
  console.error('Uso: npm.cmd run skus:auditar [-- --aplicar]');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient();
  try {
    const { normalizarSkus } = await import('../dist/productos/normalizar-skus.js');
    const resultado = await normalizarSkus(prisma, argumentos.includes('--aplicar'));
    console.log(JSON.stringify(resultado, null, 2));
  } catch (error) {
    console.error(
      error?.name === 'ConflictException' || error?.name === 'BadRequestException'
        ? error.message
        : 'No se pudieron normalizar los SKU. No se aplicaron cambios. Compila el backend y revisa la conexión a la base de datos.',
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
