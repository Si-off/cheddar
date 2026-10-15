import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { API_ENV, type ApiEnv } from "../config/env";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.pool = new Pool({
      connectionString: env.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    this.pool.on("error", () => {
      process.stderr.write("Database pool connection lost.\n");
    });
    this.db = drizzle(this.pool, { schema });
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
