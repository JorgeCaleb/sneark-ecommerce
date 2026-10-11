import { IsEnum, IsOptional } from 'class-validator';
import { EstadoPedido } from '@prisma/client';
import { PaginacionDto } from '../../common/dto/paginacion.dto.js';

export class FiltrarPedidosDto extends PaginacionDto {
  @IsOptional()
  @IsEnum(EstadoPedido)
  estado?: EstadoPedido;
}
