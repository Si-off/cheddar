import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class PageQueryDto {
  @ApiPropertyOptional({
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ maxLength: 256 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(256)
  cursor?: string;
}
export class ErrorDetailDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ format: "uuid" }) requestId!: string;
  @ApiPropertyOptional({
    oneOf: [
      { type: "object", additionalProperties: true },
      { type: "array", items: { type: "object", additionalProperties: true } },
    ],
  })
  details?: unknown;
}
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto }) error!: ErrorDetailDto;
}
export class HealthDto {
  @ApiProperty({ enum: ["ok"] }) status!: "ok";
}
