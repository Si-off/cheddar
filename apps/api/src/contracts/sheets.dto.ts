import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
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

export const SYSTEM_FIELDS = [
  "caseCode",
  "title",
  "preconditions",
  "steps",
  "expectedResult",
  "priority",
  "relatedFrames",
  "screens",
] as const;
export class SheetColumnDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ enum: ["system", "custom"] })
  @IsIn(["system", "custom"])
  kind!: "system" | "custom";
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiPropertyOptional({ enum: SYSTEM_FIELDS })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(SYSTEM_FIELDS)
  field?: (typeof SYSTEM_FIELDS)[number];
  @ApiPropertyOptional({ enum: ["text"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["text"])
  valueType?: "text";
}
export class CaseContentDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  caseCode!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() preconditions!: string;
  @ApiProperty() @IsString() steps!: string;
  @ApiProperty() @IsString() expectedResult!: string;
  @ApiProperty({
    type: String,
    enum: ["high", "medium", "low", null],
    nullable: true,
  })
  @ValidateIf((_o, v) => v !== null)
  @IsIn(["high", "medium", "low"])
  priority!: "high" | "medium" | "low" | null;
  @ApiProperty({ type: "array", items: { type: "string", format: "uuid" } })
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  relatedFrameIds!: string[];
  @ApiProperty({ type: "array", items: { type: "string", format: "uuid" } })
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  screenIds!: string[];
  @ApiProperty({
    type: "object",
    additionalProperties: { type: "string" },
    description: "Keys are custom column UUIDs, not labels or positions.",
  })
  @IsObject()
  customValues!: Record<string, string>;
}

export function validColumns(columns: unknown): columns is SheetColumnDto[] {
  if (
    !Array.isArray(columns) ||
    new Set(columns.map((c) => c?.id)).size !== columns.length
  )
    return false;
  const system = columns.filter((c) => c?.kind === "system");
  return (
    system.length === SYSTEM_FIELDS.length &&
    SYSTEM_FIELDS.every(
      (field) => system.filter((c) => c.field === field).length === 1,
    ) &&
    columns.every(
      (c) =>
        c &&
        (c.kind === "system"
          ? c.valueType === undefined
          : c.kind === "custom" &&
            c.field === undefined &&
            c.valueType === "text"),
    )
  );
}
@ValidatorConstraint({ name: "sheetContent", async: false })
export class SheetContentRules implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: { object: object }) {
    if (!args) return false;
    const content = args.object as SheetContentDto;
    if (!validColumns(content.columns) || !Array.isArray(content.cases))
      return false;
    const columnIds = new Set(
      content.columns.filter((c) => c.kind === "custom").map((c) => c?.id),
    );
    const codes = content.cases.map((c) => c?.caseCode).filter(Boolean);
    return (
      new Set(codes).size === codes.length &&
      content.cases.every(
        (c) =>
          c?.customValues &&
          typeof c.customValues === "object" &&
          Object.entries(c.customValues).every(
            ([key, value]) => columnIds.has(key) && typeof value === "string",
          ),
      )
    );
  }
  defaultMessage() {
    return "Sheet columns, case codes and custom values must be consistent.";
  }
}
export class SheetContentDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({
    type: [SheetColumnDto],
    description: "All system fields once; custom columns have valueType text.",
  })
  @IsArray()
  @ArrayUnique((c: SheetColumnDto) => c?.id)
  @Type(() => SheetColumnDto)
  @ValidateNested({ each: true })
  columns!: SheetColumnDto[];
  @ApiProperty({ type: [CaseContentDto] })
  @IsArray()
  @ArrayUnique((c: CaseContentDto) => c?.id)
  @Type(() => CaseContentDto)
  @ValidateNested({ each: true })
  @Validate(SheetContentRules)
  cases!: CaseContentDto[];
}
export class ColumnViewDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() columnId!: string;
  @ApiProperty({ type: "integer", minimum: 1 }) @IsInt() @Min(1) width!: number;
}
export class SheetViewDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({
    type: [ColumnViewDto],
    description:
      "Array order is display order. IDs must exactly match the sheet columns.",
  })
  @IsArray()
  @ArrayUnique((c: ColumnViewDto) => c?.columnId)
  @Type(() => ColumnViewDto)
  @ValidateNested({ each: true })
  columns!: ColumnViewDto[];
}
export class CreateSheetDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({ enum: ["unit", "integration"] })
  @IsIn(["unit", "integration"])
  kind!: "unit" | "integration";
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  uploadId?: string | null;
}
