import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { PluginConnectionsController } from "./plugin-connections.controller";
import { PluginConnectionsService } from "./plugin-connections.service";

@Module({
  imports: [AuthModule, AuthorizationModule],
  providers: [PluginConnectionsService],
  controllers: [PluginConnectionsController],
})
export class PluginConnectionsModule {}
