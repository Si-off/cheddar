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
- `apps/api/`: 백엔드 위치, 내부 구조는 별도 설계
- `packages/ui/`: 기본 UI
- `packages/design-tokens/`: 디자인 토큰

workspace·기본 도구 설정과 최소 실행 화면을 구성했다. 단계별 결과는 [작업 기록](docs/changes/2026-10-15-workspace-setup/change.md)을, 상세 경로와 허용 범위는 [구조 문서](docs/architecture.md)를 따른다.

## 개발 환경

- 웹·플러그인: TypeScript, React, Vite, Tailwind CSS, Motion, TanStack Query, Zustand
- 패키지 관리자·린터: pnpm workspace, Biome
- 웹 라우터: TanStack Router
- API 코드 생성: `@hey-api/openapi-ts`
- 상세 기술 결정과 미정 사항: [구조 문서](docs/architecture.md)
- 초기 검증: 로그인·검색 노출 없이 개발자 PC에서 로컬 실행, 백엔드·DB도 로컬 실행
- 도구 버전: nvm 0.40.8, Node 24.22.0 LTS (`.nvmrc`), pnpm 12.11.2 (`packageManager`)
- 백엔드: NestJS·Drizzle·PostgreSQL 17. 프로젝트·파일 저장과 공통 계약을 제공한다. 실행 방법은 아래 백엔드 항목을 따른다.
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

웹은 `http://127.0.0.1:5173/`에서 실행한다. `/`와 `/share/<shareId>`는 기본 화면만 제공하며 실제 생성·편집·공유 기능은 아직 구현하지 않았다.

```sh
pnpm dev:plugin
```

플러그인 UI와 main을 각각 감시 빌드하여 `apps/figma-plugin/dist/index.html`과 `dist/main.js`를 만든다. UI는 CSS·폰트를 포함한 단일 HTML이다. 브라우저에서 UI만 확인하려면 `pnpm --filter @cheddar/figma-plugin dev:ui`를 사용한다 (`http://127.0.0.1:5174/`).

Figma 플러그인 ID는 아직 발급되지 않아 manifest의 `id`를 생략했다. Figma에서 새 플러그인을 만들고 [공식 안내](https://developers.figma.com/docs/plugins/manifest/)에 따라 발급된 ID를 manifest에 반영한 뒤 개발용으로 가져온다. 현재 실제 Figma 내 실행은 미검증이다. API 기본 주소는 `http://127.0.0.1:3101`이며 실제 Figma origin·네트워크 허용은 2A에서 검증한다.

## 검증과 API 코드 생성

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm check
```

`pnpm check`는 위 세 검사를 순서대로 수행한다. API는 `node:test`로 검증한다. UI 테스트 프레임워크와 CI는 미정이다. Vite 캐시·오류 로그 등 임시 자료는 저장소 밖에 둔다.

두 앱의 `openapi-ts.config.ts`는 `OPENAPI_INPUT` 환경변수로 실제 명세 URL 또는 절대 경로를 받으며, 타입·Fetch SDK·TanStack Query 코드를 생성한다. 명세가 없으면 명확한 오류로 종료한다. `.env.example`은 설명용이며 코드 생성 시 환경변수는 셸에서 명시적으로 전달한다.

현재 명세는 `apps/api/openapi.json`이며 두 앱의 타입·SDK·Query 코드가 생성되어 있다. 각 `generated/` 아래 `client/`·`core/`·`@tanstack/`는 생성 코드 전용으로 허용했다. 명세를 export한 뒤 다음 명령을 사용한다.

```sh
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:web
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:plugin
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

`apps/api/.env.example`을 참고해 Git 제외 파일 `apps/api/.env.local`에 실제 연결 값을 설정한다. 이 worktree에서는 승인된 전용 DB·role과 로컬 환경 파일을 준비했다. 환경 파일은 다른 worktree로 자동 복사하지 않는다.

| 변수 | 의미 |
| --- | --- |
| `DATABASE_URL` | 전용 실행 DB 연결 |
| `TEST_DATABASE_URL` | 전용 테스트 DB 연결. 실행 DB와 달라야 함 |
| `FILE_STORAGE_ROOT` | Git 밖의 전용 영속 파일 루트. 현재 승인 위치는 `/Users/sion/Library/Application Support/Cheddar/stage-1/files` |
| `API_PORT` | 기본 `3101`, loopback에만 listen |
| `CORS_ORIGINS` | 기본 `http://127.0.0.1:5173`. 쉼표로 구분한 정확한 origin |

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

프로젝트 PATCH는 `expectedRevision`을 요구한다. 충돌 시 409와 현재 revision을 반환하며 클라이언트의 미저장 입력 보존은 후속 화면에서 구현한다. API는 로그인 없는 로컬 환경이며 CORS·프로젝트 소속 검사를 인증으로 간주하지 않는다. 실제 Figma 연결은 후속 2A 검증 대상이다.

## 백엔드 검증과 계약 갱신

```sh
pnpm test:api
pnpm --filter @cheddar/api openapi:check
pnpm check
```

테스트는 `TEST_DATABASE_URL`의 이름·로컬 host·role·DB 소유권·superuser 여부를 확인하고 같은 테스트 DB의 동시 실행을 막는다. 실행 DB와 같거나 테스트 설정이 없으면 실패하며 건너뛰지 않는다. 테스트는 자신이 만든 UUID 행과 OS 임시 파일만 정리한다. 실제 DB로 임의 전환하거나 truncate/drop하지 않는다. 실패 주입 테스트의 503 로그는 의도한 검증 결과다.

스키마를 바꾸면 `pnpm --filter @cheddar/api db:generate`로 SQL을 만들고 검토한 뒤 `pnpm db:migrate`로 적용한다. `migrations/`의 SQL·도구 meta를 함께 커밋하며 자동 schema push를 사용하지 않는다.

```sh
pnpm openapi:export
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:web
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:plugin
pnpm --filter @cheddar/api openapi:check
pnpm test:api
pnpm typecheck
```

명세 export/check는 DB 연결·포트 listen·파일 저장 루트 생성 없이 실행한다. DTO와 실제 응답을 계약 테스트로 검증하고 두 생성 SDK의 프로젝트·multipart·다운로드 호출도 HTTP로 확인한다. 생성 코드는 직접 편집하지 않는다. 업로드·시트·IA DTO는 후속 계약이며 해당 기능 API가 이미 구현됐다는 뜻이 아니다.

DB 백업과 `FILE_STORAGE_ROOT` 전체를 함께 옮기면 저장 키를 바꾸지 않고 새 루트로 연결할 수 있다. 실제 이전·클라우드 배포는 후속 검증 대상이다. 중단된 업로드는 시작 시 개수만 보고하며 자동 삭제하지 않는다. 프로젝트·파일 삭제와 보관 만료도 아직 제공하지 않는다.
