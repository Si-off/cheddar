# Cheddar

사람이 수행하는 QA 테스트 케이스를 AI로 생성하고 편집·공유·XLSX 내보내기 하는 제품이다. Figma 플러그인은 선택한 프레임의 데이터·이미지 업로드를 담당하고, 생성·편집은 웹에서 수행한다. pnpm workspace 모노레포로 관리하며 Codex를 사용해 개발한다.

## 작업 시작

Codex에서 이 저장소를 프로젝트 작업 위치로 연다. 루트 `AGENTS.md`에서 작업에 맞는 문서를 찾는다. 세부 규칙은 `docs/`에서 관리한다. 다른 폴더에서 시작한 채팅은 이 저장소의 지침을 자동으로 읽는다고 가정하지 않는다.

설정을 처음 적용하거나 바꾼 뒤에는 새 세션에서 실제 적용된 지침의 경로와 주요 규칙을 확인한다. 문서가 존재하는 것과 세션에 로드된 것은 구분한다.

## 문서 안내

| 문서 | 용도 |
| --- | --- |
| [작업별 문서 안내](AGENTS.md) | 작업 조건에 따라 읽을 문서를 찾는 진입점 |
| [제품 정의](docs/product.md) | 현재 확정된 제품 내용과 미정 사항 |
| [구조](docs/architecture.md) | 구성요소·기술 선택의 확정 상태 |
| [작업 절차](docs/workflow.md) | 계획·실행·검증·완료의 기준 |
| [결정 기록 안내](docs/decisions/README.md) | 중요한 선택의 이유를 남기는 방법 |
| [작업 기록 안내](docs/changes/README.md) | 특정 작업을 기록하고 재개하는 방법 |
| [작업 템플릿](docs/templates/change.md) | 필요한 작업에서 사용하는 양식 |

## 소스 위치

- `apps/web/`: 웹 앱
- `apps/figma-plugin/`: Figma 실행 코드·메시지 계약·React UI
- `apps/api/`: NestJS·Drizzle 백엔드와 API 계약·검증
- `packages/ui/`: 기본 UI
- `packages/design-tokens/`: 디자인 토큰

상세 경로와 허용 범위는 [구조 문서](docs/architecture.md)를 따른다. 구현·검증 이력은 [기반 구성](docs/changes/2026-10-15-workspace-setup/change.md), [AI 생성](docs/changes/2026-10-15-mvp-generation/change.md), [화면 개편](docs/changes/2026-10-16-workspace-redesign/change.md)에 있다. 기록은 당시 코드·환경의 결과이며 현재 실행 상태를 보장하지 않는다.

## 개발 환경

- 웹·플러그인: TypeScript, React, Vite, Tailwind CSS, Motion, TanStack Query, Zustand
- 패키지 관리자·린터: pnpm workspace, Biome
- 웹 라우터: TanStack Router
- API 코드 생성: `@hey-api/openapi-ts`
- 상세 기술 결정과 미정 사항: [구조 문서](docs/architecture.md)
- 초기 검증: 로그인·검색 노출 없이 개발자 PC에서 로컬 실행, 백엔드·DB도 로컬 실행
- 도구 버전: nvm 0.40.8, Node 24.22.0 LTS (`.nvmrc`), pnpm 12.11.2 (`packageManager`)
- 백엔드: NestJS·Drizzle·PostgreSQL 17. 저장·AI 생성·내보내기 API를 제공한다. 실행 방법은 아래 백엔드 항목을 따른다.
- 사내 배포 환경과 절차: 추후 결정

## 설치와 실행

저장소 루트에서 실행한다. nvm 설치 후 새 셸을 열거나 nvm을 로드한다.

```sh
nvm install
nvm use
npm install --global pnpm@12.11.2
pnpm install --frozen-lockfile
pnpm dev:web
```

웹은 `http://127.0.0.1:5173/`에서 실행한다. `/`에서 프로젝트·시트를 선택하고 `/projects/<projectId>/sheets/<sheetId>`에서 편집한다. 프로젝트별 `/uploads`, `/sheets`, `/settings` 경로와 AI 생성·후보 검토를 제공한다. 실제 공유 링크 발급·외부 열람은 후속이다. 실제 모델 권한·응답 품질은 사용하는 환경에서 별도로 확인한다.

