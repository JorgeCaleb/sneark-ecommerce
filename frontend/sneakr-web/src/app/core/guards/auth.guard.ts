import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Guard funcional para rutas que requieren autenticación
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.sesionValida() ? true : router.createUrlTree(['/auth/login']);
};

// Guard funcional para rutas exclusivas de ADMIN
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.sesionValida() && auth.esAdmin() ? true : router.createUrlTree(['/']);
};
