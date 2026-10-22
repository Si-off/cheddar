import {
  ApiProperty,
  ApiPropertyOptional,
  type ApiPropertyOptions,
  getSchemaPath,
  OmitType,
  PickType,
} from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { TemplateColumnDto } from "./project.dto";

export class TestSetColumnDto extends OmitType(TemplateColumnDto, [
  "enabled",
] as const) {}

export class RecentTemplateTestSetDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
export class RecentTemplateDto {
  @ApiProperty({ type: RecentTemplateTestSetDto, nullable: true })
  testSet!: RecentTemplateTestSetDto | null;
  @ApiProperty({ type: [TestSetColumnDto] })
  columns!: TestSetColumnDto[];
}

export type CellValue = string | boolean | string[] | null;
export const CELL_SCHEMA = {
  oneOf: [
    { type: "string", maxLength: 20000, nullable: true },
    { type: "boolean" },
    { type: "array", items: { type: "string" }, uniqueItems: true },
  ],
} satisfies ApiPropertyOptions;
const valuesSchema = {
  type: "object",
  additionalProperties: CELL_SCHEMA,
} as const;
const optional = (_: unknown, value: unknown) => value !== undefined;
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ProjectTemplateChoiceDto {
  @ApiProperty({ enum: ["project"] }) @IsIn(["project"]) kind!: "project";
}
export class RecentTemplateChoiceDto {
  @ApiProperty({ enum: ["recent"] }) @IsIn(["recent"]) kind!: "recent";
}
export class CustomTemplateChoiceDto {
  @ApiProperty({ enum: ["custom"] }) @IsIn(["custom"]) kind!: "custom";
  @ApiProperty({ type: [TemplateColumnDto], minItems: 2, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TemplateColumnDto)
  columns!: TemplateColumnDto[];
}
export class CreateTestSetDto {
  @ApiPropertyOptional({
    oneOf: [
      ProjectTemplateChoiceDto,
      RecentTemplateChoiceDto,
      CustomTemplateChoiceDto,
    ].map((dto) => ({ $ref: getSchemaPath(dto) })),
  })
  @ValidateIf(optional)
  @ValidateNested()
  @Type(() => ProjectTemplateChoiceDto, {
    discriminator: {
      property: "kind",
      subTypes: [
        { name: "project", value: ProjectTemplateChoiceDto },
        { name: "recent", value: RecentTemplateChoiceDto },
        { name: "custom", value: CustomTemplateChoiceDto },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  template?:
    | ProjectTemplateChoiceDto
    | RecentTemplateChoiceDto
    | CustomTemplateChoiceDto;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() projectId!: string;
  @ApiPropertyOptional({ type: String, maxLength: 5000, default: "" })
  @IsString()
  @MaxLength(5000)
  memo = "";
}
export class UpdateTestSetDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(5000)
  memo?: string;
}
export class TestSetQueryDto {
  @ApiPropertyOptional({ enum: ["all", "mine"], default: "all" })
  @IsIn(["all", "mine"])
  filter: "all" | "mine" = "all";
  @ApiPropertyOptional({ type: String, default: "" }) @IsString() search = "";
}
export class SetCellOpDto {
  @ApiProperty({ enum: ["set_cell"] }) @IsIn(["set_cell"]) type!: "set_cell";
  @ApiProperty({ format: "uuid" }) @IsUUID() caseId!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() columnId!: string;
  @ApiProperty({ ...CELL_SCHEMA }) @ValidateIf(() => false) value!: CellValue;
}
export class AddCaseOpDto {
  @ApiProperty({ enum: ["add_case"] }) @IsIn(["add_case"]) type!: "add_case";
  @ApiProperty({ format: "uuid" }) @IsUUID() caseId!: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  afterCaseId!: string | null;
  @ApiPropertyOptional(valuesSchema)
  @ValidateIf(optional)
  @IsObject()
  values?: Record<string, CellValue>;
}
export class DeleteCasesOpDto {
  @ApiProperty({ enum: ["delete_cases"] })
  @IsIn(["delete_cases"])
  type!: "delete_cases";
  @ApiProperty({ type: [String], format: "uuid" })
  @IsArray()
  @IsUUID("all", { each: true })
  caseIds!: string[];
}
export class MoveCaseOpDto {
  @ApiProperty({ enum: ["move_case"] }) @IsIn(["move_case"]) type!: "move_case";
  @ApiProperty({ format: "uuid" }) @IsUUID() caseId!: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  afterCaseId!: string | null;
}
export class AddColumnDefinitionDto extends PickType(TemplateColumnDto, [
  "name",
  "type",
  "description",
  "options",
  "presetKey",
] as const) {}
export class AddColumnOpDto {
  @ApiProperty({ enum: ["add_column"] })
  @IsIn(["add_column"])
  type!: "add_column";
  @ApiProperty({ format: "uuid" }) @IsUUID() columnId!: string;
  @ApiProperty({ type: AddColumnDefinitionDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AddColumnDefinitionDto)
  column!: AddColumnDefinitionDto;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  afterColumnId!: string | null;
}
export class UpdateColumnOpDto {
  @ApiProperty({ enum: ["update_column"] })
  @IsIn(["update_column"])
  type!: "update_column";
  @ApiProperty({ format: "uuid" }) @IsUUID() columnId!: string;
  @ApiProperty({ minLength: 1, maxLength: 50 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  description!: string;
  @ApiProperty({
    type: [String],
    required: false,
    description:
      "선택과 태그 열의 항목. 없으면 바꾸지 않는다. 규칙은 양식의 options와 같다. 기존 셀 값은 바꾸지 않는다",
  })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === "string" ? v.trim() : v))
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}
export class RemoveColumnOpDto {
  @ApiProperty({ enum: ["remove_column"] })
  @IsIn(["remove_column"])
  type!: "remove_column";
  @ApiProperty({ format: "uuid" }) @IsUUID() columnId!: string;
}
export class ReorderColumnsOpDto {
  @ApiProperty({ enum: ["reorder_columns"] })
  @IsIn(["reorder_columns"])
  type!: "reorder_columns";
  @ApiProperty({ type: [String], format: "uuid" })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  columnIds!: string[];
}
export type CaseOp =
  | UpdateColumnOpDto
  | AddColumnOpDto
  | RemoveColumnOpDto
  | ReorderColumnsOpDto
  | SetCellOpDto
  | AddCaseOpDto
  | DeleteCasesOpDto
  | MoveCaseOpDto;
export class ApplyOpsDto {
  @ApiProperty({
    type: "array",
    minItems: 1,
    maxItems: 500,
    items: {
      oneOf: [
        SetCellOpDto,
        AddCaseOpDto,
        DeleteCasesOpDto,
        MoveCaseOpDto,
        UpdateColumnOpDto,
        AddColumnOpDto,
        RemoveColumnOpDto,
        ReorderColumnsOpDto,
      ].map((dto) => ({ $ref: getSchemaPath(dto) })),
    },
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  ops!: CaseOp[];
}
export class TestSetViewDto {
  @ApiProperty({ enum: ["table", "card"] }) @IsIn(["table", "card"]) view!:
    | "table"
    | "card";
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  groupByColumnId!: string | null;
  @ApiProperty({
    type: "object",
    additionalProperties: { type: "integer", minimum: 40, maximum: 2000 },
  })
  @IsObject()
  columnWidths!: Record<string, number>;
  @ApiProperty({
    type: "object",
    additionalProperties: { type: "integer", minimum: 24, maximum: 2000 },
  })
  @IsObject()
  rowHeights!: Record<string, number>;
}
export class TestSetPersonDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
export class TestSetAccessDto {
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canRename!: boolean;
  @ApiProperty() canDelete!: boolean;
  @ApiProperty() canExport!: boolean;
}
export class CaseDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty(valuesSchema) values!: Record<string, CellValue>;
}
export class TestSetSummaryDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: TestSetPersonDto }) owner!: TestSetPersonDto;
  @ApiProperty() isPublic!: boolean;
  @ApiProperty({ type: "integer" }) caseCount!: number;
  @ApiProperty({ type: "integer" }) reviewCount!: number;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
export class TestSetListDto {
  @ApiProperty({ type: [TestSetSummaryDto] }) items!: TestSetSummaryDto[];
}
export class TestSetDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() memo!: string;
  @ApiProperty({ type: TestSetPersonDto }) project!: TestSetPersonDto;
  @ApiProperty({ type: TestSetPersonDto }) owner!: TestSetPersonDto;
  @ApiProperty() isPublic!: boolean;
  @ApiProperty({ type: "integer" }) version!: number;
  @ApiProperty({ type: TestSetAccessDto }) access!: TestSetAccessDto;
  @ApiProperty({ type: [TestSetColumnDto] }) columns!: TestSetColumnDto[];
  @ApiProperty({ type: [CaseDto] }) cases!: CaseDto[];
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
export class OpsResultDto {
  @ApiProperty({ type: "integer" }) version!: number;
  @ApiProperty({ type: [CaseDto] }) cases!: CaseDto[];
  @ApiProperty({ type: [String], format: "uuid" }) deletedCaseIds!: string[];
}
