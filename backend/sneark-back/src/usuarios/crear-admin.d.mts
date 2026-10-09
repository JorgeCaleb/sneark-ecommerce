export interface ClientePrismaAdmin {
  usuario: {
    upsert(argumentos: {
      where: { email: string };
      create: {
        nombre: string;
        email: string;
        password: string;
        rol: 'ADMIN';
      };
      update: { rol: 'ADMIN' };
    }): Promise<unknown>;
  };
  $disconnect(): Promise<void>;
}

export interface OpcionesCreacionAdmin {
  entorno?: Record<string, string | undefined>;
  crearCliente?: () => ClientePrismaAdmin;
  informar?: (mensaje: string) => void;
}

export function ejecutarCreacionAdmin(
  opciones?: OpcionesCreacionAdmin,
): Promise<void>;
