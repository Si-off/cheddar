import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { type CaseOp, isCellImage } from "@cheddar/contracts";
import { readMigrationFiles } from "drizzle-orm/migrator";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import { ApiError } from "../src/common/errors";
import type { CellImageDto } from "../src/contracts/cell-image.dto";
import type { TestSetColumnDto } from "../src/contracts/test-set.dto";
import { generationJobs } from "../src/database/schema";
import { validateDraft } from "../src/generation/output-schema";
import { fingerprint, StageRunner } from "../src/generation/stage-runner";
import { isEmptyCell } from "../src/generation/steps/column-rules";
import type { GenerationInput } from "../src/generation/types";
import { LiveEvents } from "../src/live/live-events";
import { ProjectsService } from "../src/projects/projects.service";
import { defaultColumns, validateTemplate } from "../src/projects/template";
import { SharingService } from "../src/sharing/sharing.service";
import { LocalStorage } from "../src/storage/local-storage";
import { CaseOperationsService } from "../src/test-sets/case-operations.service";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import {
  cellText,
  validateCell,
  validateOps,
  withoutCellImages,
} from "../src/test-sets/values";
import { openTestDatabase } from "./database";

const failed = (e: unknown) => e instanceof ApiError && e.getStatus() === 400;
const textColumn = (): TestSetColumnDto => ({
  id: randomUUID(),
  name: "메모",
  description: "",
  type: "text",
  options: [],
  colors: {},
  presetKey: null,
  systemKey: null,
});

test("셀 이미지와 항목 색의 값 계약 및 AI 문맥", () => {
  const column = textColumn(),
    image = { image: randomUUID() };
  assert.throws(() => validateCell(column, image), failed);
  assert.deepEqual(validateCell(column, image, new Set([image.image])), image);
  for (const type of ["select", "tags", "checkbox"] as const)
    assert.throws(
      () => validateCell({ ...column, type }, image, new Set([image.image])),
      failed,
    );
  assert.throws(
    () =>
      validateCell(
        column,
        { image: image.image, extra: true },
        new Set([image.image]),
      ),
    failed,
  );
  assert.throws(() => validateCell(column, { image: "bad-id" }), failed);
  assert.equal(cellText(image), "");
  assert.equal(
    isEmptyCell(image),
    false,
    "AI 빈 셀 채우기는 이미지 셀을 건너뛴다",
  );
  assert.throws(() => validateDraft([column], { [column.id]: image }), failed);
  assert.deepEqual(
    withoutCellImages({ cases: [{ values: { [column.id]: image } }] }),
    { cases: [{ values: { [column.id]: "" } }] },
  );
  const input = { columns: [column] } as GenerationInput;
  assert.equal(
    fingerprint(input, { [column.id]: image }),
    fingerprint(input, { [column.id]: "" }),
  );
  const op = {
    type: "update_column",
    columnId: column.id,
    name: "메모",
    description: "",
    colors: { 완료: "green" },
    options: ["완료"],
    columnType: "select",
  };
  assert.equal(validateOps({ ops: [op] })[0].type, "update_column");
  for (const colors of [null, [], { 완료: "orange" }])
    assert.throws(() => validateOps({ ops: [{ ...op, colors }] }), failed);
  assert.throws(() => validateOps({ ops: [{ ...op, options: null }] }), failed);
  const columns = [
    ...defaultColumns(),
    {
      ...column,
      type: "select",
      options: ["완료"],
      colors: { 완료: "green", 삭제됨: "red" },
      enabled: true,
    },
  ];
  assert.deepEqual(
    validateTemplate({ revision: 1, columns }).columns.at(-1)?.colors,
    { 완료: "green" },
  );
});

