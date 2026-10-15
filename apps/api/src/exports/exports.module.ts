import { Module } from "@nestjs/common";
import { SheetsModule } from "../sheets/sheets.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [SheetsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
