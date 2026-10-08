import { PartialType } from '@nestjs/mapped-types';
import { CrearColorDto } from './crear-color.dto.js';

export class ActualizarColorDto extends PartialType(CrearColorDto) {}
