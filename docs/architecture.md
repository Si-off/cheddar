# 프로젝트 구조

이 문서는 합의된 시스템 구조, 기술 선택, 코드 규칙, 운영 제약을 설명한다. 구현 진행과 검증 이력은 커밋과 PR에 남긴다.

2026-10-18부터 2026-10-19까지의 전면 개편으로 코드가 이 문서의 구조를 따른다. 2026-10-21에 확정한 시트 개선안은 아래 "시트 개선안" 절에 구현 범위로 정리했고 아직 코드에 반영하지 않았다. 그 절과 충돌하는 기존 설명은 구현 시 그 절을 따른다.

## 설계 범위와 환경

- 구성요소: Figma 플러그인 `apps/figma-plugin/`, 웹 `apps/web/`, 백엔드 `apps/api/`. 공통 패키지 `packages/ui/`, `packages/design-tokens/`, `packages/contracts/`(신규).
- 저장소: pnpm workspace 모노레포. Node는 `.nvmrc`, pnpm은 `packageManager`로 고정한다. 라이브러리 버전은 각 `package.json`과 `pnpm-lock.yaml`이 기준이고 실행 명령은 [README](../README.md)에 있다.
- 개발 도구: Claude Code(오케스트레이션과 UI 구현), Codex(백엔드 위임과 리뷰). 역할 분담은 루트 `AGENTS.md`.
- 초기 환경: 개발자 PC에서 백엔드와 DB를 로컬로 실행한다. 사내 배포 방식은 추후 결정한다.

## 기술 선택

| 영역 | 선택 |
| --- | --- |
| 언어 | TypeScript |
| UI | React, Vite, Tailwind CSS 4(CSS 설정), motion(motion.dev) |
| 공통 UI 기반 | Base UI 위에 Tailwind 클래스와 cva로 직접 작성. lucide-react 아이콘 |
| 데이터와 상태 | TanStack Query(서버 데이터), Zustand(화면 상태), TanStack Router, TanStack Table과 TanStack Virtual(큰 표) |
| API 코드 생성 | Nest Swagger로 OpenAPI 명세 → `@hey-api/openapi-ts`로 타입, SDK, Query 헬퍼 |
| 실시간 | 공동 편집은 WebSocket, 생성 진행은 SSE |
| 백엔드 | NestJS(Express), Drizzle, PostgreSQL 17, pg-boss(작업 큐) |
| 린터 | Biome |
| 테스트 | API는 `node:test`와 실제 PostgreSQL, 웹은 Playwright |

## 웹 구조(FSD)

아래 레이어는 위 레이어를 가져오지 않는다. 같은 레이어의 슬라이스끼리도 가져오지 않는다(entities만 예외로 다른 entity의 공개 타입을 가져올 수 있다). 슬라이스 밖에는 `index`로 공개한 것만 보이며, 이 경계는 루트 `biome.json`의 `noRestrictedImports` overrides로 강제한다.

| 레이어 | 슬라이스 | 하는 일 |
| --- | --- | --- |
| app | router, providers, `global.css` | 라우트 트리, 로그인과 권한 경계, Query와 motion 설정 |
| pages | login, password-setup(초대 수락과 재설정), no-access, admin-accounts, admin-account, admin-roles, admin-role, admin-affiliations, test-sets, test-set-new, test-set-generating, test-set, shared-test-set(공개 링크), projects(목록과 만들기), project-settings, plugin-connect | 화면 조립. 데이터 가져오기와 레이아웃만 |
| widgets | app-header, admin-shell, auth-card, project-shell, case-table, case-board, case-dialog, columns-editor, review-panel, share-dialog, no-access-notice | 여러 기능이 모인 화면 덩어리 |
| features | auth, manage-account(계정 양식, 만들기, 초대와 재설정 링크, 계정 작업), transfer-ownership(소유 테스트 세트 넘기기), manage-role, manage-affiliation, create-project, edit-project, edit-project-memo, edit-template, manage-feature-groups, manage-required-cases, manage-screens, create-test-set, manage-test-set, edit-test-set-columns, edit-cases, test-set-view, collaborate-test-set, generate-cases, resolve-review, export-xlsx, share-test-set | 사용자 행동 하나와 그 상태 |
| entities | test-set(케이스 포함), generation(생성 작업과 확인 필요), project, account, role, affiliation, permission | 도메인 타입, 생성 API 타입을 도메인 타입으로 바꾸는 변환, Query 키와 조회 훅 |
| shared | api(생성 코드와 클라이언트 설정, 오류 변환), config(환경, 공유 링크 경로), testing(e2e용 API 응답 합성) | 도메인을 모르는 도구 |

- 플러그인 UI(`apps/figma-plugin/src/ui/`)는 app, pages, shared 레이어만 쓴다. `main/`(Figma 문서 접근)과 `protocol/`(main과 UI 사이 메시지 계약)은 FSD 밖에 둔다.
- 권한은 `entities/permission`의 `can(permission, projectId)` 하나로 묻는다. 화면은 역할 이름을 모르고 권한 키만 안다.
- 라우트는 코드로 정의하고, 페이지 진입 전에 로그인과 권한을 확인한다.

- 확인 필요 UI는 공통 `Dialog`의 `placement="side"`를 재사용한다. 모달 포커스 관리와 Esc 닫기를 제공하며 본문만 스크롤한다.

## 코드 규칙

### 결합도

- 공통 컴포넌트는 도메인을 모른다. 예를 들어 표는 `DataGrid`로 열 정의와 셀 렌더러를 받는다. "케이스", "테스트 세트"라는 말은 entities 위에서만 나온다.
- 참거짓 props를 늘리지 않는다. 모양은 `variant`, `tone`, `size` 같은 값 하나로 받고 조합은 cva로 정의한다.
- 구조가 바뀔 수 있는 컴포넌트(Dialog, Menu, Select, Tabs)는 `Dialog.Root`, `Dialog.Title`처럼 조각을 children으로 받는다. 정해진 자리 하나만 바뀌면 `icon`, `trailing` 같은 ReactNode prop으로 받는다.
- 각 컴포넌트는 감싸는 요소의 기본 속성 타입을 확장해 그대로 넘긴다. `className`은 tailwind-merge로 합친다. 다른 요소로 그려야 하면 Base UI의 `render` prop을 쓴다.
- 입력형 컴포넌트는 모두 `value`, `defaultValue`, `onValueChange`를 같은 이름으로 지원한다.
- 생성 API 타입은 entities에서 멈춘다. widgets와 pages는 도메인 타입만 받는다. 백엔드 계약이 바뀌면 entities의 변환 함수만 고친다.
- 권한, 실시간 연결, 생성 진행은 훅 하나로 감싼다. `useTestSetSession(testSetId)`는 연결, 접속자, 셀 선택, 연산 전송을 숨긴다.

### 응집도

- 다른 파일이 가져가지 않는 작은 기능(하위 컴포넌트, 훅, 상수, 변환 함수)은 쓰는 파일 안에 둔다.
- 두 곳 이상에서 쓰일 때만 파일을 나누고, 나눌 때도 같은 슬라이스 안에 먼저 둔다.
- 슬라이스 안 세그먼트 폴더(ui, model, api)는 파일이 여러 개가 될 때만 만든다.
- 테스트는 사용자에게 의미 있는 동작 기준으로 쓴다. 클래스 이름이나 DOM 구조를 고정하지 않는다.

### 스타일

- CSS 파일은 `packages/design-tokens/src/theme.css`(토큰만, Tailwind `@theme`)와 앱별 `global.css`만 둔다. 컴포넌트와 페이지별 CSS 파일을 만들지 않는다.
- `global.css`에는 Tailwind 가져오기, 토큰 가져오기, `@source`, 기본 요소 스타일, 스크롤바, 움직임 줄이기 설정만 둔다.
- 컴포넌트 스타일은 Tailwind 클래스로만 쓴다. 원시 값과 임의 값(`w-[13px]` 같은 것)을 쓰지 않고, 필요한 값은 토큰에 먼저 추가한다.
- 디자인 기준은 [DESIGN.md](../DESIGN.md)를 따른다.

## 백엔드 구조

