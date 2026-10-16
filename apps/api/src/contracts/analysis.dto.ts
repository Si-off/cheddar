import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class AnalysisRegionDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(1) x!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) y!: number;
  @ApiProperty() @IsNumber() @Min(0.000001) @Max(1) width!: number;
  @ApiProperty() @IsNumber() @Min(0.000001) @Max(1) height!: number;
}
export class AnalysisItemDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({
    enum: ["screen", "state", "requirement", "question", "relation"],
  })
  @IsIn(["screen", "state", "requirement", "question", "relation"])
  kind!: "screen" | "state" | "requirement" | "question" | "relation";
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(255) title!: string;
  @ApiProperty() @IsString() @MaxLength(20000) text!: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  frameId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(200)
  nodeId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  parentId?: string;
  @ApiPropertyOptional({ type: AnalysisRegionDto })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => AnalysisRegionDto)
  @ValidateNested()
  region?: AnalysisRegionDto;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(20000)
  answer?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsBoolean()
  useAsRule?: boolean;
  @ApiPropertyOptional({ enum: ["transition", "state", "annotation"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["transition", "state", "annotation"])
  relation?: "transition" | "state" | "annotation";
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  fromId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  toId?: string;
}
export class AnalysisLinkDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() requirementId!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() testScenarioId!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() caseId!: string;
}
export class AnalysisDto {
  @ApiProperty({ minimum: 0, type: "integer" })
  @IsInt()
  @Min(0)
  revision!: number;
  @ApiProperty({ type: [AnalysisItemDto] })
  @IsArray()
  @ArrayMaxSize(10000)
  @ArrayUnique((x: AnalysisItemDto) => x?.id)
  @Type(() => AnalysisItemDto)
  @ValidateNested({ each: true })
  items!: AnalysisItemDto[];
  @ApiProperty({ type: [AnalysisLinkDto] })
  @IsArray()
  @ArrayMaxSize(20000)
  @ArrayUnique(
    (x: AnalysisLinkDto) =>
      `${x?.requirementId}/${x?.testScenarioId}/${x?.caseId}`,
  )
  @Type(() => AnalysisLinkDto)
  @ValidateNested({ each: true })
  links!: AnalysisLinkDto[];
}
export class ExtractAnalysisDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() uploadId!: string;
}
