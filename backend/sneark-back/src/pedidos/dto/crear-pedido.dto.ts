import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum MetodoPagoDto {
  YAPE = 'YAPE',
  PLIN = 'PLIN',
}

export class CrearPedidoDto {
  @IsEnum(MetodoPagoDto, { message: 'El método de pago debe ser YAPE o PLIN' })
  metodoPago: MetodoPagoDto;

  @IsString()
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @MaxLength(20)
  telefono: string;

  @IsString()
  @IsNotEmpty({ message: 'La ciudad es obligatoria' })
  @MaxLength(100)
  ciudad: string;

  @IsString()
  @IsNotEmpty({ message: 'La dirección es obligatoria' })
  @MaxLength(255)
  direccion: string;
}