| 모듈 | 하는 일 |
| --- | --- |
| auth | 로그인, 로그아웃, 세션 쿠키, 초대 수락, 비밀번호 설정과 재설정 토큰 |
| accounts | 계정 만들기, 수정, 비활성화, 만료 처리, 소유 테스트 세트 넘기기, 첫 관리자 CLI |
| roles, affiliations | 역할과 권한, 할당과 범위, 소속 이름표 |
| authorization | 권한 키 목록, 할당 합산 계산, 모든 컨트롤러에 붙는 Guard와 데코레이터 |
| projects | 프로젝트, 양식, 기능 그룹, 화면 구조와 화면 ID 규칙, 메모 설정 (현재 코드는 기본 양식 편집과 필수 케이스를 제공한다. "시트 개선안" 절 참고) |
| test-sets | 목록(전체, 내 것, 공유받은 것), 만들기(양식 복사), 이름 변경, 삭제, 양식 편집, 사람별 보기 설정 |
| collaboration | 테스트 세트별 WebSocket 방, 셀과 행 연산 적용과 전파, 접속자와 셀 선택, 권한 변경 때 연결 끊기 |
| sharing | 공개 범위, 링크 권한, 링크 토큰 재발급, 사람 초대, 방문자 세션과 자동 이름 |
| temp-uploads | 프로젝트 없는 임시 업로드, 사용 표시, 만료 삭제 |
| generation | 단계 실행기, 단계 이벤트(SSE), 확인 필요 항목, 답변으로 다시 작성 |
| exports | XLSX 내보내기 |
| plugin-connections | 플러그인 연결 요청, 브라우저 승인, 토큰 발급과 폐기 |

- `src/contracts/`는 외부 DTO, `database/schema.ts`는 DB 모델이다. 서로의 내부 타입을 직접 공유하지 않는다.
- OpenAPI에 담기지 않는 WebSocket과 SSE 메시지 형식은 `packages/contracts`에 두고 API와 웹과 플러그인이 함께 쓴다.
- 모든 요청은 권한 키와 프로젝트로 확인하고, 역할 이름에 묶인 분기를 두지 않는다. 방문자 요청은 해당 테스트 세트로만 범위를 묶는다.
- 계약을 바꾸면 명세를 다시 내보내고 웹과 플러그인 SDK를 다시 생성한다. 생성 코드는 직접 편집하지 않는다.
- API는 loopback에 바인딩하고 웹 Origin을 명시적으로 허용한다. AI 키와 모델은 서버 환경변수로만 관리한다.
- 마이그레이션은 schema에서 생성한 SQL을 검토해 명시적으로 적용한다. 서버 시작 시 실행하지 않는다. 개편 시작에서 기존 마이그레이션을 지우고 새 기준 마이그레이션 하나로 시작한다(운영 데이터 없음).

## 데이터 모델

| 묶음 | 테이블 |
| --- | --- |
| 계정 | accounts, auth_tokens(초대, 재설정), sessions, affiliations |
| 권한 | roles, role_permissions, role_assignments, role_assignment_projects |
| 프로젝트 | projects, project_templates, feature_groups, required_cases, screen_structure_items, project_memos |
| 테스트 세트 | test_sets(소유자, 프로젝트, 공개 범위, 링크 권한, 링크 토큰), test_set_columns, test_cases, test_case_values, test_set_members, view_preferences |
| 생성 | generation_jobs, generation_steps, review_items, ai_call_usage, ai_provider_costs |
| 임시 자료 | temp_uploads, temp_frames(파일은 만료 삭제) |
| 연결 | visitor_sessions, plugin_connections |

- 필수 시스템 항목은 테스트 ID와 제목이다. 사용자 항목은 UUID, 이름, 형식, 선택 항목, 항목 설명을 가진다. 값은 항목 UUID로 연결하므로 이름과 순서를 바꿔도 값이 유지된다.
- 케이스와 프레임, 요구사항, 화면 구조의 연결은 저장하지 않는다.

### 2단계 계정·권한 구현

백엔드는 auth, accounts, roles, affiliations, authorization과 기반 모듈로 전환했다. 프로젝트 설정 API는 아래 4단계, 테스트 세트 API는 5a단계에서 구현했다. 생성·공유·플러그인 연결의 스키마는 정의했지만 API와 작업 실행기는 후속 단계다. 기존 업무 API와 LangGraph 실행기는 제거했다. 이 단계에서는 OpenAPI만 내보내고 웹·플러그인 SDK는 갱신하지 않는다.

- 계정의 저장 상태는 `invited | active | inactive`다. 외부 응답의 `expired`는 `active`이면서 `expires_at <= 현재 시각`일 때 계산한다. 소속은 필수이며 이메일은 공백 제거·소문자화 후 유일하다. 계정 삭제 API는 없다.
- 비밀번호는 Node 내장 `crypto.scrypt`(N=32768, r=8, p=1, 임의 16바이트 salt, 64바이트 결과)로 해시한다. 설정·재설정 비밀번호 길이는 12~128자다.
- 세션은 임의 32바이트 토큰을 `cheddar_session` 쿠키로 발급한다. `HttpOnly; SameSite=Lax; Path=/`, 운영(`NODE_ENV=production`)에서는 `Secure`다. 고정 유효기간은 30일이며 연장하지 않는다. DB에는 SHA-256만 저장하고, 매 요청에 세션·계정 만료와 상태를 확인한다. 비활성화·비밀번호 변경은 해당 계정의 세션을 삭제한다.
- 초대와 재설정 토큰도 임의 32바이트를 쓰며 해시·용도·7일 만료·사용 시각을 저장한다. 재발급은 같은 용도의 이전 토큰을 폐기한다. 수락·재설정은 한 번만 허용하며 기존 세션을 폐기한다. 만료·비활성 계정은 링크로도 활성화할 수 없다. 만료일 연장·재활성화는 관리 API에서 먼저 처리한다. 비밀번호가 없는 계정을 재활성화하면 초대됨으로 돌아가므로 초대 링크를 다시 발급한다.
- 계정·역할 변경과 토큰 사용은 공통 트랜잭션 advisory lock으로 직렬화한다. 커밋 전에 전체 범위 `role.manage`를 가진 활성·미만료 계정이 남는지 확인한다. 설치 중 첫 관리자 생성·초대 수락·로그인은 이 사후 조건의 예외이며 같은 lock을 사용한다.
- 역할 이름은 인가에 쓰지 않는다. `global` 할당은 해당 권한을 모든 프로젝트에 적용하고, `projects`는 비어 있지 않은 프로젝트 UUID 목록이다. 전체만 권한은 후자의 할당에서 제외한다. `can(accountId, permission)`처럼 프로젝트가 없으면 전체 범위만 통과한다. 유효 권한 응답은 권한 키마다 전체 범위 또는 프로젝트 합집합을 반환한다.
- `@Public()` 외 컨트롤러는 전역 Guard에서 세션을 검사한다. `@RequirePermission(key, { source: "params" | "body", key: "projectId" })`는 프로젝트 UUID를 읽어 권한을 검사한다. 계정 관리는 `account.manage`, 역할·소속 관리는 `role.manage`를 요구한다.
- 역할 할당은 수정 요청의 목록으로 교체한다. 필수 만료일을 기본 기간으로 자동 저장하지 않고 명시적으로 받는다. 응답의 `defaultExpiryDays`는 만료일 필수 역할들의 기본 기간 중 최솟값이다. 역할에 만료일 필수를 추가할 때 기존 할당 계정에 만료일이 없으면 거부한다.
- `account.manage` 계정은 `GET /api/v1/accounts/:accountId/owned-test-sets`로 소유 세트를 이름순으로 조회하고, `POST /api/v1/accounts/:accountId/owned-test-sets/:testSetId/owner`로 한 세트의 소유자를 넘긴다. 원 소유자는 비활성, 받는 계정은 활성·미만료여야 한다. 세트 행 잠금 안에서 소유자를 확인하고 새 소유자의 구성원 행을 정리한다. 커밋 후 기존 계정 변경 알림으로 live 연결 권한을 재검사한다.
- 기본 역할·소속은 `db:migrate`의 별도 트랜잭션으로 초기화한다. 초기 데이터가 있으면 이름·권한을 덮어쓰지 않는다. `admin:create --email --name`은 계정이 없는 DB에서만 첫 관리자 역할의 전체 범위 계정과 초대 토큰을 만든다. 링크 경로는 웹이 결정하며 CLI는 토큰과 만료 시각을 출력한다.
- DB 필수 테이블 검사는 Drizzle 스키마의 전체 테이블을 사용한다. 서버 시작 시 마이그레이션 이력과 테이블을 확인하며 마이그레이션 자체는 실행하지 않는다.

