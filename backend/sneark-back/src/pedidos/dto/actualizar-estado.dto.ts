import { IsEnum, IsNotEmpty } from 'class-validator';

export enum EstadoPedidoDto {
  PENDIENTE = 'PENDIENTE',
  PAGO_VERIFICADO = 'PAGO_VERIFICADO',
  EN_PREPARACION = 'EN_PREPARACION',
  ENVIADO = 'ENVIADO',
  ENTREGADO = 'ENTREGADO',
  CANCELADO = 'CANCELADO',
}

export class ActualizarEstadoDto {
  @IsEnum(EstadoPedidoDto, { message: 'Estado no válido' })
  @IsNotEmpty()
  estado: EstadoPedidoDto;
}
