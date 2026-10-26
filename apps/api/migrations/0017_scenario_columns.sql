-- 사전 정의 열의 이름, 형식, 화면 설명, 값 목록, 색을 2026-10-26 정의로 맞춘다.
-- 0007이 presetKey를 비운 이전 양식과 세트는 이름, 형식, systemKey가 같은 열을 사전 정의 열로 되돌린다.
CREATE TEMP TABLE "presets_0017" (
  "position" integer NOT NULL,
  "preset_key" text NOT NULL,
  "system_key" text,
  "enabled" boolean NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "options" jsonb NOT NULL,
  "colors" jsonb NOT NULL
);--> statement-breakpoint
INSERT INTO "presets_0017" VALUES
  (1, 'test_id', 'test_id', true, '테스트 ID', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (2, 'test_env', NULL, true, '테스트 환경', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (3, 'test_case', NULL, true, '테스트 케이스', 'text', '시나리오 이름', '[]'::jsonb, '{}'::jsonb),
  (4, 'title', 'title', true, '제목', 'text', '테스트 케이스 안의 하위 시나리오 이름', '[]'::jsonb, '{}'::jsonb),
  (5, 'user_role', NULL, true, '사용자/관리자', 'select', '', '["사용자","관리자"]'::jsonb, '{"사용자":"gray","관리자":"gray"}'::jsonb),
  (6, 'screen_id', NULL, true, '화면 ID 또는 URL', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (7, 'steps', NULL, true, '수행 절차', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (8, 'expected', NULL, true, '예상 결과', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (9, 'qa_result', NULL, true, 'QA 결과', 'select', '', '["Pass","Fail","Deferred","N/A","-","추가 요청"]'::jsonb, '{"Pass":"green","Fail":"red","Deferred":"yellow","N/A":"gray","-":"gray","추가 요청":"yellow"}'::jsonb),
  (10, 'qa_owner', NULL, true, 'QA 담당자', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (11, 'result_comment', NULL, true, '결과 및 의견', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (12, 'dev_status', NULL, true, '개발 진행 상태', 'select', '', '["완료","수정중","수정 완료","보류","기타","-"]'::jsonb, '{"완료":"green","수정중":"blue","수정 완료":"green","보류":"yellow","기타":"gray","-":"gray"}'::jsonb),
  (13, 'dev_owner', NULL, true, '개발 담당자', 'text', '', '[]'::jsonb, '{}'::jsonb),
  (14, 'extra', NULL, false, '추가 정보', 'text', '', '[]'::jsonb, '{}'::jsonb);--> statement-breakpoint
WITH "matched" AS (
  SELECT t."project_id", e."item", e."position",
    COALESCE(
      e."item"->>'presetKey',
      (SELECT p."preset_key" FROM "presets_0017" p
        WHERE p."name" = e."item"->>'name'
          AND p."type" = e."item"->>'type'
          AND p."system_key" IS NOT DISTINCT FROM e."item"->>'systemKey'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(t."columns") o
            WHERE o->>'presetKey' = p."preset_key"))
    ) AS "preset_key"
  FROM "project_templates" t,
    jsonb_array_elements(t."columns") WITH ORDINALITY AS e("item", "position")
), "missing" AS (
  -- 양식에는 사전 정의 열이 모두 있어야 한다. 되돌리지 못한 열은 기본 상태로 끝에 더한다.
  SELECT t."project_id", p.*
  FROM "project_templates" t CROSS JOIN "presets_0017" p
  WHERE NOT EXISTS (
    SELECT 1 FROM "matched" m
    WHERE m."project_id" = t."project_id" AND m."preset_key" = p."preset_key")
), "next" AS (
  SELECT t."project_id",
    (SELECT count(*) FROM "matched" m WHERE m."project_id" = t."project_id")
      + (SELECT count(*) FROM "missing" x WHERE x."project_id" = t."project_id") AS "total",
    COALESCE((
      SELECT jsonb_agg("column" ORDER BY "order", "position")
      FROM (
        SELECT 0 AS "order", m."position",
          CASE
            WHEN p."preset_key" IS NOT NULL THEN m."item" || jsonb_build_object(
              'presetKey', p."preset_key", 'systemKey', p."system_key",
              'name', p."name", 'type', p."type", 'description', p."description",
              'options', p."options", 'colors', p."colors")
            -- 형식이 달라 되돌리지 못한 같은 이름의 사용자 열은 값을 두고 이름만 비켜 준다.
            WHEN EXISTS (
              SELECT 1 FROM "missing" x
              WHERE x."project_id" = m."project_id" AND x."name" = m."item"->>'name')
            THEN m."item" || jsonb_build_object('name', (
              SELECT v."name"
              FROM generate_series(1, 50) g("n"),
                LATERAL (SELECT (m."item"->>'name') || ' (사용자 열'
                  || CASE WHEN g."n" = 1 THEN '' ELSE ' ' || g."n" END || ')' AS "name") v
              WHERE NOT EXISTS (
                  SELECT 1 FROM "matched" o
                  WHERE o."project_id" = m."project_id" AND o."item"->>'name' = v."name")
                AND NOT EXISTS (
                  SELECT 1 FROM "missing" x
                  WHERE x."project_id" = m."project_id" AND x."name" = v."name")
              ORDER BY g."n" LIMIT 1))
            ELSE m."item"
          END AS "column"
        FROM "matched" m LEFT JOIN "presets_0017" p ON p."preset_key" = m."preset_key"
        WHERE m."project_id" = t."project_id"
        UNION ALL
        SELECT 1, x."position", jsonb_build_object(
          'id', gen_random_uuid(), 'presetKey', x."preset_key", 'systemKey', x."system_key",
          'enabled', x."enabled", 'name', x."name", 'type', x."type",
          'description', x."description", 'options', x."options", 'colors', x."colors")
        FROM "missing" x
        WHERE x."project_id" = t."project_id"
      ) "columns"
    ), '[]'::jsonb) AS "columns"
  FROM "project_templates" t
)
-- 더하면 양식 열 제한(50개)을 넘는 양식은 그대로 둔다. 다른 양식의 이전은 막지 않는다.
UPDATE "project_templates" t
SET "columns" = n."columns", "revision" = t."revision" + 1, "updated_at" = now()
FROM "next" n
WHERE n."project_id" = t."project_id"
  AND n."total" <= 50
  AND n."columns" IS DISTINCT FROM t."columns";--> statement-breakpoint
UPDATE "test_set_columns" c
SET "preset_key" = p."preset_key"
FROM "presets_0017" p
WHERE c."preset_key" IS NULL
  AND c."name" = p."name"
  AND c."type"::text = p."type"
  AND c."system_key" IS NOT DISTINCT FROM p."system_key"
  AND NOT EXISTS (
    SELECT 1 FROM "test_set_columns" o
    WHERE o."test_set_id" = c."test_set_id" AND o."preset_key" = p."preset_key");--> statement-breakpoint
UPDATE "test_set_columns" c
SET "name" = p."name", "description" = p."description",
  "options" = p."options", "colors" = p."colors"
FROM "presets_0017" p
WHERE c."preset_key" = p."preset_key"
  AND c."type"::text = p."type"
  AND (c."name", c."description", c."options", c."colors")
    IS DISTINCT FROM (p."name", p."description", p."options", p."colors");--> statement-breakpoint
DROP TABLE "presets_0017";