### 4단계 프로젝트 설정 구현

- `projects` 모듈이 `/api/v1/projects` 아래 프로젝트, 기본 양식, 기능 그룹, 필수 케이스, 화면 구조, 메모 API를 제공한다. 하나의 프로젝트 설정 경계이므로 별도 하위 모듈로 나누지 않았다. 웹 SDK는 이 명세로 다시 생성했고, 플러그인 SDK는 플러그인을 다시 만드는 7단계에서 생성한다.
- `AuthorizationService.projectAccess`와 `canViewProject`는 유효 권한 중 해당 프로젝트에 적용되는 권한이 하나라도 있으면 보기를 허용한다. 전체 범위 권한은 모든 프로젝트에 적용되므로 계정 관리와 역할 관리 계정도 모든 프로젝트를 본다. 보이지 않는 프로젝트의 모든 GET은 `404 NOT_FOUND`다. `canManage`는 별도로 `project.manage`를 계산한다. 만들기는 전체 `project.create`, 설정 쓰기는 기존 `RequirePermission`의 URL 프로젝트 검사를 사용한다. 만든 계정에 새 역할을 자동 할당하지 않는다.
- 프로젝트 만들기는 하나의 트랜잭션으로 QA 시나리오 기본 양식(시스템 항목 2개를 포함한 14개, revision 1), 켜진 기본 필수 케이스 12개, 생성 계정이 마지막 수정자인 빈 메모를 저장한다. 기본 항목과 작성 기준은 `projects/template.ts`의 `defaultColumns()`에서 정의한다. 사용자/관리자, QA 결과, 개발 진행 상태는 선택 형식이며 나머지는 텍스트다. 원본의 묶인 QA 진행과 개발 작업상황 헤더는 각각 결과 또는 상태와 담당자 항목으로 나누고, 릴리즈 범위와 개별 테스트 데이터는 포함하지 않는다. 기본값 변경은 이후 생성하는 프로젝트에만 적용하며 기존 양식 JSONB는 갱신하지 않는다. 기능 그룹과 화면 구조는 행 없이 시작한다.
- 기존 `0000`을 유지하고 Drizzle로 생성한 `0001`에서 프로젝트 설명, 필수 케이스의 `is_default`, 메모의 프로젝트 유일 제약을 추가했다. 메모의 DB 컬럼 `author_id`는 유지하며 API에서는 마지막 수정 계정인 `updatedBy`로 노출한다. 메모가 없는 기존 프로젝트는 빈 본문과 null 수정 정보를 반환하고 PUT으로 upsert한다. 기존 중복 메모를 임의로 삭제하거나 합치지 않으므로 기존 DB에 중복 행이 있다면 마이그레이션 전에 별도 판단이 필요하다.
- 설정 쓰기는 프로젝트 행의 `FOR UPDATE` 잠금으로 직렬화한다. 양식 저장은 revision을 조건으로 갱신하며 불일치는 `409 TEMPLATE_CONFLICT`다. 양식 DTO와 업무 규칙을 전용 검증 함수에서 함께 검사해 `400 VALIDATION_FAILED`와 한국어 오류를 반환한다. 문자열은 공백을 제거하며 텍스트와 체크박스의 선택 값은 빈 배열로 저장한다.
- 기능 그룹은 현재 전체 ID 집합과 같은 목록만 정렬하고 다르면 `409 STALE_ORDER`다. 필수 케이스 중 기본 항목은 설명 수정과 삭제를 거부하고 켜고 끄기만 허용한다. 화면은 같은 프로젝트 부모만 허용하고 조상 경로를 검사해 다단계 순환을 거부한다. 부모 변경 시 새 부모의 마지막 순서로 옮기고, 하위 화면이 있으면 삭제를 거부한다. 화면 조회는 부모 다음 하위 화면 순서다.
- 메모는 사람 간 기록으로 유지하며 AI 생성 입력에 연결하지 않는다. 기존 프로젝트의 기본 데이터 일괄 보충은 이번 계약에 없으므로 수행하지 않는다.

### 5a단계 테스트 세트 구현

- `test-sets` 모듈이 `/api/v1/test-sets` 아래 목록, 직접 만들기, 상세, 이름과 메모 변경, 삭제, 열 편집, 케이스 연산, 사람별 보기 설정을 제공한다. AI 생성, 확인 필요 처리, 공유 변경, 공개 링크와 WebSocket은 포함하지 않는다. 이번 단계에서는 OpenAPI만 갱신하며 웹과 플러그인 SDK는 다시 생성하지 않는다.
- 소유자와 view/edit 멤버, 해당 프로젝트의 `test_set.view_all` 계정만 세트를 본다. 프로젝트 보기 권한이나 공개 여부만으로는 이 API에서 세트를 볼 수 없다. 편집과 이름 변경은 소유자 또는 edit 멤버, 삭제는 소유자만 가능하다. 내보내기는 보기와 해당 프로젝트의 `test_set.export`를 모두 요구한다. 보이지 않는 세트는 모든 경로에서 404, 보이지만 작업 권한이 없으면 403이다. 만들기는 프로젝트 보기 확인 후 `test_set.create`를 검사한다.
- 만들기는 프로젝트 행을 잠그고 현재 기본 양식을 새 열 UUID로 복사하며 케이스 없이 시작한다. 기본 양식과 이후 양식 사본은 서로 영향을 주지 않는다. 이름은 DTO에서 1~100자로 제한하고 DB의 200자 컬럼은 유지한다. 메모는 최대 5000자이며 입력한 공백을 보존한다. 목록은 최근 수정순이며 전체, 소유, 초대받음 필터와 이름의 대소문자 무시 부분 검색을 지원한다. 확인 필요 수는 이 단계에서 0을 반환한다.
- 세트 쓰기는 세트 행의 `FOR UPDATE` 잠금 안에서 권한을 확인하고 처리한다. 이름과 메모, 양식, 케이스 연산의 성공은 version과 updated_at을 올린다. 보기 설정은 세트 내용 버전을 바꾸지 않는다. `CaseOperationsService.apply`는 HTTP에 의존하지 않으며 권한 확인부터 연산 검증과 트랜잭션까지 포함해 6단계 WebSocket에서도 재사용한다. 한 요청의 연산은 순서대로 적용되고 하나라도 실패하면 전체를 되돌린다. 같은 셀은 나중 연산의 값으로 저장한다.
- 셀은 열 UUID로 연결하며 텍스트 최대 20000자, 선택 항목 소속, 체크박스 boolean, 태그 소속과 중복을 검증한다. 추가할 때 작성 계정과 당시 이름을 저장한다. 비어 있는 테스트 ID는 `TC-001`부터 세 자리 이상 번호를 채운다. 큰 사용자 지정 번호도 정밀도 손실 없이 처리하고 삭제한 번호를 다시 사용하지 않도록 마지막 번호를 문자열로 저장하는 `test_sets.test_id_counter`를 Drizzle `0002`로 추가했다. 기존 0000과 0001은 유지한다. 기존 세트의 현재 번호도 연산 시작 시 합산한다.
- 열 편집은 프로젝트의 `validateTemplate`을 그대로 재사용한다. 삭제한 열의 값은 함께 지우고 형식과 선택 항목이 바뀌면 유효한 값만 남긴다. 태그는 남은 선택 값만 유지하고 텍스트 변환은 태그를 `, `로 연결하고 체크박스를 `예`/빈 문자열로 바꾼다. 모든 사람의 보기 설정에서 삭제된 열 너비와 사용할 수 없는 묶기 기준을 정리한다. 케이스 삭제는 해당 행 높이도 정리한다.
- 보기 설정은 계정별로 따로 upsert하며 기본값은 표 보기, 묶기 없음, 빈 크기 맵이다. 묶기는 같은 세트의 선택, 태그, 체크박스 열만 허용한다. 크기 맵은 같은 세트의 열과 케이스만 참조하고 너비 40~2000, 높이 24~2000 정수만 저장한다. 세트 삭제는 묶기 열의 RESTRICT FK에 걸리지 않도록 보기 설정부터 삭제한다.
- XLSX는 `exceljs@4.4.0`으로 만든다. 시트 하나에 현재 열 이름을 머리글로, 저장된 케이스를 화면 순서로 넣는다. 태그는 ", "로 잇고 체크박스는 "예"/빈칸이다. 파일 이름은 테스트 세트 이름이며 `Content-Disposition`에 UTF-8로 인코딩한다.
- DB 없는 DTO, 값 검증과 변환, 접근 계산, HTTP 400 테스트와 PostgreSQL 계약 테스트를 분리했다. PostgreSQL 테스트는 기존 전용 `TEST_DATABASE_URL`과 안전 검사를 그대로 쓰며 권한, 목록, 양식 복사와 값 정리, 연산의 원자성과 세트 경계, 번호, 작성자, 개인 보기를 검증한다. XLSX는 머리글과 응답 헤더를 검증한다. 실제 DB 실행 여부는 검증 결과에서 별도로 보고한다.

