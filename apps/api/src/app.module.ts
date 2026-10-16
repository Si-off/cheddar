import { type DynamicModule, Module } from "@nestjs/common";
import { type ApiEnv, configModule } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import { ExportsModule } from "./exports/exports.module";
import { FilesModule } from "./files/files.module";
import { GenerationModule } from "./generation/generation.module";
import {
  HealthController,
  MIGRATIONS_FOLDER,
} from "./health/health.controller";
import { IaModule } from "./ia/ia.module";
import { ProjectsModule } from "./projects/projects.module";
import { StorageModule } from "./storage/storage.module";
import { TemplatesModule } from "./templates/templates.module";
import { TestScenariosModule } from "./test-scenarios/test-scenarios.module";
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
      IaModule,
      TemplatesModule,
      TestScenariosModule,
      ExportsModule,
      GenerationModule,
    ],
    controllers: [HealthController],
    providers: [{ provide: MIGRATIONS_FOLDER, useValue: migrationsFolder }],
  };
}