test("실제 PostgreSQL에서 셀 형식, 이미지 HTTP 권한과 XLSX", async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(lease.config, lease.folder);
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1`;
    const accounts = app.get(AccountsService),
      auth = app.get(AuthService),
      projects = app.get(ProjectsService),
      sets = app.get(TestSetsService),
      ops = app.get(CaseOperationsService),
      sharing = app.get(SharingService);
    const admin = await createFirstAdministrator(
      app.get(AuthorizationService),
      accounts,
      "celltypes@example.com",
      "셀 테스트",
    );
    lease.accountIds.push(admin.account.id);
    const password = "셀-형식-검증-12345";
    await accounts.resetPassword(admin.account.id, password);
    const account = admin.account.id;
    const cookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.loginId, password)).token}`;
    const project = await projects.create(account, {
      name: "셀 형식",
      description: "",
    });
    const set = await sets.create(account, {
      projectId: project.id,
      name: "셀 형식",
      memo: "",
    });
    const other = await sets.create(account, {
      projectId: project.id,
      name: "다른 세트",
      memo: "",
    });
    const json = async <T>(res: Response, status = 200): Promise<T> => {
      assert.equal(res.status, status, await res.clone().text());
      return (await res.json()) as T;
    };
    const request = (
      path: string,
      method = "GET",
      body?: FormData,
      actor = cookie,
    ) =>
      fetch(`${base}${path}`, {
        method,
        headers: actor ? { Cookie: actor } : {},
        body,
      });
    const upload = (
      path: string,
      bytes: Uint8Array,
      type = "image/png",
      actor = cookie,
    ) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(bytes)], { type }), "image");
      return request(path, "POST", form, actor);
    };
    const imagePath = `/test-sets/${set.id}/images`;
    const png = await sharp({
      create: { width: 200, height: 120, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    const image = await json<CellImageDto>(await upload(imagePath, png), 201);
    assert.equal(image.width, 200);
    assert.equal(image.height, 120);
    let webp: CellImageDto;
    await t.test("형식과 10MB 제한, 조회 권한과 세트 경계", async () => {
      for (const [bytes, mime] of [
        [Buffer.from("<svg></svg>"), "image/svg+xml"],
        [png, "image/jpeg"],
        [Buffer.alloc(10 * 1024 * 1024 + 1), "image/png"],
        [png.subarray(0, 32), "image/png"],
      ] as const)
        await json(await upload(imagePath, bytes, mime), 400);
      await json(await upload(imagePath, png, "image/png", ""), 401);
      const res = await request(`${imagePath}/${image.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "image/png");
      assert.equal(
        res.headers.get("Cache-Control"),
        "private, max-age=31536000, immutable",
      );
      assert.equal(Number(res.headers.get("Content-Length")), png.length);
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), png);
      await json(
        await request(`/test-sets/${other.id}/images/${image.id}`),
        404,
      );
      await json(
        await request(`${imagePath}/${image.id}`, "GET", undefined, ""),
        401,
      );
      for (const format of ["jpeg", "gif", "webp"] as const) {
        const bytes = await sharp(png).toFormat(format).toBuffer();
        const uploaded = await json<CellImageDto>(
          await upload(imagePath, bytes, `image/${format}`),
          201,
        );
        if (format === "webp") webp = uploaded;
      }
    });
    const col = textColumn();
    const select = {
      ...textColumn(),
      type: "select" as const,
      options: ["완료", '확인"필요', "기본색"],
      colors: {
        완료: "green" as const,
        '확인"필요': "red" as const,
        기본색: "gray" as const,
        목록밖: "blue" as const,
      },
    };
    const addColumn = (column: TestSetColumnDto) =>
      ops.apply(set.id, account, {
        ops: [
          {
            type: "add_column",
            columnId: column.id,
            afterColumnId: set.columns[0].id,
            column: {
              name: column.name,
              type: column.type,
              description: column.description,
              options: column.options,
              colors: column.colors,
              presetKey: column.presetKey,
            },
          },
        ],
      });
    select.name = "진행 상태";
    await addColumn(col);
    await addColumn(select);
    const imageCase = randomUUID(),
      stringCase = randomUUID();
    await ops.apply(set.id, account, {
      ops: [
        {
          type: "add_case",
          caseId: imageCase,
          afterCaseId: null,
          values: { [col.id]: { image: image.id }, [select.id]: "완료" },
        },
        {
          type: "add_case",
          caseId: stringCase,
          afterCaseId: imageCase,
          values: { [col.id]: "목록 밖", [select.id]: '확인"필요' },
        },
      ],
    });
    await t.test("색 저장, 목록 밖 색 제거와 양식 복사", async () => {
      const detail = await sets.detail(set.id, account);
      assert.deepEqual(detail.columns.find((c) => c.id === select.id)?.colors, {
        완료: "green",
        '확인"필요': "red",
        기본색: "gray",
      });
      assert.equal(
        detail.columns.find((c) => c.presetKey === "qa_result")?.colors?.Pass,
        "green",
      );
      const recent = await sets.recentTemplate(project.id, account);
      assert.deepEqual(
        recent.columns.find((c) => c.id === select.id)?.colors,
        detail.columns.find((c) => c.id === select.id)?.colors,
      );
      const copy = await sets.create(account, {
        projectId: project.id,
        name: "最近の書式",
        memo: "",
        template: { kind: "recent" },
      });
      assert.deepEqual(
        copy.columns.find((c) => c.name === select.name)?.colors,
        detail.columns.find((c) => c.id === select.id)?.colors,
      );
      const template = await projects.template(project.id, account);
      const custom = {
        ...textColumn(),
        type: "select" as const,
        enabled: true,
        options: ["완료"],
        colors: { 완료: "teal" as const, 삭제됨: "red" as const },
      };
      const updated = await projects.saveTemplate(project.id, {
        revision: template.revision,
        columns: [...template.columns, custom],
      });
      assert.deepEqual(updated.columns.at(-1)?.colors, { 완료: "teal" });
      const fromTemplate = await sets.create(account, {
        projectId: project.id,
        name: "양식 복사",
        memo: "",
      });
      assert.deepEqual(
        fromTemplate.columns.find(
          (c) => c.id !== custom.id && c.name === custom.name,
        )?.colors,
        { 완료: "teal" },
      );
    });
    await t.test(
      "이미지는 자기 세트의 텍스트 열만 허용하고 일괄 편집은 원자적이다",
      async () => {
        for (const [id, columnId, value] of [
          [set.id, select.id, { image: image.id }],
          [set.id, col.id, { image: randomUUID() }],
          [other.id, other.columns[1].id, { image: image.id }],
        ] as const)
          await assert.rejects(
            ops.apply(id, account, {
              ops: [
                {
                  type: "add_case",
                  caseId: randomUUID(),
                  afterCaseId: null,
                  values: { [columnId]: value },
                },
              ],
            }),
            failed,
          );
        await assert.rejects(
          ops.apply(set.id, account, {
            ops: [
              {
                type: "set_cell",
                caseId: imageCase,
                columnId: col.id,
                value: { image: randomUUID() },
              },
            ],
          }),
          failed,
        );
      },
    );
    await t.test("XLSX의 조건부 서식과 셀 이미지, 비율과 행 높이", async () => {
      const imageCol = set.columns.find((c) => c.presetKey === "steps");
      assert.ok(imageCol);
      await ops.apply(set.id, account, {
        ops: [
          {
            type: "set_cell",
            caseId: imageCase,
            columnId: imageCol.id,
            value: { image: webp.id },
          },
          {
            type: "set_cell",
            caseId: stringCase,
            columnId: imageCol.id,
            value: { image: webp.id },
          },
        ],
      });
      const file = await sets.export(set.id, account);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(file.data as never);
      const sheet = book.worksheets[0];
      const imgs = sheet.getImages() as unknown as {
        range: { editAs: string; ext: { width: number; height: number } };
      }[];
      assert.equal(imgs.length, 3);
      assert.equal(imgs[0].range.editAs, "oneCell");
      const extent = imgs[0].range.ext;
      assert.ok(extent);
      assert.equal(extent.width / extent.height, 200 / 120);
      assert.ok(
        imgs.every(
          (i) =>
            i.range.ext && i.range.ext.height <= 96 && i.range.ext.width <= 160,
        ),
      );
      const model = sheet.model as typeof sheet.model & {
        conditionalFormattings: {
          rules: {
            type: string;
            operator: string;
            formulae: string[];
            style: unknown;
          }[];
        }[];
      };
      const rules = model.conditionalFormattings.flatMap((c) => c.rules);
      assert.ok(
        rules.some(
          (r) =>
            r.type === "cellIs" &&
            r.operator === "equal" &&
            r.formulae[0] === '"확인""필요"',
        ),
      );
      assert.ok(rules.every((r) => r.formulae[0] !== '"기본색"'));
      assert.ok(JSON.stringify(rules).includes("FFEDF7F0"));
      const current = await sets.detail(set.id, account);
      const imageIndex = current.columns.findIndex((c) => c.id === col.id) + 1;
      assert.equal(sheet.getCell(3, imageIndex).value, "");
      assert.ok((sheet.getRow(3).height ?? 0) >= 72);
      const stepsIndex =
        current.columns.findIndex((c) => c.id === imageCol.id) + 1;
      assert.equal(sheet.getCell(3, stepsIndex).isMerged, false);
      assert.equal(sheet.getCell(4, stepsIndex).isMerged, false);
    });
    await t.test(
      "AI 열 채우기는 요청 시점과 저장 시점의 이미지를 덮어쓰지 않는다",
      async () => {
        const concurrent = randomUUID(),
          blank = randomUUID();
        await ops.apply(set.id, account, {
          ops: [concurrent, blank].map((caseId) => ({
            type: "add_case",
            caseId,
            afterCaseId: stringCase,
          })),
        });
        const snapshot = await sets.detail(set.id, account);
        const [job] = await lease.database.db
          .insert(generationJobs)
          .values({
            testSetId: set.id,
            requestedBy: account,
            kind: "fill_column",
            status: "running",
          })
          .returning();
        await ops.apply(set.id, account, {
          ops: [
            {
              type: "set_cell",
              caseId: concurrent,
              columnId: col.id,
              value: { image: image.id },
            },
          ],
        });
        const input: GenerationInput = {
          columns: snapshot.columns,
          existingCases: snapshot.cases,
          fillColumn: col,
          memo: "",
          frames: [],
          featureGroups: [],
          viewpoints: [],
          screenStructure: [],
          styleExamples: [],
        };
        await app
          .get(StageRunner)
          .finishFill(
            job,
            input,
            Object.fromEntries(snapshot.cases.map((c) => [c.id, "AI 글자"])),
          );
        const result = await sets.detail(set.id, account);
        for (const id of [imageCase, concurrent])
          assert.deepEqual(
            result.cases.find((c) => c.id === id)?.values[col.id],
            { image: image.id },
          );
        assert.equal(
          result.cases.find((c) => c.id === blank)?.values[col.id],
          "AI 글자",
        );
      },
    );
    await t.test(
      "텍스트→선택 전환은 글자 보존, 이미지 비우기와 실시간 전파",
      async () => {
        const before = await sets.detail(set.id, account);
        const events = app.get(LiveEvents),
          published: unknown[] = [];
        const original = events.publish.bind(events);
        events.publish = async (event) => {
          published.push(event);
          await original(event);
        };
        try {
          const result = await ops.apply(set.id, account, {
            ops: [
              {
                type: "update_column",
                columnId: col.id,
                name: col.name,
                description: "",
                columnType: "select",
                options: ["완료"],
                colors: { 완료: "green", 없음: "red" },
              },
            ],
          });
          assert.equal(result.version, before.version + 1);
          assert.equal(
            result.cases.find((c) => c.id === imageCase)?.values[col.id],
            null,
          );
          const detail = await sets.detail(set.id, account);
          assert.equal(
            detail.columns.find((c) => c.id === col.id)?.type,
            "select",
          );
          assert.equal(
            detail.cases.find((c) => c.id === stringCase)?.values[col.id],
            "목록 밖",
          );
          assert.deepEqual(
            detail.columns.find((c) => c.id === col.id)?.colors,
            { 완료: "green" },
          );
          assert.ok(
            (published[0] as { ops: CaseOp[] }).ops.some(
              (op) =>
                op.type === "set_cell" &&
                op.caseId === imageCase &&
                op.value === null,
            ),
          );
        } finally {
          events.publish = original;
        }
        await ops.apply(set.id, account, {
          ops: [
            {
              type: "update_column",
              columnId: col.id,
              name: col.name,
              description: "",
              options: ["다른 값"],
            },
          ],
        });
        assert.deepEqual(
          (await sets.detail(set.id, account)).columns.find(
            (c) => c.id === col.id,
          )?.colors,
          {},
        );
        const preset = set.columns.find((c) => c.presetKey === "qa_result");
        assert.ok(preset);
        for (const op of [
          { columnId: col.id, columnType: "select", options: ["완료"] },
          { columnId: preset.id, columnType: "select", options: ["완료"] },
          { columnId: set.columns[1].id, colors: { 완료: "red" } },
        ])
          await assert.rejects(
            ops.apply(set.id, account, {
              ops: [
                { type: "update_column", name: "수정", description: "", ...op },
              ],
            }),
            failed,
          );
        const newCol = textColumn();
        newCol.name = "추가 메모";
        await addColumn(newCol);
        await assert.rejects(
          ops.apply(set.id, account, {
            ops: [
              {
                type: "update_column",
                columnId: newCol.id,
                name: newCol.name,
                description: "",
                columnType: "select",
              },
            ],
          }),
          failed,
        );
      },
    );
    await t.test(
      "공개 링크 읽기와 편집, 방문자 이미지와 링크 교체",
      async () => {
        const state = await sharing.patch(set.id, account, {
          visibility: "public",
          linkPermission: "view",
        });
        const path = `/shared/${state.linkToken}/images`;
        await json(await upload(path, png, "image/png", ""), 403);
        const view = await request(`${path}/${image.id}`, "GET", undefined, "");
        assert.equal(view.status, 200);
        await view.arrayBuffer();
        await json(
          await request(`${path}/${randomUUID()}`, "GET", undefined, ""),
          404,
        );
        await sharing.patch(set.id, account, { linkPermission: "edit" });
        const visitorImage = await json<CellImageDto>(
          await upload(path, png, "image/png", ""),
          201,
        );
        const rotated = await sharing.rotate(set.id, account);
        const response = await request(
          `/shared/${rotated.linkToken}/images/${visitorImage.id}`,
          "GET",
          undefined,
          "",
        );
        assert.equal(response.status, 200);
        await response.arrayBuffer();
        await json(
          await request(`${path}/${image.id}`, "GET", undefined, ""),
          404,
        );
        assert.ok(isCellImage({ image: visitorImage.id }));
      },
    );
  } finally {
    await app.close();
    await lease.close();
  }
});

test("0014는 기존 세트와 프로젝트 양식에 기본 색과 빈 색 객체를 채운다", async () => {
  const lease = await openTestDatabase();
  const client = await lease.database.pool.connect();
  const schema = `cell_types_migration_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const migrations = readMigrationFiles({ migrationsFolder: lease.folder });
    const run = async (index: number) => {
      for (const statement of migrations[index].sql)
        await client.query(statement.replaceAll('"public".', `"${schema}".`));
    };
    for (let i = 0; i < 14; i++) await run(i);
    const account = randomUUID(),
      project = randomUUID(),
      set = randomUUID();
    await client.query(
      "INSERT INTO accounts (id,name,login_id,role,status,password_hash) VALUES ($1,'관리자','cell-migration','admin','active','hash')",
      [account],
    );
    await client.query(
      "INSERT INTO projects (id,name,created_by) VALUES ($1,'이전 프로젝트',$2)",
      [project, account],
    );
    await client.query(
      "INSERT INTO test_sets (id,name,project_id,owner_id) VALUES ($1,'이전 세트',$2,$3)",
      [set, project, account],
    );
    const columns = [...defaultColumns(), { ...textColumn(), enabled: true }];
    await client.query(
      "INSERT INTO project_templates (project_id,columns) VALUES ($1,$2::jsonb)",
      [
        project,
        JSON.stringify(columns.map(({ colors: _colors, ...column }) => column)),
      ],
    );
    for (const [position, column] of columns.entries())
      await client.query(
        "INSERT INTO test_set_columns (id,test_set_id,name,type,preset_key,options,position) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)",
        [
          column.id,
          set,
          column.name,
          column.type,
          column.presetKey,
          JSON.stringify(column.options),
          position,
        ],
      );
    await run(14);
    const rows = (
      await client.query(
        "SELECT preset_key, colors FROM test_set_columns ORDER BY position",
      )
    ).rows;
    assert.equal(
      rows.find((c) => c.preset_key === "qa_result").colors.Pass,
      "green",
    );
    assert.equal(
      rows.find((c) => c.preset_key === "dev_status").colors.수정중,
      "blue",
    );
    assert.deepEqual(rows.at(-1).colors, {});
    const template = (
      await client.query("SELECT columns FROM project_templates")
    ).rows[0].columns;
    assert.deepEqual(
      template.map((c: { colors: unknown }) => c.colors),
      rows.map((c) => c.colors),
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await lease.close();
  }
});
