import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsIn,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { CaseDto, CELL_SCHEMA, type CellValue } from "./test-set.dto";

const optional = (_: unknown, value: unknown) => value !== undefined;
const draftSchema = {
  type: "object",
  additionalProperties: CELL_SCHEMA,
} as const;
export class CreateGenerationDto {
  @ApiPropertyOptional({
    format: "uuid",
    description: "같은 요청을 재전송할 때 사용하는 식별자",
  })
  @ValidateIf(optional)
  @IsUUID()
  clientRequestId?: string;
  @ApiProperty({ enum: ["initial", "append"] })
  @IsIn(["initial", "append"])
  kind!: "initial" | "append";
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf(optional)
  @IsUUID()
  uploadId?: string;
  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @ValidateIf(optional)
  @IsArray()
  @IsUUID("all", { each: true })
  frameIds?: string[];
  @ApiPropertyOptional({ maxLength: 10000 })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(10000)
  memo?: string;
}
export class GenerationAcceptedDto {
  @ApiProperty({ format: "uuid" }) jobId!: string;
}
export class GenerationCurrentDto extends GenerationAcceptedDto {
  @ApiProperty({ enum: ["initial", "append", "rewrite", "fill_column"] })
  kind!: string;
  @ApiProperty({ enum: ["queued", "running", "succeeded", "failed"] }) status!:
    | "queued"
    | "running"
    | "succeeded"
    | "failed";
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ["screens", "flows", "cases", "finish"],
  })
  stage!: string | null;
  @ApiProperty() addedCount!: number;
  @ApiProperty() reviewCount!: number;
  @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;
}
export class ReviewItemDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: String, nullable: true }) question!: string | null;
  @ApiProperty() answer!: string;
  @ApiProperty(draftSchema) draft!: Record<string, CellValue>;
  @ApiProperty({ enum: ["pending", "rewriting", "excluded", "resolved"] })
  status!: "pending" | "rewriting" | "excluded" | "resolved";
}
export class ReviewItemsDto {
  @ApiProperty({ type: [ReviewItemDto] }) items!: ReviewItemDto[];
}
export class PatchReviewItemDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(2000)
  answer?: string;
  @ApiPropertyOptional(draftSchema)
  @ValidateIf(optional)
  @IsObject()
  draft?: Record<string, CellValue>;
  @ApiPropertyOptional({ enum: ["pending", "excluded"] })
  @ValidateIf(optional)
  @IsIn(["pending", "excluded"])
  status?: "pending" | "excluded";
}
export class AcceptReviewItemDto {
  @ApiProperty(draftSchema) @IsObject() draft!: Record<string, CellValue>;
}
export class RewriteReviewItemDto {
  @ApiPropertyOptional({
    format: "uuid",
    description: "같은 요청을 재전송할 때 사용하는 식별자",
  })
  @ValidateIf(optional)
  @IsUUID()
  clientRequestId?: string;
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer!: string;
}
export class AcceptReviewResultDto {
  @ApiProperty({ type: ReviewItemDto }) item!: ReviewItemDto;
  @ApiProperty({ type: CaseDto }) case!: CaseDto;
  @ApiProperty() version!: number;
}
