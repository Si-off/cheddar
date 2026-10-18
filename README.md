# Cheddar

사람이 수행하는 QA 테스트 케이스를 AI로 생성하고 편집·공유·XLSX 내보내기 하는 제품이다. Figma 플러그인은 선택한 프레임의 데이터·이미지 업로드를 담당하고, 생성·편집은 웹에서 수행한다. pnpm workspace 모노레포로 관리하며 Claude Code와 Codex를 함께 사용해 개발한다. 에이전트 지침은 루트 `AGENTS.md`에 있다.

## 소스 위치

- `apps/web/`: 웹 앱
- `apps/figma-plugin/`: Figma 실행 코드·메시지 계약·React UI
- `apps/api/`: NestJS·Drizzle 백엔드와 API 계약·검증
- `packages/ui/`: 기본 UI
- `packages/design-tokens/`: 디자인 토큰

상세 경로와 구성요소 경계는 [구조 문서](docs/architecture.md)를 따른다.

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

웹은 `http://127.0.0.1:5173/`에서 실행한다. `/`에서 프로젝트·시나리오를 선택하고 `/projects/<projectId>/test-scenarios/<testScenarioId>`에서 편집한다. 접이식 사이드바에서 프로젝트별 `/uploads`, `/test-scenarios`, `/settings`를 이동한다. 시트에서 생성·확인 항목·화면 분석을 모달로 열고, 케이스 편집과 관련 자료는 하나의 상세 패널에서 전환한다. 명확한 생성 결과는 기존 시나리오에 자동 추가·저장한다. 실제 공유 링크 발급·외부 열람은 후속이다. 실제 모델 권한·응답 품질은 사용하는 환경에서 별도로 확인한다.

```sh
VITE_WEB_BASE_URL=http://127.0.0.1:5173 pnpm dev:plugin
```

플러그인 UI와 main을 각각 감시 빌드하여 `apps/figma-plugin/dist/index.html`과 `dist/main.js`를 만든다. UI는 CSS·폰트를 포함한 단일 HTML이다. 브라우저에서 UI만 확인하려면 `pnpm --filter @cheddar/figma-plugin dev:ui`를 사용한다 (`http://127.0.0.1:5174/`).

