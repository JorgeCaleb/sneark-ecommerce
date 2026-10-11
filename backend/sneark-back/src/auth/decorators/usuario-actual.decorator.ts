import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UsuarioAutenticado {
  id: number;
  email: string;
  rol: string;
}

/**
 * Decorador de parámetro para inyectar el usuario autenticado desde el JWT.
 * Uso:
 *   - `@UsuarioActual() usuario: UsuarioAutenticado`
 *   - `@UsuarioActual('id') usuarioId: number`
 */
export const UsuarioActual = createParamDecorator(
  (propiedad: keyof UsuarioAutenticado | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const usuario = request.user as UsuarioAutenticado | undefined;
    if (!usuario) {
      return undefined;
    }
    return propiedad ? usuario[propiedad] : usuario;
  },
);
