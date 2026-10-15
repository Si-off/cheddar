import { ApiProperty } from "@nestjs/swagger";

export class FileDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) projectId!: string;
  @ApiProperty({ maxLength: 255 }) originalName!: string;
  @ApiProperty({
    enum: ["image/png", "image/jpeg", "image/webp", "application/json"],
  })
  mediaType!: string;
  @ApiProperty({ type: "integer", minimum: 1, maximum: 20971520 })
  byteSize!: number;
  @ApiProperty({ pattern: "^[a-f0-9]{64}$" }) sha256!: string;
  @ApiProperty({ enum: ["ready"] }) status!: "ready";
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class FilePageDto {
  @ApiProperty({ type: [FileDto] }) items!: FileDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
