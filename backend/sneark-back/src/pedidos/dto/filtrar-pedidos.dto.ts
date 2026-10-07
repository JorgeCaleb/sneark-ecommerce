import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { EstadoPedido } from '@prisma/client';

export class FiltrarPedidosDto {
  @IsOptional()
  @IsEnum(EstadoPedido)
  estado?: EstadoPedido;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 25;
}
