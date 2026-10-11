import { Transform } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';
import { DISTRITOS_ENVIO, type DistritoEnvio } from '../envio.util.js';

export class CotizarEnvioDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsIn(DISTRITOS_ENVIO, { message: 'Selecciona un distrito de envío válido' })
  distrito: DistritoEnvio;
}
