import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { CaseContentDto } from "./sheets.dto";

export class StartGenerationDto {
  @ApiPropertyOptional({ enum: ["replace", "review"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["replace", "review"])
  mode?: "replace" | "review";
  @ApiPropertyOptional({
    type: "array",
    items: { type: "string", format: "uuid" },
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  frameIds?: string[];
  @ApiPropertyOptional({
    type: "array",
    items: { type: "string", format: "uuid" },
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  requirementIds?: string[];
  @ApiProperty({ format: "uuid" }) @IsUUID() clientRequestId!: string;
  @ApiProperty({ enum: ["anthropic", "openai"] })
  @IsIn(["anthropic", "openai"])
  provider!: "anthropic" | "openai";
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  uploadId?: string | null;
  @ApiPropertyOptional({ maxLength: 10000 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(10000)
  description?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  exampleSheetId?: string;
}
export class CandidateDto {
  @ApiPropertyOptional({ enum: ["case", "candidate"] }) kind?:
    | "case"
    | "candidate";
  @ApiPropertyOptional({
    type: "array",
    items: { type: "string", format: "uuid" },
  })
  requirementIds?: string[];
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: ["pending", "added", "excluded"] }) status!:
    | "pending"
    | "added"
    | "excluded";
  @ApiProperty() reason!: string;
  @ApiProperty({ type: CaseContentDto }) content!: CaseContentDto;
}
export class GenerationDto {
  @ApiPropertyOptional({ enum: ["replace", "review"] }) mode?:
    | "replace"
    | "review";
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) sheetId!: string;
  @ApiProperty({ enum: ["anthropic", "openai"] }) provider!:
    | "anthropic"
    | "openai";
  @ApiProperty() model!: string;
  @ApiProperty({ enum: ["running", "succeeded", "failed"] }) status!:
    | "running"
    | "succeeded"
    | "failed";
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: "integer" }) revision!: number;
  @ApiProperty({ type: "integer" }) caseCount!: number;
  @ApiProperty({ type: [CandidateDto] }) candidates!: CandidateDto[];
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class GenerationListDto {
  @ApiProperty({ type: [GenerationDto] }) items!: GenerationDto[];
}
export class ReviewCandidateDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({ enum: ["add", "exclude", "restore", "edit"] })
  @IsIn(["add", "exclude", "restore", "edit"])
  action!: "add" | "exclude" | "restore" | "edit";
  @ApiPropertyOptional({ type: CaseContentDto })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => CaseContentDto)
  @ValidateNested()
  content?: CaseContentDto;
}
export class GenerationProviderDto {
  @ApiProperty({ enum: ["anthropic", "openai"] }) id!: "anthropic" | "openai";
  @ApiProperty() model!: string;
  @ApiProperty() configured!: boolean;
}
export class GenerationProvidersDto {
  @ApiProperty({ type: [GenerationProviderDto] })
  items!: GenerationProviderDto[];
}

export class AddGeneratedCasesDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  sheetRevision!: number;
  @ApiProperty({ type: "array", items: { type: "string", format: "uuid" } })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  candidateIds!: string[];
}
