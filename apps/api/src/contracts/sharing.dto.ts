import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { IsIn, ValidateIf } from "class-validator";
import { TestSetDto } from "./test-set.dto";

export class SharingDto {
  @ApiProperty({ enum: ["private", "public"] }) visibility!:
    | "private"
    | "public";
  @ApiProperty({ enum: ["view", "edit"] }) linkPermission!: "view" | "edit";
  @ApiProperty({ type: String, nullable: true }) linkToken!: string | null;
}
export class PatchSharingDto {
  @ApiPropertyOptional({ enum: ["private", "public"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["private", "public"])
  visibility?: "private" | "public";
  @ApiPropertyOptional({ enum: ["view", "edit"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["view", "edit"])
  linkPermission?: "view" | "edit";
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
