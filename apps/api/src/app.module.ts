import { type DynamicModule, Module } from "@nestjs/common";
import { type ApiEnv, configModule } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import { FilesModule } from "./files/files.module";
import {
  HealthController,
  MIGRATIONS_FOLDER,
} from "./health/health.controller";
import { ProjectsModule } from "./projects/projects.module";
import { StorageModule } from "./storage/storage.module";
import { UploadsModule } from "./uploads/uploads.module";

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
      DatabaseModule,
      StorageModule,
      ProjectsModule,
      FilesModule,
      UploadsModule,
    ],
    controllers: [HealthController],
    providers: [{ provide: MIGRATIONS_FOLDER, useValue: migrationsFolder }],
  };
}
