import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReviewItemsController } from "../review-items/review-items.controller";
import { ReviewItemsService } from "../review-items/review-items.service";
import { StorageModule } from "../storage/storage.module";
import { TempUploadsModule } from "../temp-uploads/temp-uploads.module";
import { TestSetsModule } from "../test-sets/test-sets.module";
import { GenerationController } from "./generation.controller";
import { GenerationService } from "./generation.service";
import { GenerationWorker } from "./generation.worker";
import { PiGenerationService } from "./pi/pi.service";
import { ProviderCostsService } from "./provider-costs.service";
import { ProviderService } from "./providers/provider.service";
import { StageRunner } from "./stage-runner";
import { AiUsageService } from "./usage.service";
@Module({
  imports: [AuthModule, TestSetsModule, TempUploadsModule, StorageModule],
  controllers: [GenerationController, ReviewItemsController],
  providers: [
    AiUsageService,
    ProviderCostsService,
    GenerationService,
    GenerationWorker,
    StageRunner,
    ProviderService,
    PiGenerationService,
    ReviewItemsService,
  ],
  exports: [ProviderService, AiUsageService],
})
export class GenerationModule {}
