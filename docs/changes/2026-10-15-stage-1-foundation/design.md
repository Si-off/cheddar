# 1단계 설계안 — 기반·공통 계약

상태: 2026-10-15 사용자 승인. 사용자가 “설계안 승인합니다. 이대로 1단계 백엔드 개발을 진행해주세요”라고 지시했다. 아래 설계의 제안 표현은 검토 당시 문맥을 보존한 것이며, 1단계 범위·경로·환경·브랜치 절차는 승인되었다. 후속 단계 착수와 LangGraph 상세 결정은 제외한다. 디자인 시안 이미지는 구현에 참고하지 않는다. 실제 구현·검증 결과는 change.md에 기록한다.

## 1. 이번에 만들 결과

웹·플러그인이 같은 프로젝트와 파일을 다루고, 후속 단계가 같은 데이터·API 규칙을 사용할 수 있는 서버 기반을 만든다.

| 구분 | 1단계 결과 | 후속 단계 |
| --- | --- | --- |
| 서버 | NestJS 서버, 설정 검증, DB 연결, 상태 확인 | 업무별 API 추가 |
| 프로젝트 | 생성·목록·조회·이름/설명 수정 | IA·기본 양식 관리 화면 |
| 파일 | 프로젝트별 단일 파일 등록·메타데이터 조회·다운로드 | 프레임 묶음, IA 분석, 플로우 입력 연결 |
| 데이터 계약 | 프로젝트·파일의 실제 스키마, 시트·IA·프레임 계약 DTO와 유효/무효 예시 | 후속 업무 테이블·마이그레이션과 처리 구현 |
| API | 실제 제공하는 경로만 OpenAPI에 등록, 두 앱 SDK 생성·타입 검사 | 업무 경로를 계약에 따라 추가 |
| 검증 | DB 영속성·수정 충돌·파일 실패·명세와 응답의 일치 | 실제 Figma·표·AI·XLSX 통합 검증 |

공유·로그인·배포는 이번 범위에 넣지 않는다. 20프레임·500케이스는 후속 규모 검증 기준이며 업로드 개수 제한이나 AI 생성 목표가 아니다.

## 2. 확정 요구와 문서 차이

인계 `4799dcb`에 기록된 아래 합의는 설계의 입력으로 사용한다. 현재 제품·구조 문서의 미정 항목은 승인 후 이 합의와 새 결정을 구분해 갱신한다.

| 항목 | 인계에서 확정된 내용 | 현재 문서와 차이 |
| --- | --- | --- |
| 실행 기술 | NestJS·Drizzle·PostgreSQL, TanStack Table, React Flow | 백엔드·표 도구 등이 미정으로 남음 |
| 프로젝트 | 프로젝트별 기본 양식·IA, 새 시트로 양식 복사 | 프로젝트·복사 규칙 미기재 |
| 편집 | 생성 전 편집, 텍스트 사용자 열, 자동 저장·실패 시 입력 보존 | 필드·저장·열 유형이 미정 |
| 업로드 | 선택 프레임의 데이터·이미지를 묶음으로 보관, 덮어쓰기·버전 관리 제외 | 업무 업로드 계약 미정 |
| AI | 실행별 제공자 선택, 새 시트/교체, 후보 분리, 대상 시트 잠금 | 입력·실패 동작 대부분 미정 |
| 플로우 | 시트별 의미 모델과 배치 상태 분리, 플로우 없이 통합 생성 가능 | 제품 문서 미기재 |
| 출력 | 전체 시트의 케이스만 현재 열 이름·순서로 XLSX 출력 | 내보내기 상세 미정 |
| 초기 범위 | 로그인 없는 로컬 환경, 공유 링크는 후속 | 공유 요구는 있으나 초기 단계 경계 미기재 |

LangGraph 사용은 확정되어 있다. 구체적인 AI 실행 설계는 3B 단계에서 사용자 검토를 거친다.

## 3. 구성요소와 타입의 경계

| 구성요소 | 소유하는 책임 | 의존 방식 |
| --- | --- | --- |
| 웹 | 편집 화면·미저장 입력·저장 대기열·선택/검색 상태 | 생성 SDK로 HTTP 요청 |
| 플러그인 main | Figma 문서 접근·프레임 추출 | 기존 protocol로 UI에 데이터 전달 |
| 플러그인 UI | 프로젝트 선택·업로드 요청·진행 상태 | 생성 SDK로 HTTP 요청 |
| API controller | 입력 검증·HTTP 상태·응답 DTO | service 호출 |
| API service | 프로젝트 소속 검사·수정 충돌·업무 트랜잭션 | repository와 파일 저장 인터페이스 호출 |
| repository | Drizzle 조회·제약·영속 상태 | PostgreSQL |
| 파일 저장 adapter | 저장 키에 따른 바이트 저장·읽기·실패 정리 | 환경변수의 저장 루트 |

