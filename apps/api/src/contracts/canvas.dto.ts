import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class FlowStepDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;
  @ApiProperty({ enum: ["start", "screen", "action", "condition", "end"] })
  @IsIn(["start", "screen", "action", "condition", "end"])
  kind!: "start" | "screen" | "action" | "condition" | "end";
  @ApiProperty() @IsString() @MaxLength(10000) description!: string;
  @ApiProperty({ type: [String], format: "uuid" })
  @IsArray()
  @ArrayMaxSize(10000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  caseIds!: string[];
}
export class FlowEdgeDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() from!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() to!: string;
  @ApiProperty() @IsString() @MaxLength(2000) condition!: string;
}
export class FlowDocumentDto {
  @ApiProperty({ type: [FlowStepDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique((s: FlowStepDto) => s?.id)
  @Type(() => FlowStepDto)
  @ValidateNested({ each: true })
  steps!: FlowStepDto[];
  @ApiProperty({ type: [FlowEdgeDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ArrayUnique((e: FlowEdgeDto) => e?.id)
  @Type(() => FlowEdgeDto)
  @ValidateNested({ each: true })
  edges!: FlowEdgeDto[];
}
export class CanvasPositionDto {
  @ApiProperty() @IsString() @MaxLength(1000) id!: string;
  @ApiProperty() @IsNumber() x!: number;
  @ApiProperty() @IsNumber() y!: number;
}
export class CanvasLayoutDto {
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  groupBy!: string | null;
  @ApiProperty({ type: [CanvasPositionDto] })
  @IsArray()
  @ArrayMaxSize(30000)
  @ArrayUnique((p: CanvasPositionDto) => p?.id)
  @Type(() => CanvasPositionDto)
  @ValidateNested({ each: true })
  positions!: CanvasPositionDto[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ArrayUnique()
  @IsString({ each: true })
  collapsed!: string[];
}
export class CanvasBackupDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ type: FlowDocumentDto }) flow!: FlowDocumentDto;
  @ApiProperty({ type: CanvasLayoutDto }) layout!: CanvasLayoutDto;
  @ApiProperty({ type: "object", additionalProperties: { type: "string" } })
  caseLabels!: Record<string, string>;
}
export class CanvasSnapshotDto {
  @ApiProperty({ type: "integer" }) flowRevision!: number;
  @ApiProperty({ type: "integer" }) layoutRevision!: number;
  @ApiProperty({ type: FlowDocumentDto }) flow!: FlowDocumentDto;
  @ApiProperty({ type: CanvasLayoutDto }) layout!: CanvasLayoutDto;
  @ApiProperty({ type: CanvasBackupDto, nullable: true })
  previous!: CanvasBackupDto | null;
}
export class SaveFlowDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  contentRevision!: number;
  @ApiProperty({ type: FlowDocumentDto })
  @Type(() => FlowDocumentDto)
  @ValidateNested()
  @IsObject()
  flow!: FlowDocumentDto;
}
export class SaveCanvasLayoutDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({ type: CanvasLayoutDto })
  @Type(() => CanvasLayoutDto)
  @ValidateNested()
  @IsObject()
  layout!: CanvasLayoutDto;
}
export class ReplaceFlowDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  flowRevision!: number;
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  layoutRevision!: number;
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  contentRevision!: number;
  @ApiProperty({ type: FlowDocumentDto })
  @Type(() => FlowDocumentDto)
  @ValidateNested()
  @IsObject()
  flow!: FlowDocumentDto;
  @ApiProperty({ type: CanvasLayoutDto })
  @Type(() => CanvasLayoutDto)
  @ValidateNested()
  @IsObject()
  layout!: CanvasLayoutDto;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  jobId?: string;
}
export class RestoreFlowDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() backupId!: string;
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  flowRevision!: number;
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  layoutRevision!: number;
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  contentRevision!: number;
}
export class StartFlowGenerationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() clientRequestId!: string;
  @ApiProperty({ enum: ["anthropic", "openai"] })
  @IsIn(["anthropic", "openai"])
  provider!: "anthropic" | "openai";
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  contentRevision!: number;
  @ApiProperty() @IsString() @MaxLength(10000) description!: string;
}
export class FlowGenerationDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: ["running", "succeeded", "failed"] }) status!:
    | "running"
    | "succeeded"
    | "failed";
  @ApiProperty({ enum: ["anthropic", "openai"] }) provider!:
    | "anthropic"
    | "openai";
  @ApiProperty({ type: "integer" }) contentRevision!: number;
  @ApiProperty({ type: "integer" }) flowRevision!: number;
  @ApiProperty({ type: "integer" }) layoutRevision!: number;
  @ApiProperty({ type: FlowDocumentDto, nullable: true })
  result!: FlowDocumentDto | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
}
export class FlowGenerationListDto {
  @ApiProperty({ type: [FlowGenerationDto] }) items!: FlowGenerationDto[];
}
