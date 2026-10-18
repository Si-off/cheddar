# 프로젝트 구조

이 문서는 합의된 시스템 구조, 기술 선택, 코드 규칙, 운영 제약을 설명한다. 구현 진행과 검증 이력은 커밋과 PR에 남긴다.

2026-10-18 전면 개편으로 이 문서는 **목표 구조**를 설명한다. 코드는 단계적으로 옮기는 중이며, 아직 옮기지 않은 영역은 이전 구조로 남아 있다. 단계와 현재 상태는 [개편 기록](changes/2026-10-18-redesign.md)에 있다.

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

아래 레이어는 위 레이어를 가져오지 않는다. 같은 레이어의 슬라이스끼리도 가져오지 않는다. 슬라이스 밖에는 `index.ts`로 공개한 것만 보이며, 이 경계는 Biome `noRestrictedImports`로 강제한다.

| 레이어 | 슬라이스 | 하는 일 |
| --- | --- | --- |
| app | router, providers, `global.css` | 라우트 트리, 로그인과 권한 경계, Query와 motion 설정 |
| pages | test-sets, test-set-new, test-set-generating, test-set, shared-test-set, projects, project-new, project-settings, login, invite, no-access, plugin-connect, admin-accounts, admin-account, admin-roles, admin-role, admin-affiliations | 화면 조립. 데이터 가져오기와 레이아웃만 |
| widgets | app-header, case-grid, case-board, view-switcher, review-panel, generation-progress, share-dialog, role-assignments | 여러 기능이 모인 화면 덩어리 |
| features | auth, collaborate-test-set, generate-cases, rewrite-review-item, export-xlsx, share-test-set, invite-account, transfer-ownership, edit-template, edit-feature-groups, edit-required-cases, edit-screen-structure | 사용자 행동 하나와 그 상태 |
| entities | test-set, case, review-item, project, account, role, affiliation, permission | 도메인 타입, 생성 API 타입을 도메인 타입으로 바꾸는 변환, Query 키와 조회 훅 |
| shared | api(생성 코드), lib, config | 도메인을 모르는 도구 |

- 플러그인 UI(`apps/figma-plugin/src/ui/`)는 app, pages, shared 레이어만 쓴다. `main/`(Figma 문서 접근)과 `protocol/`(main과 UI 사이 메시지 계약)은 FSD 밖에 둔다.
- 권한은 `entities/permission`의 `can(permission, projectId)` 하나로 묻는다. 화면은 역할 이름을 모르고 권한 키만 안다.
- 라우트는 코드로 정의하고, 페이지 진입 전에 로그인과 권한을 확인한다.

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
| projects, templates, feature-groups, required-cases, screen-structure | 프로젝트 설정 |
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
| 생성 | generation_jobs, generation_steps, review_items |
| 임시 자료 | temp_uploads, temp_frames(파일은 만료 삭제) |
| 연결 | visitor_sessions, plugin_connections |

- 필수 시스템 항목은 테스트 ID와 제목이다. 사용자 항목은 UUID, 이름, 형식, 선택 항목, 항목 설명을 가진다. 값은 항목 UUID로 연결하므로 이름과 순서를 바꿔도 값이 유지된다.
- 케이스와 프레임, 요구사항, 화면 구조의 연결은 저장하지 않는다.

## 공동 편집

- 서버가 기준인 셀 단위 연산을 WebSocket으로 주고받는다. 연산: 셀 값 설정, 행 추가, 행 삭제, 행 이동, 열 변경. 같은 셀은 나중에 온 값이 이긴다.
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

## Figma 플러그인

- 직접 선택한 Frame과 선택한 Section 안의 최상위 Frame을 모은다. 중복은 한 번만 포함한다.
- 원본 JSON 대신 보드별 화면 문서를 만든다. 남기는 것: 글자(읽는 순서), 프레임과 인스턴스 이름, 컴포넌트 속성 값, 연결선, Dev Mode 주석. 버리는 것: 숨김 노드, 벡터와 아이콘과 장식, 스타일, 절대 좌표. 같은 컴포넌트가 반복되는 목록과 표 행은 처음 두 개와 개수로 접는다.
- 이미지는 보드 단위로 렌더하고, 큰 보드는 겹치게 타일로 자른다.
- main은 IIFE JavaScript, UI는 단일 HTML로 따로 빌드한다. 실제 Figma iframe relay는 Figma Origin과 manifest pluginId를 검사한다.
- 플러그인 ID `1692417282897261384`. 웹 주소는 main 빌드 시 `VITE_WEB_BASE_URL`, API 주소는 `VITE_API_BASE_URL`에서 읽는다. 배포용 네트워크 허용은 `none`이며 배포 전 다시 정한다.

## 미정

| 항목 | 상태 |
| --- | --- |
| CI | 미구성. 도입 방식은 미정 |
| 사내 배포, 릴리스, 관측 방식 | 추후 결정 |
| 파일 저장소 | 로컬 디스크. 배포 환경에서 다시 정함 |

## 갱신 기준

구조가 결정되면 이 문서에 현재 상태를 반영한다. 선택 이유가 이후 판단에 필요하면 해당 절에 한두 문장으로 남긴다.
