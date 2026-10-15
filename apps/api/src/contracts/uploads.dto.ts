import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
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
  @ApiProperty({ minLength: 1, maxLength: 100 })
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
  @ArrayUnique((f: FrameInputDto) => `${f?.figmaFileKey}:${f?.figmaNodeId}`)
  @Type(() => FrameInputDto)
  @ValidateNested({ each: true })
  frames!: FrameInputDto[];
}
