import { IsEnum, IsNotEmpty } from 'class-validator';
import { EstadoPedido } from '@prisma/client';

export class ActualizarEstadoDto {
  @IsEnum(EstadoPedido, { message: 'Estado no válido' })
  @IsNotEmpty()
  estado: EstadoPedido;
}
