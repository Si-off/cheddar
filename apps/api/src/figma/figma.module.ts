import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { FigmaController } from "./figma.controller";
import { FigmaService } from "./figma.service";
import { FigmaClient } from "./figma-client";
import { FigmaTokenCipher } from "./token-cipher";
@Module({
  imports: [AuthorizationModule],
  controllers: [FigmaController],
  providers: [FigmaService, FigmaClient, FigmaTokenCipher],
  exports: [FigmaService],
})
export class FigmaModule {}
