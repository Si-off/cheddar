import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { CaseContentDto } from "./test-scenarios.dto";

export class StartGenerationDto {
  @ApiPropertyOptional({ enum: ["replace", "review", "append"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["replace", "review", "append"])
  mode?: "replace" | "review" | "append";
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
  exampleTestScenarioId?: string;
}
export class GenerationResultItemDto {
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
  @ApiPropertyOptional({ enum: ["replace", "review", "append"] }) mode?:
    | "replace"
    | "review"
    | "append";
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) testScenarioId!: string;
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
  @ApiProperty({ type: [GenerationResultItemDto] })
  results!: GenerationResultItemDto[];
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class GenerationListDto {
  @ApiProperty({ type: [GenerationDto] }) items!: GenerationDto[];
}
export class GenerationQuestionAnswerDto {
  @ApiProperty({ type: "integer", minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision!: number;
  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MaxLength(20000)
  answer!: string;
  @ApiProperty()
  @IsBoolean()
  useAsRule!: boolean;
}
export class ReviewGenerationResultDto {
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
  @ApiPropertyOptional({ type: GenerationQuestionAnswerDto })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => GenerationQuestionAnswerDto)
  @ValidateNested()
  question?: GenerationQuestionAnswerDto;
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
  testScenarioRevision!: number;
  @ApiProperty({ type: "array", items: { type: "string", format: "uuid" } })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  resultIds!: string[];
}
