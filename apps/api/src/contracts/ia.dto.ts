import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";
import { ColumnViewDto, SheetColumnDto, validColumns } from "./sheets.dto";

export class CreateIaItemDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 100,
    description: "Case-sensitive business identifier, not a Figma node ID.",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  screenId!: string;
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  parentId?: string | null;
  @ApiProperty({ type: "integer", minimum: 0 })
  @IsInt()
  @Min(0)
  position!: number;
}
export class UpdateIaItemDto extends CreateIaItemDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
@ValidatorConstraint({ name: "templateColumns", async: false })
export class TemplateRules implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: { object: object }) {
    if (!args) return false;
    const value = args.object as UpdateTemplateDto;
    if (!validColumns(value.columns) || !Array.isArray(value.view))
      return false;
    return (
      value.view.length === value.columns.length &&
      value.view.every((c) =>
        value.columns.some((column) => column.id === c?.columnId),
      )
    );
  }
  defaultMessage() {
    return "Template columns and display settings must match.";
  }
}
export class UpdateTemplateDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({ type: [SheetColumnDto] })
  @IsArray()
  @Type(() => SheetColumnDto)
  @ValidateNested({ each: true })
  columns!: SheetColumnDto[];
  @ApiProperty({ type: [ColumnViewDto] })
  @IsArray()
  @ArrayUnique((c: ColumnViewDto) => c?.columnId)
  @Type(() => ColumnViewDto)
  @ValidateNested({ each: true })
  @Validate(TemplateRules)
  view!: ColumnViewDto[];
}
