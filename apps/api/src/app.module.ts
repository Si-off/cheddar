import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccountsModule } from "./accounts/accounts.module";
import { AuthModule } from "./auth/auth.module";
import { AuthorizationModule } from "./authorization/authorization.module";
import { AccessGuard } from "./authorization/guards";
import { type ApiEnv, configModule } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import { FigmaModule } from "./figma/figma.module";
import { GenerationModule } from "./generation/generation.module";
import { QueueModule } from "./generation/queue.service";
import {
  HealthController,
  MIGRATIONS_FOLDER,
} from "./health/health.controller";
import { LiveEventsModule } from "./live/live-events";
import { PluginConnectionsModule } from "./plugin-connections/plugin-connections.module";
import { ProjectsModule } from "./projects/projects.module";
import { StorageModule } from "./storage/storage.module";
import { TempUploadsModule } from "./temp-uploads/temp-uploads.module";
import { TestSetsModule } from "./test-sets/test-sets.module";
@Module({})
export class AppModule {}
export function appModule(
  config: ApiEnv,
  migrationsFolder: string,
): DynamicModule {
  return {
    module: AppModule,
    imports: [
      configModule(config),
      LiveEventsModule,
      DatabaseModule,
      StorageModule,
      AuthorizationModule,
      AccountsModule,
      AuthModule,
      PluginConnectionsModule,
      ProjectsModule,
      TestSetsModule,
      QueueModule,
      FigmaModule,
      TempUploadsModule,
      GenerationModule,
    ],
    controllers: [HealthController],
    providers: [
      { provide: MIGRATIONS_FOLDER, useValue: migrationsFolder },
      { provide: APP_GUARD, useClass: AccessGuard },
    ],
  };
}
