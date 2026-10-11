import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ApiUrlService } from '../services/api-url.service';

// Inyecta el JWT válido y elimina la sesión cuando el servidor lo rechaza.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const apiRoot = inject(ApiUrlService).endpoint('').replace(/\/+$/, '');
  const esApiPropia = req.url === apiRoot || req.url.startsWith(`${apiRoot}/`);
  const token = esApiPropia ? authService.obtenerTokenValido() : null;
  const authReq = token
    ? req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`),
      })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (token && error instanceof HttpErrorResponse && error.status === 401) {
        authService.limpiarSesion();
        void router.navigate(['/auth/login']);
      }
      return throwError(() => error);
    }),
  );
};
