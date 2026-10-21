import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

const optional = (_: unknown, value: unknown) => value !== undefined;
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiPropertyOptional({
    type: String,
    minLength: 0,
    maxLength: 2000,
    default: "",
  })
  @Transform(trim)
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  description = "";
}
export class UpdateProjectDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ minLength: 0, maxLength: 2000 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  description?: string;
}
export class CreateFeatureGroupDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({ minLength: 0, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  description!: string;
}
export class UpdateFeatureGroupDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ minLength: 0, maxLength: 2000 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  description?: string;
}
export const SCREEN_TYPES = ["page", "popup", "bottom_sheet", "tab"] as const;
export class CreateScreenDto {
  @ApiPropertyOptional({ enum: SCREEN_TYPES, default: "page" })
  @ValidateIf(optional)
  @IsIn(SCREEN_TYPES)
  type?: (typeof SCREEN_TYPES)[number];
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  screenId!: string;
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
  @ApiProperty({ minLength: 0, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  description!: string;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsUUID()
  parentId?: string | null;
}
export class UpdateScreenDto {
  @ApiPropertyOptional({ enum: SCREEN_TYPES, default: "page" })
  @ValidateIf(optional)
  @IsIn(SCREEN_TYPES)
  type?: (typeof SCREEN_TYPES)[number];
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  screenId?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional({ minLength: 0, maxLength: 2000 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsUUID()
  parentId?: string | null;
}
export class UpdateMemoDto {
  @ApiProperty({ minLength: 0, maxLength: 20000 })
  @Transform(trim)
  @IsString()
  @MinLength(0)
  @MaxLength(20000)
  body!: string;
}
export class FeatureGroupOrderDto {
  @ApiProperty({ type: [String], format: "uuid" })
  @IsArray()
  @IsUUID("all", { each: true })
  ids!: string[];
}
export const COLUMN_TYPES = ["text", "select", "checkbox", "tags"] as const;
export class TemplateColumnDto {
  @ApiProperty({ type: String, nullable: true, maxLength: 40 })
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  presetKey!: string | null;
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({
    type: String,
    enum: ["test_id", "title", null],
    nullable: true,
  })
  @IsIn(["test_id", "title", null])
  systemKey!: "test_id" | "title" | null;
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({ enum: COLUMN_TYPES })
  @IsIn(COLUMN_TYPES)
  type!: (typeof COLUMN_TYPES)[number];
  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description!: string;
  @ApiProperty({
    type: [String],
    description:
      "선택과 태그는 공백 제거 후 1~50개, 각 1~100자이며 중복 불가. 텍스트와 체크박스는 빈 배열로 저장",
  })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === "string" ? v.trim() : v))
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  options!: string[];
}
export class UpdateTemplateDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;
  @ApiProperty({ type: [TemplateColumnDto], minItems: 2, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TemplateColumnDto)
  columns!: TemplateColumnDto[];
}
export class TemplateDto {
  @ApiProperty({ type: "integer", minimum: 1 }) revision!: number;
  @ApiProperty({ type: [TemplateColumnDto] }) columns!: TemplateColumnDto[];
}
export class ProjectDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() canManage!: boolean;
}
export class ProjectSummaryDto extends ProjectDto {
  @ApiProperty({ type: "integer" }) columnCount!: number;
  @ApiProperty({ type: "integer" }) screenCount!: number;
}
export class ProjectListDto {
  @ApiProperty({ type: [ProjectSummaryDto] }) items!: ProjectSummaryDto[];
}
export class FeatureGroupDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
}
export class FeatureGroupListDto {
  @ApiProperty({ type: [FeatureGroupDto] }) items!: FeatureGroupDto[];
}
export class ScreenDto {
  @ApiProperty({ enum: SCREEN_TYPES }) type!: (typeof SCREEN_TYPES)[number];
  @ApiProperty() ruleMismatch!: boolean;
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() screenId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true }) parentId!:
    | string
    | null;
  @ApiProperty() description!: string;
}
export class ScreenListDto {
  @ApiProperty({ type: [ScreenDto] }) items!: ScreenDto[];
}
export class MemoAuthorDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
export class MemoDto {
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  updatedAt!: string | null;
  // 안쪽 required 배열이 속성 자체의 필수 여부를 덮지 않도록 selfRequired를 둔다
  @ApiProperty({
    type: "object",
    nullable: true,
    selfRequired: true,
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
    },
    required: ["id", "name"],
    additionalProperties: false,
  })
  updatedBy!: MemoAuthorDto | null;
}

export class ScreenIdRuleCodeDto {
  @ApiProperty({ minLength: 1, maxLength: 40, pattern: "^[A-Za-z0-9_-]+$" })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  meaning!: string;
}
export class ScreenIdRulePartDto {
  @ApiProperty({ minLength: 1, maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
  @ApiProperty({ enum: ["list", "fixed", "number"] })
  @IsIn(["list", "fixed", "number"])
  kind!: "list" | "fixed" | "number";
  @ApiProperty({ type: [ScreenIdRuleCodeDto] })
  @IsArray()
  @ArrayUnique((item: ScreenIdRuleCodeDto) => item?.code)
  @ValidateNested({ each: true })
  @Type(() => ScreenIdRuleCodeDto)
  codes!: ScreenIdRuleCodeDto[];
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  value!: string;
  @ApiProperty({ type: "integer", minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  digits!: number;
}
export class CreateScreenIdRuleDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiPropertyOptional({ default: "_", maxLength: 3 })
  @IsString()
  @MaxLength(3)
  separator = "_";
  @ApiProperty({ type: [ScreenIdRulePartDto], minItems: 1, maxItems: 8 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ScreenIdRulePartDto)
  parts!: ScreenIdRulePartDto[];
}
export class UpdateScreenIdRuleDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ maxLength: 3 })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(3)
  separator?: string;
  @ApiPropertyOptional({
    type: [ScreenIdRulePartDto],
    minItems: 1,
    maxItems: 8,
  })
  @ValidateIf(optional)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ScreenIdRulePartDto)
  parts?: ScreenIdRulePartDto[];
}
export class ScreenIdRuleDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() separator!: string;
  @ApiProperty({ type: [ScreenIdRulePartDto] }) parts!: ScreenIdRulePartDto[];
  @ApiProperty() example!: string;
}
export class ScreenIdRuleListDto {
  @ApiProperty({ type: [ScreenIdRuleDto] }) items!: ScreenIdRuleDto[];
}
export class NextScreenIdDto {
  @ApiProperty({ type: String, nullable: true }) screenId!: string | null;
}
export class ImportScreensResultDto {
  @ApiProperty({ type: "integer" }) created!: number;
  @ApiProperty({ type: "integer" }) skipped!: number;
}
