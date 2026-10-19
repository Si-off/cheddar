import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
