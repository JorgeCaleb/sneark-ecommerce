import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ActualizarItemDto {
  @IsInt()
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Max(2_147_483_647, { message: 'La cantidad supera el máximo permitido' })
  @Type(() => Number)
  cantidad: number;
}