DB 레코드 타입, 외부 API DTO, 웹의 표 모델은 별개다. Drizzle 타입을 클라이언트로 보내거나 TanStack Table/React Flow 객체를 DB에 그대로 저장하지 않는다. 공통 타입 패키지는 새로 만들지 않고 기존 OpenAPI 생성 경로를 사용한다.

TanStack Query는 서버 응답·조회 갱신을, Zustand 또는 화면 내부 상태는 미저장 초안·선택·검색·편집 중 상태를 담당한다. 서버 응답이 갱신돼도 미저장 입력을 덮어쓰지 않는다. 세부 UI 구현은 2단계에서 한다.

API 앱은 NestJS의 Express adapter, Drizzle의 `node-postgres` 연결을 사용한다. 빌드는 TypeScript compiler로 하고 API 전용 설정에서 decorator metadata를 켠다. 웹의 Bundler 설정을 그대로 상속하지 않고 Node 실행용 설정을 별도로 둔다. 모듈 형식은 API 패키지의 CommonJS로 제안하며 기존 웹·플러그인의 ESM 설정은 유지한다. 정확한 의존성 버전은 구현 착수 시 Node 24.22.0·TypeScript 5.9.3과 호환되는 조합을 확인해 고정한다.

## 4. 데이터 모델

### 공통 규칙

- 내부 식별자는 UUID, 시각은 DB의 `timestamptz`와 API의 UTC ISO 8601 문자열을 사용한다. 초기 규모에서는 확장 없이 생성 가능한 UUID v4를 제안한다.
- 업무 식별자인 화면 ID·케이스 번호·Figma node ID를 내부 PK로 쓰지 않는다.
- 수정 가능한 자원에는 정수 `revision`을 둔다. 클라이언트의 기대 버전과 일치할 때만 저장하고 1 증가시킨다.
- 프로젝트가 다른 파일·프레임·IA·시트를 연결할 수 없다. API 검증에 더해 자식의 `project_id`와 부모 `(project_id, id)`를 묶는 복합 FK로 가능한 관계를 강제한다.
- 프로젝트별 조회와 FK 접근에 필요한 인덱스를 둔다. 초기에는 범용 JSON 검색 인덱스나 전문 검색을 추가하지 않는다.
- 프로젝트·파일 삭제 API와 자동 보관 만료는 1단계에서 제공하지 않는다. 후속 삭제 정책 승인 없이 연쇄 삭제하지 않는다.

### 1단계에서 실제 생성할 테이블

| 테이블 | 주요 필드 | 제약·조회 |
| --- | --- | --- |
| `projects` | `id`, `name`, `description`, `revision`, `created_at`, `updated_at` | 이름 trim 후 1~100자, 설명 0~2,000자. 같은 이름 허용. `(created_at, id)` 목록 인덱스 |
| `files` | `id`, `project_id`, `storage_key`, `original_name`, `media_type`, `byte_size`, `sha256`, `status`, `created_at` | 프로젝트 FK, `(project_id, id)` unique, 저장 키 unique, 크기 양수, `pending/ready/failed`, `(project_id, created_at, id)` 인덱스 |

파일은 성공 후 내용이 바뀌지 않는 자원이다. 수신 전 pending 행의 검증된 MIME·크기·해시는 null을 허용하되, ready 행에는 필수이며 양의 크기를 갖도록 DB check 제약을 둔다. 파일 행의 상태 전이는 서버 내부에서만 수행하며 클라이언트가 임의로 `ready`로 바꾸지 못한다. 파일의 절대 경로·DB 접속 정보는 응답에 넣지 않는다.

### 후속 단계의 모델과 참조 관계

아래는 연결 규칙을 검토하기 위한 모델이다. 1단계에서 모든 테이블·업무 기능을 미리 만들지 않는다. 2A·2B·2C의 핵심 DTO는 1단계 계약으로 작성·검증하고, 3A·3B의 세부 DTO와 저장 필드는 해당 단계에서 확정한다.

