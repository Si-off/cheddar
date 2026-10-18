import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  PERMISSIONS,
  type Permission,
  SCOPES,
  type Scope,
} from "../authorization/permissions";

const optional = (_: unknown, v: unknown) => v !== undefined;
export const ACCOUNT_STATUSES = [
  "invited",
  "active",
  "expired",
  "inactive",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export class LoginDto {
  @ApiProperty({ format: "email", maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
export class TokenQueryDto {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @MinLength(43)
  @MaxLength(43)
  token!: string;
}
export class SetPasswordDto extends TokenQueryDto {
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class AssignmentDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() roleId!: string;
  @ApiProperty({ enum: SCOPES }) @IsIn(SCOPES) scope!: Scope;
  @ApiProperty({ type: [String], format: "uuid", maxItems: 100 })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  projectIds!: string[];
}
export class CreateAccountDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({ format: "email", maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() affiliationId!: string;
  @ApiProperty({ type: [AssignmentDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AssignmentDto)
  assignments!: AssignmentDto[];
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsDateString()
  expiresAt?: string | null;
}
export class UpdateAccountDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(optional)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ format: "email", maxLength: 254 })
  @ValidateIf(optional)
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf(optional)
  @IsUUID()
  affiliationId?: string;
  @ApiPropertyOptional({ type: [AssignmentDto], maxItems: 100 })
  @ValidateIf(optional)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AssignmentDto)
  assignments?: AssignmentDto[];
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsDateString()
  expiresAt?: string | null;
}
export class AccountQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf(optional)
  @IsUUID()
  roleId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf(optional)
  @IsUUID()
  affiliationId?: string;
  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES })
  @ValidateIf(optional)
  @IsIn(ACCOUNT_STATUSES)
  status?: AccountStatus;
  @ApiPropertyOptional({
    type: "integer",
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
  @ApiPropertyOptional({
    type: "integer",
    default: 0,
    minimum: 0,
    maximum: 1000000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset = 0;
}
export class CreateRoleDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions!: Permission[];
  @ApiProperty() @IsBoolean() requiresExpiry!: boolean;
  @ApiProperty({ type: "integer", minimum: 1, maximum: 36500, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(36500)
  defaultExpiryDays!: number | null;
}
export class UpdateRoleDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(optional)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ enum: PERMISSIONS, isArray: true })
  @ValidateIf(optional)
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions?: Permission[];
  @ApiPropertyOptional()
  @ValidateIf(optional)
  @IsBoolean()
  requiresExpiry?: boolean;
  @ApiPropertyOptional({
    type: "integer",
    minimum: 1,
    maximum: 36500,
    nullable: true,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(36500)
  defaultExpiryDays?: number | null;
}
export class NameDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
export class AffiliationDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
export class RoleDto extends AffiliationDto {
  @ApiProperty() fixed!: boolean;
  @ApiProperty() requiresExpiry!: boolean;
  @ApiProperty({ type: "integer", nullable: true }) defaultExpiryDays!:
    | number
    | null;
  @ApiProperty({ enum: PERMISSIONS, isArray: true }) permissions!: Permission[];
}
export class AccountDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty({ type: AffiliationDto }) affiliation!: AffiliationDto;
  @ApiProperty({ enum: ACCOUNT_STATUSES }) status!: AccountStatus;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  expiresAt!: string | null;
  @ApiProperty({ type: [AssignmentDto] }) assignments!: AssignmentDto[];
  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "만료일 필수 역할의 기본 기간 중 최솟값",
  })
  defaultExpiryDays!: number | null;
}
export class AccountPageDto {
  @ApiProperty({ type: [AccountDto] }) items!: AccountDto[];
  @ApiProperty({ type: "integer" }) total!: number;
}
export class IssuedTokenDto {
  @ApiProperty({ description: "링크에 넣을 토큰. 발급 응답에서만 제공한다." })
  token!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
}
export class AccountInvitationDto extends IssuedTokenDto {
  @ApiProperty({ type: AccountDto }) account!: AccountDto;
}
export class TokenInfoDto {
  @ApiProperty() name!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
}
export class EffectivePermissionDto {
  @ApiProperty({ enum: PERMISSIONS }) permission!: Permission;
  @ApiProperty({ enum: SCOPES }) scope!: Scope;
  @ApiProperty({ type: [String], format: "uuid" }) projectIds!: string[];
}
export class MeDto extends AccountDto {
  @ApiProperty({ type: [EffectivePermissionDto] })
  permissions!: EffectivePermissionDto[];
}
