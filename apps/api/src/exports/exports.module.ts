import { Module } from "@nestjs/common";
import { TestScenariosModule } from "../test-scenarios/test-scenarios.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [TestScenariosModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
