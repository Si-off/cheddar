import { Controller, Get, Inject } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../authorization/guards";
import { unavailable } from "../common/errors";
import { ErrorResponseDto, HealthDto } from "../contracts/common.dto";
import { DatabaseService } from "../database/database.service";
import { checkMigrations } from "../database/migrations";
import { LocalStorage } from "../storage/local-storage";

export const MIGRATIONS_FOLDER = Symbol("MIGRATIONS_FOLDER");
@Public()
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(LocalStorage) private readonly storage: LocalStorage,
    @Inject(MIGRATIONS_FOLDER) private readonly migrationsFolder: string,
  ) {}
  @Get("live")
  @ApiOperation({ operationId: "getLiveness" })
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return { status: "ok" };
  }
  @Get("ready")
  @ApiOperation({ operationId: "getReadiness" })
  @ApiOkResponse({ type: HealthDto })
  @ApiResponse({ status: 503, type: ErrorResponseDto })
  async ready(): Promise<HealthDto> {
    try {
      await Promise.all([
        checkMigrations(this.database, this.migrationsFolder),
        this.storage.check(),
      ]);
      return { status: "ok" };
    } catch {
      throw unavailable();
    }
  }
}
