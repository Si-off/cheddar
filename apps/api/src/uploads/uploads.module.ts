import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { ProjectsModule } from "../projects/projects.module";
import { EvidenceController } from "./evidence.controller";
import { EvidenceService } from "./evidence.service";
import { UploadsController } from "./uploads.controller";
import { UploadsRepository } from "./uploads.repository";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [ProjectsModule, FilesModule],
  controllers: [UploadsController, EvidenceController],
  providers: [UploadsRepository, UploadsService, EvidenceService],
  exports: [UploadsService],
})
export class UploadsModule {}
