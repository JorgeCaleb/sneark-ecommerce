import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Inyecta el JWT válido y elimina la sesión cuando el servidor lo rechaza.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.obtenerTokenValido();
  const authReq = token
    ? req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`),
      })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (token && error instanceof HttpErrorResponse && error.status === 401) {
        authService.limpiarSesion();
      }
      return throwError(() => error);
    }),
  );
};