```sh
pnpm dev:plugin
```

플러그인 UI와 main을 각각 감시 빌드하여 `apps/figma-plugin/dist/index.html`과 `dist/main.js`를 만든다. UI는 CSS·폰트를 포함한 단일 HTML이다. 브라우저에서 UI만 확인하려면 `pnpm --filter @cheddar/figma-plugin dev:ui`를 사용한다 (`http://127.0.0.1:5174/`).

Figma 플러그인 ID는 `1692417282897261384`다. [공식 안내](https://developers.figma.com/docs/plugins/manifest/)에 따라 개발용 manifest를 가져온다. 플러그인의 개발 API 기본 주소는 `http://localhost:3102`다. 실제 Figma의 origin·네트워크 접근·업로드 결과는 [프레임 업로드 작업 기록](docs/changes/2026-10-15-stage-2a-frame-upload/change.md)의 환경과 구분해 현재 환경에서 확인한다.

업로드할 Frame 또는 Section을 선택한다. Section을 선택하면 내부의 최상위 Frame들을 목록에 표시하며, 각 Frame 안의 중첩 프레임은 별도 항목으로 추가하지 않는다. 섹션과 그 안의 프레임을 함께 선택해도 중복 없이 포함한다. 업로드 전에 목록과 개수를 확인한다.

## 검증과 API 코드 생성

명령은 저장소 루트 기준이다. Node·pnpm·의존성은 위 개발 환경을 준비한다. 변경된 동작과 영향을 받는 범위에 맞춰 선택하며, `pnpm check`는 lint·typecheck·build만 수행하고 아래 동작 테스트를 포함하지 않는다. CI는 아직 구성하지 않았다.

| 범위 | 명령 | 필요한 환경과 확인 범위 |
| --- | --- | --- |
| 정적 검사·빌드 | `pnpm check` | 전체 lint·타입·빌드. 개별 실행은 `pnpm lint`, `pnpm typecheck`, `pnpm build` |
| 한 앱의 타입 | `pnpm --filter @cheddar/web typecheck` | API·플러그인은 필터를 `@cheddar/api`·`@cheddar/figma-plugin`으로 변경. 소비 앱 영향은 별도 확인 |
| API 동작·계약 | `pnpm test:api` | 아래 전용 PostgreSQL 설정과 `apps/api/.env.local`. 실제 DB·HTTP·SDK·XLSX 및 합성 AI 응답 검증. 실제 AI 호출·품질은 제외 |
| API 명세 일치 | `pnpm --filter @cheddar/api openapi:check` | DB·서버 없이 DTO에서 생성한 명세와 `apps/api/openapi.json` 비교 |
| 플러그인 로직 | 아래 Node 명령 | 메시지·선택·업로드 세션의 합성 환경 검증. 실제 Figma 실행은 제외 |
| 웹 편집기 | 아래 `editor.spec.ts` 명령 | 웹 서버와 Chromium. HTTP 합성 응답으로 저장·충돌·생성·편집 검증 |
| 프로젝트 설정 | 아래 `project-settings.spec.ts` 명령 | 웹 서버·Chromium·전용 테스트 DB. 테스트가 API를 시작해 실제 저장·조회 검증 |
| 플러그인 UI | 아래 `plugin-redesign.spec.ts` 명령 | 플러그인 UI 서버와 Chromium. Figma 메시지·HTTP 합성 환경 검증 |

플러그인 로직은 기존 세 테스트 파일을 실행한다.

```sh
node --test apps/figma-plugin/src/main/index.test.mjs apps/figma-plugin/src/ui/pages/frame-upload/upload-session.test.mjs apps/figma-plugin/src/ui/shared/lib/figma-bridge.test.mjs
```

브라우저 준비와 목록 확인은 다음과 같다. 캐시·로그·결과는 저장소 밖 OS 임시 경로를 사용한다. 브라우저 설치는 해당 경로에 없을 때만 필요하다. `--list`는 테스트 목록 확인이며 동작 검증 성공을 뜻하지 않는다.

```sh
export PLAYWRIGHT_BROWSERS_PATH="${TMPDIR:-/tmp}/cheddar-playwright-browsers"
pnpm --filter @cheddar/web exec playwright install chromium
pnpm --filter @cheddar/web test:e2e --list
```

편집기 검증은 별도 터미널에서 `pnpm --filter @cheddar/web dev --port 5176`으로 웹을 실행한 뒤 다음을 수행한다. 기존 서버를 사용할 때는 그 코드 기준과 포트를 확인해 `PLAYWRIGHT_BASE_URL`에 지정한다.

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5176 pnpm --filter @cheddar/web test:e2e src/pages/test-case-editor/editor.spec.ts
```

프로젝트 설정 검증은 [백엔드 실행](#백엔드-실행)의 전용 테스트 DB와 환경 파일을 먼저 준비한다. 웹은 별도 터미널에서 아래 주소로 실행하며, 테스트가 API 포트 `3104`를 사용한다. 포트를 바꾸면 `VITE_API_BASE_URL`과 `SETTINGS_TEST_API_PORT`를 함께 맞춘다. 아래 Node 명령은 웹 패키지에서 API 환경 파일을 읽어 테스트 프로세스에 전달한다. API 테스트와 달리 일반 `test:e2e` 명령은 이 파일을 자동으로 읽지 않는다.

```sh
VITE_API_BASE_URL=http://127.0.0.1:3104 pnpm --filter @cheddar/web dev --port 5177
```

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5177 SETTINGS_TEST_API_PORT=3104 pnpm --filter @cheddar/web exec node --env-file=../api/.env.local node_modules/@playwright/test/cli.js test src/pages/project-settings/project-settings.spec.ts
```

플러그인 UI 검증은 별도 터미널에서 `pnpm --filter @cheddar/figma-plugin dev:ui --port 5174`를 실행한다. 현재 테스트의 iframe 주소가 `http://127.0.0.1:5174/`로 고정돼 있으므로 이 테스트에는 해당 포트가 필요하다.

```sh
pnpm --filter @cheddar/web test:e2e src/pages/test-case-editor/plugin-redesign.spec.ts
```

세 브라우저 테스트 전체를 실행하려면 위 설정 화면용 웹·DB·API 환경과 플러그인 UI 서버를 준비하고 설정 화면 명령의 마지막 파일 선택 인자만 생략한다. 실제 Figma, macOS IME, Excel 앱, 외부 AI 호출은 이 검사와 구분해 필요한 경우 별도로 확인한다.

### API 코드 생성

두 앱의 `openapi-ts.config.ts`는 `OPENAPI_INPUT` 환경변수로 실제 명세 URL 또는 절대 경로를 받으며, 타입·Fetch SDK·TanStack Query 코드를 생성한다. 명세가 없으면 명확한 오류로 종료한다. `.env.example`은 설명용이며 코드 생성 시 환경변수는 셸에서 명시적으로 전달한다.

현재 명세는 `apps/api/openapi.json`이며 두 앱의 타입·SDK·Query 코드가 생성되어 있다. 각 `generated/` 아래 `client/`·`core/`·`@tanstack/`는 생성 코드 전용으로 허용했다. 계약 변경 시 다음 순서로 생성·검증한다. `test:api`에는 위 전용 DB 환경이 필요하다.

```sh
pnpm openapi:export
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:web
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:plugin
pnpm --filter @cheddar/api openapi:check
pnpm test:api
pnpm typecheck
```

생성 코드는 위 지정된 경로에 커밋한다. 비교용·테스트용 사본은 OS 임시 경로에 두며 생성 코드를 직접 편집하지 않고 명세·설정 변경 후 다시 만든다.

## 디자인 토큰

UI 디자인 기준과 토큰 사용 규칙은 [공통 디자인 기준](docs/architecture.md#공통-디자인-기준)을 따른다.

[라이트 모드 foundations 미리보기](docs/design-foundations.html)는 폰트와 스타일을 내장한 스탠드얼론 HTML이다. 파일을 브라우저에서 열면 색상, 타이포그래피, 간격, 형태, 모션, 인터랙션을 확인할 수 있다.

프로젝트의 디자인 방향을 비교·결정하기 위한 미리보기다. 합의한 표현은 [DESIGN.md](DESIGN.md)의 공통 원칙으로, 반복해서 사용할 값은 공통 토큰으로 관리한다. 실제 화면은 이 원칙과 토큰을 맥락에 맞게 적용하며, 미리보기의 개별 구현 기법이나 샘플 구성을 제품 컴포넌트 명세로 삼지 않는다.

토큰 원본은 `packages/design-tokens/src/theme.css`, 미리보기 원본은 `packages/design-tokens/preview.template.html`이다. 원본 변경 후 아래 명령으로 HTML을 다시 생성한다.

```sh
node packages/design-tokens/build-preview.mjs
```

HTML 안의 CSS 다운로드는 일반 CSS 변수를 내보낸다. 다운로드하는 CSS에는 폰트 파일이 포함되지 않는다. HTML에는 Fontsource의 Noto Sans와 Noto Sans KR 및 해당 라이선스가 함께 포함된다.

## 공통 컴포넌트

`@cheddar/ui`는 shadcn/ui의 Base UI 구성을 바탕으로 프로젝트 토큰과 모션 원칙을 적용한다. 기존 배경색과 테두리 색상 변화만으로 키보드 포커스를 구분한다.

`pnpm dev:web` 실행 후 [컴포넌트 미리보기](http://127.0.0.1:5173/design-system.html)에서 실제 컴포넌트를 조작할 수 있다. 이 진입점은 개발 모드에서만 렌더링하며 기본 프로덕션 빌드에 포함되지 않는다. 디자인 방향을 비교하는 foundations HTML과 역할이 다르다.

제공 API, 스타일 로드와 사용 예시는 [공통 UI 사용 안내](packages/ui/README.md)를 참고한다.

## 백엔드 실행

명령은 저장소 루트 기준이다. 먼저 로컬 PostgreSQL 17에 전용 role `cheddar_stage1`과 해당 role이 소유하는 `cheddar_stage1`, `cheddar_stage1_test` DB를 준비한다. role은 superuser·다른 DB 생성 권한 없이 사용한다. 기존 이름이 있다면 소유와 사용 목적부터 확인하며 기존 DB를 초기화하지 않는다. 비밀번호는 대화나 명령 로그에 붙여넣지 않고 PostgreSQL의 대화형 `\password` 등 안전한 입력 방식으로 설정한다.

`apps/api/.env.example`을 참고해 Git 제외 파일 `apps/api/.env.local`에 실제 연결 값을 설정한다. 전용 DB·role과 환경 파일의 준비 여부는 현재 환경에서 확인한다. 환경 파일은 다른 worktree로 자동 복사하지 않는다.

| 변수 | 의미 |
| --- | --- |
| `DATABASE_URL` | 전용 실행 DB 연결 |
| `TEST_DATABASE_URL` | 전용 테스트 DB 연결. 실행 DB와 달라야 함 |
| `FILE_STORAGE_ROOT` | Git 밖의 전용 영속 파일 루트. 현재 승인 위치는 `/Users/sion/Library/Application Support/Cheddar/stage-1/files` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | AI 제공자 키. 서버 전용, 사용할 제공자의 키만 설정 |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` | 기본 `claude-haiku-5-5` / `gpt-6-luna` |
| `API_PORT` | 기본 `3101`, loopback에만 listen |
| `CORS_ORIGINS` | 기본 `http://127.0.0.1:5173`. 쉼표로 구분한 정확한 origin |
| `ALLOW_FIGMA_NULL_ORIGIN` | 기본 `false`. `true`는 `NODE_ENV=development`에서만 허용하며 Figma iframe의 `Origin: null`을 허용 |

```sh
pnpm install --store-dir "$HOME/Library/pnpm/store/v11" --package-import-method copy
pnpm db:migrate
pnpm dev:api
```

pnpm 저장소는 저장소 밖에 둔다. `@scarf/scarf` 설치 스크립트는 실행하지 않도록 설정했다. API 앱의 `dev`는 빌드 후 실행이며 파일 변경 시 다시 실행한다. 서버 시작 자체는 migration을 실행하지 않는다.

- `http://127.0.0.1:3101/health/live`: 프로세스 응답
- `http://127.0.0.1:3101/health/ready`: DB migration·테이블·파일 루트 상태
- `http://127.0.0.1:3101/openapi.json`: 실제 제공 API 명세
- `/api/v1/projects`: 프로젝트 생성·목록, `/{projectId}`에서 조회·수정
- `/api/v1/projects/{projectId}/files`: 파일 등록·목록, `/{fileId}`와 `/{fileId}/content`에서 메타데이터·다운로드

파일 업로드는 multipart `file` 필드 하나다. PNG/JPEG/WebP는 20 MiB, UTF-8 JSON은 5 MiB까지이며 선언된 MIME과 내용을 검사한다. 성공한 파일만 노출한다. 생성 요청은 자동 재시도하지 않으며 응답 유실 시 목록에서 처리 결과부터 확인한다. 다운로드 SDK 호출은 원본 바이트가 필요하면 `parseAs: "arrayBuffer"` 또는 `"blob"`을 지정한다.

프로젝트 PATCH는 `expectedRevision`을 요구한다. 충돌 시 409와 현재 revision을 반환하며 클라이언트는 미저장 입력을 보존한다. API는 로그인 없는 로컬 환경이며 CORS·프로젝트 소속 검사를 인증으로 간주하지 않는다.

## 백엔드 검증과 계약 갱신

실행 명령과 범위는 [검증 안내](#검증과-api-코드-생성)를 따른다.

테스트는 `TEST_DATABASE_URL`의 이름·로컬 host·role·DB 소유권·superuser 여부를 확인하고 같은 테스트 DB의 동시 실행을 막는다. 실행 DB와 같거나 테스트 설정이 없으면 실패하며 건너뛰지 않는다. 테스트는 자신이 만든 UUID 행과 OS 임시 파일만 정리한다. 실제 DB로 임의 전환하거나 truncate/drop하지 않는다. 실패 주입 테스트의 503 로그는 의도한 검증 결과다.

스키마를 바꾸면 `pnpm --filter @cheddar/api db:generate`로 SQL을 만들고 검토한 뒤 `pnpm db:migrate`로 적용한다. `migrations/`의 SQL·도구 meta를 함께 커밋하며 자동 schema push를 사용하지 않는다.

명세·SDK 갱신은 [API 코드 생성](#api-코드-생성)을 따른다.

명세 export/check는 DB 연결·포트 listen·파일 저장 루트 생성 없이 실행한다. DTO와 실제 응답을 계약 테스트로 검증하고 두 생성 SDK의 프로젝트·multipart·다운로드 호출도 HTTP로 확인한다. 생성 코드는 직접 편집하지 않는다. 업로드·시트·IA·기본 양식은 실제 API와 양쪽 생성 SDK에 연결되어 있다.

DB 백업과 `FILE_STORAGE_ROOT` 전체를 함께 옮기면 저장 키를 바꾸지 않고 새 루트로 연결할 수 있다. 실제 이전·클라우드 배포는 후속 검증 대상이다. 중단된 업로드는 시작 시 개수만 보고하며 자동 삭제하지 않는다. 프로젝트·파일 삭제와 보관 만료도 아직 제공하지 않는다.

Figma 로컬 개발에서만 `ALLOW_FIGMA_NULL_ORIGIN=true`를 명시한다. 이 설정은 Figma 신원을 인증하지 않으며 같은 `null` origin을 보내는 다른 opaque origin에도 적용된다. 일반 웹 origin은 계속 `CORS_ORIGINS`에 정확히 나열한다.

업로드 묶음 API는 `POST/GET /api/v1/projects/{projectId}/uploads`와 `GET .../uploads/{uploadId}`다. `clientRequestId`는 같은 묶음 재시도에 유지한다. 신규 등록은201, 동일 요청의 재시도는200, 같은 ID의 다른 내용은409다. IA 목록·생성·수정·삭제는 `/api/v1/projects/{projectId}/ia`, 기본 양식 조회·저장은 `.../template`에서 제공한다. 시트 생성·목록·조회는 `.../sheets`, 내용·보기 저장은 `.../sheets/{sheetId}/content`·`.../view`, XLSX 내보내기는 `.../sheets/{sheetId}/export.xlsx`에서 제공한다. 내보내기는 서버에 저장된 전체 시트를 대상으로 하며 내용·보기 revision을 지정해 최신 저장본과 일치하는지 검사할 수 있다.

두 앱의 공통 API client는 빌드 시 `VITE_API_BASE_URL`을 사용한다. 웹 기본값은 `http://127.0.0.1:3101`, 플러그인 개발 기본값은 `http://localhost:3102`다. 2A 웹 검증 시 웹에는 `http://127.0.0.1:3102`를 지정할 수 있다. Figma 플러그인 주소는 manifest의 `networkAccess.devAllowedDomains`와 일치시킨다. Figma import에서 숫자 IP 주소가 거부되어 [공식 manifest 문서](https://developers.figma.com/docs/plugins/manifest/)의 개발 서버 패턴인 `http://localhost:3102`를 사용한다. 값을 바꾸면 UI를 다시 빌드하며 기존 로컬 환경 설정이 기본값을 덮어쓸 수 있다. API listen은 loopback으로 제한한다. POST mutation 자동 재시도는 비활성화한다. Playwright는 `PLAYWRIGHT_BASE_URL`로 이미 실행된 웹에 연결하며 브라우저 캐시는 `PLAYWRIGHT_BROWSERS_PATH`로 OS 임시 경로에 지정한다.

## MVP AI 생성 실행

`apps/api/.env.local`에 키를 입력한다. 기존 파일을 예제 파일로 덮어쓰지 않는다. 이 파일의 키를 웹 `VITE_` 환경변수에 넣지 않는다. 새 체크아웃에서 실행한다면 `DATABASE_URL`, `FILE_STORAGE_ROOT`와 포트·CORS 설정도 기존 로컬 환경에 맞게 준비해야 한다. 환경 파일은 worktree마다 별개다.

AI 생성에는 `0003_youthful_sister_grimm.sql`의 생성 작업 테이블이 필요하다. 기존 서버에서 새 기능을 사용하려면 연결 설정과 migration 상태를 확인하고, 필요한 migration 적용과 이 체크아웃의 API 재시작을 수행한다. 기존 서버의 경로·사용 목적과 현재 작업의 실행 범위를 확인한 뒤 진행한다.

1. 웹에서 프로젝트를 선택하거나 만든다.
2. 새 시트를 만들고 단위/통합을 선택하거나 기존 시트를 연다.
3. `AI 케이스 생성·후보 검토`에서 모델과 업로드 묶음 또는 설명을 지정한다.
4. 기존 케이스가 있다면 교체 확인 후 생성한다. 기존 케이스는 작성 예시로도 사용한다.
5. 생성 완료 후 표를 편집하고 후보를 확인해 추가·편집·제외한다. 제외한 후보는 다시 표시하고 복원할 수 있다.

생성 중 대상 시트는 잠기며 다른 시트는 계속 편집할 수 있다. 작업 상태는 새로고침 후 다시 읽는다. AI 호출이 중단되면 자동 재호출하지 않는다. 서버 중단으로 상태가 남은 작업은 10분 후 조회할 때 실패 처리하며, 사용자가 다시 생성할 수 있다. 같은 요청 ID를 다시 보내도 AI 작업은 중복 생성하지 않는다. 입력 크기 초과·출력 잘림·참조 오류는 기존 시트를 교체하지 않는다.

AI 호출은 공식 [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)와 [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 형식을 사용한다. 실제 키 권한·응답 품질은 각 환경에서 확인한다.
