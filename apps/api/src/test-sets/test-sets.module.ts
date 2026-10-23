import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { LiveGateway } from "../live/live.gateway";
import { SharedController } from "../sharing/shared.controller";
import { SharedService } from "../sharing/shared.service";
import { SharingController } from "../sharing/sharing.controller";
import { SharingService } from "../sharing/sharing.service";
import { StorageModule } from "../storage/storage.module";
import { CaseOperationsService } from "./case-operations.service";
import { CellImagesService } from "./cell-images.service";
import { RecentTemplateController } from "./recent-template.controller";
import { TestSetsController } from "./test-sets.controller";
import { TestSetsService } from "./test-sets.service";
import { TestSetsStore } from "./test-sets.store";
@Module({
  imports: [AuthorizationModule, AuthModule, StorageModule],
  controllers: [
    TestSetsController,
    SharingController,
    SharedController,
    RecentTemplateController,
  ],
  providers: [
    TestSetsStore,
    CellImagesService,
    TestSetsService,
    CaseOperationsService,
    SharingService,
    SharedService,
    LiveGateway,
  ],
  exports: [CaseOperationsService, TestSetsStore],
})
export class TestSetsModule {}