| 모델 | 소유·주요 내용 | 연결 규칙 |
| --- | --- | --- |
| IA 항목 | 프로젝트, 내부 UUID, `screenId`, 이름, 설명, 선택적 상위 항목, 순서 | 화면 ID는 프로젝트 안에서 unique. trim 후 대소문자를 구분. 상위 항목은 같은 프로젝트이며 순환 금지 |
| 기본 시트 양식 | 프로젝트당 하나, 열 정의, 기본 표시 설정, revision | 새 시트 생성 시 복사. 기존 시트는 원본 양식 변경을 따라가지 않음 |
| 업로드 묶음 | 프로젝트, 제목, 생성 시각, 순서 있는 프레임 목록 | 완료된 묶음은 불변. 새 업로드는 새 묶음이며 교체하지 않음 |
| 프레임 | 묶음, Figma file key/node ID, 이름, 크기, 이미지 파일 ID·데이터 파일 ID | Figma 식별자는 출처. 각 파일은 같은 프로젝트의 ready 파일 |
| 시트 | 프로젝트, 이름, unit/integration 구분, 선택적 원본 묶음, 내용 revision | 한 묶음에서 여러 시트 생성 가능. 프로젝트 내 빈 시트도 허용하는 안 |
| 시트 열 | 시트, 안정적인 열 UUID, system/custom, 시스템 필드 키 또는 text 유형, 표시 이름 | 값은 표시 이름·열 위치가 아닌 안정적인 키로 연결 |
| 케이스 | 시트, UUID, 표시용 케이스 번호, 순서, 시스템 값, 사용자 정의 값 | 사용자 정의 값은 `columnId → string`. 기본 수행 단계·기대 결과는 각각 긴 문자열로 제안 |
| 케이스 연결 | 케이스와 프레임 목록·IA 항목 목록 | 두 목록은 독립. 불확실한 화면 연결은 빈 목록으로 허용 |
| 시트 표시 설정 | 시트, 열 순서·너비, 별도 revision | 표 라이브러리 상태를 저장하지 않음. 선택 셀·검색어·스크롤 위치는 로컬 상태 |
| 후보 | 생성 작업·시트, 케이스와 같은 내용, 이유, 검토 상태, 추가된 케이스 ID | 검토 대기/추가됨/제외됨. 후보 추가는 케이스 작성과 상태 변경을 한 트랜잭션으로 처리 |
| 플로우 의미 모델 | 시트, 안정적인 노드/엣지 ID, 노드 종류·설명·IA 연결, 엣지 방향·조건 | 시트당 하나를 제안. 그래프 구조와 프로젝트 소속 검증 |
| 플로우 표시 설정 | 시트, 노드 위치·viewport, 별도 revision | AI 입력에서 제외. React Flow 내부 객체와 분리 |
| AI 작업 | 프로젝트·대상 시트·제공자·생성 방식·관찰 가능한 진행 상태 | 대상 시트 잠금과 성공 시 원자적 교체를 보장해야 함. 내부 그래프·재시도·복구·큐 선택은 유보 |

프로젝트 이름 중복, 화면 ID의 대소문자 구분, 빈 시트, 긴 문자열 형식 등은 이번 제안이다. 후속 UI가 이 선택을 바꾸려면 계약 영향도 함께 검토한다.

### 열·케이스와 편집 규칙 제안

- 시스템 필드는 `caseCode`, `title`, `preconditions`, `steps`, `expectedResult`, `priority`, `relatedFrames`, `screens`다. 내부 UUID는 사용자 편집 대상에서 제외한다.
- 시스템 열은 이름·순서·너비를 변경할 수 있고, 사용자 정의 열은 추가·수정·삭제할 수 있다. 시스템 열 삭제는 초기 제외를 제안한다.
- 우선순위는 `high/medium/low`와 미지정(null). 빈 케이스를 저장할 수 있도록 제목·본문은 빈 문자열을 허용한다. AI 결과 품질 검증과 사람의 초안 저장 검증을 구분한다.
- 시트 내 `caseCode`는 비어 있지 않으면 unique이며 사용자 수정 가능하다. UUID는 바뀌지 않는다. 신규 번호는 서버가 기존 번호와 충돌하지 않게 부여하며 삭제 후 재번호하지 않는다.
- 검색은 표시 문자열 전체에 대해 대소문자 구분 없는 부분 일치로 제안한다. 후보는 별도 목록이며 시트 검색·XLSX에 포함하지 않는다.
- 열 삭제는 그 열의 사용자 정의 값을 함께 제거하는 원자적 저장이다. 영향 안내와 확인 동작은 2B UI 설계에서 포함한다.
- IA 화면 ID가 바뀌어도 내부 UUID 연결은 유지한다. 참조 중인 IA 항목 삭제는 409로 막고 먼저 연결 해제를 요청하는 안을 제안한다.

## 5. API와 저장 계약

### 1단계에서 제공할 HTTP 경로

기본 주소는 `http://127.0.0.1:3101`, 업무 prefix는 `/api/v1`로 제안한다.

| 메서드·경로 | 결과 |
| --- | --- |
| `GET /health/live` | 프로세스 응답 200 |
| `GET /health/ready` | DB 조회·저장 루트 접근·마이그레이션 상태 확인. 준비되면 200, 아니면 503 |
| `GET /openapi.json` | 실제 구현 경로의 OpenAPI 문서 |
| `POST /api/v1/projects` | `{name, description?}` → Project, 201 |
| `GET /api/v1/projects?cursor=&limit=` | `{items, nextCursor}`. 기본 50·최대 100, 생성 시각·UUID 내림차순 |
| `GET /api/v1/projects/{projectId}` | Project, 200 |
| `PATCH /api/v1/projects/{projectId}` | `{expectedRevision, name?, description?}` → 변경된 Project, 200 |
| `POST /api/v1/projects/{projectId}/files` | multipart의 `file` 하나 → ready File, 201 |
| `GET /api/v1/projects/{projectId}/files?cursor=&limit=` | ready 파일 목록. 프로젝트 목록과 같은 페이지 규칙 |
| `GET /api/v1/projects/{projectId}/files/{fileId}` | ready 파일의 공개 메타데이터, 200 |
| `GET /api/v1/projects/{projectId}/files/{fileId}/content` | 바이트 스트림, 200. 다운로드 파일명·MIME·길이 제공 |

