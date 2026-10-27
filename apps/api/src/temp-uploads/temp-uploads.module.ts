import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { FigmaModule } from "../figma/figma.module";
import { StorageModule } from "../storage/storage.module";
import { TempUploadsController } from "./temp-uploads.controller";
import { TempUploadsService } from "./temp-uploads.service";
@Module({
  imports: [AuthorizationModule, StorageModule, FigmaModule],
  controllers: [TempUploadsController],
  providers: [TempUploadsService],
  exports: [TempUploadsService],
})
export class TempUploadsModule {}
