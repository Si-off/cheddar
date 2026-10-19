# Cheddar

사람이 수행하는 QA 테스트 케이스를 Figma 기획 자료로부터 AI로 만들고, 여러 사람이 함께 편집하고, 공유하고, XLSX로 내보내는 사내 도구다. Figma 플러그인이 프레임을 올리고, 웹에서 생성과 편집을 하며, 백엔드가 저장과 AI 실행을 맡는다. pnpm workspace 모노레포로 관리하며 Claude Code와 Codex를 함께 사용해 개발한다. 에이전트 지침은 루트 `AGENTS.md`에 있다.

## 소스 위치

- `apps/web/`: 웹(React, Vite, Tailwind CSS, TanStack Router와 Query, FSD)
- `apps/figma-plugin/`: Figma 플러그인(`main/` 실행 코드, `protocol/` 메시지 계약, `ui/` React)
- `apps/api/`: 백엔드(NestJS, Drizzle, PostgreSQL 17, pg-boss)
- `packages/ui/`: 공통 컴포넌트(shadcn/Base UI)
- `packages/design-tokens/`: 디자인 토큰
- `packages/contracts/`: 실시간 공동 편집 메시지 계약

제품 범위와 업무 규칙은 [제품 문서](docs/product.md), 구성요소 경계와 기술 판단은 [구조 문서](docs/architecture.md), 화면 원칙은 [DESIGN.md](DESIGN.md)를 따른다.

## 개발 환경

- Node 24.22.0 LTS(`.nvmrc`), pnpm 12.11.2(`packageManager`), Biome
- PostgreSQL 17(로컬)
- 사내 배포 환경과 절차는 추후 결정

```sh
nvm install
nvm use
npm install --global pnpm@12.11.2
pnpm install --frozen-lockfile
```

## 백엔드 실행

로컬 PostgreSQL 17에 실행 DB와 별도의 테스트 DB를 준비한다. `apps/api/.env.example`을 참고해 Git 제외 파일 `apps/api/.env.local`에 값을 넣는다. 비밀번호와 API 키는 대화나 명령 로그에 붙여넣지 않는다.

| 변수 | 의미 |
| --- | --- |
| `DATABASE_URL` | 실행 DB 연결 |
| `TEST_DATABASE_URL` | 테스트 DB 연결. superuser가 아닌 role, 실행 DB와 다른 DB |
| `FILE_STORAGE_ROOT` | 임시 업로드를 둘 저장소 밖의 절대 경로 |
| `API_PORT` | 기본 3101, loopback으로만 listen |
| `CORS_ORIGINS` | 웹 origin을 쉼표로 구분. 쿠키 자격 증명을 허용 |
| `ALLOW_FIGMA_NULL_ORIGIN` | `true`면 development에서 Figma 플러그인(Origin `null`)의 연결과 업로드 경로를 허용 |
| `NODE_ENV` | `production`이면 세션 쿠키에 Secure 적용 |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | AI 제공자 키. 쓰는 제공자의 키만 넣는다 |
| `AI_PROVIDER` | `fake`면 외부 호출 없이 합성 결과로 생성한다 |
| `AI_MODEL_SCREENS` 등 | 단계별 모델. 형식은 `anthropic:<모델>` 또는 `openai:<모델>` |

```sh
pnpm db:migrate
pnpm --filter @cheddar/api admin:create --email admin@example.com --name "첫 관리자"
pnpm dev:api
```

마이그레이션은 스키마와 기본 역할, 소속을 설치한다. 첫 관리자 CLI는 계정이 없는 DB에서만 실행되며 초대 토큰을 출력한다. 웹의 `/invite?token=<토큰>`에서 비밀번호를 정하고 로그인한다. 메일 발송과 공용 회원가입은 없다. 서버 시작은 마이그레이션을 실행하지 않는다.

- `/health/live`, `/health/ready`: 프로세스와 DB, 저장소 상태
- `/openapi.json`: 현재 API 명세. 정적 사본은 `apps/api/openapi.json`

## 웹과 플러그인 실행

```sh
pnpm dev:web
```

웹은 `http://127.0.0.1:5173/`에서 연다. 개발 모드에서는 [공통 컴포넌트 미리보기](http://127.0.0.1:5173/design-system.html)도 열 수 있다.

```sh
VITE_WEB_BASE_URL=http://127.0.0.1:5173 pnpm dev:plugin
```

플러그인 UI와 main을 감시 빌드해 `apps/figma-plugin/dist/index.html`과 `dist/main.js`를 만든다. Figma 데스크톱에서 개발용 manifest(`apps/figma-plugin/manifest.json`, 플러그인 ID `1692417282897261384`)를 불러온다. 플러그인의 API 주소는 기본 `http://localhost:3101`(`VITE_API_BASE_URL`), 웹 주소는 main 빌드 때의 `VITE_WEB_BASE_URL`이다. 플러그인에서 로그인하면 브라우저의 `/plugin-connect`에서 연결을 승인하고, 업로드가 끝나면 웹의 새 테스트 세트가 열린다. API에는 `ALLOW_FIGMA_NULL_ORIGIN=true`가 필요하다.

## 검증

명령은 저장소 루트 기준이다. CI는 아직 없다.

| 범위 | 명령 | 확인 범위 |
| --- | --- | --- |
| 정적 검사와 빌드 | `pnpm check` | lint, 타입, 빌드. 동작 테스트는 포함하지 않는다 |
| API | `pnpm test:api` | 테스트 DB의 실제 PostgreSQL과 pg-boss, 합성 AI 응답. 실제 AI 호출은 제외 |
| API 명세 | `pnpm --filter @cheddar/api openapi:check` | DTO에서 만든 명세와 `apps/api/openapi.json` 비교 |
| 웹 | 아래 e2e 명령 | 웹 서버와 Chromium. API 응답과 실시간 연결은 합성한다 |
| 플러그인 | 아래 Node 명령 | 메시지, 선택, 화면 문서, 타일, 업로드 흐름. 실제 Figma 실행은 제외 |

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 pnpm --filter @cheddar/web test:e2e
```

```sh
node --test apps/figma-plugin/src/main/*.test.mjs apps/figma-plugin/src/ui/shared/lib/*.test.mjs
```

웹 e2e는 `pnpm dev:web`이 떠 있어야 한다. 캐시, 로그, 결과는 저장소 밖 OS 임시 경로에 둔다. 실제 Figma, Excel 앱, 외부 AI 호출은 필요할 때 따로 확인한다.

## API 코드 생성

웹과 플러그인의 `shared/api/generated/`는 생성 코드이며 직접 고치지 않는다. 계약을 바꾸면 다음 순서로 다시 만든다.

```sh
pnpm openapi:export
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:web
OPENAPI_INPUT="$PWD/apps/api/openapi.json" pnpm gen:api:plugin
pnpm --filter @cheddar/api openapi:check
```

스키마 변경은 `pnpm --filter @cheddar/api db:generate`로 만든 SQL과 meta를 검토한 뒤 `pnpm db:migrate`로 적용한다.

## 디자인 토큰과 공통 컴포넌트

토큰 원본은 `packages/design-tokens/src/theme.css`다. 색, 간격, radius, 폰트, 모션은 토큰만 쓴다. `@cheddar/ui`는 Base UI 위에 토큰과 모션 원칙을 적용한 공통 컴포넌트이며 사용법은 [공통 UI 안내](packages/ui/README.md)에 있다.
