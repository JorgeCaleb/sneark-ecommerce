import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ActualizarItemDto {
  @IsInt()
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Type(() => Number)
  cantidad: number;
}
