import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { CaseOperationsService } from "./case-operations.service";
import { TestSetsController } from "./test-sets.controller";
import { TestSetsService } from "./test-sets.service";
import { TestSetsStore } from "./test-sets.store";
@Module({
  imports: [AuthorizationModule],
  controllers: [TestSetsController],
  providers: [TestSetsStore, TestSetsService, CaseOperationsService],
  exports: [CaseOperationsService, TestSetsStore],
})
export class TestSetsModule {}
