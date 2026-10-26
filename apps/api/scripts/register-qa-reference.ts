import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { readEnv } from "../src/config/env";
import { DatabaseService } from "../src/database/database.service";
import { projectQaReferences, projects } from "../src/database/schema";
import { readQaReference } from "../src/generation/pi/reference";

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      file: { type: "string" },
      sheet: { type: "string", multiple: true },
      remove: { type: "boolean" },
    },
  });
  if (!values.project || (!values.remove && !values.file))
    throw new Error(
      "--project <프로젝트 UUID> --file <xlsx 경로> [--sheet <시트 이름>] 또는 --remove를 지정하세요.",
    );
  const db = new DatabaseService(readEnv());
  try {
    const [project] = await db.db
      .select()
      .from(projects)
      .where(eq(projects.id, values.project));
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
    if (values.remove) {
      await db.db
        .delete(projectQaReferences)
        .where(eq(projectQaReferences.projectId, project.id));
      console.log("프로젝트의 기준 QA 문서 연결을 해제했습니다.");
      return;
    }
    const document = await readQaReference(
      await readFile(values.file!),
      basename(values.file!),
      values.sheet,
    );
    await db.db
      .insert(projectQaReferences)
      .values({ projectId: project.id, document })
      .onConflictDoUpdate({
        target: projectQaReferences.projectId,
        set: { document, updatedAt: new Date() },
      });
    console.log(
      JSON.stringify({
        project: project.name,
        reference: document.name,
        sheets: document.sheets.map((s) => ({
          name: s.name,
          rows: s.rows.length,
        })),
      }),
    );
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "기준 문서 등록에 실패했습니다.",
  );
  process.exitCode = 1;
});
