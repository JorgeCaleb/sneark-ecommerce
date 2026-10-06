import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Decorador para marcar rutas que solo pueden acceder ciertos roles
// Uso: @Roles('ADMIN')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
