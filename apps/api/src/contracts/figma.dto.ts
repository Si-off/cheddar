import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { TempUploadDto } from "./temp-upload.dto";

const optional = (_: unknown, value: unknown) => value !== undefined;

export class FigmaTokenDto {
  @ApiProperty({ description: "토큰을 만든 Figma 계정 이름" })
  handle!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ description: "토큰 끝 네 글자" }) tokenSuffix!: string;
}
export class FigmaTokenStatusDto {
  @ApiProperty({ type: FigmaTokenDto, nullable: true })
  token!: FigmaTokenDto | null;
}
export class SaveFigmaTokenDto {
  @ApiProperty({ minLength: 1, maxLength: 512, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;
}
export class AddFigmaLinkDto {
  @ApiProperty({
    maxLength: 2000,
    description: "Figma 파일, 페이지, 프레임 링크",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  url!: string;
  @ApiPropertyOptional({
    format: "uuid",
    description: "이어 붙일 임시 업로드. 없으면 새로 만든다",
  })
  @ValidateIf(optional)
  @IsUUID()
  uploadId?: string;
}
export class AddImagesMultipartDto {
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf(optional)
  @IsUUID()
  uploadId?: string;
}
export class TempUploadAddedDto {
  @ApiProperty({ type: TempUploadDto }) upload!: TempUploadDto;
  @ApiProperty({ type: [String], format: "uuid" }) addedFrameIds!: string[];
  @ApiPropertyOptional({
    description: "Figma 링크가 가리키는 페이지, 섹션, 프레임이나 파일 이름",
  })
  title?: string;
  @ApiProperty({ description: "업로드 한도를 넘어 넣지 못한 프레임 수" })
  omittedCount!: number;
}
