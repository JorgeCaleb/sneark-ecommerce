import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { Roles } from './roles.decorator.js';

/**
 * Decorador compuesto para endpoints accesibles exclusivamente por administradores.
 * Aplica JwtAuthGuard, RolesGuard y la metadata de rol ADMIN.
 */
export function Admin() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles('ADMIN'),
  );
}