### 5b단계 AI 생성 구현

- 기본 모델은 `screens`·`flows`·`cases`·`rewrite`에 `terra`(GPT-5.6 Terra), `finish`에 `luna`(GPT-6 Luna)를 쓴다. 모델 변경과 별개로 단계별 출력 토큰 한도와 effort는 유지한다.
- `kind: initial`은 요청자 소유의 `uploadId`가 필수다. 메모만으로 최초 생성할 수 없다. `kind: append`는 업로드 없이 비어 있지 않은 메모만으로 실행할 수 있으며 업로드와 메모가 모두 없으면 400이다.
- 제공자 전송용 스키마는 [Anthropic 지원 범위](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations)와 [OpenAI strict 지원 범위](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas)의 공통 부분집합을 사용한다. 글자 수, 배열 개수와 중복, 숫자 최솟값 제약은 전송 시 설명으로 옮기고 원본 스키마로 서버에서 검증한다. OpenAI의 fine-tuned 모델에도 같은 전송 형식을 쓴다. SDK가 요청 시간 초과를 사용자 중단 오류로 감싸더라도 시간 초과는 재시도하며 서버 종료에 의한 중단은 재개용으로 보존한다.
- 열 저장 트랜잭션에서 모든 상태의 확인 필요 초안도 케이스와 같은 값 정리 규칙을 적용한다. 삭제된 열은 제거하고, 선택지와 형식 변경은 유효한 값만 보존하거나 텍스트로 변환한다. 만료 정리는 `.incoming`의 수정 시각이 1시간 이상 지난 UUID 일반 파일도 제거하며 최근 스테이징과 게시된 파일은 보존한다. SSE의 반복 조회는 계정 활성 상태와 만료 시각도 확인하며 더 이상 유효하지 않으면 연결을 닫는다.

