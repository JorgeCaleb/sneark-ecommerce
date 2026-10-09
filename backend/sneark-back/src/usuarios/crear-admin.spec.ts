import bcrypt from 'bcrypt';
import { ejecutarCreacionAdmin } from '../../scripts/crear-admin.mjs';

describe('Creación inicial de administrador', () => {
  const entorno = {
    ADMIN_EMAIL: '  ADMIN@example.test ',
    ADMIN_PASSWORD: 'clave-segura-de-prueba',
  };

  it('crea un administrador con contraseña cifrada cuando el correo no existe', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const desconectar = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      usuario: { upsert },
      $disconnect: desconectar,
    };
    const informar = vi.fn();

    await ejecutarCreacionAdmin({
      entorno,
      crearCliente: () => prisma,
      informar,
    });

    const argumentos = upsert.mock.calls[0][0];
    expect(argumentos.where).toEqual({ email: 'ADMIN@example.test' });
    expect(argumentos.create).toMatchObject({
      nombre: 'Administrador',
      email: 'ADMIN@example.test',
      rol: 'ADMIN',
    });
    expect(argumentos.create.password).not.toBe(entorno.ADMIN_PASSWORD);
    await expect(
      bcrypt.compare(entorno.ADMIN_PASSWORD, argumentos.create.password),
    ).resolves.toBe(true);
    expect(argumentos.update).toEqual({ rol: 'ADMIN' });
    expect(informar).toHaveBeenCalledWith(
      'Administrador creado o promovido correctamente.',
    );
    expect(JSON.stringify(informar.mock.calls)).not.toContain(
      entorno.ADMIN_PASSWORD,
    );
    expect(desconectar).toHaveBeenCalledOnce();
  });

  it('promueve al usuario existente con un solo upsert y sin crear otro', async () => {
    const existente = {
      email: 'ADMIN@example.test',
      rol: 'CLIENTE',
    };
    const upsert = vi.fn(async ({ update }) => {
      Object.assign(existente, update);
      return existente;
    });
    const prisma = {
      usuario: { upsert },
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };

    await ejecutarCreacionAdmin({
      entorno,
      crearCliente: () => prisma,
      informar: vi.fn(),
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(existente.rol).toBe('ADMIN');
  });

  it('falla claramente sin variables y no abre conexión a la base', async () => {
    const crearCliente = vi.fn();

    await expect(
      ejecutarCreacionAdmin({
        entorno: {},
        crearCliente,
        informar: vi.fn(),
      }),
    ).rejects.toThrow(
      'Faltan las variables ADMIN_EMAIL y ADMIN_PASSWORD. Configúralas antes de ejecutar el comando.',
    );

    expect(crearCliente).not.toHaveBeenCalled();
  });
});
