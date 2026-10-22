import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { IsIn, IsString, MaxLength, ValidateIf } from "class-validator";
import { TestSetDto } from "./test-set.dto";

export class SharingPersonDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() loginId!: string;
  @ApiProperty({ type: String, nullable: true }) affiliation!: string | null;
}
export class SharingMemberDto {
  @ApiProperty({ type: SharingPersonDto }) person!: SharingPersonDto;
  @ApiProperty({ enum: ["view", "edit"] }) access!: "view" | "edit";
}
export class SharingDto {
  @ApiProperty({ enum: ["private", "public"] }) visibility!:
    | "private"
    | "public";
  @ApiProperty({ enum: ["view", "edit"] }) linkAccess!: "view" | "edit";
  @ApiProperty({ type: String, nullable: true }) linkToken!: string | null;
  @ApiProperty() canInvite!: boolean;
  @ApiProperty() canManageLink!: boolean;
  @ApiProperty({ type: SharingPersonDto }) owner!: SharingPersonDto;
  @ApiProperty({ type: [SharingMemberDto] }) members!: SharingMemberDto[];
}
export class PatchSharingDto {
  @ApiPropertyOptional({ enum: ["private", "public"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["private", "public"])
  visibility?: "private" | "public";
  @ApiPropertyOptional({ enum: ["view", "edit"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["view", "edit"])
  linkAccess?: "view" | "edit";
}
export class MemberAccessDto {
  @ApiProperty({ enum: ["view", "edit"] }) @IsIn(["view", "edit"]) access!:
    | "view"
    | "edit";
}
export class SharingCandidatesQueryDto {
  @ApiPropertyOptional({ type: String, default: "", maxLength: 200 })
  @IsString()
  @MaxLength(200)
  search = "";
}
export class SharedActorDto {
  @ApiProperty({ enum: ["account", "visitor"] }) kind!: "account" | "visitor";
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
export class SharedOwnerDto {
  @ApiProperty() name!: string;
}
export class SharedTestSetDto extends OmitType(TestSetDto, ["owner"] as const) {
  @ApiProperty({ type: SharedActorDto }) me!: SharedActorDto;
  @ApiProperty({ type: SharedOwnerDto }) owner!: SharedOwnerDto;
}
