import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { StorageModule } from "../storage/storage.module";
import { TempUploadsController } from "./temp-uploads.controller";
import { TempUploadsService } from "./temp-uploads.service";
@Module({
  imports: [AuthorizationModule, StorageModule],
  controllers: [TempUploadsController],
  providers: [TempUploadsService],
  exports: [TempUploadsService],
})
export class TempUploadsModule {}
