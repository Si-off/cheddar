import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

import { PageQueryDto } from "./common.dto";

export const SYSTEM_FIELDS = ["caseCode", "title"] as const;
export const VALUE_TYPES = ["text", "select", "checkbox", "tags"] as const;
export type ColumnValue = string | boolean | string[] | null;
export class ColumnOptionDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
export class TestScenarioColumnDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ enum: ["system", "custom"] })
  @IsIn(["system", "custom"])
  kind!: "system" | "custom";
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiPropertyOptional({ enum: SYSTEM_FIELDS })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(SYSTEM_FIELDS)
  field?: (typeof SYSTEM_FIELDS)[number];
  @ApiPropertyOptional({ enum: VALUE_TYPES })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(VALUE_TYPES)
  valueType?: (typeof VALUE_TYPES)[number];
  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ type: [ColumnOptionDto] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayUnique((option: ColumnOptionDto) => option?.id)
  @Type(() => ColumnOptionDto)
  @ValidateNested({ each: true })
  options?: ColumnOptionDto[];
}
export function validColumnValue(
  column: TestScenarioColumnDto,
  value: unknown,
): boolean {
  const ids = new Set(column.options?.map((option) => option.id));
  switch (column.valueType) {
    case "text":
      return typeof value === "string";
    case "checkbox":
      return typeof value === "boolean";
    case "select":
      return value === null || (typeof value === "string" && ids.has(value));
    case "tags":
      return (
        Array.isArray(value) &&
        new Set(value).size === value.length &&
        value.every((id) => typeof id === "string" && ids.has(id))
      );
    default:
      return false;
  }
}
export class CaseContentDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  caseCode!: string;
  @ApiProperty() @IsString() title!: string;
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
    additionalProperties: {
      oneOf: [
        { type: "string", nullable: true },
        { type: "boolean" },
        { type: "array", items: { type: "string" } },
      ],
    },
    description: "Keys are custom column UUIDs, not labels or positions.",
  })
  @IsObject()
  customValues!: Record<string, ColumnValue>;
}

export function validColumns(
  columns: unknown,
): columns is TestScenarioColumnDto[] {
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
          ? c.valueType === undefined && c.options === undefined
          : c.kind === "custom" &&
            c.field === undefined &&
            VALUE_TYPES.includes(c.valueType) &&
            (["select", "tags"].includes(c.valueType)
              ? Array.isArray(c.options) &&
                c.options.every(
                  (o: ColumnOptionDto) =>
                    o &&
                    typeof o.id === "string" &&
                    typeof o.name === "string" &&
                    !!o.name.trim(),
                ) &&
                new Set(c.options.map((o: ColumnOptionDto) => o.id)).size ===
                  c.options.length &&
                new Set(c.options.map((o: ColumnOptionDto) => o.name.trim()))
                  .size === c.options.length &&
                c.options.every((o: ColumnOptionDto) => !!o.name.trim())
              : c.options === undefined)),
    )
  );
}
@ValidatorConstraint({ name: "testScenarioContent", async: false })
export class TestScenarioContentRules implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: { object: object }) {
    if (!args) return false;
    const content = args.object as TestScenarioContentDto;
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
            ([key, value]) =>
              columnIds.has(key) &&
              validColumnValue(
                content.columns.find(
                  (column) => column.id === key,
                ) as TestScenarioColumnDto,
                value,
              ),
          ),
      )
    );
  }
  defaultMessage() {
    return "TestScenario columns, case codes and custom values must be consistent.";
  }
}
export class TestScenarioContentDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({
    type: [TestScenarioColumnDto],
    description:
      "ID and title once; other columns use text, select, checkbox or tags.",
  })
  @IsArray()
  @ArrayUnique((c: TestScenarioColumnDto) => c?.id)
  @Type(() => TestScenarioColumnDto)
  @ValidateNested({ each: true })
  columns!: TestScenarioColumnDto[];
  @ApiProperty({ type: [CaseContentDto] })
  @IsArray()
  @ArrayUnique((c: CaseContentDto) => c?.id)
  @Type(() => CaseContentDto)
  @ValidateNested({ each: true })
  @Validate(TestScenarioContentRules)
  cases!: CaseContentDto[];
}
export class ColumnViewDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() columnId!: string;
  @ApiProperty({ type: "integer", minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  width!: number;
}
export class TestScenarioViewDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
  @ApiProperty({
    type: [ColumnViewDto],
    description:
      "Array order is display order. IDs must exactly match the testScenario columns.",
  })
  @IsArray()
  @ArrayUnique((c: ColumnViewDto) => c?.columnId)
  @Type(() => ColumnViewDto)
  @ValidateNested({ each: true })
  columns!: ColumnViewDto[];
}
export class CreateTestScenarioDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
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

export class TestScenarioPageQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  uploadId?: string;
}
export class TestScenarioExportQueryDto {
  @ApiPropertyOptional({ type: "integer", minimum: 1 })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentRevision?: number;
  @ApiPropertyOptional({ type: "integer", minimum: 1 })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  viewRevision?: number;
}
export class TestScenarioSummaryDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) projectId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ["unit", "integration"] }) kind!: "unit" | "integration";
  @ApiProperty({ type: String, format: "uuid", nullable: true }) uploadId!:
    | string
    | null;
  @ApiProperty({ type: "integer", minimum: 1 }) contentRevision!: number;
  @ApiProperty({ type: "integer", minimum: 1 }) viewRevision!: number;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
export class TestScenarioPageDto {
  @ApiProperty({ type: [TestScenarioSummaryDto] })
  items!: TestScenarioSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class FrameReferenceDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) uploadId!: string;
  @ApiProperty() figmaFileKey!: string;
  @ApiProperty() figmaNodeId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: "uuid" }) imageFileId!: string;
  @ApiProperty({ format: "uuid" }) dataFileId!: string;
}
export class IaReferenceDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() screenId!: string;
  @ApiProperty() name!: string;
}
export class TestScenarioReferencesDto {
  @ApiProperty({ type: [FrameReferenceDto] }) frames!: FrameReferenceDto[];
  @ApiProperty({ type: [IaReferenceDto] }) iaItems!: IaReferenceDto[];
}
export class TestScenarioSnapshotDto extends TestScenarioSummaryDto {
  @ApiProperty({ type: "integer", minimum: 1 }) sourceTemplateRevision!: number;
  @ApiProperty({ type: [TestScenarioColumnDto] })
  columns!: TestScenarioColumnDto[];
  @ApiProperty({ type: [CaseContentDto] }) cases!: CaseContentDto[];
  @ApiProperty({ type: [ColumnViewDto] }) view!: ColumnViewDto[];
  @ApiProperty({ type: TestScenarioReferencesDto })
  references!: TestScenarioReferencesDto;
}
