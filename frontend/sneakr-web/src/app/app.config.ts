import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Router con binding de inputs en componentes (parámetros de ruta como @Input)
    provideRouter(routes, withComponentInputBinding()),
    // HttpClient con interceptor JWT automático
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
