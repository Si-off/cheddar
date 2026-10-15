import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
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
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: ["pending", "added", "excluded"] }) status!:
    | "pending"
    | "added"
    | "excluded";
  @ApiProperty() reason!: string;
  @ApiProperty({ type: CaseContentDto }) content!: CaseContentDto;
}
export class GenerationDto {
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
