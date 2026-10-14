import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { DISTRITOS_ENVIO, type DistritoEnvio } from '../envio.util.js';

export class CrearPedidoDto {
  @IsString()
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @MaxLength(20)
  telefono: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El distrito es obligatorio' })
  @IsIn(DISTRITOS_ENVIO, { message: 'Selecciona un distrito de envío válido' })
  distrito: DistritoEnvio;

  @IsString()
  @IsNotEmpty({ message: 'La dirección es obligatoria' })
  @MaxLength(255)
  direccion: string;
}
