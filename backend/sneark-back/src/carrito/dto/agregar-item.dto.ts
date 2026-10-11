import { Type } from 'class-transformer';
import { IsInt, IsPositive, Max, Min } from 'class-validator';

export class AgregarItemDto {
  @IsInt()
  @IsPositive({ message: 'Debe seleccionar una talla válida' })
  @Type(() => Number)
  tallaProductoId: number;

  @IsInt()
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Max(2_147_483_647, { message: 'La cantidad supera el máximo permitido' })
  @Type(() => Number)
  cantidad: number;
}
