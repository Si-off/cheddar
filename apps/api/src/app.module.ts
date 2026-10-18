import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccountsModule } from "./accounts/accounts.module";
import { AffiliationsModule } from "./affiliations/affiliations.module";
import { AuthModule } from "./auth/auth.module";
import { AuthorizationModule } from "./authorization/authorization.module";
import { AccessGuard } from "./authorization/guards";
import { type ApiEnv, configModule } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import {
  HealthController,
  MIGRATIONS_FOLDER,
} from "./health/health.controller";
import { RolesModule } from "./roles/roles.module";
import { StorageModule } from "./storage/storage.module";
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
      AuthorizationModule,
      AccountsModule,
      AuthModule,
      RolesModule,
      AffiliationsModule,
    ],
    controllers: [HealthController],
    providers: [
      { provide: MIGRATIONS_FOLDER, useValue: migrationsFolder },
      { provide: APP_GUARD, useClass: AccessGuard },
    ],
  };
}
