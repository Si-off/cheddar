import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

const optional = (_: unknown, v: unknown) => v !== undefined;
/** 새 아이디는 정규화 후 3~64자. 이전 이메일 아이디는 로그인에서 254자까지 허용한다. */
export const LOGIN_ID_PATTERN = /^[a-z0-9._@-]{3,64}$/;
const normalizeLoginId = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;
export const ACCOUNT_ROLES = ["admin", "member"] as const;
export const ACCOUNT_STATUSES = ["active", "inactive"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export class LoginDto {
  @ApiProperty({ minLength: 1, maxLength: 254 })
  @Transform(normalizeLoginId)
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  loginId!: string;
  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
export class PasswordDto {
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class ChangePasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
export class CreateAccountDto extends PasswordDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({
    minLength: 3,
    maxLength: 64,
    pattern: LOGIN_ID_PATTERN.source,
  })
  @Transform(normalizeLoginId)
  @IsString()
  @Matches(LOGIN_ID_PATTERN)
  loginId!: string;
  @ApiProperty({ enum: ACCOUNT_ROLES })
  @IsIn(ACCOUNT_ROLES)
  role!: AccountRole;
}
export class UpdateAccountDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(optional)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ enum: ACCOUNT_ROLES })
  @ValidateIf(optional)
  @IsIn(ACCOUNT_ROLES)
  role?: AccountRole;
}
export class AccountQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ enum: ACCOUNT_ROLES })
  @ValidateIf(optional)
  @IsIn(ACCOUNT_ROLES)
  role?: AccountRole;
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
export class MeDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() loginId!: string;
  @ApiProperty({ enum: ACCOUNT_ROLES }) role!: AccountRole;
  @ApiProperty({ enum: ACCOUNT_STATUSES }) status!: AccountStatus;
}
export class AccountDto extends MeDto {
  @ApiProperty({ format: "date-time" }) createdAt!: string;
}
export class AccountPageDto {
  @ApiProperty({ type: [AccountDto] }) items!: AccountDto[];
  @ApiProperty({ type: "integer" }) total!: number;
}
