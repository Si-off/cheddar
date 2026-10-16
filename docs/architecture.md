# 프로젝트 구조

이 문서는 합의된 시스템 구조·기술 선택·운영 제약을 설명한다. 개별 브랜치의 구현 진행과 검증 이력은 해당 작업 기록에 남긴다. 현재 체크아웃의 적용 여부는 코드와 설정으로 확인한다. 기술이나 연결 방식을 가정해 채우지 않는다.

## 설계 범위와 환경

- 설계 범위: 웹·Figma 플러그인·저장 및 AI 생성 백엔드. 기반 선택의 배경은 [1단계 설계안](changes/2026-10-15-stage-1-foundation/design.md), AI 실행 구조는 아래 [MVP AI 생성](#mvp-ai-생성)을 따른다.
- 저장소 구성: pnpm workspace 기반 모노레포.
- 개발 도구: Codex.
- 필요한 구성요소: Figma 플러그인, 웹사이트, 백엔드 서버.
- 앱 위치: 웹 `apps/web/`, Figma 플러그인 `apps/figma-plugin/`, 백엔드 `apps/api/`.
- 공통 패키지 위치: `packages/ui/`, `packages/design-tokens/`.
- 백엔드: NestJS + Drizzle + PostgreSQL. API DTO·DB 모델·화면 모델을 분리한다.
- 초기 환경: 로그인·검색 노출 없이 개발자 PC에서 로컬 검증. 백엔드·DB도 로컬 실행한다.
- 사내 배포 환경과 방식은 추후 결정한다.
- 에이전트의 작업별 문서 안내: 루트 `AGENTS.md`.
- 현재 제품·구조·절차 문서: `docs/`.
- 개별 작업 기록: `docs/changes/`에서 작업별로 관리하고 필요한 경우에만 읽는다.

## 웹·플러그인 기술 결정

| 영역 | 확정된 선택 |
| --- | --- |
| 공통 언어 | TypeScript |
| 기본 UI 스택 | React, Vite, Tailwind CSS, Motion |
| 공통 UI 기반 | shadcn/ui의 Base UI 구성, 프로젝트 토큰과 스타일로 커스텀 |
| 데이터·상태 도구 | TanStack Query, Zustand |
| 린터 | Biome |
| 웹 라우터 | TanStack Router |
| API 코드 생성 | `@hey-api/openapi-ts`로 타입·SDK·TanStack Query 코드 생성 |
| UI 구조 | 웹과 플러그인 UI 모두 FSD 적용, 필요한 레이어만 구성 |

Node는 `.nvmrc`의 24.22.0 LTS, pnpm은 `packageManager`의 12.11.2로 고정한다. 라이브러리 버전은 각 `package.json`과 `pnpm-lock.yaml`이 기준이며 실행 명령은 [README](../README.md)에 있다.

## 구성요소 경계와 공유

- 플러그인은 직접 선택한 Frame과 선택 Section 내부의 최상위 Frame 데이터를 업로드한다. Section은 자식 순서로 탐색하고 Frame을 만나면 그 하위 탐색을 멈춘다. 같은 nodeId와 이미 수집한 조상 Frame에 포함된 Frame은 중복 등록하지 않는다. 빈 Section이나 지원하지 않는 직접 선택이 섞이면 사용자가 선택을 수정하도록 안내한다. 테스트 케이스 생성·편집은 웹에서 수행한다.
- Figma 문서 접근 코드는 React UI와 분리한다. main은 IIFE JavaScript, UI는 폰트·CSS를 포함한 단일 HTML로 별도 빌드한다. `protocol/`에서 연결·선택·경량 이미지·업로드 준비·프레임 추출·완료 전 검증·웹 열기 메시지를 구분한다. 썸네일은 긴 변 240px, 미리보기는 960px 이하로 별도 추출하고 선택 버전별로 캐시한다. 업로드 원본 추출과 분리하며 선택 변경 후 오래된 이미지 응답을 반영하지 않는다. 실제 Figma 중첩 iframe relay는 정확한 Figma Origin과 manifest pluginId를 검사하고, opaque-origin UI 요청 UUID는 crypto.getRandomValues로 보완한다.
- 기본 UI와 디자인 토큰은 공유한다.
- 화면·업무 기능·상태 저장소는 앱별로 관리한다.
- 웹은 TanStack Table 기반 표·상세 편집과 별도 초안·저장 모델을 구현한다. 필수 열은 테스트 ID·제목이며 사용자 열은 텍스트·선택·체크박스·태그다. 표시 문자열 부분 검색을 사용한다. TanStack Query는 서버 데이터, Zustand/화면 상태는 미저장 입력·선택·검색을 담당한다.
- 실제 공유 링크는 후속 범위이며 초기 읽기 전용, 향후 링크별 편집 권한을 계획한다. 현재 시나리오 미리보기와 구분한다.
- API는 프로젝트·파일·업로드 묶음·IA·기본 양식·시나리오를 저장하며, 저장된 전체 시나리오를 ExcelJS로 XLSX 내보내기 한다. 사용자 문자열을 수식으로 변환하지 않고 표현 불가능한 데이터는 잘라내지 않고 오류로 알린다. AI 실행은 아래 MVP LangGraph 흐름을 따른다.

## 백엔드 기반

- NestJS Express adapter, Drizzle node-postgres, PostgreSQL 17, API 전용 CommonJS TypeScript 빌드와 decorator metadata를 사용한다. 정확한 패키지 버전은 lockfile 기준이다.
- `src/contracts/`는 외부 DTO, `database/schema.ts`는 DB 모델, 각 앱 모델은 화면 책임이다. 서로의 내부 타입을 직접 공유하지 않는다.
- `projects/`·`files/`는 controller → service → repository, `storage/`는 파일 바이트 처리를 담당한다. `common/`은 입력 검증·안전한 오류·요청 ID·명세 설정을 소유한다.
- 파일은 전용 루트의 `.incoming/`에 기록·검증한 뒤 프로젝트/파일 UUID 키로 이동하고 DB에서 ready로 확정한다. DB와 파일시스템의 실패를 분리하며 불완전 파일을 공개하지 않는다. 시작 시 잔여 pending/작업 파일을 보고하고 자동 삭제하지 않는다.
- 저장 루트는 `FILE_STORAGE_ROOT`로 설정하며 DB에 절대 경로를 넣지 않는다. 프로젝트와 파일은 현재 삭제 API가 없다.
- 실행 DB는 `cheddar_stage1`, 테스트 DB는 `cheddar_stage1_test`, role은 `cheddar_stage1`. 로컬 기본 저장 위치는 `/Users/sion/Library/Application Support/Cheddar/stage-1/files`다. 다른 환경에서는 설정을 변경한다.
- API는 loopback에 바인딩한다. 웹 Origin을 명시적으로 허용하며 인증·사용자 권한으로 간주하지 않는다. 로컬 Figma iframe은 `NODE_ENV=development`와 `ALLOW_FIGMA_NULL_ORIGIN=true`를 함께 설정할 때만 null Origin을 허용한다. AI 키·모델은 서버 환경변수로만 관리한다.
- schema에서 생성한 SQL migration을 검토·명시 적용한다. 서버 시작 시 migration/push를 실행하지 않는다. readiness는 DB migration hash와 테이블·저장 접근을 확인한다.
- 실제 경로만 OpenAPI에 포함하며 프로젝트·파일·업로드·IA·기본 양식·시나리오·XLSX·AI 생성·분석 결과·생성 결과 경로와 양쪽 SDK를 생성한다. export는 DB 접속·listen·저장소 생성 없이 실행한다.
- 생성 명세와 Drizzle meta는 Biome 포맷 대상에서 제외하고 명세 재생성 비교·계약 테스트·migration 재현으로 검증한다. 기존 소스 검사를 완화하지 않는다.
- API 테스트는 `node:test`, `@nestjs/testing`, 실제 PostgreSQL·HTTP를 사용한다. 컴파일·SDK 실행 테스트·파일 fixture는 OS 임시 경로를 사용한다. 테스트 데이터는 이 실행이 만든 UUID 행만 정리한다.
- 프로젝트 생성 시 기본 양식을 같은 트랜잭션에서 저장하고, 기존 프로젝트에는 migration으로 누락분만 보충한다. IA·양식·시나리오 공통 모델의 배경은 [공통 계약 기록](changes/2026-10-15-staged-development/stage-2bc-common.md)에 있다. 시나리오는 생성 시 양식을 독립 UUID로 복사하며 이후 기본 양식 변경의 영향을 받지 않는다. 시나리오 내용과 보기는 별도 revision으로 저장하고 충돌 시 덮어쓰지 않는다.
- 업로드 공통 스키마는 `uploads`·`upload_frames`다. 프로젝트별 요청 UUID의 유일성, 프레임 순서·Figma 식별자 중복, 프로젝트·파일 소속을 DB에서 보장한다. ready 상태·MIME과 묶음 전체 등록·재시도 응답은 uploads 서비스가 검사한다. 신규 등록201, 같은 요청 키·같은 입력200, 같은 키·다른 입력409를 반환한다.
- 승인된 기능 경로는 아래 구조를 따른다. 과거 작업의 파일 소유권은 해당 작업에만 적용한다. 추가 하위 폴더는 구조 변경 승인 절차를 따른다.

## 공통 디자인 기준

웹·Figma 플러그인 UI·공통 UI에 동일하게 적용한다.

라이트 모드의 톤앤매너와 디자인 원칙은 [DESIGN.md](../DESIGN.md)를 따른다.

- UI의 폰트·컬러·radius와 공통 타이포그래피·간격은 `packages/design-tokens/src/theme.css`의 토큰을 반드시 사용한다.
- primary 컬러는 `#515299`다. hover·subtle·배경·텍스트·경계선 컬러는 공통 의미별 토큰으로 정의한다.
- 기본 폰트는 Noto Sans다. 한글은 Noto Sans KR로 보완하며, Fontsource 패키지로 폰트 파일을 자체 호스팅한다.
- 앱과 공통 UI에 원시 색상값, 임의의 폰트·radius 값, 토큰을 우회하는 Tailwind arbitrary 값을 직접 넣지 않는다. 의미가 맞는 기존 토큰을 사용하고 부족하면 공통 토큰에 정의한다.
- 앱은 공통 토큰을 로드한다. 앱별 스타일이나 컴포넌트에서 같은 의미의 디자인 값을 별도로 재정의하지 않는다.
- 디자인 기준 자체를 변경하는 경우에는 사용자 결정을 먼저 반영한다. 기술적 기본값을 새로운 디자인 결정으로 임의 확대하지 않는다.

## 소스 경로의 역할

| 경로 | 역할 |
| --- | --- |
| `apps/web/src/app/` | 웹 초기화·프로바이더·라우트·앱 스타일 |
| `apps/web/src/pages/test-case-editor/` | 테스트 케이스 생성·편집 화면 |
| `apps/web/src/pages/shared-test-cases/` | 읽기 전용 시나리오 미리보기와 공유 경로의 빈 상태. 실제 공유 링크는 후속 |
| `apps/web/src/widgets/test-case-table/` | 편집·열람 화면에서 사용하는 표 |
| `apps/web/src/entities/test-case/` | 웹 내부에서 사용하는 테스트 케이스 모델과 관련 처리 |
| `apps/web/src/shared/` | 웹 전용 API 연결·설정·라이브러리·기본 UI |
| `apps/figma-plugin/src/main/` | Figma 문서 접근과 프레임 데이터·이미지 추출 |
| `apps/figma-plugin/src/protocol/` | Figma 실행 코드와 React UI 사이의 메시지 계약 |
| `apps/figma-plugin/src/ui/` | React UI의 FSD 루트: 앱 초기화·프레임 업로드 화면·플러그인 UI 전용 공통 코드 |
| 각 앱의 `shared/api/generated/` | `@hey-api/openapi-ts`로 생성할 API 코드의 위치 |
| `packages/ui/src/` | 앱에 종속되지 않는 기본 UI 컴포넌트 |
| `packages/design-tokens/src/` | 앱에서 공유하는 디자인 토큰 |

웹은 `app`, `pages`, `widgets`, `entities`, `shared` 레이어로 시작한다. 플러그인의 FSD 적용 범위는 `src/ui/`이며 `app`, `pages`, `shared` 레이어로 시작한다. `main/`과 `protocol/`은 React UI의 FSD 루트 밖에 둔다.

앱의 화면·업무 기능·상태 저장소는 공통 패키지로 이동하지 않는다. 공통 패키지는 앱을 역으로 참조하지 않는다. 앱 내부 슬라이스의 세부 세그먼트와 추가 레이어는 필요성과 경로를 제시하고 구조 변경 승인 후 추가한다.

웹은 TanStack Router의 `/`·`/share/$shareId`와 프로젝트별 `/projects/$projectId/uploads`·`/projects/$projectId/uploads/$uploadId`·`/projects/$projectId/settings`·`/projects/$projectId/test-scenarios`·`/projects/$projectId/test-scenarios/$testScenarioId`, Query·Motion 프로바이더를 구성했다. 접이식 사이드바에서 프로젝트별 시나리오·Figma 자료·설정을 이동한다. 생성과 확인 항목은 시트에서 모달로 열며 별도 결과 경로를 만들지 않는다. 케이스 편집과 관련 자료는 단일 inspector의 탭으로 표시하고 좁은 화면에서는 같은 내용을 Dialog로 연다. 설정의 기본 정보·화면 구조·기본 양식 탭은 미저장 변경·저장 중 이동 확인과 revision 보호를 유지한다. 자료 상세 이미지는 같은 화면에서 확대·원본 크기·접기를 제공한다.

플러그인은 main/UI 메시지 연결과 Zustand 연결 상태를 구성했다. 프로젝트 검색, 선택 프레임 썸네일과 미리보기, 추출·이미지·데이터·등록 진행 상태를 제공한다. 업로드 완료 후 main의 `figma.openExternal`로 해당 웹 자료 경로를 연다. 웹 기준 주소는 main 빌드 시 `VITE_WEB_BASE_URL`에서 읽으며 HTTP(S) 주소만 허용한다. Vite serve 모드 기본값은 `http://127.0.0.1:5173`이며 build/watch에서는 값을 명시한다. 빌드 시 미설정이면 웹 열기를 오류로 처리한다.

공통 UI는 shadcn/ui Base UI 기반의 Button, Input, Textarea, Checkbox, RadioGroup, Switch, Label, Dialog, Select, Combobox, Tabs, Tooltip, Popover와 Surface를 제공한다. `packages/ui/src/styles.css`는 공통 토큰을 사용하며 두 앱의 스타일 진입점에서 로드한다. `components.json`은 각 workspace의 shadcn 경로를 연결한다. 토큰은 별도 CSS 진입점으로 라이트 팔레트, 타이포그래피, 크기, 모서리, 그림자, 레이어와 모션을 제공한다. 툴바 32px·폼 40px·표 최소 행 48px와 전환 120/180/240ms를 공통 토큰으로 관리하며 시스템 동작 줄이기를 반영한다. Motion 프로바이더는 `reducedMotion="user"`를 사용한다. `packages/design-tokens/build-preview.mjs`는 `preview.template.html`·토큰·Fontsource 폰트로 `docs/design-foundations.html`을 생성한다. 이 HTML은 디자인 방향의 영속 미리보기다. 실제 공통 컴포넌트는 개발 전용 `/design-system.html`에서 확인한다.

업로드 상세의 testScenarioGateway는 실제 SDK로 해당 업로드 시나리오만 조회·생성하며 POST를 자동 재시도하지 않는다. 시나리오 페이지는 Router blocker로 저장을 기다리고 실패 시 IndexedDB 초안 보관을 확인한 뒤 명시 이동을 제공한다. 보관도 실패하면 이동을 막고, 전체 페이지 이탈은 beforeunload로 보호한다. 확인 항목 수정·질문 답변의 초안은 프로젝트·시나리오별 localStorage 키로 보관한다. 생성 작업과 분석 revision 충돌 시 최신 내용과 초안을 비교하며, 초안 보관 실패 시 모달 이탈을 막는다. 이는 시나리오 편집기의 IndexedDB 초안과 별도 책임이다.

두 앱은 실제 명세를 `OPENAPI_INPUT`으로 받아 타입·SDK·Query 코드를 각 `shared/api/generated/`에 생성하도록 설정했다. 현재 명세는 `apps/api/openapi.json`이며 두 앱의 생성 타입·SDK·Query 코드를 관리한다. 도구 기본 출력의 `client/`·`core/`·`@tanstack/` 하위 폴더는 생성 코드 전용으로 사용자 승인을 받았다. 명세 변경 후 재생성하며 생성 코드를 직접 편집하지 않는다.

Figma ID는 `1692417282897261384`다. 웹 API 기본 주소는 `http://127.0.0.1:3101`, 플러그인 개발 API 기본 주소는 `http://localhost:3102`다. 플러그인 빌드 주소와 개발 manifest 허용 주소를 일치시킨다. 배포용 외부 네트워크 허용은 `none`이며 개발 검증에만 localhost를 사용한다.

검증 도구는 API·플러그인 로직의 Node 테스트와 UI의 Playwright/Chromium이다. 명령·환경·확인 범위는 [README](../README.md#검증과-api-코드-생성)를 따른다. 실제 실행 이력과 당시 미확인 사항은 [프레임 업로드](changes/2026-10-15-stage-2a-frame-upload/change.md), [시나리오·설정 통합](changes/2026-10-15-staged-development/stage-2bc-common.md), [AI 생성](changes/2026-10-15-mvp-generation/change.md), [화면 개편](changes/2026-10-16-workspace-redesign/change.md), [전체 UI/UX 리디자인](changes/2026-10-16-complete-ux-redesign/change.md) 기록에 있다.

## 문서와 검수 에이전트의 역할

- `docs/ux-writing.md`는 사용자 노출 문구의 작성·판단·완료 기준을 관리한다.
- `.codex/agents/ux-writing-review.toml`은 검수 에이전트의 모델·effort, 입력·코드 확인·결과·재검수 방법을 관리한다. 제품 런타임에는 포함하지 않는다.
- `docs/workflow.md`는 실행·검증·승인 경계와 독립 검수 호출·결과 반영을 관리한다.
- 루트 `AGENTS.md`는 각 문서와 검수를 적용할 작업 조건만 연결한다.

## 파일 생성과 폴더 변경

- 폴더를 생성·이동·이름 변경하기 전에 `docs/architecture.md`의 허용된 폴더 구조와 현재 경로를 확인한다. 승인된 범위 밖의 폴더는 숨김 폴더를 포함해 임의로 만들지 않는다.
- 새 폴더나 구조 변경이 필요하면 정확한 경로·목적·영향을 먼저 알리고 사용자의 명시적 승인을 받는다. 구조 문서에 먼저 추가해 스스로 허용 범위를 넓히지 않는다.
- 허용된 폴더 안에서도 현재 요청에 필요한 영속 파일만 생성한다. 일반적인 구현 요청을 구조 확장이나 임시 파일 저장의 승인으로 해석하지 않는다.

## 허용된 폴더 구조

현재 승인된 고정 구조는 다음과 같다. `.git`은 Git 관리 메타데이터이며 프로젝트 산출물 폴더가 아니다.

```text
cheddar/
├── AGENTS.md
├── README.md
├── .codex/
│   └── agents/
│       └── ux-writing-review.toml
├── .github/
│   └── pull_request_template.md
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── common/
│   │   │   ├── contracts/
│   │   │   ├── database/
│   │   │   ├── storage/
│   │   │   ├── health/
│   │   │   ├── projects/
│   │   │   ├── files/
│   │   │   ├── uploads/
│   │   │   ├── generation/
│   │   │   ├── test-scenarios/
│   │   │   ├── exports/
│   │   │   ├── ia/
│   │   │   └── templates/
│   │   ├── scripts/
│   │   ├── test/
│   │   └── migrations/
│   ├── web/
│   │   └── src/
│   │       ├── design-prototype/
│   │       ├── app/
│   │       │   ├── providers/
│   │       │   ├── routes/
│   │       │   └── styles/
│   │       ├── pages/
│   │       │   ├── project-uploads/
│   │       │   ├── project-settings/
│   │       │   ├── test-case-editor/
│   │       │   └── shared-test-cases/
│   │       ├── widgets/
│   │       │   └── test-case-table/
│   │       ├── entities/
│   │       │   └── test-case/
│   │       └── shared/
│   │           ├── api/
│   │           │   └── generated/
│   │           │       ├── client/
│   │           │       ├── core/
│   │           │       └── @tanstack/
│   │           ├── config/
│   │           ├── lib/
│   │           └── ui/
│   └── figma-plugin/
│       └── src/
│           ├── main/
│           ├── protocol/
│           └── ui/
│               ├── app/
│               ├── pages/
│               │   └── frame-upload/
│               └── shared/
│                   ├── api/
│                   │   └── generated/
│                   │       ├── client/
│                   │       ├── core/
│                   │       └── @tanstack/
│                   ├── config/
│                   ├── lib/
│                   └── ui/
├── packages/
│   ├── ui/
│   │   └── src/
│   └── design-tokens/
│       └── src/
└── docs/
    ├── product.md
    ├── architecture.md
    ├── workflow.md
    ├── ux-writing.md
    ├── decisions/
    │   └── README.md
    ├── changes/
    │   └── README.md
    └── templates/
        └── change.md
```

- 두 앱의 `shared/api/generated/` 아래 `client/`·`core/`·`@tanstack/`는 API 생성 코드 전용으로 승인되었으며 현재 실제 명세로 생성한다. 임의 기능 폴더나 추가 하위 폴더로 허용 범위를 확대하지 않는다.
- 위 트리에 표시된 모든 폴더가 승인된 고정 구조다. `.gitkeep`은 각 빈 말단 폴더를 Git에서 유지하기 위한 파일이며 트리에서는 생략했다. 실제 구현 파일이 생기면 같은 폴더의 `.gitkeep`을 제거할 수 있다.
- `apps/web/src/design-prototype/`는 2026-10-15 사용자가 승인한 독립 디자인 시안의 소스·샘플 데이터·스타일·검증 전용 폴더다. 추가 하위 폴더는 포함하지 않는다. `apps/web/design-prototype.html`로 개발 서버에서 실행하며 제품 라우트와 배포 빌드에는 연결하지 않는다. 공통 디자인 토큰만 공유하고 화면·모션·사용자 흐름을 별도로 실험한다. 시안의 표현과 모델은 확정된 제품 요구사항이나 공통 디자인 원칙을 변경하지 않는다.
- `apps/api/` 내부 구조는 승인된 1단계 설계안 8절을 따른다. `src/`의 위 고정 폴더와 `scripts/`, `test/`, `migrations/`를 허용한다. 마이그레이션 도구가 생성하는 SQL·snapshot·journal 하위 경로만 `migrations/` 아래 추가로 허용하며 임의 소스 폴더로 확대하지 않는다. API 루트의 설정·환경 예시·OpenAPI 명세는 같은 설계안의 파일 목록을 따른다.
- 이미 합의된 작업 기록 형식으로 `docs/changes/<change-id>/` 한 단계의 폴더를 허용한다. 현재 사용자가 요청한 작업에 기록이 필요한 경우에만 생성한다. 그 아래의 추가 폴더는 별도 승인이 필요하다.
- 결정 기록은 `docs/decisions/` 안에 Markdown 파일로 추가한다. 작업·결정 기록 생성에 관한 상세 기준은 각 디렉터리의 안내를 따른다.
- `.codex/agents/`는 UX 문구 검수의 영속 에이전트 정의 위치로 승인되었다. 현재 파일은 `ux-writing-review.toml`만 사용한다. 다른 스킬·에이전트·설정·스크립트·참고자료·메타데이터용 경로의 추가 권한으로 확대하지 않는다.
- 위 트리 밖의 추가 소스 폴더, `.agents/`·`.codex/`의 추가 하위 경로, 워크플로 폴더 등은 아직 승인되지 않았다. 향후 확장 예시나 미정 항목에 언급된 이름을 생성 허가로 해석하지 않는다.
- 폴더 생성·이동·이름 변경으로 이 범위를 벗어나려면 경로·목적·영향을 먼저 제시하고 명시적 승인을 받는다. 승인 후 실제 구조와 이 목록을 함께 갱신한다. 에이전트가 목록을 먼저 수정해 스스로 승인할 수 없다.
- 기존에 발견한 폴더는 그 존재만으로 승인된 구조에 편입하지 않는다. 목록과 다르면 사용자 변경 여부와 필요성을 확인하고 임의 삭제하지 않는다.

## 임시 파일과 도구 산출물

- 임시 스크립트·조사 자료·다운로드·로그·스크린샷·캐시 등 작업용 임시 파일은 저장소와 worktree 밖의 OS 임시 경로에 둔다. 생성 전에 실제 경로가 저장소 밖인지 확인한다. `.gitignore` 등록은 예외가 아니다.
- 도구가 저장소 안에 임시 산출물을 만드는지 실행 전에 확인하고, 가능하면 출력·캐시 경로를 밖으로 지정한다. 불가능하면 실행 전에 경로와 필요성을 알리고 예외 승인을 받는다. 향후 별도로 승인된 빌드·의존성 산출물 경로는 그 승인 범위만 따른다.
- 사용자에게 제공할 영속 산출물은 임시 파일과 구분하고 합의된 경로에 저장한다. 본인이 만든 임시 파일만 정리하며 기존 파일을 임의로 삭제하지 않는다.

`tmp/`·`work/`·숨김 폴더도 임시 파일 저장의 예외가 아니다.

이번 기본 설정·설치·검증에 필요한 도구 산출물 예외는 다음과 같다. 모두 Git에서 제외한다.

- 루트와 workspace 패키지의 `node_modules/`: pnpm 의존성과 workspace 링크. 루트의 `node_modules/.pnpm/`을 포함한다.
- `apps/api/dist/`: API TypeScript 빌드 결과와 소스에 대응하는 하위 폴더. 테스트 컴파일·로그·명세 비교 출력은 OS 임시 경로에 둔다.
- `apps/web/dist/`, `apps/figma-plugin/dist/`: 배포·Figma 개발 실행용 빌드 결과. 번들러가 만드는 하위 파일·폴더를 포함한다.
- Vite 캐시, 코드 생성 검증 결과, 로그·스크린샷은 저장소 밖의 OS 임시 경로를 사용한다. pnpm 저장소는 저장소 밖의 사용자 기본 저장소를 사용한다. Vite 설정은 runner 로더로 읽어 설정 번들 임시 파일도 저장소에 남기지 않는다.

위 예외는 workspace·앱 기본 설정과 승인된 1단계 백엔드에 필요한 범위다. 새로운 도구 산출물 경로나 다른 임시 파일의 저장 허가로 확대하지 않는다.

## 미정

| 항목 | 상태 |
| --- | --- |
| 슬라이스 내부 세그먼트와 향후 추가 레이어·슬라이스 | 필요 시 별도 결정 |
| 공통 UI·디자인 토큰 확장 | 라이트 foundations 토큰 구현안·스탠드얼론 미리보기 구성. 세부 값은 사용자 시각 검토 후 조정 |
| CI | 미구성. 도입 방식은 미정 |
| 공유 링크 접근 방식 | 후속 |
| 사내 배포·릴리스·관측 방식 | 추후 결정 |

## 갱신 기준

구조가 결정되면 이 문서에 현재 상태를 반영한다. 여러 대안 중 선택한 이유가 이후 판단에 필요하면 `decisions/`에 별도 기록을 남기고 연결한다. 과거 작업 계획만으로 현재 구조를 판단하지 않는다.

## MVP AI 생성

`apps/api/src/generation/`의 LangGraph는 입력 준비 → 모델 생성 → 형식·참조 검사 → 저장의 단일 흐름이며 자동 재시도·분할 생성은 초기 범위에서 제외한다. 생성 작업과 후보는 DB에 저장하고, 대상 시나리오만 편집을 잠근다. 키·모델은 서버 환경변수에서 관리한다. 생성 요청 ID로 중복 실행을 막고, 프로젝트 쓰기 잠금 안에서 생성 모드별 시나리오 반영과 성공 상태를 한 트랜잭션으로 저장한다. 웹의 `append`는 기존 케이스·양식·번호를 보존하며 명확한 결과와 근거 연결을 원자적으로 추가하고 일반 행으로 반환한다. 기존 `replace`·`review` API 계약은 유지한다. 시나리오 자동 저장과 후보 추가도 같은 잠금 규칙을 따른다. 모델 호출 동안 DB 트랜잭션을 열어두지 않는다.


## QA 작성과 분석 결과 편집

- `uploads/`의 analysis 서비스는 프로젝트별 `project_analysis`에 자료 항목과 요구사항의 케이스 연결을 JSON 문서로 저장한다. 프로젝트 PK와 revision을 사용하고 참조의 프로젝트 소속, 영역 범위, 부모 순환과 링크 중복을 검사한다. 업로드 바이트는 유지한다.
- `generation/`의 `append`·`review`는 입력 준비 → AI 자료 정리 → 테스트 케이스 생성 → 형식과 근거 검사 → 저장으로 실행한다. `append`는 명확한 결과를 즉시 추가하고 불확실한 항목만 대기로 남긴다. `review`는 결과 전체를 검토 대상으로 보관하며 기존 `replace`와 함께 유지한다. 개별 프레임과 요구사항 선택, 요구사항 UUID 근거 연결을 지원한다.
- 자료 정리에서는 선택한 원본 노드의 후보를 제공하고 AI는 해당 ID만 선택해 화면, 상태, 요구사항과 관계를 구성한다. 텍스트 원문과 영역은 서버가 원본에서 유지한다. 원본 파일 밖 설명과 벡터만으로 확정할 수 없는 화살표는 자동 확정을 보장하지 않는다.
- 확인 항목 추가는 생성 작업 revision과 시나리오 revision을 함께 검사한다. 질문 답변을 함께 반영할 때는 분석 revision도 검사한다. 시나리오 저장, 후보 상태, 답변과 근거 연결은 프로젝트 쓰기 잠금 안에서 한 트랜잭션으로 저장한다. 모델 호출은 잠금 밖에서 수행한다.
- 웹의 관련 자료, 확인 항목 비교와 화면 분석은 기존 시나리오 편집 경로 안에 제공한다. 화면 분석은 화면 분석·확인 질문·요구사항 연결을 포함한 하나의 모달이며 케이스 상세 inspector와 구분한다. 기능 소스는 승인된 `project-uploads`와 `test-case-editor` 폴더에 둔다. 표시 패널은 서버 업무 데이터와 분리한다.

## 사용자 양식과 생성 결과

필수 시스템 열은 `caseCode`·`title` 두 개다. 사용자 열은 UUID·이름·`valueType`·선택 항목·선택적인 작성 기준을 가진다. 형식은 `text`·`select`·`checkbox`·`tags`이며 선택 항목도 UUID와 이름을 분리한다. 사용자 값은 열 UUID로 연결하고 문자열·옵션 UUID 또는 null·boolean·옵션 UUID 배열로 저장한다. 이름·순서 변경으로 값의 연결을 바꾸지 않는다.

AI 결과 스키마는 생성 작업이 보관한 시나리오 양식에서 만든다. 사용자 열은 모두 정의된 형식으로 반환하고, 선택과 태그는 해당 열의 허용 항목만 참조한다. 제목과 근거 연결은 별도 필드이며 사전 조건·수행 절차·예상 결과·우선순위는 고정 출력 필드가 아니다. 저장 전에 열 ID·형식·옵션 소속을 검사한다.

사용자가 개발 데이터 초기화를 승인했다. 구형 고정 필드의 호환·데이터 변환은 제공하지 않으며 명시적으로 로컬 개발 데이터를 초기화한 뒤 새 스키마를 적용한다. 신규 양식에서 이름·순서 변경 시 UUID와 값 연결은 유지한다. 화면·자료·요구사항 연결은 사용자 열과 별도 데이터다. 구현·데이터 이전·검증 상태는 [양식 기반 생성](changes/2026-10-16-configurable-scenario-columns/change.md)에 기록한다.