프로젝트가 다른 파일, 없는 자원, 공개 준비가 안 된 파일은 404로 응답한다. readiness는 내부 경로·접속 정보·SQL 오류를 노출하지 않는다. 인증 없는 로컬 접근이라는 현재 한계를 유지하며 프로젝트 소속 검사를 사용자 권한 검사로 표현하지 않는다.

### 공통 입력·오류 규칙

- DTO에서 미지정 필드를 거부한다. PATCH에서 생략은 유지, 허용된 `null`은 값 비우기, 빈 문자열은 필드별 규칙으로 검증한다.
- 정해진 operationId를 사용해 controller 이름 변경으로 SDK 함수가 바뀌지 않게 한다.
- 오류는 `{error: {code, message, requestId, details?}}` 형식이다. 클라이언트는 `code`로 분기한다. 내부 예외·SQL·절대 경로·비밀번호는 포함하지 않는다.
- 대표 코드: 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `REVISION_CONFLICT`/`REFERENCE_IN_USE`, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE_TYPE`, 503 `DEPENDENCY_UNAVAILABLE`, 500 `INTERNAL_ERROR`.
- 충돌 응답의 details에는 `currentRevision`을 포함한다. 입력 검증 details는 필드 경로와 검증 코드를 담고 입력 원문은 반환하지 않는다.
- 생성 POST는 1단계에서 자동 재시도하지 않는다. 응답 유실 후 성공 여부가 불명확하면 목록을 재조회한다. 생성 중복 방지용 멱등성 저장은 실제 업로드 묶음/AI 작업 계약 단계에서 다룬다.

대표 프로젝트 응답:

```json
{
  "id": "33f2a639-fc72-4132-bcdf-18e60808d5a2",
  "name": "주문 QA",
  "description": "주문과 취소 흐름",
  "revision": 1,
  "createdAt": "2026-10-15T00:00:00.000Z",
  "updatedAt": "2026-10-15T00:00:00.000Z"
}
```

### 후속 단계가 공유할 계약

후속 경로는 이번 공개 OpenAPI에 실행 가능한 API처럼 넣지 않는다. DTO와 예시를 먼저 검증하고 각 기능 구현 때 실제 경로를 추가한다.

| 담당 | 경로 제안 | 핵심 입력·보장 |
| --- | --- | --- |
| 2A | `POST/GET /projects/{projectId}/uploads`, `GET .../uploads/{uploadId}` | 이미 저장된 ready 이미지·JSON 파일 ID로 프레임 목록 등록. 전체 연결 검증 후 묶음 확정, 실패 시 불완전 묶음 숨김 |
| 2B | `POST/GET /projects/{projectId}/sheets`, `GET .../sheets/{sheetId}` | 같은 프로젝트의 선택적 uploadId와 현재 기본 양식의 사본으로 생성 |
| 2B | `PUT .../sheets/{sheetId}/content` | expectedRevision과 열·케이스·연결의 전체 스냅샷. 모든 검증 후 트랜잭션으로 저장 |
| 2B | `PUT .../sheets/{sheetId}/view` | 별도 expectedRevision, 안정적인 열 ID별 순서·너비. 내용 revision과 분리 |
| 2B | `GET .../sheets/{sheetId}/export.xlsx` | 저장된 시트 전체·확정 케이스만, 현재 열 이름·순서 반영. 필터 조건을 받지 않음 |
| 2C | `GET/PUT /projects/{projectId}/template` | 기대 버전을 검사하며 기본 양식 갱신. 기존 시트 불변 |
| 2C | `GET/POST/PATCH/DELETE /projects/{projectId}/ia[/{itemId}]` | 프로젝트 내 화면 ID unique, 같은 프로젝트 참조, 상위 순환 방지 |

위 경로는 모두 `/api/v1` 아래다. 화면 ID와 프레임 ID는 서로 대체하지 않는다. API 입력은 단일 파일 20 MiB, 시트 내용 5 MiB의 초기 제한을 제안한다. 최대 케이스 수를 500으로 제한하지 않으며 500케이스 저장의 응답 시간·페이로드를 측정한 뒤 필요하면 부분 저장을 검토한다.

시트 내용과 표시 설정은 서로 다른 문서이지만 열 추가·삭제로 생기는 정합성은 한 저장 트랜잭션에서 맞춘다. 삭제한 열의 표시 설정을 제거하고 새 열에 기본 순서·너비를 부여하면서 표시 revision도 증가시킨다. 표시 저장은 존재하는 열만 허용하며 충돌 시 최신 표시 설정을 다시 읽는다.

### 자동 저장과 충돌 제안

2B는 편집 후 500 ms 대기, 시트별 하나의 진행 요청, 그동안의 새 편집은 최신 대기 스냅샷으로 관리한다. 서버의 성공 응답이 저장된 기준이다. 오래된 성공 응답으로 더 최신 미저장 초안을 지우지 않는다. 내보내기는 저장 완료 후 실행한다.

네트워크 오류·409에서는 입력을 유지한다. 자동 병합하거나 최신 서버 값을 덮어쓰지 않는다. 응답이 유실된 저장은 서버 revision·내용 재조회로 반영 여부를 확인한 후 재전송한다. 충돌 해결 UI와 재시도 안내는 2B에서 설계·검수한다.

시트 content·view 변경, 후보 추가, 향후 AI 완료 처리는 같은 시트의 짧은 DB 잠금과 revision 검사를 통해 직렬화한다. AI 실행 전체 시간 동안 DB 트랜잭션을 열어두지 않는다. AI 잠금의 생성·만료·복구 상세는 3B에서 결정한다.

## 6. 파일과 OpenAPI 구현 방식

### 파일 저장

- 초기 파일 유형은 PNG/JPEG/WebP와 UTF-8 JSON으로 제안한다. 이미지는 파일 시그니처, JSON은 파싱 성공 여부를 검증한다. XLSX·CSV는 2C에서 분석 입력 계약과 함께 추가한다.
- 단일 이미지 최대 20 MiB, JSON 최대 5 MiB. 파일명은 표시용이고 저장 키는 서버가 생성한다. `original_name`은 길이를 제한하고 다운로드 헤더에서 안전하게 인코딩한다.
- DB에는 `projectId/fileId` 형태의 저장 키와 메타데이터만 둔다. 루트 경로는 서버 설정에서만 읽는다. 임의 경로·심볼릭 링크를 통해 저장 루트를 벗어나는 접근을 거부한다.
- DB와 파일시스템은 하나의 트랜잭션이 아니다. `pending` 파일 행 생성 → 저장소 안의 작업 파일에 기록·검증 → 같은 파일시스템에서 최종 키로 이동 → `ready` 갱신 순서로 처리한다.
- DB 트랜잭션을 열어둔 채 파일을 수신하지 않는다. 실패 시 해당 요청의 임시 바이트를 정리하고 `failed`로 남긴다. ready로 확정한 뒤에만 다운로드와 프레임 연결에 사용할 수 있다.
- 장애 직후 남은 pending/작업 파일은 시작 시 검출·보고한다. 자동으로 사용자 파일을 지우지 않는다. 식별 가능한 자기 실패 파일만 명시적 정리 도구로 처리한다. 해당 도구의 삭제 실행은 이번 설계 승인에 포함하지 않는다.
- 프로세스 재시작과 DB 재접속 후에도 파일 ID·저장 키로 동일한 바이트를 조회할 수 있어야 한다. 파일 이전은 DB와 저장 루트를 함께 복사하고 루트 설정만 바꾸는 방식이다.

### 명세와 SDK

Nest DTO와 Swagger 데코레이터를 외부 계약의 원천으로 삼는다. 명세 export는 포트를 열거나 DB에 연결하지 않고 실행할 수 있도록 의존성 초기화를 분리한다. 런타임과 export는 같은 DTO·문서 설정을 사용한다. [Nest OpenAPI 공식 문서](https://docs.nestjs.com/openapi/introduction)

- 영속 명세: `apps/api/openapi.json`. 직접 수정하지 않는다.
- 검증: OS 임시 경로에 다시 export하여 커밋 대상 명세와 비교하고 operationId·오류·nullable·multipart·응답 필드를 검사한다.
- SDK: 기존 웹·플러그인 `openapi-ts.config.ts`와 출력 폴더로 생성한다. API 앱 내부를 직접 import하지 않는다.
- 후속 DTO는 `components.schemas`로 제공할 수 있지만 미구현 경로를 생성하지 않는다. 공개된 실제 응답과 명세 일치 여부를 계약 테스트로 검사한다.
- 전역 입력 검증은 class-validator/class-transformer 기반 ValidationPipe를 제안한다. transform·unknown field 거부·중첩 검증과 명세가 같은 제약을 갖도록 유효/무효 예시를 검사한다. [Nest Validation 공식 문서](https://docs.nestjs.com/techniques/validation)

## 7. 로컬 환경과 DB 운용 제안

| 설정 | 제안 | 영향 |
| --- | --- | --- |
| API listen | `127.0.0.1:3101` | LAN 전체 공개하지 않음. 충돌 시 명시적으로 다른 포트 설정 |
| 웹·플러그인 UI | 기존 5173·5174 | 현재 실행 설정 유지 |
| 실행 DB | `cheddar_stage1` | 다른 worktree와 데이터 분리 |
| 테스트 DB | `cheddar_stage1_test` | 실제 저장 데이터와 분리, 보호 검사 통과 시에만 테스트 데이터 정리 |
| DB role | `cheddar_stage1` | 해당 개발·테스트 DB만 사용. superuser·다른 DB 초기화 제외 |
| 파일 루트 | `/Users/sion/Library/Application Support/Cheddar/stage-1/files` | Git 밖의 영속 데이터. DB에는 절대 경로 저장 안 함 |
| 파일 작업 경로 | 위 루트의 `.incoming/` | 업로드 중 임시 바이트, 같은 파일시스템의 rename용 |
| 테스트·로그 루트 | `os.tmpdir()` 아래 `cheddar-stage-1-*` | 실행별 격리. 생성한 경로만 정리 |
| 환경 파일 | `apps/api/.env.example`, 실행 값은 Git 제외된 `apps/api/.env.local` | 예시에 실제 비밀번호·API 키를 넣지 않음 |

`DATABASE_URL`, `TEST_DATABASE_URL`, `FILE_STORAGE_ROOT`, `API_PORT`, `CORS_ORIGINS`를 서버에서 검증한다. 개발 기본 pool 크기는 5로 제안한다. 외부 API 키는 1단계에 필요하지 않다.

웹 CORS는 실제 로컬 웹 origin만 허용하고 변경 요청의 Origin도 검사한다. 인증 없는 로컬 서버이므로 이것을 사용자 인증으로 간주하지 않는다. Figma 내부 UI의 origin·허용 도메인·로컬 접근은 2A 실제 Figma 환경에서 검증하고 명시적으로 구성한다. 지금 플러그인 manifest의 `none`을 임의 변경하지 않는다.

Drizzle schema에서 SQL 마이그레이션을 생성하고 검토한 파일을 명시적으로 적용한다. 앱 시작 시 자동 schema push·migration은 하지 않는다. 변경 이력·빈 전용 DB 재현·반복 적용 결과를 검사한다. 기존 환경에서 실패한 migration은 조사 후 전진 수정하며 자동 초기화로 해결하지 않는다. [Drizzle Migrations 공식 문서](https://orm.drizzle.team/docs/migrations)

구현 착수 후 기존 PostgreSQL의 버전·TCP 접속·role 권한·DB 존재를 먼저 확인한다. 위 이름의 DB나 role이 이미 있으면 전용 소유 여부를 확인하기 전 변경하지 않는다. 지정된 저장 루트 밖 쓰기는 도구의 별도 권한 검사를 통과해야 한다.

## 8. 추가 경로와 변경 파일 승인안

설계 문서는 현재 허용된 `docs/changes/<change-id>/` 한 단계 안에만 작성한다. 아래 제품 소스와 산출물은 아직 생성하지 않았다. 이 목록을 승인받은 뒤 `docs/architecture.md`의 허용 구조·산출물 목록을 함께 갱신한다.

### 1단계에서 추가할 폴더

| 정확한 경로 | 목적·주요 파일 | 영향 |
| --- | --- | --- |
| `apps/api/src/` | `main.ts`, `app.module.ts`, 앱 초기화 | 서버 진입점 |
| `apps/api/src/config/` | `env.ts` | 서버 전용 환경 검증 |
| `apps/api/src/common/` | 오류 필터·request ID·입력 검증 설정 | 모든 업무 API의 공통 동작 |
| `apps/api/src/contracts/` | `common.dto.ts`, `projects.dto.ts`, `files.dto.ts`, `uploads.dto.ts`, `sheets.dto.ts`, `ia.dto.ts` | 공통 계약, 기반 담당자가 변경 통제 |
| `apps/api/src/database/` | `database.module.ts`, `database.service.ts`, `schema.ts` | 실제 DB 스키마·pool·트랜잭션 |
| `apps/api/src/storage/` | 저장 인터페이스·로컬 adapter | 파일 바이트 저장 교체 지점 |
| `apps/api/src/health/` | controller·service | 상태 확인 |
| `apps/api/src/projects/` | module·controller·service·repository | 프로젝트 업무 |
| `apps/api/src/files/` | module·controller·service·repository | 파일 메타데이터·입출력 |
| `apps/api/scripts/` | 명세 export·migration·테스트 실행 보조 | 영속 개발 스크립트. 임시 로그 저장 금지 |
| `apps/api/test/` | 프로젝트·파일·계약·migration 테스트와 코드 내 예시 | 추가 하위 폴더 없이 시작 |
| `apps/api/migrations/` | 생성 SQL과 해당 Drizzle 버전이 요구하는 snapshot/journal 하위 경로 | 재현 가능한 영속 이력. 도구 생성물로만 하위 경로 허용 |
| `apps/api/dist/` | TypeScript 빌드 결과와 소스에 대응하는 하위 폴더 | Git 제외 산출물 예외 추가 |

표에 기재하지 않은 `dto/`, `entities/`, `utils/` 등 추가 하위 폴더를 관행만으로 생성하지 않는다. 테스트 컴파일 결과·보고서·커버리지는 OS 임시 경로에 둔다. `test/` 아래 fixture 폴더도 이번에는 만들지 않는다.

API 루트에는 `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsconfig.test.json`, `drizzle.config.ts`, `.env.example`, `openapi.json`을 추가한다. `.env.local`은 승인 후 필요한 실행 환경에서만 Git 제외 파일로 만든다. 테스트 출력 위치는 runner가 OS 임시 경로로 전달하며 API dependency resolution이 유지되도록 구성하고 실제 실행으로 검증한다.

### 기존 파일의 변경

| 파일·경로 | 변경 목적 |
| --- | --- |
| `pnpm-workspace.yaml` | `apps/api` 추가 |
| 루트 `package.json`, `pnpm-lock.yaml` | API 명령·의존성 잠금 반영 |
| `biome.json` | 필요한 경우 API decorator syntax와 산출물 범위의 명시적 설정, 기존 검사 완화 금지 |
| `README.md` | 서버·DB·파일·명세·테스트 명령과 환경 설명 |
| `docs/product.md` | 인계의 확정 제품 요구와 이번 승인 결과 반영 |
| `docs/architecture.md` | 승인된 서버 구조·경계·경로·산출물 예외 반영 |
| 웹 `src/shared/api/generated/`, 플러그인 `src/ui/shared/api/generated/` | 기존 설정을 이용한 생성 타입·SDK·Query 코드 |
| 이 작업의 `change.md`, `design.md` | 승인 근거·실제 결과·계약 기준 커밋 |

`AGENTS.md`, `docs/workflow.md`, 검수 스킬·에이전트 정의는 변경 대상이 아니다. 화면·공통 UI·디자인 토큰·기존 디자인 산출물도 이번 변경 대상이 아니다.

## 9. 브랜치 기준과 후속 소유권

### 구현 기준 제안

현재 준비 브랜치는 `92e9b72`이며 저장된 `origin/main`보다 디자인 커밋 2개가 앞선다. 이 커밋을 1단계 변경으로 함께 푸시하지 않는다.

승인 후 원격 main을 갱신해 비교한다. 디자인 커밋이 이미 main에 반영됐다면 해당 최신 main을 기준으로 사용한다. 아직 없다면 최신 origin/main에서 새 브랜치 `codex/stage-1-foundation-implementation`을 만들고 이 작업의 승인된 설계 문서만 옮기는 방식을 제안한다. 준비 브랜치는 남기고 강제 reset·rebase로 고치지 않는다. 새 브랜치 이름이 이미 사용 중이면 덮어쓰지 않는다. 어느 경우든 실제 기준 SHA를 기록한 뒤 구현하며 무관한 디자인 파일을 복사하지 않는다.

### 2단계의 파일 소유권 제안

아래 후속 경로는 이번 생성 승인 목록에 포함하지 않는다. 단계 시작 시 필요한 경로를 별도로 승인받는다. 기반 소유자는 다음 단계 시작 때 조율 채팅이 지정하며, 지정 전에는 병렬 구현을 시작하지 않는다.

| 소유자 | 담당 경로·책임 | 타 소유자와의 경계 |
| --- | --- | --- |
| 기반·통합 담당 | `apps/api/src/contracts/`, `database/`, `storage/`, `common/`, `config/`, `projects/`, `files/`, `health/`, `migrations/`, `scripts/`, `openapi.json`, `src/app.module.ts`, API 루트 설정·환경 파일, workspace 설정·모든 package.json·lockfile, 생성 SDK, README·현재 제품/구조 문서 | 요청된 schema·DTO·dependency 변경을 모아 커밋. 공통 파일을 각 채팅에서 동시에 수정하지 않음 |
| 2A 프레임 업로드 | 후속 `apps/api/src/uploads/`, 플러그인 `src/main/`, `src/protocol/`, `src/ui/pages/frame-upload/`, `src/ui/shared/lib/figma-bridge.ts`, `manifest.json`, 후속 웹 `src/pages/project-uploads/`, `apps/api/test/uploads.test.ts` | 파일 저장은 files/storage의 공개 기능 사용. 프로젝트·시트 생성 계약 소비 |
| 2B 시트 편집 | 후속 `apps/api/src/sheets/`, `src/exports/`, 웹 `src/pages/test-case-editor/`, `src/widgets/test-case-table/`, `src/entities/test-case/`, `apps/api/test/sheets.test.ts`, `exports.test.ts` | 기본 양식은 2C의 계약으로 읽어 복사. SDK 직접 수정 금지 |
| 2C 프로젝트 설정 | 후속 `apps/api/src/ia/`, `src/templates/`, 웹 후속 `src/pages/project-settings/`, `apps/api/test/ia.test.ts`, `templates.test.ts` | 기존 시트를 변경하지 않음. AI 파일 분석은 3B 공통 실행 계약 이후 |

웹·플러그인의 `app/` 라우트·provider·공통 환경 설정, 공통 UI·토큰 변경은 통합 담당이 조율한다. 공통 API 테스트 `apps/api/test/` 중 위 표에서 명명한 기능 테스트 이외 파일도 기반 담당이 소유한다. 소유권은 같은 파일을 여러 채팅에서 동시에 수정하지 않기 위한 것이며 하위 폴더 생성 승인이나 메시지 전송 권한을 대신하지 않는다.

통합 순서는 공통 schema·계약·SDK → 각 기능 API → 앱 연결 → 교차 기능 검증이다. 후속 단계는 1단계 종료 시 실제 계약 커밋·예시·검증 명령을 전달받은 뒤 시작한다. 채팅 간 메시지 전송은 사용자의 별도 허용 전까지 하지 않는다.

## 10. 구현 순서와 완료 조건

| 순서 | 작업 | 통과 기준 |
| --- | --- | --- |
| 1 | 승인 기록, 기준 브랜치·환경 재확인, 현재 문서 반영 | 경로·실행 대상·DB 소유권 명확, 원래 디자인 변경 미포함 |
| 2 | API workspace·설정·서버·DB/migration | 빌드·타입 검사, 올바른 설정 기동, 잘못된 설정은 설명 가능한 실패, 준비 상태 확인 |
| 3 | 프로젝트·파일 구현 | 재시작 후 재조회, 이름 검증·revision 충돌, 정상 파일 byte/hash 일치, 다른 프로젝트 참조 차단 |
| 4 | 후속 DTO·예시, 명세·SDK | 유효·무효 예시 검증, 실제 HTTP 응답과 스키마 일치, 재생성 명세 차이 없음, 두 앱 타입 검사 |
| 5 | 실패·통합 검증과 인계 | 저장 실패 시 ready 자료 오염 없음, DB 분리 보장, 소유권·실행 명령·제한·계약 SHA 기록 |

테스트는 API에서 `node:test`와 `@nestjs/testing`, 로컬 HTTP의 실제 fetch를 사용하도록 제안한다. TypeScript를 먼저 컴파일해 decorator metadata를 보존하며 테스트 출력은 OS 임시 경로로 보낸다. Node 기본 runner 사용은 [공식 문서](https://nodejs.org/docs/latest-v24.x/api/test.html)를 기준으로 구현한다. UI 테스트 도구·CI 도입은 이번 범위에 포함하지 않는다.

핵심 검증은 다음과 같다.

1. 빈 전용 테스트 DB에 migration 적용, 반복 적용, 프로젝트·파일 생성 후 서버 재기동과 조회.
2. 같은 revision으로 동시에 수정하면 한 요청만 성공, 나머지는 409, 성공한 값 보존.
3. 파일 유형·크기·JSON 파싱·프로젝트 불일치·다운로드 헤더·경로 이탈 검사. 디스크 쓰기 실패와 DB 최종 갱신 실패를 주입해 불완전 파일이 공개되지 않는지 확인.
4. validation 오류와 실제 HTTP 응답을 OpenAPI 스키마에 대조. 응답의 내부 필드·stack·DB 오류 노출 여부 확인.
5. 테스트 DB URL이 실행 DB와 같으면 즉시 중단. 전용 테스트 DB 확인 없이 DROP/TRUNCATE/초기화하지 않음. 동시 실행은 별도 DB를 쓰거나 직렬 실행.
6. `pnpm lint`, `pnpm typecheck`, `pnpm build`, API 테스트, 명세 재생성 비교, 웹·플러그인 SDK 생성 후 타입 검사를 실행하고 실제 명령·결과 기록.

20프레임 실제 업로드, 500케이스 편집 성능, Figma 네트워크, AI 실패·후보, XLSX 내용, 한글 입력·복붙·접근성 검증은 해당 구현 단계와 통합 단계에 남긴다. 이 단계에서 통과했다고 보고하지 않는다. 사용자 노출 문구를 추가하는 구현이 생기면 기존 정책대로 독립 UX 문구 검수를 수행한다.

## 11. 사용자 검토 지점

제안의 기본 방향은 로컬 서버 하나, 프로젝트 중심 데이터, 파일 저장 분리, revision 기반 저장, 단일 명세와 공통 파일 소유자다. 검토 시 아래 네 묶음을 승인하거나 수정할 수 있다.

1. **기능·데이터 계약**: 1단계 범위, 4~6절의 모델·필드·API·실패 처리. 후속 제품 선택 중 빈 시트·시스템 열 삭제 제외·우선순위·검색·IA 삭제 제한도 제안임을 포함한다.
2. **구조 변경**: 8절의 정확한 폴더·파일·도구 생성 하위 경로와 `docs/architecture.md` 허용 목록 갱신.
3. **실행 환경**: 7절의 전용 DB/role·포트·영속 저장 경로. 기존 DB/파일 삭제와 외부 공개는 제외.
4. **구현 기준**: 9절의 원격 재확인과 별도 구현 브랜치. 제품 구현은 승인 뒤 시작.

LangGraph 상세, 실제 Figma 연결 정책, 클라우드 이전·배포는 이번 승인으로 확정하지 않는다.
