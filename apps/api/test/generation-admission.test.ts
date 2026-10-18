import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ApiError } from "../src/common/errors";
import { DatabaseService } from "../src/database/database.service";
import { GenerationRepository } from "../src/generation/generation.repository";
import { ProjectsRepository } from "../src/projects/projects.repository";
import { TemplatesRepository } from "../src/templates/templates.repository";
import { TestScenariosRepository } from "../src/test-scenarios/test-scenarios.repository";
import { openTestDatabase } from "./database";

test("database admission bounds concurrent projects across independent API pools and retains idempotence", async () => {
  const lease = await openTestDatabase();
  const otherDatabase = new DatabaseService(lease.config);
  try {
    const testScenarios = new TestScenariosRepository(lease.database);
    const templates = new TemplatesRepository(lease.database);
    const repositories = [
      new GenerationRepository(lease.database, testScenarios),
      new GenerationRepository(
        otherDatabase,
        new TestScenariosRepository(otherDatabase),
      ),
    ];
    const inputs = [];
    for (let i = 0; i < 3; i++) {
      const project = await new ProjectsRepository(lease.database).create({
        name: `Admission ${i}`,
      });
      lease.projects.push(project.id);
      const scenario = await testScenarios.create(
        project.id,
        { name: "Synthetic", kind: "unit" },
        templates.readSnapshot.bind(templates),
      );
      inputs.push({
        projectId: project.id,
        testScenarioId: scenario.id,
        request: {
          clientRequestId: randomUUID(),
          provider: "openai" as const,
          expectedRevision: 1,
          description: "Test",
        },
      });
    }
    const results = await Promise.allSettled(
      inputs.map((item, i) =>
        repositories[i % 2].start(
          item.projectId,
          item.testScenarioId,
          item.request,
          "synthetic",
          2,
        ),
      ),
    );
    const accepted = results.flatMap((item, i) =>
      item.status === "fulfilled" ? [{ index: i, ...item.value }] : [],
    );
    const rejected = results.filter((item) => item.status === "rejected");
    assert.equal(accepted.length, 2);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0].status === "rejected" &&
        rejected[0].reason instanceof ApiError &&
        rejected[0].reason.code === "GENERATION_CAPACITY",
    );
    const first = inputs[accepted[0].index];
    const repeated = await repositories[1].start(
      first.projectId,
      first.testScenarioId,
      first.request,
      "synthetic",
      2,
    );
    assert.equal(repeated.job.id, accepted[0].job.id);
    assert.equal(repeated.created, false);
    await repositories[0].fail(
      accepted[0].job,
      "Synthetic stop",
      performance.now(),
    );
    const retry =
      inputs[results.findIndex((item) => item.status === "rejected")];
    assert.equal(
      (
        await repositories[0].start(
          retry.projectId,
          retry.testScenarioId,
          retry.request,
          "synthetic",
          2,
        )
      ).created,
      true,
    );
  } finally {
    await otherDatabase.onModuleDestroy();
    await lease.close();
  }
});
