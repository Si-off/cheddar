import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { FlowGenerationService } from "../generation/flow-generation.service";
import { AiUsageService } from "../generation/usage.service";
import { TemplatesModule } from "../templates/templates.module";
import { CanvasController } from "./canvas.controller";
import { CanvasRepository } from "./canvas.repository";
import { TestScenariosController } from "./test-scenarios.controller";
import { TestScenariosRepository } from "./test-scenarios.repository";
import { TestScenariosService } from "./test-scenarios.service";

@Module({
  imports: [TemplatesModule, FilesModule],
  controllers: [TestScenariosController, CanvasController],
  providers: [
    TestScenariosRepository,
    TestScenariosService,
    CanvasRepository,
    FlowGenerationService,
    AiUsageService,
  ],
  exports: [TestScenariosRepository, TestScenariosService, AiUsageService],
})
export class TestScenariosModule {}
