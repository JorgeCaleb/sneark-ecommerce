import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ─── Públicas ────────────────────────────────────────────────────────────────
  {
    path: '',
    loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'catalogo',
    loadComponent: () =>
      import('./pages/catalogo/catalogo.component').then((m) => m.CatalogoComponent),
  },
  {
    path: 'producto/:id',
    loadComponent: () =>
      import('./pages/producto-detalle/producto-detalle.component').then(
        (m) => m.ProductoDetalleComponent,
      ),
  },

  // ─── Auth ────────────────────────────────────────────────────────────────────
  {
    path: 'auth/login',
    loadComponent: () => import('./pages/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/registro',
    loadComponent: () =>
      import('./pages/auth/registro/registro.component').then((m) => m.RegistroComponent),
  },

  // ─── Requieren autenticación ─────────────────────────────────────────────────
  {
    path: 'carrito',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/carrito/carrito.component').then((m) => m.CarritoComponent),
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/checkout/checkout.component').then((m) => m.CheckoutComponent),
  },
  {
    path: 'comprobante/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/comprobante/comprobante.component').then((m) => m.ComprobanteComponent),
  },
  {
    path: 'pago/resultado',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/pago-resultado/pago-resultado.component').then(
        (m) => m.PagoResultadoComponent,
      ),
  },
  {
    path: 'mis-pedidos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/mis-pedidos/mis-pedidos.component').then((m) => m.MisPedidosComponent),
  },

  // ─── Admin — layout con sidebar + rutas hijas ─────────────────────────────────
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/admin/layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/admin/dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: 'pedidos',
        loadComponent: () =>
          import('./pages/admin/pedidos/admin-pedidos.component').then(
            (m) => m.AdminPedidosComponent,
          ),
      },
      {
        path: 'clientes',
        loadComponent: () =>
          import('./pages/admin/clientes/admin-clientes.component').then(
            (m) => m.AdminClientesComponent,
          ),
      },
      {
        path: 'productos',
        loadComponent: () =>
          import('./pages/admin/productos/admin-productos.component').then(
            (m) => m.AdminProductosComponent,
          ),
      },
      {
        path: 'marcas',
        loadComponent: () =>
          import('./pages/admin/marcas/admin-marcas.component').then((m) => m.AdminMarcasComponent),
      },
      {
        path: 'categorias',
        loadComponent: () =>
          import('./pages/admin/categorias/admin-categorias.component').then(
            (m) => m.AdminCategoriasComponent,
          ),
      },
      {
        path: 'colores',
        loadComponent: () =>
          import('./pages/admin/colores/admin-colores.component').then(
            (m) => m.AdminColoresComponent,
          ),
      },
      {
        path: 'inventario',
        loadComponent: () =>
          import('./pages/admin/inventario/admin-inventario.component').then(
            (m) => m.AdminInventarioComponent,
          ),
      },
    ],
  },

  // ─── Fallback ────────────────────────────────────────────────────────────────
  {
    path: '**',
    redirectTo: '',
  },
];
