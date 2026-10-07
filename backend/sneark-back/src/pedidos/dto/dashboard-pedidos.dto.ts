import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export class DashboardPedidosDto {
  @IsDateString()
  inicioAnterior: string;

  @IsDateString()
  inicioActual: string;

  @IsDateString()
  finActual: string;

  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  desfaseZonaHoraria: number;
}