Figma 플러그인 ID는 `1692417282897261384`다. [공식 안내](https://developers.figma.com/docs/plugins/manifest/)에 따라 개발용 manifest를 가져온다. 플러그인의 개발 API 기본 주소는 `http://localhost:3102`다. 실제 Figma의 origin·네트워크 접근·업로드 결과는 현재 환경에서 확인한다.

업로드할 Frame 또는 Section을 선택한다. Section을 선택하면 내부의 최상위 Frame들을 목록에 표시하며, 각 Frame 안의 중첩 프레임은 별도 항목으로 추가하지 않는다. 섹션과 그 안의 프레임을 함께 선택해도 중복 없이 포함한다. 경량 썸네일과 큰 미리보기로 화면을 확인하고 프로젝트를 검색한다. 프레임 추출·이미지 전송·데이터 전송·업로드 등록의 진행 상태를 구분한다. 완료 후 `웹에서 열기`는 main의 `figma.openExternal`로 해당 자료 상세를 연다. `VITE_WEB_BASE_URL`은 main 빌드 기준 웹 주소이며 HTTP(S)만 허용한다. build/watch에서는 값을 명시해야 하며 미설정이면 웹 열기를 오류로 처리한다. API 주소와 별도 설정이다.

## 검증과 API 코드 생성

명령은 저장소 루트 기준이다. Node·pnpm·의존성은 위 개발 환경을 준비한다. 변경된 동작과 영향을 받는 범위에 맞춰 선택하며, `pnpm check`는 lint·typecheck·build만 수행하고 아래 동작 테스트를 포함하지 않는다. CI는 아직 구성하지 않았다.

| 범위 | 명령 | 필요한 환경과 확인 범위 |
| --- | --- | --- |
| 정적 검사·빌드 | `pnpm check` | 전체 lint·타입·빌드. 개별 실행은 `pnpm lint`, `pnpm typecheck`, `pnpm build` |
| 한 앱의 타입 | `pnpm --filter @cheddar/web typecheck` | API·플러그인은 필터를 `@cheddar/api`·`@cheddar/figma-plugin`으로 변경. 소비 앱 영향은 별도 확인 |
| API 동작·계약 | `pnpm test:api` | 아래 전용 PostgreSQL 설정과 `apps/api/.env.local`. 실제 DB·HTTP·SDK·XLSX 및 합성 AI 응답 검증. 실제 AI 호출·품질은 제외 |
| API 명세 일치 | `pnpm --filter @cheddar/api openapi:check` | DB·서버 없이 DTO에서 생성한 명세와 `apps/api/openapi.json` 비교 |
| 플러그인 로직 | 아래 Node 명령 | 메시지·선택·업로드 세션의 합성 환경 검증. 실제 Figma 실행은 제외 |
| 웹 편집기·생성·자료 | 아래 웹 테스트 명령 | 웹 서버와 Chromium. HTTP 합성 응답으로 저장·충돌·자동 추가·확인 초안·이미지 확대·오류 복구 검증 |
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
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5176 pnpm --filter @cheddar/web test:e2e src/pages/test-case-editor/editor.spec.ts src/pages/test-case-editor/authoring.spec.ts src/pages/project-uploads/uploads.spec.ts --output="${TMPDIR:-/tmp}/cheddar-editor-results"
```

프로젝트 설정 검증은 [백엔드 실행](#백엔드-실행)의 전용 테스트 DB와 환경 파일을 먼저 준비한다. 웹은 별도 터미널에서 아래 주소로 실행하며, 테스트가 API 포트 `3104`를 사용한다. 포트를 바꾸면 `VITE_API_BASE_URL`과 `SETTINGS_TEST_API_PORT`를 함께 맞춘다. `TEST_DATABASE_URL`은 환경 파일 또는 프로세스 환경변수에 명시한다. 아래 Node 명령은 웹 패키지에서 API 환경 파일을 읽어 테스트 프로세스에 전달한다. API 테스트와 달리 일반 `test:e2e` 명령은 이 파일을 자동으로 읽지 않는다.

```sh
VITE_API_BASE_URL=http://127.0.0.1:3104 pnpm --filter @cheddar/web dev --port 5177
```

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5177 SETTINGS_TEST_API_PORT=3104 pnpm --filter @cheddar/web exec node --env-file=../api/.env.local node_modules/@playwright/test/cli.js test src/pages/project-settings/project-settings.spec.ts --output="${TMPDIR:-/tmp}/cheddar-settings-results"
```

플러그인 UI 검증은 별도 터미널에서 `pnpm --filter @cheddar/figma-plugin dev:ui --port 5174`를 실행한다. 현재 테스트의 iframe 주소가 `http://127.0.0.1:5174/`로 고정돼 있으므로 이 테스트에는 해당 포트가 필요하다.

```sh
pnpm --filter @cheddar/web test:e2e src/pages/test-case-editor/plugin-redesign.spec.ts --output="${TMPDIR:-/tmp}/cheddar-plugin-results"
```

브라우저 테스트 전체를 실행하려면 위 설정 화면용 웹·DB·API 환경과 플러그인 UI 서버를 준비하고 설정 화면 명령에서 테스트 파일 선택 인자만 생략한다. 병렬 프로세스는 서로 다른 `--output` 경로를 사용하고, 같은 테스트 DB의 API·설정 테스트는 동시에 실행하지 않는다. 실제 Figma, macOS IME, Excel 앱, 외부 AI 호출은 이 검사와 구분해 필요한 경우 별도로 확인한다.

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

토큰 원본은 `packages/design-tokens/src/theme.css`, 미리보기 원본은 `packages/design-tokens/preview.template.html`이다. 툴바 32px·폼 40px·표 최소 행 48px와 전환 120/180/240ms를 공통 토큰으로 관리하며 시스템 동작 줄이기를 반영한다. 원본 변경 후 아래 명령으로 HTML을 다시 생성한다.

```sh
node packages/design-tokens/build-preview.mjs
```

HTML 안의 CSS 다운로드는 일반 CSS 변수를 내보낸다. 다운로드하는 CSS에는 폰트 파일이 포함되지 않는다. HTML에는 Fontsource의 Noto Sans와 Noto Sans KR 및 해당 라이선스가 함께 포함된다.

## 공통 컴포넌트

`@cheddar/ui`는 shadcn/ui의 Base UI 구성을 바탕으로 프로젝트 토큰과 모션 원칙을 적용한다. 기존 배경색과 테두리 색상 변화만으로 키보드 포커스를 구분한다.

`pnpm dev:web` 실행 후 [컴포넌트 미리보기](http://127.0.0.1:5173/design-system.html)에서 실제 컴포넌트를 조작할 수 있다. 이 진입점은 개발 모드에서만 렌더링하며 기본 프로덕션 빌드에 포함되지 않는다. 디자인 방향을 비교하는 foundations HTML과 역할이 다르다.

제공 API, 스타일 로드와 사용 예시는 [공통 UI 사용 안내](packages/ui/README.md)를 참고한다.

## 백엔드 실행

현재 백엔드는 전면 개편 2단계의 인증·계정·역할·소속 API다. 프로젝트·테스트 세트·생성·공유·플러그인 연결은 스키마만 준비되어 있으며 이전 업무 API는 제거했다. 저장 모델과 세부 판단은 [백엔드 구조](docs/architecture.md#백엔드-구조)를 따른다.

로컬 PostgreSQL 17에 실행 DB와 별도의 테스트 DB를 준비한다. 기존 환경의 사용 목적을 확인한 뒤 새 기준용 DB를 사용한다. 이전 0000~0008 마이그레이션과의 호환·데이터 변환·자동 초기화는 제공하지 않는다.

`apps/api/.env.example`을 참고해 Git 제외 파일 `apps/api/.env.local`에 실제 연결 값을 설정한다. 비밀번호는 대화나 명령 로그에 붙여넣지 않는다. 기존 환경 파일은 덮어쓰지 않는다.

| 변수 | 의미 |
| --- | --- |
| `DATABASE_URL` | 실행 DB 연결 |
| `TEST_DATABASE_URL` | loopback의 `cheddar_stage1_test`, 소유 role `cheddar_stage1` 연결. role은 superuser가 아니어야 하며 실행 DB와 달라야 함 |
| `FILE_STORAGE_ROOT` | 저장소 밖의 전용 절대 경로. 임시 업로드 저장소의 후속 구현에도 사용 |
| `API_PORT` | 기본 3101, loopback으로만 listen |
| `CORS_ORIGINS` | 웹 origin을 쉼표로 구분. 정확한 HTTP origin만 허용하며 쿠키 자격 증명을 허용 |
| `NODE_ENV` | 운영에서 `production`을 지정하면 세션 쿠키에 Secure 적용 |
| `ALLOW_FIGMA_NULL_ORIGIN` | 기본 false. true는 development에서만 허용 |

```sh
pnpm db:migrate
pnpm --filter @cheddar/api admin:create --email admin@example.com --name "첫 관리자"
pnpm dev:api
```

마이그레이션은 새 스키마와 기본 역할·소속을 설치한다. 기본 데이터를 다시 실행해도 변경한 역할 이름·권한을 덮어쓰지 않는다. 첫 관리자 CLI는 계정이 없는 DB에서만 실행되며 관리자 역할 전체 범위의 초대됨 계정을 만든다. 출력된 토큰을 웹 초대 화면의 token 값으로 전달한다. 초대 수락으로 비밀번호를 설정한 뒤 로그인한다. 메일 발송과 공용 회원가입은 없다.

인증 경로는 `/api/v1/auth`, 관리 경로는 `/api/v1/accounts`, `/api/v1/roles`, `/api/v1/affiliations`다. 정확한 메서드·요청·응답은 [OpenAPI](apps/api/openapi.json)에 있다. 계정 관리는 전체 `account.manage`, 역할과 소속 관리는 전체 `role.manage`가 필요하다. 상태 전환, 토큰 발급, 역할 할당 교체도 관리 API에서 수행한다.

웹은 요청에 `credentials: "include"`를 사용하고 API와 쿠키의 SameSite 조건을 만족하는 주소로 접속해야 한다. 로그인 응답은 내 정보이며 세션 토큰은 httpOnly 쿠키로만 전달한다. `GET /api/v1/auth/me`의 permissions를 사용해 권한과 프로젝트 범위를 판단한다. 역할 이름으로 분기하지 않는다. 계정 생성·초대 재발급·재설정 발급 응답의 token은 링크를 만드는 용도이며 다시 조회할 수 없다.

- `/health/live`: 프로세스 응답, 인증 불필요
- `/health/ready`: 마이그레이션 이력·27개 테이블·저장소 검사, 인증 불필요
- `/openapi.json`: 현재 런타임 API 명세
- 세션 쿠키: HttpOnly, SameSite=Lax, 운영 Secure, 유효기간 30일
- 초대·재설정 토큰: 7일, 재발급 시 이전 링크 폐기, 한 번만 사용
- 비밀번호 설정·재설정: 12~128자, Node scrypt 해시

서버 시작은 마이그레이션이나 DB 초기화를 실행하지 않는다. 저장소는 프로젝트 대신 임시 업로드 UUID/파일 UUID 경로를 사용하도록 준비했으며 업로드 API와 자동 삭제 작업은 아직 없다.

## 백엔드 검증과 계약 갱신

```sh
pnpm --filter @cheddar/api build
pnpm --filter @cheddar/api typecheck
pnpm --filter @cheddar/api openapi:export
pnpm --filter @cheddar/api openapi:check
pnpm test:api
```

API 테스트는 node:test와 실제 PostgreSQL을 사용한다. TEST_DATABASE_URL이 없으면 DB 검증은 실패하며 성공이나 skip으로 처리하지 않는다. 전용 DB 이름·host·role·소유권·superuser 여부와 기존 마이그레이션 이력을 확인하고 동시 테스트 실행을 막는다. 첫 관리자 테스트를 위해 계정이 없는 새 기준 테스트 DB가 필요하다. 테스트가 만든 UUID 행과 OS 임시 파일만 정리하며 다른 데이터를 지우거나 DB를 drop/truncate하지 않는다. 이미 구형 마이그레이션이 있으면 새 기준용 별도 테스트 DB를 준비한다.

명세 export/check는 DB 연결·포트 listen·저장소 생성 없이 실행한다. 스키마 변경은 `pnpm --filter @cheddar/api db:generate`로 생성한 SQL과 meta를 검토한 뒤 명시적으로 적용한다. 이번 2단계에서는 `apps/api/openapi.json`만 갱신한다. 웹과 플러그인의 기존 생성 SDK와 업무 화면은 이전 계약을 사용하므로 후속 단계에서 새 화면과 함께 갱신해야 한다.
