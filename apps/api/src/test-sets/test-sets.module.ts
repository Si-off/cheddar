import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { LiveGateway } from "../live/live.gateway";
import { SharedController } from "../sharing/shared.controller";
import { SharedService } from "../sharing/shared.service";
import { SharingController } from "../sharing/sharing.controller";
import { SharingService } from "../sharing/sharing.service";
import { CaseOperationsService } from "./case-operations.service";
import { TestSetsController } from "./test-sets.controller";
import { TestSetsService } from "./test-sets.service";
import { TestSetsStore } from "./test-sets.store";
@Module({
  imports: [AuthorizationModule, AuthModule],
  controllers: [TestSetsController, SharingController, SharedController],
  providers: [
    TestSetsStore,
    TestSetsService,
    CaseOperationsService,
    SharingService,
    SharedService,
    LiveGateway,
  ],
  exports: [CaseOperationsService, TestSetsStore],
})
export class TestSetsModule {}
