import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
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
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
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
export class UpdateIaItemDto extends PartialType(CreateIaItemDto, {
  skipNullProperties: false,
}) {
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

export class DeleteIaQueryDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
export class IaItemDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) projectId!: string;
  @ApiProperty() screenId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true }) parentId!:
    | string
    | null;
  @ApiProperty({ type: "integer", minimum: 0 }) position!: number;
  @ApiProperty({ type: "integer", minimum: 1 }) revision!: number;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
export class IaPageDto {
  @ApiProperty({ type: [IaItemDto] }) items!: IaItemDto[];
}
export class ProjectTemplateDto {
  @ApiProperty({ format: "uuid" }) projectId!: string;
  @ApiProperty({ type: [SheetColumnDto] }) columns!: SheetColumnDto[];
  @ApiProperty({ type: [ColumnViewDto] }) view!: ColumnViewDto[];
  @ApiProperty({ type: "integer", minimum: 1 }) revision!: number;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
