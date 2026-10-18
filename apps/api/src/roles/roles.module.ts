import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
@Module({
  imports: [AuthorizationModule],
  providers: [RolesService],
  controllers: [RolesController],
  exports: [],
})
export class RolesModule {}
