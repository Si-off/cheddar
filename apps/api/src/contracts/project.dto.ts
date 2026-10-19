import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
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
export class CreateRequiredCaseDto {
  @ApiProperty({ minLength: 1, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;
}
export class UpdateRequiredCaseDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 300 })
  @ValidateIf(optional)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description?: string;
  @ApiPropertyOptional() @ValidateIf(optional) @IsBoolean() enabled?: boolean;
}
export class CreateScreenDto {
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
export class RequiredCaseDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() description!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() isDefault!: boolean;
}
export class RequiredCaseListDto {
  @ApiProperty({ type: [RequiredCaseDto] }) items!: RequiredCaseDto[];
}
export class ScreenDto {
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
