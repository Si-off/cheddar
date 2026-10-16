import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { ProjectsModule } from "../projects/projects.module";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { UploadsController } from "./uploads.controller";
import { UploadsRepository } from "./uploads.repository";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [ProjectsModule, FilesModule],
  controllers: [UploadsController, AnalysisController],
  providers: [UploadsRepository, UploadsService, AnalysisService],
  exports: [UploadsService],
})
export class UploadsModule {}
