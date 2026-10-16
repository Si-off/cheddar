import { Module } from "@nestjs/common";
import { TemplatesModule } from "../templates/templates.module";
import { TestScenariosController } from "./test-scenarios.controller";
import { TestScenariosRepository } from "./test-scenarios.repository";
import { TestScenariosService } from "./test-scenarios.service";

@Module({
  imports: [TemplatesModule],
  controllers: [TestScenariosController],
  providers: [TestScenariosRepository, TestScenariosService],
  exports: [TestScenariosRepository, TestScenariosService],
})
export class TestScenariosModule {}
