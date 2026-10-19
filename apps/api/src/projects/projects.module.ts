import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
@Module({
  imports: [AuthorizationModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [],
})
export class ProjectsModule {}
