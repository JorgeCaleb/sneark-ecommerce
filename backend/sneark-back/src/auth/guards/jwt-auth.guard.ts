import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard que protege rutas: solo permite acceso con JWT válido
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
