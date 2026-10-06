import { PartialType } from '@nestjs/mapped-types';
import { CrearMarcaDto } from './crear-marca.dto.js';

// PartialType hace todos los campos opcionales automáticamente
export class ActualizarMarcaDto extends PartialType(CrearMarcaDto) {}
