import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { UploadsController } from "./uploads.controller";
import { UploadsRepository } from "./uploads.repository";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [ProjectsModule],
  controllers: [UploadsController],
  providers: [UploadsRepository, UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
