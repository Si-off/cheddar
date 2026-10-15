import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { SheetsModule } from "../sheets/sheets.module";
import {
  GenerationController,
  GenerationProvidersController,
} from "./generation.controller";
import { GenerationRepository } from "./generation.repository";
import { GenerationService } from "./generation.service";
@Module({
  imports: [SheetsModule, FilesModule],
  controllers: [GenerationController, GenerationProvidersController],
  providers: [GenerationRepository, GenerationService],
})
export class GenerationModule {}
