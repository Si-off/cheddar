import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { GenerationModule } from "../generation/generation.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { ScreenDraftsService } from "./screen-drafts.service";
@Module({
  imports: [AuthorizationModule, GenerationModule],
  providers: [ProjectsService, ScreenDraftsService],
  controllers: [ProjectsController],
  exports: [],
})
export class ProjectsModule {}
