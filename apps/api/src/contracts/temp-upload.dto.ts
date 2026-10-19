import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";
export class UploadMultipartDto {
  @ApiProperty({
    description: "JSON: { frames: [{ name, document, imageCount }] }",
  })
  @IsString()
  manifest!: string;
}
export class TempFrameDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() imageCount!: number;
}
export class TempUploadDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
  @ApiProperty({ type: [TempFrameDto] }) frames!: TempFrameDto[];
}
