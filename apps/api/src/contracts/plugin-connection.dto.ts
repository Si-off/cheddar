import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";
import { MeDto } from "./identity.dto";

export class PluginConnectionRequestDto {
  @ApiProperty({ minLength: 43, maxLength: 43, pattern: "^[A-Za-z0-9_-]{43}$" })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  requestToken!: string;
}
export class CreatedPluginConnectionDto {
  @ApiProperty() requestToken!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
}
export class PluginConnectionStatusDto {
  @ApiProperty({ enum: ["pending", "approved", "expired"] })
  status!: "pending" | "approved" | "expired";
}
export class PendingPluginConnectionDto {
  @ApiProperty({ enum: ["pending"] }) status!: "pending";
}
export class PluginConnectionTokenDto {
  @ApiProperty() token!: string;
  @ApiProperty({ type: MeDto }) account!: MeDto;
}
