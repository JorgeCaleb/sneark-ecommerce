import { IsIn, IsOptional } from 'class-validator';
import { FiltrarProductosDto } from './filtrar-productos.dto.js';

export class FiltrarProductosAdminDto extends FiltrarProductosDto {
  @IsOptional()
  @IsIn(['todos', 'activos', 'inactivos'])
  estado?: 'todos' | 'activos' | 'inactivos' = 'todos';
}
