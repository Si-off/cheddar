import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { StorageModule } from "../storage/storage.module";
import { FilesController } from "./files.controller";
import { FilesRepository } from "./files.repository";
import { FilesService } from "./files.service";
@Module({
  imports: [ProjectsModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesRepository, FilesService],
  exports: [FilesService],
})
export class FilesModule {}
