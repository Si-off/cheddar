# 프로젝트 구조

이 문서는 합의된 시스템 구조·기술 선택·운영 제약을 설명한다. 구현 진행과 검증 이력은 커밋·PR에 남기고 여기에는 현재 상태만 적는다. 실제 적용 여부는 코드와 설정으로 확인한다.

## 설계 범위와 환경

- 설계 범위: 웹·Figma 플러그인·저장 및 AI 생성 백엔드. AI 실행 구조는 아래 [MVP AI 생성](#mvp-ai-생성)을 따른다.
- 저장소 구성: pnpm workspace 기반 모노레포.
- 개발 도구: Claude Code(오케스트레이션·프런트엔드 구현)와 Codex(리뷰·백엔드 위임). 역할 분담은 루트 `AGENTS.md`.
- 필요한 구성요소: Figma 플러그인, 웹사이트, 백엔드 서버.
- 앱 위치: 웹 `apps/web/`, Figma 플러그인 `apps/figma-plugin/`, 백엔드 `apps/api/`.
- 공통 패키지 위치: `packages/ui/`, `packages/design-tokens/`.
- 백엔드: NestJS + Drizzle + PostgreSQL. API DTO·DB 모델·화면 모델을 분리한다.
- 초기 환경: 로그인·검색 노출 없이 개발자 PC에서 로컬 검증. 백엔드·DB도 로컬 실행한다.
- 사내 배포 환경과 방식은 추후 결정한다.
- 현재 제품·구조 문서: `docs/`.

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
- 프로젝트 생성 시 기본 양식을 같은 트랜잭션에서 저장하고, 기존 프로젝트에는 migration으로 누락분만 보충한다. 시나리오는 생성 시 양식을 독립 UUID로 복사하며 이후 기본 양식 변경의 영향을 받지 않는다. 시나리오 내용과 보기는 별도 revision으로 저장하고 충돌 시 덮어쓰지 않는다.
- 업로드 공통 스키마는 `uploads`·`upload_frames`다. 프로젝트별 요청 UUID의 유일성, 프레임 순서·Figma 식별자 중복, 프로젝트·파일 소속을 DB에서 보장한다. ready 상태·MIME과 묶음 전체 등록·재시도 응답은 uploads 서비스가 검사한다. 신규 등록201, 같은 요청 키·같은 입력200, 같은 키·다른 입력409를 반환한다.

## 시나리오 캔버스

- 화면 조작은 React Flow, 명시적인 흐름 자동 정렬은 ELK를 사용한다. 라이브러리 노드와 좌표는 캔버스 내부에 한정한다. 기존 편집기는 보기 선택, 케이스 전달, 상세 편집·자료 열기·이탈 보호 콜백을 연결한다.
- 케이스 본문은 기존 `test_cases`·`test_case_values`, 흐름과 배치는 `scenario_canvases`, 독립 AI 흐름 작업은 `scenario_flow_jobs`에 저장한다. 흐름에는 케이스 UUID만 있으며 본문을 복사하지 않는다. 흐름·배치는 각각 revision으로 충돌을 검사한다. 케이스 삭제와 참조 정리는 같은 트랜잭션이다.
- 서버 공통 배치와 브라우저 화면 중심·배율·선택을 분리한다. 미저장 흐름·배치·검토 초안을 브라우저에 보관하고 이탈 전에 각 저장 상태를 확인한다. 케이스 내보내기는 이 저장 경로에 의존하지 않는다.
- AI 흐름 생성은 기존 제공자 transport와 프레임 준비를 재사용한다. 결과는 검토용 구조 초안으로만 저장한다. 반영 시 케이스·흐름·배치 revision과 연결 자료 지문을 검사하며 교체 이전 구조·배치를 서버에 한 개 보관한다.

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

현재 구성은 다음과 같다.

- 웹 라우트: `/`, `/share/$shareId`, `/projects/$projectId/{uploads, uploads/$uploadId, settings, test-scenarios, test-scenarios/$testScenarioId}`. 접이식 사이드바로 시나리오·Figma 자료·설정을 이동한다. 생성·확인 항목·화면 분석은 시트에서 여는 모달이고 별도 결과 경로는 없다. 케이스 편집과 관련 자료는 단일 inspector의 탭이며 좁은 화면에서는 Dialog로 연다. 설정의 기본 정보·화면 구조·기본 양식 탭은 미저장 이동 확인과 revision 보호를 유지한다.
- 플러그인: main/UI 메시지 연결과 Zustand 연결 상태, 프로젝트 검색, 선택 프레임 썸네일·미리보기, 추출·이미지·데이터·등록 진행 상태. 업로드 완료 후 `figma.openExternal`로 해당 웹 자료를 연다. 웹 주소는 main 빌드 시 `VITE_WEB_BASE_URL`(HTTP(S)만 허용, serve 기본 `http://127.0.0.1:5173`, build/watch는 명시)에서 읽는다.
- 공통 UI: shadcn/ui Base UI 기반 Button, Input, Textarea, Checkbox, RadioGroup, Switch, Label, Dialog, Select, Combobox, Tabs, Tooltip, Popover, Surface. `packages/ui/src/styles.css`가 토큰을 사용하며 두 앱의 스타일 진입점에서 로드한다. `components.json`이 각 workspace의 shadcn 경로를 연결한다.
- 토큰: 라이트 팔레트, 타이포그래피, 크기(툴바 32px·폼 40px·표 최소 행 48px), 모서리, 그림자, 레이어, 모션(120/180/240ms). Motion 프로바이더는 `reducedMotion="user"`로 시스템 동작 줄이기를 반영한다. `packages/design-tokens/build-preview.mjs`가 `docs/design-foundations.html`을 생성하며, 실제 컴포넌트는 개발 전용 `/design-system.html`에서 확인한다.
- 브라우저 초안: 시나리오 편집기는 IndexedDB 초안 + Router blocker + beforeunload. 확인 항목 수정·질문 답변 초안은 프로젝트·시나리오별 localStorage 키. revision 충돌 시 최신 내용과 초안을 비교하고, 초안 보관 실패 시 이탈을 막는다. 업로드 상세의 testScenarioGateway는 POST를 자동 재시도하지 않는다.
- API 코드 생성: `OPENAPI_INPUT`(현재 `apps/api/openapi.json`) → 각 앱 `shared/api/generated/`의 `client/`·`core/`·`@tanstack/`. 명세 변경 후 재생성하며 생성 코드는 직접 편집하지 않는다.
- 주소: Figma 플러그인 ID `1692417282897261384`. 웹 API `http://127.0.0.1:3101`, 플러그인 개발 API `http://localhost:3102`. 플러그인 빌드 주소와 개발 manifest 허용 주소를 일치시키고 배포용 네트워크 허용은 `none`이다.
- 검증 도구: API·플러그인 로직은 Node 테스트, UI는 Playwright/Chromium. 명령과 환경은 [README](../README.md#검증과-api-코드-생성).

## 미정

| 항목 | 상태 |
| --- | --- |
| 슬라이스 내부 세그먼트와 향후 추가 레이어·슬라이스 | 필요 시 별도 결정 |
| 공통 UI·디자인 토큰 확장 | 라이트 foundations 토큰 구현안·스탠드얼론 미리보기 구성. 세부 값은 사용자 시각 검토 후 조정 |
| CI | 미구성. 도입 방식은 미정 |
| 공유 링크 접근 방식 | 후속 |
| 사내 배포·릴리스·관측 방식 | 추후 결정 |

## 갱신 기준

구조가 결정되면 이 문서에 현재 상태를 반영한다. 선택 이유가 이후 판단에 필요하면 해당 절에 한두 문장으로 남긴다.

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

사용자가 개발 데이터 초기화를 승인했다. 구형 고정 필드의 호환·데이터 변환은 제공하지 않으며 명시적으로 로컬 개발 데이터를 초기화한 뒤 새 스키마를 적용한다. 신규 양식에서 이름·순서 변경 시 UUID와 값 연결은 유지한다. 화면·자료·요구사항 연결은 사용자 열과 별도 데이터다.

## AI 사용량, 비용과 동시 생성 한도

- 모델 호출 전후의 서버 코드 훅이 PostgreSQL `ai_call_usage`에 호출별 메타데이터를 기록한다. 테스트 케이스 생성의 자료 정리·생성 호출은 `job_id`, 캔버스 흐름 생성 호출은 `flow_job_id`로 작업을 가리키며 둘 중 하나만 채운다. 에이전트 실행이나 별도 계측 서비스가 필요하지 않다. `generation_jobs`에는 종료 관찰 시각과 전체 실행 시간을 저장한다.
- 공급자가 응답한 실제 토큰과 호출 시간을 기록하며, usage는 허용된 숫자 필드만 보관한다. 입력·이미지·출력 본문·키는 계측 데이터에 넣지 않는다. 입력 토큰 합계에는 캐시 읽기·쓰기가 포함되며 세부 토큰을 중복 합산하지 않는다.
- 호출 기록은 시나리오 저장 트랜잭션과 분리한다. 출력 잘림·검증·시나리오 저장 실패에도 수신한 usage를 보존하며, 계측 저장 실패는 식별자만 로그로 남기고 생성 결과를 바꾸지 않는다. 응답이 없으면 토큰과 비용을 미확인으로 둔다. 서버 중단 후 생성 작업이 만료되면 남은 running 호출을 unknown으로 바꾸며 확인되지 않은 실행 시간은 만들지 않는다.
- 계산 비용은 `numeric(24,12)` USD이며 호출 당시 단가와 조건을 함께 저장한다. 기본 Haiku·Luna의 2026-10-15 공식 표준·글로벌 단가만 계산하고, 다른 응답 모델·tier는 비용을 미확인으로 둔다. 추론 토큰은 출력 토큰에 포함되며 Haiku의 입력 100,000토큰 초과 요금과 캐시 TTL을 구분한다.
- 관리자 키와 공급자 전용 프로젝트/워크스페이스 ID가 설정되면 시작 시와 기본 1시간 간격으로 최근 7 UTC 일의 비용 집계를 `ai_provider_costs`에 동기화한다. 공급자 금액과 호출별 계산 비용은 별개다. 오늘 집계는 잠정 값이며 최종 청구서는 공급자 기준으로 확인한다.
- 비용 보고서의 모든 페이지를 검증한 후 해당 공급자·scope·기간만 한 트랜잭션으로 교체해 수정·삭제된 집계와 중복 동기화를 처리한다. 실패한 공급자는 기존 집계를 보존한다. 과거 기간의 명시 재동기화는 `scripts/sync-ai-costs.ts` CLI를 사용한다. 자동 모델 재호출은 추가하지 않는다.
- 사용량 조회는 DB 쿼리로 제공한다. 화면·외부 API 노출, 보관 만료·자동 삭제와 과거 호출 사용량 복원은 포함하지 않는다.
- 테스트 케이스 생성 시작은 PostgreSQL advisory 트랜잭션 잠금 안에서 실행 중인 작업 수를 세어 `AI_GENERATION_CONCURRENCY`(기본 2)를 넘으면 입력을 읽기 전에 429로 거절한다. 여러 API 프로세스가 같은 DB의 한도를 공유하고 대기열은 두지 않는다. 같은 요청 ID 재요청은 한도 검사 전에 기존 작업을 돌려준다. 흐름 생성은 이 한도에 포함하지 않는다.
