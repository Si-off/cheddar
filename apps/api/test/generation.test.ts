import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import type {
  GenerationCurrentDto,
  ReviewItemDto,
} from "../src/contracts/generation.dto";
import {
  accounts as accountRows,
  generationJobs,
  generationSteps,
  projectMemos,
  reviewItems,
  tempUploads,
  testCases,
} from "../src/database/schema";
import { GenerationService } from "../src/generation/generation.service";
import { DEFAULT_GUIDE } from "../src/generation/guides";
import { readAiConfig } from "../src/generation/model-config";
import {
  AiFailure,
  type AiRequest,
} from "../src/generation/providers/ai-provider";
import { ProviderService } from "../src/generation/providers/provider.service";
import {
  GENERATION_QUEUE,
  QueueService,
} from "../src/generation/queue.service";
import { StageRunner } from "../src/generation/stage-runner";
import type { GenerationInput } from "../src/generation/types";
import { ProjectsService } from "../src/projects/projects.service";
import { LocalStorage } from "../src/storage/local-storage";
import { TempUploadsService } from "../src/temp-uploads/temp-uploads.service";
import { CaseOperationsService } from "../src/test-sets/case-operations.service";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { openTestDatabase } from "./database";

test("실제 PostgreSQL과 pg-boss에서 업로드, 생성, 재개와 확인 필요 처리", {
  timeout: 120000,
}, async (t) => {
  const lease = await openTestDatabase();
  let app = await createApp(
    {
      ...lease.config,
      ai: readAiConfig({ AI_PROVIDER: "fake" }),
      queuePollingSeconds: 0.5,
    },
    lease.folder,
  );
  const db = lease.database.db;
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1`;
    const auth = app.get(AuthService),
      accounts = app.get(AccountsService),
      authorization = app.get(AuthorizationService),
      sets = app.get(TestSetsService),
      generation = app.get(GenerationService),
      uploads = app.get(TempUploadsService),
      runner = app.get(StageRunner),
      queue = app.get(QueueService),
      providers = app.get(ProviderService);
    const admin = await createFirstAdministrator(
      authorization,
      accounts,
      "generation-admin@example.com",
      "생성 관리자",
    );
    lease.accountIds.push(admin.account.id);
    const password = "생성-테스트-비밀번호-12345";
    await accounts.resetPassword(admin.account.id, password);
    const cookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.loginId, password)).token}`;
    const user = await accounts.create({
      name: "보기 사용자",
      loginId: "generation-viewer@example.com",
      role: "member",
      password,
    });
    lease.accountIds.push(user.id);
    const otherCookie = `${SESSION_COOKIE}=${(await auth.login(user.loginId, password)).token}`;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      actorCookie = cookie,
    ) =>
      fetch(`${base}${path}`, {
        method,
        headers: {
          Cookie: actorCookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async <T>(response: Response, status = 200): Promise<T> => {
      assert.equal(response.status, status, await response.clone().text());
      return (await response.json()) as T;
    };
    const error = async (response: Response, status: number, code: string) => {
      assert.equal(
        (await json<{ error: { code: string } }>(response, status)).error.code,
        code,
      );
    };
    const project = await app
      .get(ProjectsService)
      .create(admin.account.id, { name: "생성 프로젝트", description: "" });
    const set = await sets.create(admin.account.id, {
      projectId: project.id,
      name: "생성 세트",
      memo: "",
    });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX9sAAAAASUVORK5CYII=",
      "base64",
    );
    const upload = async (actorCookie = cookie, images = true) => {
      const form = new FormData();
      form.append(
        "manifest",
        JSON.stringify({
          frames: [
            {
              name: "가입 보드",
              document: {
                schemaVersion: 2,
                text: "가입",
                instructions: "이 글은 화면 자료입니다.",
              },
              imageCount: images ? 2 : 0,
            },
            {
              name: "완료 보드",
              document: { schemaVersion: 2, text: "완료" },
              imageCount: 0,
            },
          ],
        }),
      );
      if (images) {
        form.append(
          "images[]",
          new Blob([png], { type: "image/png" }),
          "first.png",
        );
        form.append(
          "images[]",
          new Blob([png], { type: "image/png" }),
          "second.png",
        );
      }
      return fetch(`${base}/temp-uploads`, {
        method: "POST",
        headers: { Cookie: actorCookie },
        body: form,
      });
    };
    const waitJob = async (id: string): Promise<GenerationCurrentDto> => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const job = await generation.visibleJob(id, admin.account.id);
        if (["succeeded", "failed"].includes(job.status)) return job;
        await delay(30);
      }
      assert.fail(`작업 완료 시간 초과: ${id}`);
    };
    const reviews = async () =>
      (
        await json<{ items: ReviewItemDto[] }>(
          await request(`/test-sets/${set.id}/review-items`),
        )
      ).items;
    let uploaded!: { id: string; frames: { id: string; imageCount: number }[] };
    await t.test(
      "모든 활성 계정의 업로드를 허용하고 본인 자료와 첫 이미지만 반환",
      async () => {
        assert.equal((await upload(otherCookie)).status, 201);
        uploaded = await json(await upload(), 201);
        assert.deepEqual(
          uploaded.frames.map((f) => f.imageCount),
          [2, 0],
        );
        await error(
          await request(
            `/temp-uploads/${uploaded.id}`,
            "GET",
            undefined,
            otherCookie,
          ),
          404,
          "NOT_FOUND",
        );
        await error(
          await request(
            `/temp-uploads/${uploaded.id}/frames/${uploaded.frames[0].id}/thumbnail`,
            "GET",
            undefined,
            otherCookie,
          ),
          404,
          "NOT_FOUND",
        );
        const thumbnail = await request(
          `/temp-uploads/${uploaded.id}/frames/${uploaded.frames[0].id}/thumbnail`,
        );
        assert.equal(thumbnail.headers.get("content-type"), "image/png");
        assert.deepEqual(Buffer.from(await thumbnail.arrayBuffer()), png);
        await error(
          await request(
            `/temp-uploads/${uploaded.id}/frames/${uploaded.frames[1].id}/thumbnail`,
          ),
          404,
          "NOT_FOUND",
        );
      },
    );
    await t.test(
      "생성은 편집 권한과 입력, 자료 소유자를 검사하고 진행 중에는 409",
      async () => {
        await error(
          await request(
            `/test-sets/${set.id}/generations`,
            "POST",
            { kind: "initial", uploadId: uploaded.id },
            otherCookie,
          ),
          404,
          "NOT_FOUND",
        );
        await error(
          await request(`/test-sets/${set.id}/generations`, "POST", {
            kind: "append",
          }),
          400,
          "VALIDATION_ERROR",
        );
        await error(
          await request(`/test-sets/${set.id}/generations`, "POST", {
            kind: "initial",
            memo: "설명만으로 최초 생성 불가",
          }),
          400,
          "VALIDATION_ERROR",
        );
        assert.equal(await generation.current(set.id, admin.account.id), null);
        await queue.boss.offWork(GENERATION_QUEUE);
        const { jobId } = await json<{ jobId: string }>(
          await request(`/test-sets/${set.id}/generations`, "POST", {
            kind: "initial",
            uploadId: uploaded.id,
          }),
          202,
        );
        await error(
          await request(`/test-sets/${set.id}/generations`, "POST", {
            kind: "append",
            memo: "추가",
          }),
          409,
          "GENERATION_RUNNING",
        );
        const streamAbort = new AbortController();
        t.after(() => streamAbort.abort());
        const stream = await fetch(`${base}/generations/${jobId}/events`, {
          headers: { Cookie: cookie },
          signal: streamAbort.signal,
        });
        assert.equal(stream.headers.get("content-type"), "text/event-stream");
        const reader = stream.body?.getReader();
        assert.ok(reader);
        let streamText = new TextDecoder().decode((await reader.read()).value);
        assert.match(streamText, /event: progress/);
        await queue.boss.work<{ jobId: string; stage: string }>(
          GENERATION_QUEUE,
          { pollingIntervalSeconds: 0.5 },
          async (jobs) => {
            for (const job of jobs)
              await runner.process(
                job.data.jobId,
                job.data.stage as Parameters<StageRunner["process"]>[1],
              );
          },
        );
        const result = await waitJob(jobId);
        assert.equal(result.status, "succeeded", result.errorMessage ?? "");
        assert.equal(result.addedCount, 2);
        assert.equal(result.reviewCount, 1);
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          streamText += new TextDecoder().decode(chunk.value);
        }
        for (const stage of ["screens", "flows", "cases", "finish"])
          assert.ok(streamText.includes(`"stage":"${stage}"`), streamText);
        assert.match(streamText, /event: done/);
        const done = await request(`/generations/${jobId}/events`);
        assert.match(
          await done.text(),
          /event: done\ndata: \{"status":"succeeded","addedCount":2,"reviewCount":1\}/,
        );
        const cases = (await sets.detail(set.id, admin.account.id)).cases;
        assert.equal(cases.length, 2);
        assert.deepEqual(
          cases.map((c) => c.values[set.columns[0].id]),
          ["TC-001", "TC-002"],
        );
        const authors = await db
          .select()
          .from(testCases)
          .where(eq(testCases.testSetId, set.id));
        assert.ok(authors.every((c) => c.createdBy === admin.account.id));
        const steps = await db
          .select()
          .from(generationSteps)
          .where(eq(generationSteps.jobId, jobId));
        assert.ok(steps.every((s) => s.input === null && s.output === null));
        assert.ok(
          steps
            .filter((s) => s.stage !== "context")
            .every(
              (s) =>
                // 어떤 작성 지침으로 만든 결과인지 남긴다.
                s.promptVersion?.includes(`+${DEFAULT_GUIDE}@`) &&
                s.model === "fake" &&
                s.cost === "0.0000000000",
            ),
        );
        // job 완료 후 파일 정리는 별도 복구 가능한 작업이므로 완료될 때까지 짧게 확인한다.
        for (let i = 0; i < 100; i++) {
          if (
            !(
              await db
                .select()
                .from(tempUploads)
                .where(eq(tempUploads.id, uploaded.id))
            ).length
          )
            break;
          await delay(10);
        }
        await error(
          await request(`/temp-uploads/${uploaded.id}`),
          404,
          "NOT_FOUND",
        );
        await assert.rejects(
          readdir(join(lease.config.storageRoot, uploaded.id)),
          { code: "ENOENT" },
        );
        assert.equal((await reviews()).length, 1);
        assert.equal(
          (await sets.list(admin.account.id, { filter: "all", search: "" }))
            .items[0].reviewCount,
          1,
        );
      },
    );
    await t.test(
      "append는 메모만으로 생성하고 같은 자료의 중복을 피함",
      async () => {
        const first = await generation.create(set.id, admin.account.id, {
          kind: "append",
          memo: "새로운 비밀번호 변경",
        });
        assert.equal((await waitJob(first.jobId)).addedCount, 2);
        const second = await generation.create(set.id, admin.account.id, {
          kind: "append",
          memo: "새로운 비밀번호 변경",
        });
        assert.equal((await waitJob(second.jobId)).addedCount, 0);
        assert.equal(
          (await sets.detail(set.id, admin.account.id)).cases.length,
          4,
        );
      },
    );
    await t.test(
      "확인 필요는 보기 권한, 수정과 제외 복원, 다시 작성과 추가를 지원",
      async () => {
        let item = (await reviews())[0];
        const select = set.columns.find((column) => column.type === "select");
        assert.ok(select);
        const memberEdit = await json<ReviewItemDto>(
          await request(
            `/review-items/${item.id}`,
            "PATCH",
            { answer: "수정" },
            otherCookie,
          ),
        );
        assert.equal(memberEdit.answer, "수정");
        await error(
          await request(`/review-items/${item.id}`, "PATCH", {
            // 목록 밖 글자는 Excel처럼 받지만 형식이 다른 값은 거절한다.
            draft: {
              [select.id]: ["형식이 다른 값"],
            },
          }),
          400,
          "VALIDATION_FAILED",
        );
        item = await json(
          await request(`/review-items/${item.id}`, "PATCH", {
            answer: "완료 화면",
            status: "excluded",
          }),
        );
        assert.equal(item.status, "excluded");
        item = await json(
          await request(`/review-items/${item.id}`, "PATCH", {
            status: "pending",
            draft: item.draft,
          }),
        );
        const { jobId } = await json<{ jobId: string }>(
          await request(`/review-items/${item.id}/rewrite`, "POST", {
            answer: "완료 화면으로 이동",
          }),
          202,
        );
        await error(
          await request(`/review-items/${item.id}`, "PATCH", {
            answer: "동시 변경",
          }),
          409,
          "REVIEW_ITEM_LOCKED",
        );
        assert.equal((await waitJob(jobId)).status, "succeeded");
        item = (await reviews()).find((r) => r.id === item.id) as ReviewItemDto;
        assert.equal(item.status, "pending");
        const titleColumn = set.columns.find((c) => c.systemKey === "title");
        assert.ok(titleColumn);
        assert.match(String(item.draft[titleColumn.id]), /완료 화면으로 이동/);
        const accepted = await json<{
          item: ReviewItemDto;
          case: { values: Record<string, string> };
          version: number;
        }>(
          await request(`/review-items/${item.id}/accept`, "POST", {
            draft: item.draft,
          }),
        );
        assert.equal(accepted.item.status, "resolved");
        assert.equal(accepted.case.values[set.columns[0].id], "TC-005");
        await error(
          await request(`/review-items/${item.id}/accept`, "POST", {
            draft: item.draft,
          }),
          409,
          "REVIEW_ITEM_LOCKED",
        );
      },
    );
    await t.test(
      "재개는 저장된 화면 결과를 재사용하고 끝나지 않은 단계만 실행",
      async () => {
        await queue.boss.offWork(GENERATION_QUEUE);
        const { jobId } = await generation.create(set.id, admin.account.id, {
          kind: "append",
          memo: "재개 테스트",
        });
        const [context] = await db
          .select()
          .from(generationSteps)
          .where(
            and(
              eq(generationSteps.jobId, jobId),
              eq(generationSteps.stage, "context"),
            ),
          );
        const data = context.input as GenerationInput;
        await runner.step(
          jobId,
          "screens",
          "memo",
          { ...data, frames: [] },
          { frames: [], memo: data.memo },
        );
        let screensCalled = 0;
        const original = providers.fake.generate.bind(providers.fake);
        providers.fake.generate = async (r) => {
          if (r.definition.key === "screens") screensCalled++;
          return original(r);
        };
        try {
          await generation.recover();
          await runner.process(jobId, "screens");
          await runner.process(jobId, "flows");
          await runner.process(jobId, "cases");
          await runner.process(jobId, "finish");
          await runner.process(jobId, "finish");
          assert.equal((await waitJob(jobId)).status, "succeeded");
          assert.equal(screensCalled, 0);
        } finally {
          providers.fake.generate = original;
        }
      },
    );
    await t.test(
      "출력 실패는 케이스를 남기지 않고 재작성 실패는 이전 초안을 보존",
      async () => {
        const original = providers.fake.generate.bind(providers.fake);
        let calls = 0;
        providers.fake.generate = async (r: AiRequest) => {
          calls++;
          if (r.definition.key === "finish" || r.definition.key === "rewrite")
            throw new AiFailure("AI_REFUSAL", false);
          return original(r);
        };
        try {
          const before = (await sets.detail(set.id, admin.account.id)).cases
            .length;
          const { jobId } = await generation.create(set.id, admin.account.id, {
            kind: "append",
            memo: "실패 테스트",
          });
          for (const stage of ["screens", "flows", "cases", "finish"] as const)
            await runner.process(jobId, stage);
          const failed = await waitJob(jobId);
          assert.equal(failed.status, "failed");
          assert.match(
            failed.errorMessage ?? "",
            /설명으로 케이스 추가 생성을 실행하세요/,
          );
          assert.doesNotMatch(failed.errorMessage ?? "", /입력 내용을 확인/);
          assert.equal(
            (await sets.detail(set.id, admin.account.id)).cases.length,
            before,
          );
          const item = (await reviews()).find((r) => r.status === "pending");
          assert.ok(item);
          const result = await json<{ jobId: string }>(
            await request(`/review-items/${item.id}/rewrite`, "POST", {
              answer: "답변",
            }),
            202,
          );
          await runner.process(result.jobId, "rewrite");
          assert.equal((await waitJob(result.jobId)).status, "failed");
          const after = (await reviews()).find((r) => r.id === item.id);
          assert.equal(after?.status, "pending");
          assert.deepEqual(after.draft, item.draft);
          assert.ok(calls >= 5);
        } finally {
          providers.fake.generate = original;
        }
      },
    );
    await t.test(
      "프로젝트 메모는 입력에서 빠지고 만료 정리는 사용 중 업로드를 보존",
      async () => {
        await db
          .insert(projectMemos)
          .values({
            projectId: project.id,
            authorId: admin.account.id,
            body: "절대 생성 입력에 넣지 않을 프로젝트 메모",
          })
          .onConflictDoUpdate({
            target: projectMemos.projectId,
            set: { body: "절대 생성 입력에 넣지 않을 프로젝트 메모" },
          });
        const unused = await json<{ id: string }>(
          await upload(cookie, false),
          201,
        );
        const active = await json<{ id: string }>(
          await upload(cookie, false),
          201,
        );
        const { jobId } = await generation.create(set.id, admin.account.id, {
          kind: "initial",
          uploadId: active.id,
        });
        const [snapshot] = await db
          .select()
          .from(generationSteps)
          .where(
            and(
              eq(generationSteps.jobId, jobId),
              eq(generationSteps.stage, "context"),
            ),
          );
        assert.ok(!JSON.stringify(snapshot.input).includes("절대 생성 입력"));
        await db
          .update(tempUploads)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(tempUploads.id, unused.id));
        await db
          .update(tempUploads)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(tempUploads.id, active.id));
        await uploads.cleanup();
        assert.equal(
          (
            await db
              .select()
              .from(tempUploads)
              .where(eq(tempUploads.id, unused.id))
          ).length,
          0,
        );
        assert.equal(
          (
            await db
              .select()
              .from(tempUploads)
              .where(eq(tempUploads.id, active.id))
          ).length,
          1,
        );
        await generation.fail(jobId, "TEST_FINISHED");
        assert.equal(
          (
            await db
              .select()
              .from(tempUploads)
              .where(eq(tempUploads.id, active.id))
          ).length,
          0,
        );
      },
    );
    await t.test(
      "일시 오류는 최대 2회 재시도하고 완료한 분할 결과를 재사용",
      async () => {
        const { jobId } = await generation.create(set.id, admin.account.id, {
          kind: "append",
          memo: "재시도 테스트",
        });
        const [snapshot] = await db
          .select()
          .from(generationSteps)
          .where(
            and(
              eq(generationSteps.jobId, jobId),
              eq(generationSteps.stage, "context"),
            ),
          );
        const context = snapshot.input as GenerationInput;
        const original = providers.fake.generate.bind(providers.fake);
        let calls = 0;
        providers.fake.generate = async (r) => {
          calls++;
          if (calls <= 2) throw new AiFailure("AI_UNAVAILABLE", true);
          return original(r);
        };
        try {
          await runner.step(jobId, "screens", "memo", context, {
            frames: [],
            memo: context.memo,
          });
          await runner.step(jobId, "screens", "memo", context, {
            frames: [],
            memo: context.memo,
          });
          assert.equal(calls, 3);
          const [step] = await db
            .select()
            .from(generationSteps)
            .where(
              and(
                eq(generationSteps.jobId, jobId),
                eq(generationSteps.stage, "screens"),
              ),
            );
          assert.equal(step.attempts, 3);
          assert.equal(step.status, "completed");
        } finally {
          providers.fake.generate = original;
          await generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "열 삭제는 모든 상태의 확인 필요 초안을 정리하고 실패 시 함께 롤백",
      async () => {
        const target = await sets.create(admin.account.id, {
          projectId: project.id,
          name: "초안 양식",
          memo: "",
        });
        const custom = (type: "text" | "select" | "tags" | "checkbox") => ({
          id: randomUUID(),
          name: type,
          type,
          systemKey: null,
          description: "",
          options: type === "select" || type === "tags" ? ["가", "나"] : [],
        });
        const removed = custom("text"),
          select = custom("select"),
          tags = custom("tags"),
          checkbox = custom("checkbox");
        const columns = [...target.columns, removed, select, tags, checkbox];
        const ops = app.get(CaseOperationsService);
        await ops.apply(target.id, admin.account.id, {
          ops: [removed, select, tags, checkbox].map((c, i) => ({
            type: "add_column",
            columnId: c.id,
            column: {
              name: c.name,
              type: c.type,
              description: c.description,
              options: c.options,
              presetKey: null,
            },
            afterColumnId: columns[target.columns.length + i - 1].id,
          })),
        });
        const values = {
          [removed.id]: "삭제",
          [select.id]: "가",
          [tags.id]: ["가", "나"],
          [checkbox.id]: true,
          [target.columns[1].id]: "보존",
        };
        await app
          .get(CaseOperationsService)
          .apply(target.id, admin.account.id, {
            ops: [
              {
                type: "add_case",
                caseId: randomUUID(),
                afterCaseId: null,
                values,
              },
            ],
          });
        const items = await db
          .insert(reviewItems)
          .values(
            ["pending", "excluded", "resolved", "rewriting"].map((status) => ({
              testSetId: target.id,
              screenDescription: "화면",
              questions: [],
              draft: values,
              status,
            })),
          )
          .returning();
        // 열 편집 중 실패하면 초안도 함께 롤백된다.
        await assert.rejects(
          ops.apply(target.id, admin.account.id, {
            ops: [
              { type: "remove_column", columnId: removed.id },
              { type: "remove_column", columnId: target.columns[0].id },
            ],
          }),
        );
        assert.deepEqual(
          (
            await db
              .select()
              .from(reviewItems)
              .where(eq(reviewItems.id, items[0].id))
          )[0].draft,
          values,
        );
        const result = await ops.apply(target.id, admin.account.id, {
          ops: [{ type: "remove_column", columnId: removed.id }],
        });
        const expected = {
          [select.id]: "가",
          [tags.id]: ["가", "나"],
          [checkbox.id]: true,
          [target.columns[1].id]: "보존",
        };
        for (const item of await db
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.testSetId, target.id))) {
          assert.deepEqual(item.draft, expected);
          assert.equal(
            item.status,
            items.find((before) => before.id === item.id)?.status,
          );
        }
        const caseValues = { ...result.cases[0].values };
        delete caseValues[target.columns[0].id];
        assert.deepEqual(caseValues, expected);
        const patched = await json<ReviewItemDto>(
          await request(`/review-items/${items[0].id}`, "PATCH", {
            draft: expected,
            answer: "확인",
          }),
        );
        const accepted = await json<{
          case: { values: Record<string, unknown> };
        }>(
          await request(`/review-items/${items[0].id}/accept`, "POST", {
            draft: patched.draft,
          }),
        );
        assert.equal(accepted.case.values[checkbox.id], true);
      },
    );
    await t.test(
      "만료 정리는 중단된 스테이징만 삭제하고 최근 파일과 게시된 파일을 보존",
      async () => {
        const storage = app.get(LocalStorage);
        const stale = randomUUID(),
          fresh = randomUUID(),
          published = randomUUID(),
          uploadId = randomUUID();
        for (const fileId of [stale, fresh, published])
          await storage.stage(fileId, png);
        const old = new Date(Date.now() - 7200000);
        await utimes(
          join(lease.config.storageRoot, ".incoming", stale),
          old,
          old,
        );
        await storage.publish(uploadId, published);
        await utimes(
          join(lease.config.storageRoot, uploadId, published),
          old,
          old,
        );
        await uploads.cleanup();
        const incoming = await readdir(
          join(lease.config.storageRoot, ".incoming"),
        );
        assert.ok(!incoming.includes(stale));
        assert.ok(incoming.includes(fresh));
        assert.ok(
          (await readdir(join(lease.config.storageRoot, uploadId))).includes(
            published,
          ),
        );
        // 반복 실행도 이미 삭제된 파일을 허용한다.
        await uploads.cleanup();
      },
    );
    await t.test(
      "SSE는 연결 후 계정이 비활성화되면 추가 이벤트 없이 종료",
      async () => {
        const { jobId } = await generation.create(set.id, admin.account.id, {
          kind: "append",
          memo: "권한 확인",
        });
        try {
          for (const change of [{ status: "inactive" as const }]) {
            const abort = new AbortController();
            const timer = setTimeout(() => abort.abort(), 3000);
            try {
              const stream = await fetch(
                `${base}/generations/${jobId}/events`,
                { headers: { Cookie: cookie }, signal: abort.signal },
              );
              assert.equal(stream.status, 200);
              const reader = stream.body?.getReader();
              assert.ok(reader);
              assert.match(
                new TextDecoder().decode((await reader.read()).value),
                /event: progress/,
              );
              await db
                .update(accountRows)
                .set(change)
                .where(eq(accountRows.id, admin.account.id));
              await assert.rejects(
                generation.visibleJob(jobId, admin.account.id),
              );
              const next = await reader.read();
              assert.equal(next.done, true);
            } finally {
              clearTimeout(timer);
              abort.abort();
              await db
                .update(accountRows)
                .set({ status: "active" })
                .where(eq(accountRows.id, admin.account.id));
            }
          }
        } finally {
          await generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "SSE는 연결에 쓴 세션이 폐기되면 추가 이벤트 없이 종료",
      async () => {
        const { jobId } = await generation.create(set.id, admin.account.id, {
          kind: "append",
          memo: "세션 확인",
        });
        const { token } = await auth.login(admin.account.loginId, password);
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 3000);
        try {
          const stream = await fetch(`${base}/generations/${jobId}/events`, {
            headers: { Cookie: `${SESSION_COOKIE}=${token}` },
            signal: abort.signal,
          });
          assert.equal(stream.status, 200);
          const reader = stream.body?.getReader();
          assert.ok(reader);
          assert.match(
            new TextDecoder().decode((await reader.read()).value),
            /event: progress/,
          );
          // 관리자가 비밀번호를 다시 정한 것처럼 이 세션만 지운다. 계정은 활성 그대로다.
          await auth.logout(token);
          const next = await reader.read();
          assert.equal(next.done, true);
        } finally {
          clearTimeout(timer);
          abort.abort();
          await generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "앱을 종료하고 다시 시작해도 미완료 단계부터 자동 실행",
      async () => {
        const { jobId } = await generation.create(set.id, admin.account.id, {
          kind: "append",
          memo: "실제 재시작",
        });
        const [snapshot] = await db
          .select()
          .from(generationSteps)
          .where(
            and(
              eq(generationSteps.jobId, jobId),
              eq(generationSteps.stage, "context"),
            ),
          );
        const context = snapshot.input as GenerationInput;
        await runner.step(jobId, "screens", "memo", context, {
          frames: [],
          memo: context.memo,
        });
        const [saved] = await db
          .select()
          .from(generationSteps)
          .where(
            and(
              eq(generationSteps.jobId, jobId),
              eq(generationSteps.stage, "screens"),
            ),
          );
        await app.close();
        app = await createApp(
          {
            ...lease.config,
            ai: readAiConfig({ AI_PROVIDER: "fake" }),
            queuePollingSeconds: 0.5,
          },
          lease.folder,
        );
        await app.get(LocalStorage).initialize();
        await app.listen(0, "127.0.0.1");
        const restarted = app.get(GenerationService);
        let status = "queued";
        for (let i = 0; i < 600; i++) {
          status = (await restarted.visibleJob(jobId, admin.account.id)).status;
          if (status === "succeeded" || status === "failed") break;
          await delay(30);
        }
        assert.equal(status, "succeeded");
        const [reused] = await db
          .select()
          .from(generationSteps)
          .where(eq(generationSteps.id, saved.id));
        assert.equal(reused.attempts, 1);
        assert.equal(
          reused.completedAt?.getTime(),
          saved.completedAt?.getTime(),
        );
        assert.equal(reused.input, null);
        assert.equal(reused.output, null);
      },
    );
    assert.equal(
      (
        await db
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.testSetId, set.id))
      ).length >= 3,
      true,
    );
    assert.ok(
      (
        await db
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.testSetId, set.id))
      ).length >= 8,
    );
  } finally {
    await app.close();
    await lease.close();
  }
});
