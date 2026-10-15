import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class FrameInputDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  figmaFileKey!: string;
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  figmaNodeId!: string;
  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  width!: number;
  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  height!: number;
  @ApiProperty({ format: "uuid" }) @IsUUID() imageFileId!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() dataFileId!: string;
}
export class CreateUploadDto {
  @ApiProperty({
    format: "uuid",
    description: "Stable ID for retries of the same upload bundle.",
  })
  @IsUUID()
  clientRequestId!: string;
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({
    type: [FrameInputDto],
    minItems: 1,
    description:
      "Ordered frames. File IDs must reference ready files in the same project; enforced by the future upload service.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((f: FrameInputDto) =>
    JSON.stringify([f?.figmaFileKey, f?.figmaNodeId]),
  )
  @Type(() => FrameInputDto)
  @ValidateNested({ each: true })
  frames!: FrameInputDto[];
}

export class UploadSummaryDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) projectId!: string;
  @ApiProperty({ minLength: 1, maxLength: 100 }) name!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: "integer", minimum: 1 }) frameCount!: number;
}
export class UploadPageDto {
  @ApiProperty({ type: [UploadSummaryDto] }) items!: UploadSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class UploadFrameDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ minLength: 1, maxLength: 200 }) figmaFileKey!: string;
  @ApiProperty({ minLength: 1, maxLength: 200 }) figmaNodeId!: string;
  @ApiProperty({ minLength: 1, maxLength: 255 }) name!: string;
  @ApiProperty({ minimum: 0.01 }) width!: number;
  @ApiProperty({ minimum: 0.01 }) height!: number;
  @ApiProperty({ format: "uuid" }) imageFileId!: string;
  @ApiProperty({ format: "uuid" }) dataFileId!: string;
}
export class UploadDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) projectId!: string;
  @ApiProperty({ minLength: 1, maxLength: 100 }) name!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: [UploadFrameDto], minItems: 1 })
  frames!: UploadFrameDto[];
}
