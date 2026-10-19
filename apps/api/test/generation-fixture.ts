import "reflect-metadata";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import { GenerationService } from "../src/generation/generation.service";
import { readAiConfig } from "../src/generation/model-config";
import { ProviderService } from "../src/generation/providers/provider.service";
import { QueueService } from "../src/generation/queue.service";
import { StageRunner } from "../src/generation/stage-runner";
import { ProjectsService } from "../src/projects/projects.service";
import { ReviewItemsService } from "../src/review-items/review-items.service";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { openTestDatabase } from "./database";

export async function generationFixture() {
  const lease = await openTestDatabase();
  const config = {
    ...lease.config,
    ai: readAiConfig({ AI_PROVIDER: "fake" }),
    workersEnabled: false,
  };
  const app = await createApp(config, lease.folder);
  try {
    // 영속 큐 전달은 기존 pg-boss 통합 테스트가 검증한다. 여기서는 단계와 입장을 직접 제어한다.
    app.get(QueueService).enqueue = async () => undefined;
    await app.listen(0, "127.0.0.1");
    const admin = await createFirstAdministrator(
      app.get(AuthorizationService),
      app.get(AccountsService),
      "accounting@example.com",
      "계측 관리자",
    );
    lease.accountIds.push(admin.account.id);
    const password = "계측-테스트-비밀번호-12345";
    await app.get(AuthService).setPassword(admin.token, password, "invite");
    const cookie = `${SESSION_COOKIE}=${(await app.get(AuthService).login(admin.account.email, password)).token}`;
    const sets = app.get(TestSetsService);
    const makeSet = async () => {
      const project = await app
        .get(ProjectsService)
        .create(admin.account.id, { name: "계측 프로젝트", description: "" });
      return sets.create(admin.account.id, {
        projectId: project.id,
        name: "계측 세트",
        memo: "",
      });
    };
    return {
      lease,
      config,
      app,
      cookie,
      base: `${await app.getUrl()}/api/v1`,
      accountId: admin.account.id,
      db: lease.database.db,
      generation: app.get(GenerationService),
      runner: app.get(StageRunner),
      providers: app.get(ProviderService),
      reviews: app.get(ReviewItemsService),
      makeSet,
      close: async () => {
        await app.close();
        await lease.close();
      },
    };
  } catch (error) {
    await app.close();
    await lease.close();
    throw error;
  }
}
