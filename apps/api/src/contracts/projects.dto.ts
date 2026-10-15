import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateProjectDto {
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
}
export class UpdateProjectDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
export class ProjectDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ minLength: 1, maxLength: 100 }) name!: string;
  @ApiProperty({ type: String, nullable: true, maxLength: 2000 }) description!:
    | string
    | null;
  @ApiProperty({ type: "integer", minimum: 1 }) revision!: number;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
export class ProjectPageDto {
  @ApiProperty({ type: [ProjectDto] }) items!: ProjectDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