- `temp-uploads`, `generation`, `review-items`가 임시 업로드, 생성 시작과 최근 작업, SSE, 확인 필요 목록과 수정, 제외와 복원, 케이스 추가와 다시 작성을 제공한다. 기존 세트의 보기와 편집 권한을 재사용한다. 보이지 않는 세트와 다른 계정의 업로드는 404, 보이지만 편집할 수 없는 세트는 403이다. 업로드 만들기는 전체 `plugin.upload` 권한을 요구한다.
- multipart는 `manifest` JSON 문자열과 프레임 순서의 `images[]`를 받는다. 프레임은 1~200개이며 `imageCount` 합계가 파일 수와 같아야 한다. PNG/JPEG 서명과 MIME, 장당 10MB, multipart 본문 전체 200MB를 검사한다. 인증을 기다리는 동안 크기 검사기가 본문을 소비하지 않도록 스트림을 멈추고 multer가 준비되면 재개한다. 파일은 기존 로컬 저장소의 UUID 경로에 저장한다. 업로드 행을 파일보다 먼저 기록해 기록 중 종료된 요청도 만료 정리가 찾을 수 있게 한다.
- pg-boss는 `DATABASE_URL`의 PostgreSQL과 기본 `pgboss` 스키마를 쓴다. 서버 초기화 때 큐 스키마와 워커, 매분 정리 예약을 준비하고 미완료 작업을 큐에 다시 넣는다. 명세를 위한 앱 생성 자체는 연결하지 않는다. DB 없는 HTTP 검사에서만 주입 설정 `workersEnabled: false`를 사용하며 실제 서버 기본값은 워커 시작이다. 테스트는 `AI_PROVIDER=fake`와 0.5초 큐 폴링을 사용한다.
- 화면, 흐름, 케이스, 마무리는 각각 pg-boss 작업으로 실행한다. 보드별 화면 분석과 기능 그룹별 케이스 작성의 동시 실행 상한은 3이다. 작업별 PostgreSQL advisory lock이 여러 워커의 중복 실행을 막고, `generation_steps`의 작업+단계+분할 키로 완료 결과를 재사용한다. DB 작업 행이 큐 전송의 영속 기준이며 전송 중 종료된 작업은 시작 시와 매분 스캔으로 다시 넣는다. 종료 신호는 제공자 호출과 백오프를 중단하며 미완료 작업과 입력은 재개용으로 보존한다.
- 요청 당시 양식, 세트 메모, 화면 문서와 이미지 키, 프로젝트 기능 그룹, 켜진 필수 케이스, 화면 구조, 요청자가 볼 수 있는 최근 세트의 스타일 예시를 `context` 단계에 잠시 저장한다. 스타일 예시는 최근 5개 세트에서 세트별 최대 3개, 총 6개이며 현재 열의 이름과 형식으로 매핑한다. append는 기존 케이스도 입력에 포함한다. 프로젝트 메모는 조회하거나 입력에 넣지 않는다. Figma 글자와 메모, 답변은 신뢰하지 않는 자료로 감싸 시스템 지시와 분리한다.
- 단계 정의 파일마다 프롬프트와 버전, 화면 단계, 출력 스키마, 출력 한도, 요청 시간 제한, 재시도 2회를 둔다. 단계별 모델과 effort는 `generation/model-config.ts`의 기본값 표에 두고 `AI_MODEL_<단계>`, `AI_EFFORT_<단계>`로 바꾼다. 모델은 짧은 이름(`haiku`, `sonnet`, `opus`, `luna`, `terra`)도 받는다. effort는 Claude에는 `output_config.effort`, GPT에는 `reasoning.effort`로 보낸다. Anthropic과 OpenAI는 공식 SDK를 `AiProvider` 인터페이스로 감싸고 SDK 자동 재시도는 끈다. 연결과 속도 제한, 서버 오류, 출력 길이 초과는 단계에서 지수 백오프로 재시도한다. 거절과 요청 설정 오류는 바로 실패한다. 제공자 키는 환경에서만 읽으며 실제 AI를 호출하는 테스트는 두지 않는다.
- 출력 JSON 스키마는 세트 열 UUID에서 만들고 테스트 ID는 서버가 붙인다. 선택과 태그는 enum, 객체는 필수 키와 추가 키 금지를 사용한다. 서버에서 파싱, 스키마, 셀 값, 화면과 기능 그룹 참조, 최종 필수 케이스 집계를 다시 검증하고 잘못된 출력에는 검증 오류를 붙여 1회만 수정 요청한다. 마무리는 필수 케이스 보충과 의미상 중복 합치기를 요청하고 서버도 번호를 제외한 셀 값이 같은 케이스를 제거한다.
- 마무리에서 세트 행을 잠그고 요청 계정의 현재 활성 상태와 편집 권한을 다시 검사한다. `CaseOperationsService.applyInTransaction`으로 세트 끝에 케이스를 추가하며 작성 계정과 자동 번호를 기존 연산과 동일하게 처리한다. 케이스, 확인 필요, 완료 상태와 개수, 단계 입력과 출력 제거는 하나의 트랜잭션이다. 실패하면 추가된 케이스가 없다. 완료 후 파일과 임시 업로드 행을 지우며, 파일 정리 중 종료돼도 다음 예약 실행이 이어서 정리한다. 사용하지 않은 업로드는 1시간 뒤 정리하고 생성 중인 업로드는 보존한다.
- 확인 필요의 `rewriting`과 `resolved`는 수정과 중복 추가를 409 `REVIEW_ITEM_LOCKED`로 막는다. 추가는 케이스 삽입과 resolved 변경을 같은 트랜잭션에서 처리한다. 다시 작성은 화면 설명, 질문과 답변, 양식, 같은 세트 케이스를 입력으로 단계 하나를 실행한다. 성공하면 초안을 바꾸고 pending으로 돌리며, 실패하면 초안을 보존하고 pending으로 돌린다. 세트 목록의 확인 필요 수는 pending과 rewriting만 센다. 한 세트에서는 생성과 다시 작성을 합해 하나의 작업만 진행할 수 있다.
- SSE는 즉시 현재 상태를 보내고 `progress`에 화면 단계와 상태만, `done`에 성공 개수 또는 짧은 한국어 오류만 보낸 뒤 종료한다. 15초마다 주석을 쓰고 연결 해제 시 타이머를 정리한다. 권한을 다시 확인하며 여러 서버에서도 DB 상태로 진행을 읽는다. 폴링 사이에 끝난 짧은 단계도 저장된 단계 시작 기록에서 순서대로 전달한다. rewrite는 별도 화면 단계를 노출하지 않는다. OpenAPI에 `text/event-stream`으로 명시하며 웹과 플러그인 SDK는 생성하지 않는다.
- Drizzle `0003_ai_generation`은 활성 작업의 세트별 유일 인덱스, 작업 개수와 재작성 대상, 캐시 토큰과 실패 코드, 합친 수와 수정 횟수, 확인 필요 이유와 rewriting 상태를 추가한다. 기존 `0000`~`0002`는 유지한다. 단계에는 모델, 토큰, 시간, 비용, 프롬프트 버전, 필수 충족 여부와 근거, 확인 필요 비율을 기록하며 HTTP 응답에는 노출하지 않는다.
- 비용은 [Anthropic 가격표](https://platform.claude.com/docs/en/about-claude/pricing)와 [OpenAI 가격표](https://developers.openai.com/api/docs/pricing)를 확인한 2026-10-20 USD 단가 상수로 추산한다. 캐시와 Haiku 100,000 토큰 경계, GPT 272,000 토큰 경계를 반영한다. Claude Opus·Sonnet·Haiku 5.5와 GPT-5.4, GPT-6 Luna, GPT-5.6 Terra의 단가를 포함한다. 다른 모델 이름도 설정할 수 있으나 등록 단가가 없으면 비용은 null로 기록하며 0으로 추정하지 않는다. 실제 청구 금액 검증은 이번 범위에 없다.

### 새 기준 스키마의 저장 단위

UUID를 주 키로 쓰고 시각은 timezone이 있는 timestamp로 저장한다. 아래 27개 테이블은 Drizzle 기준 마이그레이션 `0000`으로 만들고 4단계 변경은 `0001`, 5a단계 변경은 `0002`로 추가한다. 개편 전 0000~0008 이력과의 호환·데이터 변환은 제공하지 않으며, 실제 DB를 자동으로 초기화하지 않는다.

| 테이블 | 핵심 컬럼과 제약 |
| --- | --- |
| affiliations | 이름 유일. 계정의 소속 FK는 삭제 제한 |
| accounts | 이름, 정규화된 유일 이메일, 필수 소속, 비밀번호 해시, 저장 상태, 만료 시각. 활성 상태는 비밀번호 해시 필수 |
| auth_tokens | 계정, invite/reset 용도, 유일 토큰 해시, 만료·사용 시각. 재발급과 단일 사용은 트랜잭션으로 검증 |
| sessions | 계정, 유일 토큰 해시, 만료·생성 시각 |
| roles | 유일 이름, seed 식별용 system_key, fixed, requires_expiry, default_expiry_days. 필수 만료는 양의 기본 기간 필수. fixed는 link_visitor에만 허용 |
| role_permissions | 역할+권한 enum 복합 PK. 고정 역할의 export 전용 규칙은 서비스에서 검사 |
| role_assignments | 계정, 역할, global/projects 범위. 할당된 역할은 FK와 서비스로 삭제 제한. 고정 역할 할당 금지·범위별 목록 검증은 서비스에서 수행 |
| role_assignment_projects | 할당+프로젝트 복합 PK. 프로젝트별 권한 합산에 사용 |
| projects | 이름, 설명, 생성 계정, 생성·수정 시각. 테스트 세트의 프로젝트 FK는 삭제 제한 |
| project_templates | 프로젝트당 1행, UUID를 가진 열 정의 JSONB 배열, 양의 revision. 생성 시 테스트 세트 열로 복사 |
| feature_groups | 프로젝트, 이름, 설명, 순서. 프로젝트 안 이름 유일 |
| required_cases | 프로젝트, 설명, 사용 여부, 기본 항목 여부, 순서. 프로젝트 API가 기본 12개를 생성 |
| screen_structure_items | 프로젝트, 화면 ID, 이름, 상위 항목, 설명, 순서. 화면 ID는 프로젝트 안 유일, 상위 항목도 같은 프로젝트여야 하며 자기 참조 금지 |
| project_memos | 프로젝트당 1행, 마지막 수정 계정(author_id), 본문, 생성·수정 시각. 생성 입력과 분리 |
| test_sets | 프로젝트, 소유 계정, 이름, 메모, private/public, view/edit 링크 권한, 유일 원문 링크 토큰(link_token, 32바이트 base64url), version, 마지막 테스트 ID 번호. 공유 창에서 링크를 다시 복사해야 하므로 0004에서 해시를 원문으로 바꾸며 기존 해시 링크는 비공개로 전환해 무효화한다. 기본 private, 공개일 때 링크 필수, 링크 만료 컬럼 없음 |
| test_set_columns | 세트, 열 UUID, 이름, 형식 enum, 설명, 선택 값 배열, 순서. 시스템 키 test_id/title은 세트 안 유일하고 text 형식 |
| test_cases | 세트, 순서, 작성 계정과 작성 당시 이름, 시각. 프레임·요구사항·화면 구조 근거 FK 없음 |
| test_case_values | 케이스+열 복합 PK, JSONB 값. 세트 ID를 포함한 복합 FK로 다른 세트의 케이스·열 연결 금지 |
| test_set_members | 세트+계정 복합 PK, view/edit 권한 |
| view_preferences | 세트, 계정 또는 방문자 중 정확히 하나, table/card, 묶기 열, 열 너비·행 높이 맵. 사람별 1행, 묶기 열·방문자는 같은 세트 FK |
| generation_jobs | 세트, 요청 계정, 임시 업로드, initial/append/rewrite, 작업 상태, 표시 단계, 오류 코드. 임시 업로드 삭제 시 FK만 비움 |
| generation_steps | 작업, 단계, 분할 실행 키, 상태, 시도 횟수, 임시 입력·출력, prompt 버전, 모델·토큰·시간·비용·필수 충족률·확인 필요 비율. 작업+단계+실행 키 유일 |
| review_items | 세트, 이유, 남겨 둘 화면 설명, 질문·답변 배열, 초안, pending/rewriting/excluded/resolved. 임시 프레임과 영속 FK로 연결하지 않음 |
| temp_uploads | 업로드 계정, 기본 1시간 만료, 사용 시작 시각. 프로젝트·업로드 이름 없음 |
| temp_frames | 임시 업로드, 이름, 화면 문서, 이미지 저장 키 배열, 순서. 업로드 삭제 시 행 삭제 |
| visitor_sessions | 세트, 브라우저 토큰 해시, 표시 이름. 같은 세트의 브라우저·이름 각각 유일 |
| plugin_connections | 요청 토큰 해시, 승인 계정, 계정 토큰 해시, pending/approved/revoked, 만료·승인·폐기 시각 |

- 7단계 플러그인 연결은 10분 요청을 브라우저 세션으로 승인하고 30일 Bearer 토큰을 한 번 발급한다(`token_expires_at` 별도 저장). Bearer는 `GET /api/v1/auth/me`, `GET /api/v1/projects`, `POST /api/v1/temp-uploads`, `DELETE /api/v1/plugin-connections/current`만 허용하며, 계정 비활성화·비밀번호 변경 시 함께 폐기한다. 업로드는 전체 `plugin.upload` 권한을 요구한다.
- 플러그인 UI의 Origin은 위 네 경로와 연결 요청 생성·토큰 교환에만 credentials 없이 허용한다. 번들 UI의 `Origin: null`은 development에서 `ALLOW_FIGMA_NULL_ORIGIN=true`일 때만, 원격 UI는 `PLUGIN_UI_ORIGIN`으로 허용한다. `PLUGIN_UI_ORIGIN`은 쿠키를 받는 `CORS_ORIGINS`와 겹칠 수 없고 운영에서는 HTTPS만 받는다.

아직 없는 API에서 지켜야 할 조건은 후속 구현에 남는다. 테스트 세트의 프로젝트 불변, 테스트 세트 안의 필수 시스템 열 2개 보호, JSONB 셀 값의 열 형식·선택 값 검증, 생성 종료 시 임시 자료·단계 입력/출력 삭제, 공개 권한 변경 시 연결 종료는 이번 단계의 스키마만으로 완성되지 않는다. 프로젝트 기본 양식의 시스템 항목 보호와 화면 구조의 다단계 순환 금지는 4단계 서비스에서 검사한다.


## 공동 편집

- 셀 값 설정과 행 추가·삭제·이동은 기존 HTTP ops로 저장하고 WebSocket은 커밋 뒤 전파와 접속자·선택 표시에 쓴다. 웹의 대기열·재전송·결과 불명 처리를 재사용하며 같은 셀은 나중에 온 값이 이긴다. 단일 API 프로세스에서 test_sets.version과 방별 최근 500묶음으로 누락을 복구하고, 열·이름·메모·AI·확인 필요·공유 변경은 resync로 다시 읽는다. 전송 계약은 @cheddar/contracts의 빌드 결과를 공유한다.
- 서버는 연산마다 권한을 확인하고 정규화된 테이블에 바로 저장한 뒤 같은 방에 전파한다. 연산에는 순번을 붙여 재연결 때 빠진 연산을 받는다.
- 접속자와 셀 선택은 저장하지 않고 방 안에서만 전파한다.
- 권한 변경, 링크 재발급, 비공개 전환, 계정 비활성화가 일어나면 해당 연결을 바로 끊는다.

## AI 생성

자세한 설계는 [AI 생성 설계](https://claude.ai/artifact/TsZSVkvJA3KYV3AMGm7KNa)에 있다.

- LangGraph를 쓰지 않고 직접 만든 단계 실행기를 쓴다. 단계 정의는 키, 화면 단계, 입력과 출력 스키마, 실행 함수, 재시도 횟수, 시간 제한이며, 단계 하나는 파일 하나에 프롬프트와 함께 둔다.
- 단계마다 pg-boss 작업으로 실행하고 결과를 `generation_steps`에 저장한다. 재시작하면 끝나지 않은 단계부터 다시 실행한다. 보드별, 기능 그룹별 병렬 실행에는 동시 실행 상한을 둔다.
- 단계: 화면 살펴보기(보드별 화면 카드) → 사용 흐름 이해하기(기능 지도) → 테스트 케이스 작성하기(기능 그룹별) → 마무리하기(필수 케이스 대조, 중복 합치기, 스키마 검증과 1회 수정).
- 진행은 화면 단계 키만 SSE로 보낸다. 내부 단계와 화면 단계의 대응은 generation 모듈 한 곳에 둔다.
- 출력 스키마는 테스트 세트 양식에서 만들고, 선택과 태그는 허용 값만 받는다.
- 단계별 모델, 토큰, 시간, 비용, 필수 케이스 충족률, 확인 필요 비율을 기록한다. 프롬프트에는 버전을 붙인다.
- 끝나면 프레임, 화면 문서, 단계 결과를 지우고 확인 필요 항목의 화면 설명 글만 남긴다.
- Figma 글자는 지시가 아니라 자료로 감싸서 보낸다.
- AI 제공자는 OpenAI와 Anthropic 두 곳을 쓴다. 키는 서버 환경변수(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)로만 받고 값은 운영자가 넣는다. 단계별로 어느 제공자와 모델을 쓸지는 서버 설정으로 정하며 사용자는 고르지 않는다.
- 작업 큐는 pg-boss를 의존성으로 추가해 쓴다(2026-10-19 사용자 승인).

## AI 사용량, 비용과 동시 생성 한도

- `AiUsageService`는 단계 실행기의 모든 제공자 호출 전후에 `ai_call_usage`를 한 행씩 기록한다. 단계 시도, 재시도, 검증 오류 후 1회 수정 요청과 확인 필요 다시 작성을 포함하며 `job_id`와 `step_id`로 새 작업과 단계를 가리킨다. 호출 전에는 `running`, 응답을 관찰하면 `completed` 또는 `failed`로 저장한다. JSON 검증 실패는 이미 받은 응답의 사용량을 지우지 않는다.
- 공급자가 응답한 실제 토큰과 호출 시간을 기록하고 usage는 허용된 숫자 필드만 저장한다. 입력, 이미지, 출력 본문, 키는 계측에 넣지 않는다. 호출의 입력 토큰 합계는 캐시 읽기와 쓰기를 포함한다. 단계의 `input_tokens`는 캐시를 뺀 입력이며 캐시 열은 별도로 더한다. 추론 토큰은 출력에 포함되어 추가 과금 계산에 더하지 않는다.
- 호출 기록과 단계 합계는 생성 결과 저장과 분리한다. 잘림과 거절, 통신 오류도 관찰한 사용량을 보존하고 응답이 없으면 토큰과 비용은 미확인이다. 계측 저장 실패는 작업, 단계와 호출 식별자만 로그로 남기며 생성 성공과 원래 오류를 바꾸지 않는다. 일부 호출의 비용이 미확인이면 단계 비용도 미확인으로 유지한다.
- Anthropic 스트림의 최종 `message_delta` 사용량을 받기 전 관찰값은 보존하되 `usage_known=false`와 비용 미확인으로 기록한다. 단계 합계는 단계 행을 잠근 뒤 호출 기록에서 다시 계산하며, 합계 저장 실패 시 미확인으로 바꾸고 다음 호출에서 누락분까지 복구한다.
- 호출별 계산 비용은 `numeric(24,12)` USD이며 `generation/pricing.ts`의 호출 당시 단가, 버전과 조건을 함께 저장한다. 이 브랜치의 모델별 표준 단가와 긴 문맥 요금을 사용하고 알 수 없는 응답 모델과 비표준 tier는 미확인으로 둔다. fake는 외부 호출 없이 합성 사용량과 비용 0을 기록한다. 단계 합계는 기존 형식을 유지한다.
- `generation_jobs`는 종료 관찰 시각과 생성 요청 등록부터 종료까지의 전체 실행 시간을 저장한다. 작업은 등록 시와 단계 전환 시 10분의 복구 유효기간을 갖는다. 서버 시작 시와 매분 복구 스캔, 새 생성 요청에서 만료 작업의 실행 잠금을 얻을 수 있을 때만 실패 처리하므로 현재 실행 중인 단계는 만료시키지 않는다. 만료와 재개에서 남은 `running` 호출은 `unknown`으로 바꾸고 확인되지 않은 토큰과 실행 시간은 만들지 않는다. 유효기간 안의 작업은 기존 단계 결과를 재사용해 재개한다.
- 공급자 관리자 키와 해당 프로젝트 또는 워크스페이스 ID를 함께 설정하면 시작 시와 기본 1시간 간격으로 오늘을 포함한 최근 7 UTC 일의 비용 집계를 `ai_provider_costs`에 동기화한다. 테스트와 `AI_PROVIDER=fake`에서는 자동 동기화하지 않으며 fake 설정은 명시 동기화도 외부 호출 없이 끝낸다. 호출별 계산 비용과 공급자 집계는 별개이고 오늘 집계는 잠정 값이다.
- 모든 페이지를 검증한 후 해당 공급자, scope와 기간만 advisory 트랜잭션 잠금 안에서 교체한다. 수정과 삭제된 집계를 반영하고 중복 집계를 피하며, 실패한 공급자는 기존 값을 보존한다. `pnpm --filter @cheddar/api ai:costs:sync [UTC_FROM_DATE UTC_UNTIL_DATE_EXCLUSIVE]`로 최근 7일 또는 지정한 1~31일을 동기화한다. 키와 scope의 짝, scope 형식과 주기 60~86400초를 시작 시 검증한다.
- `ai_provider_cost_syncs`는 공급자, scope와 UTC 일별 동기화 워터마크를 비용 행과 같은 트랜잭션에 저장한다. 빈 보고서에도 워터마크를 남겨 다른 API 프로세스에서 먼저 시작한 동기화가 최신 빈 결과를 덮어쓰지 못하게 한다. 기간이 겹치면 최신 워터마크가 있는 오래된 요청 전체를 건너뛴다.
- 최초 생성, 추가 생성과 다시 작성은 PostgreSQL advisory 트랜잭션 잠금 안에서 `pending`과 `running` 작업 수를 세고 등록한다. `AI_GENERATION_CONCURRENCY`는 기본 2, 범위 1~8이다. 여러 API 프로세스가 같은 DB의 한도를 공유하며, 한도가 차면 업로드와 양식, 케이스 입력을 읽기 전에 429 `GENERATION_CAPACITY`와 원본 한국어 메시지를 반환한다. 같은 세트의 진행 중 작업은 기존 409 `GENERATION_RUNNING`을 우선한다.
- 생성과 다시 작성 DTO의 선택형 `clientRequestId`는 요청 계정별로 유일하다. 같은 ID와 요청 내용이면 한도 검사 전에 기존 작업을 반환하고, 대상 세트나 내용이 다르면 409 `REQUEST_REUSED`로 거절한다. ID를 생략한 기존 요청은 그대로 지원한다. 사용량의 화면과 외부 조회 API는 추가하지 않으며 웹과 플러그인 SDK도 생성하지 않는다.
- 마이그레이션 `0006_ai_usage_accounting`은 호출 기록과 공급자 비용 집계, 작업 종료와 복구 유효기간, 요청 재사용 식별자를 추가한다. 기존 데이터와 마이그레이션은 유지한다. 계측의 수명은 소유 작업과 단계에 종속되며 소유 작업을 삭제하면 함께 삭제된다.

## Figma 플러그인

- 직접 선택한 Frame과 선택한 Section 안의 최상위 Frame을 모은다. 중복은 한 번만 포함한다.
- 원본 JSON 대신 보드별 화면 문서를 만든다. 남기는 것: 글자(읽는 순서), 프레임과 인스턴스 이름, 컴포넌트 속성 값, 연결선, Dev Mode 주석. 버리는 것: 숨김 노드, 벡터와 아이콘과 장식, 스타일, 절대 좌표. 같은 컴포넌트가 반복되는 목록과 표 행은 처음 두 개와 개수로 접는다.
- 이미지는 보드 단위로 렌더하고, 큰 보드는 겹치게 타일로 자른다. 높이 2000px까지는 한 장, 넘으면 1600px 타일을 200px씩 겹친다(플러그인 UI의 canvas에서 자른다).
- 화면 문서 형식은 `schemaVersion: 2`의 `{ board, texts, tree, links, notes }`다. 보드 밖으로 가는 연결 대상 이름은 main이 노드를 찾아 채우고, 찾지 못한 연결은 버린다.
- 플러그인 계정 토큰과 지난번 고른 프로젝트 ID는 iframe이 저장소를 쓸 수 없어 main의 `figma.clientStorage`에 둔다.
- 고른 프로젝트는 임시 업로드에 저장하지 않고 웹 주소(`/test-sets/new?upload=<id>&project=<id>`)로 넘긴다. 고를 수 있는 프로젝트는 `/auth/me` 권한의 `test_set.create`로 웹과 같은 규칙으로 거른다.
- main은 IIFE JavaScript, UI는 단일 HTML로 따로 빌드한다. `VITE_PLUGIN_UI_URL`을 주면 UI는 `dist/ui/`에 호스팅용 파일로 만들고, manifest의 ui 파일은 그 주소로 이동하는 짧은 문서가 된다. main과 manifest를 바꾸지 않는 UI 변경은 Figma에 다시 배포하지 않고 호스팅만 갱신하면 반영된다.
- main의 메시지는 Figma 편집기 창이 Origin `https://www.figma.com`과 manifest pluginId를 붙여 전달한다. 번들 UI는 부모 iframe이 보낸 메시지도 받지만, 원격 UI는 어느 사이트든 iframe으로 띄울 수 있으므로 이 relay만 믿는다. 원격 UI는 보낼 때도 `https://www.figma.com`과 pluginId를 지정하고, main은 원격 UI Origin으로만 보낸다. Figma 데스크톱은 `frame-ancestors`를 적용하지 않아 이 헤더로는 막을 수 없다(2026-10-20 확인).
- main은 `ui-ready`를 받으면 `main-ready`로 `PROTOCOL_VERSION`을 알린다. 원격 UI는 main보다 먼저 바뀔 수 있으므로, UI가 main의 새 기능을 쓰기 시작할 때 버전을 올리고 main을 먼저 배포한다. main은 이전 UI의 메시지를 계속 받는다. UI는 main 버전이 낮으면 업로드 대신 플러그인 업데이트 안내를 보인다.
- 플러그인 ID `1692417282897261384`. 웹 주소는 main 빌드 시 `VITE_WEB_BASE_URL`, API 주소는 `VITE_API_BASE_URL`에서 읽는다. 배포용 네트워크 허용은 `none`이며 배포 전 UI와 API 주소로 바꾼다. 원격 UI 빌드는 manifest가 UI Origin을 허용하지 않으면 멈춘다.

## 시트 개선안 (2026-10-21 확정·구현)

제품 계약은 [제품 정의](product.md)의 프로젝트, 테스트 세트, AI 생성 절이다. 시안은 [Cheddar 화면 시안](https://claude.ai/artifact/LBfqbThAA8AGkkAYd8BNdA)의 테스트 세트·프로젝트 설정 페이지에 있다. 아래는 그 계약을 구현한 구조다.

### 데이터 모델

- `project_templates`의 열 정의에 `presetKey`(사전 정의 열의 고정 키, 사용자 열은 null)와 `enabled`를 더한다. 사전 정의 열의 이름, 형식, 선택 값, 작성 기준은 코드 상수(`projects/template.ts`)가 기준이며 DB에는 켜짐 여부와 순서만 의미가 있다. 사용자 열은 지금처럼 전체를 JSONB에 둔다.
- `required_cases` 테이블과 API를 없앤다. 점검 관점은 `generation/steps` 안의 코드 상수이며 프로젝트별 상태가 없다. 마이그레이션은 테이블을 지우고 기존 행을 보존하지 않는다(운영 데이터 없음).
- `screen_structure_items`에 `type`(page, popup, bottom_sheet, tab)을 더한다.
- `screen_id_rules`를 새로 둔다: 프로젝트, 이름, 구분 기호, 부분 배열 JSONB(이름, 종류 `list`·`fixed`·`number`, 코드 목록은 코드와 뜻의 쌍, 번호는 자릿수), 순서. 화면 ID 검증과 다음 번호 계산은 서버가 한다. 규칙 삭제는 화면 ID를 바꾸지 않는다.
- `test_set_columns`는 세트 전체의 열 순서를 저장한다. 열 너비와 행 높이만 사람별 `view_preferences`에 남는다.
- 병합 표시는 저장 모델에 없다. 모든 행에 값을 저장하고 표가 연속한 같은 값을 병합으로 그린다.

### API

- `projects` 모듈: 양식 PUT은 사전 정의 열의 켜짐·순서와 사용자 열 목록만 받고, 사전 정의 열의 이름·형식·작성 기준 변경은 `400`으로 거절한다. 필수 케이스 엔드포인트를 제거한다. 화면 구조에 유형과 IA 가져오기(XLSX 업로드, module·Depth·Type·Screen ID 열 해석, ID 없는 행 건너뛰기, 같은 ID는 첫 행만)를 더한다. 화면 ID 규칙 CRUD와 "다음 ID" 계산, 규칙 불일치 판정을 더한다.
- `test-sets` 모듈: 만들기가 양식 선택(프로젝트 기본, 최근 세트 복사, 직접 고른 열 목록)을 받는다. 양식 전체 교체 대신 열 추가(사전 정의 열 되돌리기 또는 사용자 열 정의), 열 삭제(값 함께 삭제), 열 순서 변경 연산을 둔다. 열 연산은 세트 version을 올리고 공동 편집으로 전파한다. `POST /test-sets`는 선택적인 `template`(`project`·`recent`·`custom`)을 받으며 생략 시 `project`다. `recent`는 같은 프로젝트의 열람 가능한 세트 중 최근 수정순(동률은 ID순)으로 열 사본을 만들고 없으면 프로젝트 양식을 쓴다. 사본의 열 UUID는 새로 만들며 `presetKey`는 보존한다. `POST /test-sets/:id/ops`의 `add_column`·`remove_column`·`reorder_columns`는 기존 케이스 연산과 같은 잠금·권한·트랜잭션을 쓰며 요청당 version을 한 번 올린다. 삭제는 값, 모든 상태의 확인 필요 초안 키, 개인 보기 참조도 정리한다. `PUT /test-sets/:id/columns`는 없다. `update_column`은 사용자 열의 이름·작성 기준과 선택적인 `options`(선택·태그 항목, 양식과 같은 검사)를 바꾸며 사전 정의 열은 400이다. 항목을 바꿔도 셀 값은 손대지 않는다. 링크 방문자의 열 연산(`add_column`·`remove_column`·`reorder_columns`·`update_column`)은 편집 링크여도 403이다. `set_cell` 등 사람이 넣는 선택·태그 값은 Excel 목록처럼 목록 밖 글자도 받고(형식과 태그 중복만 검사), AI 결과는 출력 스키마의 enum으로 목록 안에 묶는다. XLSX는 선택 열에 숨긴 `목록` 시트를 참조하는 데이터 유효성을 붙인다. 공유 계약은 `packages/contracts`에 있다.
- `generation` 모듈: 열 하나만 채우는 작업 `fill_column`(`POST /test-sets/:id/test-set-columns/:columnId/fill`, 열 추가 시 "기존 케이스 AI로 채우기")은 `rewrite`와 같은 단계 실행기를 쓰고 외부 `stage`는 null이다. 세트당 하나의 작업 제한과 서버 동시 한도를 공유하며, 값이 있는 셀은 덮지 않고 확인 필요 항목을 만들지 않는다. `POST /generations`의 `frameIds`로 올린 프레임 중 일부만 입력에 넣는다(비우면 전부).
- `exports`: QA 결과·담당자 또는 개발 진행 상태·담당자가 이웃하면 2단 머리글의 해당 묶음을 병합한다(순서가 뒤집혀도 이웃하면 묶음). 어느 묶음도 성립하지 않으면 1단이다. `test_env`·`test_case`·`title`·`screen_id`·`steps`는 현재 열 순서에 따라 공백 제거 후 같은 연속 값을 세로 병합하며 앞선 대상 열의 경계를 넘지 않는다. 빈 값, 테스트 ID와 예상 결과는 병합하지 않는다.

### AI 생성

- 출력 스키마는 세트의 열로 만들되 QA 기록 열(QA 결과·담당자, 결과 코멘트, 개발 진행 상태·담당자)은 빼고 빈 값으로 저장한다. 사전 정의 열은 `generation/steps/column-rules.ts`의 작성 규칙과 예시를 프롬프트에 넣고, 사용자 열은 이름·형식·작성 기준을 넣는다. 사용자 열은 자료에 근거가 없으면 비우게 지시한다.
- `cases` 프롬프트에 행 나누기 기준(행동·입력값·조건이 다르면 새 행, 같은 행동 뒤 여러 확인은 한 셀에 불릿, 같은 절차에서 결과만 갈리면 절차 셀을 같은 값으로)과 테스트 환경별 반복 규칙(환경에 따라 동작이 다른 케이스만 환경별 행, 나머지는 "공통")을 넣는다.
- 점검 관점은 `generation/steps/viewpoints.ts`의 코드 상수다. `coverage` 검증은 관점 ID 기준이고, 관리자 관점은 관리자 화면이 있을 때만 대상이다.
- 화면 ID는 화면 구조의 ID만 쓰고 없으면 "추후 채번"이다. 규칙으로 ID를 생성하지 않는다.

### 웹

- pages: `test-set-new`가 양식 선택(프로젝트 양식, 최근 테스트 세트와 같게, 직접 고르기)과 프레임 토글을 가진다. `project-settings` 탭은 양식, 기능 그룹, 화면 구조(규칙 목록 + 화면 목록), 메모다. 브레드크럼은 없고 저장 상태는 오른쪽이다.
- entities: `project`에 `presetKey`·`enabled`·화면 유형·규칙 타입과 `ColumnForm`(열 이름·형식·작성 기준 폼, 양식 탭과 열 추가가 함께 씀). `test-set`의 `CaseOp`는 `@cheddar/contracts`를 그대로 쓰고 `applyOps`가 열 연산을 낙관 반영한다. `mergeable`이 병합 표시 대상 열을 정한다.
- features: `manage-template-columns`(`edit-template` 대체), `manage-screen-id-rules`(목록 + `rule-dialog.tsx`), `manage-screens`(유형, 규칙 불일치, 다음 ID 채운 추가, IA 가져오기), `create-test-set`(양식 3택 + `column-modal.tsx`). `manage-required-cases`, `edit-test-set-columns`는 없다.
- widgets: `column-picker`(프로젝트 양식 탭의 열 목록), `case-table`(병합 표시와 셀 나누기, 머리글 끌기와 되돌리기 토스트, 머리글 ⋯ 메뉴, 머리글 `+`, 셀 우클릭 메뉴, `column-dialogs.tsx`의 열 추가·이름 변경, `options-panel.tsx`의 선택 항목 편집. 고르기는 `Menu.Popup`의 `footer`에 연필을 두고, 편집은 같은 셀이나 머리글에 붙는 `Popover`로 연다). `columns-editor`는 없다. 열 연산은 모두 `onOps`로 보내며 별도 feature를 두지 않는다.
- `packages/ui`: `Tabs`의 미끄러지는 선택 표시줄, `ContextMenu`, `DataGrid`의 `mergeKey`·`fixed`·`headerAction`·`onColumnReorder`·`headerEnd`·`cellMenu`, 토스트 `action`.
- 공통 조작 규칙: 목록 추가는 머리글 오른쪽 버튼이 기본이고 목록 끝 `+` 행은 보조다. 행 편집·삭제는 행 메뉴, 셀 단위 삭제는 호버 ×, 이름 변경은 두 번 클릭 제자리 편집, 순서는 끌기와 `Alt+방향키`다. 설정 탭은 선택 표시줄이 미끄러지는 탭(`packages/ui`의 Tabs)을 쓴다. 설명 문장과 help 텍스트는 두지 않는다.

## 미정

| 항목 | 상태 |
| --- | --- |
| CI | 미구성. 도입 방식은 미정 |
| 사내 배포, 릴리스, 관측 방식 | 추후 결정 |
| 플러그인 UI 원격 호스팅 | 빌드와 API는 지원한다. 운영 적용 여부, 도메인, Vercel 프로젝트 구성은 배포 때 정함 |
| 파일 저장소 | 로컬 디스크. 배포 환경에서 다시 정함 |

## 갱신 기준

구조가 결정되면 이 문서에 현재 상태를 반영한다. 선택 이유가 이후 판단에 필요하면 해당 절에 한두 문장으로 남긴다.

## 로컬 시연 실행

루트 `compose.yaml`과 `demo/Dockerfile`은 로컬 시연 전용 구성이다. DB 준비 후 API가 마이그레이션과 최초 시연 계정 생성을 수행하고, 준비 상태 확인 후 웹을 제공한다. 플러그인 빌드 파일은 `demo/figma-plugin/`에 생성한다. 일반 개발 서버와 UI 코드는 변경하지 않는다.

`start-demo.ts`는 전달받은 API 설정 파일에서 AI 키와 모델 설정만 읽는다. 실행 DB와 저장 경로는 전용 컨테이너 값으로 지정하고 실제 AI를 사용한다. 원본 설정 파일은 읽기 전용 마운트이며 이미지에 포함하지 않는다. 시연 계정은 빈 DB에서만 생성하고 재실행 시 기존 계정과 데이터를 보존한다. API와 웹은 호스트 loopback에만 공개하며 DB와 업로드는 Docker 볼륨에 보관한다. 운영 배포 방식은 여전히 미정이다.
