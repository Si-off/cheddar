import { Module } from "@nestjs/common";
import { ReviewItemsController } from "../review-items/review-items.controller";
import { ReviewItemsService } from "../review-items/review-items.service";
import { StorageModule } from "../storage/storage.module";
import { TempUploadsModule } from "../temp-uploads/temp-uploads.module";
import { TestSetsModule } from "../test-sets/test-sets.module";
import { GenerationController } from "./generation.controller";
import { GenerationService } from "./generation.service";
import { GenerationWorker } from "./generation.worker";
import { ProviderCostsService } from "./provider-costs.service";
import { ProviderService } from "./providers/provider.service";
import { StageRunner } from "./stage-runner";
import { AiUsageService } from "./usage.service";
@Module({
  imports: [TestSetsModule, TempUploadsModule, StorageModule],
  controllers: [GenerationController, ReviewItemsController],
  providers: [
    AiUsageService,
    ProviderCostsService,
    GenerationService,
    GenerationWorker,
    StageRunner,
    ProviderService,
    ReviewItemsService,
  ],
})
export class GenerationModule {}
