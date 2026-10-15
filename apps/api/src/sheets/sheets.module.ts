import { Module } from "@nestjs/common";
import { TemplatesModule } from "../templates/templates.module";
import { SheetsController } from "./sheets.controller";
import { SheetsRepository } from "./sheets.repository";
import { SheetsService } from "./sheets.service";

@Module({
  imports: [TemplatesModule],
  controllers: [SheetsController],
  providers: [SheetsRepository, SheetsService],
  exports: [SheetsRepository, SheetsService],
})
export class SheetsModule {}
