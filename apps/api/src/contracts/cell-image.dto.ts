import { ApiProperty } from "@nestjs/swagger";
export class CellImageDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ type: "integer", minimum: 1 }) width!: number;
  @ApiProperty({ type: "integer", minimum: 1 }) height!: number;
}
export const IMAGE_UPLOAD_SCHEMA = {
  type: "object",
  required: ["file"],
  properties: { file: { type: "string", format: "binary" } },
} satisfies import("@nestjs/swagger/dist/interfaces/open-api-spec.interface").SchemaObject;
