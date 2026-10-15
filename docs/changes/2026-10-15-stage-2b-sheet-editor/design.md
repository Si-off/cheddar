# 2B 설계안 — 시트 편집·저장·XLSX 내보내기

상태: 2026-10-15 사용자 승인. 사용자가 “설계안의 추천안과 새 폴더 두 곳 생성·허용 목록 반영을 승인합니다”라고 지시했다. 아래 제안 표현과 대안은 검토 당시 문맥을 보존한다. 11절의 추천안을 채택하며, 대안은 채택하지 않는다. 실제 구현은 같은 지시의 “공통 변경이 반영되면 2B 구현을 진행” 조건에 따라 공통 선행 변경 커밋을 수용한 뒤 시작한다.

기준: `codex/stage-2b-sheet-editor`의 `4cfd066574ca97241372d3b56561fb96f0430847`. [2단계 담당 경계](../2026-10-15-staged-development/stage-2.md), 현재 [제품](../../product.md)·[구조](../../architecture.md)·[절차](../../workflow.md), [1단계 설계 4~7절](../2026-10-15-stage-1-foundation/design.md)을 따른다. 초기 디자인 시안 이미지는 화면 명세로 사용하지 않는다.

## 1. 결과와 단계 경계

프로젝트의 빈 시트 또는 업로드에 연결된 새 시트에서 케이스·열을 편집한다. 긴 내용은 상세 패널에서 수정하고 입력을 자동 저장한다. 저장 충돌은 사용자가 해결하며, 저장된 전체 케이스를 XLSX로 출력한다.

| 구분 | 확정된 입력 계약 | 이번 설계의 제안 |
| --- | --- | --- |
| 시트 | unit/integration, 업로드 없이도 생성, 프로젝트 기본 양식의 사본 | 생성 대화상자에서 이름·종류 선택, 업로드 진입 시 uploadId 전달 |
| 열·행 | 시스템 8열 유지, 사용자 텍스트 열, 행 추가·삭제, 열 이름·순서·너비 | 셀 범위 선택, 열 설정 목록의 이동 버튼과 헤더 너비 조절 |
| 저장 | content/view revision 분리, 500ms 대기, 시트별 진행 요청 1개, 충돌·실패 시 입력 보존 | 브라우저 초안 보관, 충돌 초안과 최신 서버 내용을 나란히 확인 |
| 검색 | 표시 문자열의 대소문자 무시 부분 일치, 후보 제외 | 현재 로컬 초안에서 검색, 저장 순서·내보내기에 영향 없음 |
| 내보내기 | 저장된 전체 케이스, 현재 열 이름·순서, 후보·검색 조건 제외 | 백엔드 ExcelJS, 텍스트 셀, 헤더 고정·줄바꿈, revision 지정 다운로드 |

2C의 양식·IA와 2A의 업로드 계약을 사용한다. IA 편집·양식 관리·업로드·AI 생성·후보·플로우·공유·시트 삭제·시트 이름 변경은 이번 구현에 포함하지 않는다. 생성 후 시트 선택과 열·케이스 편집에 집중한다. 이 제외 범위는 기존 단계 경계를 유지하기 위한 것이며 후속 기능을 삭제하는 제품 결정이 아니다.

## 2. 웹 책임과 화면 구성 제안

| 소유 경로 | 책임 | 의존 관계 |
| --- | --- | --- |
| `apps/web/src/pages/test-case-editor/` | 프로젝트·시트 진입, 생성·선택, 조회, 상세 패널, 저장·충돌·내보내기 흐름 | widget·entity·생성 SDK·공통 UI 소비 |
| `apps/web/src/widgets/test-case-table/` | TanStack Table 연결, 선택·키보드·복붙, 열 너비·순서 조작 | entity의 모델·편집 명령 사용. page나 app import 금지 |
| `apps/web/src/entities/test-case/` | DB·표 도구와 독립된 웹 모델, 편집 명령, 검색·표시 문자열, 저장 대기열·초안 보관 | 생성 DTO를 경계에서 변환. widget/page import 금지 |
| `apps/api/src/sheets/` | controller → service → repository, 내용·표시 저장·검증 | 공통 schema·DTO, 2C 양식 읽기·IA 참조, 2A 업로드 참조 |
| `apps/api/src/exports/` | 저장 스냅샷 읽기와 XLSX 직렬화 | SheetsModule의 읽기 인터페이스 소비. 별도 시트 저장 구현 금지 |

화면 위에는 프로젝트·시트 선택과 새 시트, 검색, 저장 상태, XLSX 내보내기를 둔다. 주 영역은 가로·세로 스크롤 표, 우측 상세 패널은 선택한 케이스의 긴 문자열·우선순위·프레임·IA 연결을 편집한다. 상세 패널과 표는 하나의 초안을 사용한다. 상세 패널은 모달로 가두지 않으며 닫으면 원래 셀로 포커스를 돌린다.

프로젝트 화면을 별도로 만들지 않고 기존 프로젝트 API를 통한 선택을 이 page에서 제공한다. 경로 제안은 `/projects/$projectId/sheets/$sheetId`, `/`는 프로젝트·시트 선택 진입이다. 업로드 화면은 projectId/uploadId를 이 page의 생성 동작에 넘긴다. 실제 라우트·앱 레이아웃 연결은 조율 담당이 반영한다.

공통 Button·Input·Textarea·Select·Dialog 등을 재사용하고 라이트 디자인·토큰을 따른다. 완성된 범용 DataGrid나 공통 Sheet 컴포넌트 추가는 요청하지 않는다. 편집 위치·선택 범위·오류를 구분하며 포커스는 기존 배경과 테두리 규칙을 따른다. 열 너비는 사용자 저장 데이터이므로 동적 수치를 적용하되 색상·간격·기본 크기 토큰을 우회하지 않는다.

## 3. 셀·행·열 편집 제안

- 각 행 UUID와 열 UUID로 셀을 식별한다. 검색·열 이동 후에도 배열 인덱스로 변경 대상을 결정하지 않는다.
- 텍스트 셀은 더블클릭·Enter·F2·문자 입력으로 편집한다. 입력 중에는 네이티브 커서·선택·복붙·undo를 유지한다. 한글 composition 도중 Enter나 debounce로 입력을 잘라 저장하지 않는다.
- 셀 선택 상태에서는 방향키 이동, Shift+방향키/Shift+클릭으로 직사각형 범위 확장, Tab/Shift+Tab으로 다음·이전 셀 이동을 제공한다. 표의 첫/마지막 셀 밖에서는 포커스가 표 밖으로 나간다.
- 단일행 입력은 Enter로 확정 후 아래 셀 이동, Escape로 해당 편집 취소다. 긴 문자열 편집은 Enter가 줄바꿈, Ctrl/Cmd+Enter가 확정이다. 상세 패널에서는 일반 폼 조작을 유지한다.
- Delete/Backspace는 선택 셀 값을 비운다. 행 삭제는 별도 행동과 확인으로 처리한다. 여러 행 선택·삭제는 행 체크박스와 삭제 행동을 사용한다. 삭제 번호는 다시 매기지 않는다.
- 우선순위는 높음·보통·낮음·미지정 선택이다. 프레임·IA는 상세 패널에서 프로젝트 내 항목을 선택한다. 문자열에서 임의로 연결 UUID를 추정하지 않는다.
- 열 이름은 현재 DTO의 1~100자를 따르고 trim 후 빈 이름을 거부한다. 동일한 표시 이름은 허용하되 저장과 선택은 UUID로 구분한다. 시스템 열의 이름·순서·너비 변경, 사용자 열의 추가·삭제를 지원한다.
- 사용자 열 삭제 확인에는 값이 있는 케이스 수와 값도 함께 삭제된다는 영향을 표시한다. 확정 시 열·값·표시 설정을 한 저장으로 제거한다. 실패하면 초안을 보존한다.
- 열 순서는 설정 목록의 위/아래 이동으로 제공한다. 헤더 드래그 정렬 라이브러리는 초기 추가하지 않는다. 너비는 마우스 조절과 키보드로 조작할 수 있는 리사이즈 손잡이를 제공하고 드래그 종료 시 저장한다.

새 행은 클라이언트 UUID로 먼저 편집하고 caseCode는 번호 발급 전 빈 값으로 둔다. 서버는 새 UUID가 처음 저장될 때 비어 있는 번호에만 시트의 단조 증가 카운터로 `TC-001` 형식의 번호를 부여한다. 사용자가 입력한 번호는 유지하고 중복이면 전체 저장을 거부한다. 기존 행의 의도적인 빈 번호는 허용한다. 발급 카운터는 삭제·수동 번호 수정으로 감소하지 않으며 기존 번호와 충돌하면 다음 번호를 찾는다. 이는 1단계의 서버 번호 발급 규칙을 전체 스냅샷 API에 연결하는 제안이다.

## 4. 복사·붙여넣기 제안

| 상황 | 동작 |
| --- | --- |
| 셀 범위 복사 | 현재 표시 열·보이는 행 순서의 TSV. 탭·개행·따옴표는 인용 처리하며 헤더는 제외 |
| 단일 셀 편집 중 | 브라우저의 텍스트 복붙. 개행을 다른 행으로 해석하지 않음 |
| 범위에 1셀 붙이기 | 선택한 편집 가능 셀들을 같은 값으로 채움 |
| 다중 셀 붙이기 | 한 시작 셀이면 원본 크기로 확장, 다중 선택이면 선택 크기와 원본 크기가 같아야 함 |
| 행 범위 초과 | 검색이 없을 때만 필요한 새 행을 추가. 열은 자동 추가하지 않음 |
| 검색 중 붙이기 | 보이는 기존 행 UUID에만 적용. 보이지 않는 행을 수정하거나 새 행을 자동 추가하지 않음 |
| 우선순위 | 높음/보통/낮음, high/medium/low, 빈 값만 수용 |
| 프레임·IA 연결 열 | 복사는 표시 문자열, 범위 붙이기·지우기는 거부하고 상세 패널에서 연결 수정 |
| 오류·중복·열 초과·5MiB 초과 | 적용 전 전체 검증 후 붙이기 전체 거부. 일부 셀만 변경하지 않음 |

붙여넣기는 TSV만 데이터로 처리하며 HTML·수식은 실행하지 않는다. 일반 문자열로 보존한다. 끝의 행 구분자 하나 때문에 불필요한 빈 케이스를 만들지 않되 실제 빈 셀·빈 행은 보존한다. 선택 범위와 검색 결과는 로컬 상태이고 저장되지 않는다.

## 5. 저장·응답 유실·충돌 제안

### 상태와 요청 순서

TanStack Query는 마지막 서버 응답을, 시트별 Zustand store는 기준 스냅샷·로컬 초안·편집 순번·대기 상태를 소유한다. query refetch로 초안을 교체하지 않는다. content/view는 같은 시트의 단일 저장 대기열을 사용한다.

1. 로컬 편집을 즉시 반영하고 편집 순번을 증가시킨다. composition 중인 텍스트도 화면 초안에는 유지한다.
2. 유효한 편집이 확정된 뒤 500ms 대기한다. 하나의 요청 진행 중에는 새 요청 대신 최신 대기 스냅샷을 보관한다.
3. 내용 저장을 먼저 처리한다. 열 추가·삭제는 서버가 view도 맞추므로 응답에서 contentRevision·viewRevision과 전체 정규화 스냅샷을 받는다.
4. 진행 요청 이후 생긴 로컬 편집은 유지한다. 성공 응답 전체를 초안에 대입하지 않는다. 서버 발급 caseCode도 전송 이후 사용자가 그 필드를 수정하지 않았을 때만 반영한다.
5. 열 구조가 바뀐 경우 남은 표시 편집을 최신 열 UUID에 맞추고 최신 viewRevision으로 보낸다. 이 재적용은 자기 진행 요청의 성공 응답 처리에만 허용하며 외부 충돌의 자동 병합으로 사용하지 않는다.
6. 최신 편집까지 서버가 확인했을 때만 저장 완료로 표시한다. 로컬 유효성 오류가 있으면 초안을 유지하고 저장을 막아 문제 셀로 이동할 수 있게 한다.

### 실패와 수정 충돌

- 400/413: 입력을 보존하고 해당 필드·크기 문제를 수정한다. 자동 재시도하지 않는다.
- 네트워크 오류·5xx·응답 유실: 입력을 유지하고 대기열을 멈춘다. GET으로 같은 내용을 읽어 원래 전송과 비교한다. 서버 revision·정규화된 값이 저장 성공과 일치하는 경우만 성공으로 정리한다. 조회 실패나 번호 발급 등으로 일치 여부를 증명하지 못하면 결과 확인 상태로 둔다. 변경이 없음을 확인한 뒤에만 사용자 재시도로 동일 기대 버전에서 재전송한다.
- 409: 초안과 마지막 기준을 보존하고 자동 저장·내보내기를 중단한다. 최신 서버 스냅샷을 별도로 읽는다. expectedRevision만 최신 값으로 바꿔 전체 초안을 덮어쓰는 행동은 제공하지 않는다.
- 충돌 해결의 추천 최소 범위: 보존한 내 입력과 최신 내용을 비교·복사할 수 있게 한다. 사용자가 최신 내용으로 편집을 다시 시작하면 기존 충돌 초안은 별도 보관하고, 필요한 텍스트를 사용자가 선택해 다시 반영한다. 자동 필드 병합·구조 충돌 병합·강제 덮어쓰기는 제공하지 않는다. 필드별 충돌 선택 화면은 대안이며 구현 범위가 커진다.
- 404/참조 삭제: 초안을 보존한다. 잘못된 연결을 사용자에게 표시하고 재선택·해제한 뒤 저장한다. 행이나 열을 조용히 삭제하지 않는다.
- 다른 시트로 이동할 때 대기열을 가능한 한 비운다. 실패하면 초안 보존 여부를 알리고 유지한 채 이동하거나 머무를 수 있게 한다. 이동 전 진행 요청을 단순 취소해 성공 여부를 유실하지 않는다.

### 새로고침 이후의 보존 범위 — 승인 필요

추천은 **IndexedDB에 시트별·편집 세션별 초안을 보관**하는 안이다. 기본 요구인 실행 중 입력 보존에 새로고침·재진입 복구를 추가한다. 메모리만 유지하는 대안은 구현은 작지만 새로고침 시 미저장 입력을 잃는다.

브라우저 기본 API를 사용해 라이브러리를 추가하지 않는다. API origin·projectId·sheetId·편집 세션 UUID를 키로 기준 revision·미저장 내용·표시·편집 순번·시각을 보관한다. 동일 origin의 다른 탭이 같은 초안을 덮어쓰지 않도록 세션을 분리하고 복원 후보가 여럿이면 사용자가 고른다. 자격증명·환경변수는 저장하지 않는다.

복원 시 먼저 서버를 조회하고 같은 기준인지 확인한다. 다르면 충돌 절차로 들어가며 자동 전송하지 않는다. 서버에 저장된 편집 순번까지만 로컬에서 정리하고 실패·충돌 초안은 사용자 폐기 전까지 유지한다. 저장 공간 오류는 메모리 입력을 유지하고 브라우저 보관 실패를 구분해 표시한다. 브라우저 데이터 삭제·강제 종료 직전 기록되지 않은 입력까지 복구를 보장하지 않는다. 이 보존 범위와 보관 정책은 신규 제안이며 승인 전 구현하지 않는다.

## 6. API·저장 계약 제안

기존 요청 DTO의 구조를 유지하고 실제 응답과 operationId를 공통 담당에게 요청한다. 아래 경로는 `/api/v1` 아래이며 프로젝트·시트 소속이 다르거나 없으면 404다.

| 메서드·경로 | operationId 제안 | 응답·보장 |
| --- | --- | --- |
| POST `/projects/{projectId}/sheets` | `createSheet` | CreateSheetDto, 201 SheetSnapshot. 현재 양식을 트랜잭션 안에서 복사 |
| GET `/projects/{projectId}/sheets` | `listSheets` | 기존 cursor/limit 규칙, 선택적 uploadId 필터의 SheetSummary 목록. 케이스 전체는 제외 |
| GET `/projects/{projectId}/sheets/{sheetId}` | `getSheet` | 200 SheetSnapshot, 내용·표시를 같은 DB 스냅샷에서 조회 |
| PUT `.../sheets/{sheetId}/content` | `updateSheetContent` | SheetContentDto, 200 SheetSnapshot. content revision 검사와 전체 원자 저장 |
| PUT `.../sheets/{sheetId}/view` | `updateSheetView` | SheetViewDto, 200 SheetSnapshot. view revision 검사, 열 집합 정확히 일치 |
| GET `.../sheets/{sheetId}/export.xlsx` | `exportSheetXlsx` | XLSX bytes. 선택적 contentRevision/viewRevision으로 저장 버전 확인 |

SheetSummary는 `id, projectId, name, kind, uploadId, contentRevision, viewRevision, createdAt, updatedAt`다. SheetSnapshot은 여기에 `columns, cases, view`를 더한다. cases 배열은 저장 행 순서, view 배열은 열 표시 순서다. 프레임 이름·IA 화면 ID 등은 같은 읽기 시점의 표시용 참조 목록으로 제공하고 저장 DTO와 분리한다. 번호 발급 결과도 cases에 포함한다. `sourceTemplateRevision`은 생성 출처로 보관하되 원본을 따라 갱신하는 연결로 쓰지 않는다.

content/view의 409 details는 `resource: content|view`, `currentRevision`을 포함한다. 내보내기의 revision 불일치도 이 형식으로 반환하고 조회부터 다시 한다. 참조가 유효하지 않으면 입력 원문 대신 필드 경로·오류 코드를 반환한다. 시트별 요청 본문은 현행 공통 JSON 한도 5MiB를 유지하고 케이스 수 500개를 상한으로 만들지 않는다. 생성 POST는 기존 규칙대로 자동 재시도하지 않는다. 성공 여부가 불명확하면 목록을 조회하고 사용자가 확인하며 임의의 멱등성 저장소를 추가하지 않는다.

### DB 모델과 트랜잭션

아래 테이블은 **공통 담당이 schema·migration으로 구현할 제안**이다. 2B가 직접 schema 파일이나 별도 DB 모델을 만들지 않는다.

| 모델 | 주요 내용·제약 |
| --- | --- |
| sheets | projectId, 선택적 uploadId, 이름·종류, 내용/표시 revision, 번호 발급 카운터, 양식 출처 revision, 시각. 프로젝트 FK·목록 인덱스 |
| sheet_columns | sheetId, 안정적 UUID, system/custom, field/valueType, 이름. 시스템 필드 중복 방지 |
| sheet_column_views | sheetId·columnId, 표시 순서·너비. 열 FK·유일한 순서, 양의 너비 |
| test_cases | sheetId, UUID, 행 순서, caseCode, 제목·사전조건·단계·기대 결과, nullable priority. 빈 번호 제외 unique, UUID의 다른 시트 재사용 금지 |
| test_case_values | caseId·columnId별 문자열. 해당 시트의 사용자 열만 허용 |
| test_case_frame_links / test_case_ia_links | 케이스와 프레임/IA의 UUID 연결·순서. 프로젝트 소속 복합 FK, 참조 삭제 제한 |

새 시트는 2C가 소유한 양식 읽기 인터페이스에 동일 DB transaction을 전달해 열·표시를 복사한다. 양식 열 UUID는 새 시트 UUID로 다시 발급하고 view의 참조도 함께 치환한다. 기본 양식이 아직 없을 때의 생성·초깃값은 2C/공통 담당의 단일 제공 계약으로 해결하며 2B에서 하드코딩하거나 유사 양식 테이블을 만들지 않는다.

내용 저장은 시트 행의 짧은 잠금 → revision 비교 → 전체 유효성·프로젝트 참조 확인 → 행·열·값·연결 차이 반영 → 내용 revision 증가 → commit 순서다. 살아 있는 케이스 UUID는 전체 삭제·재삽입하지 않고 유지해 향후 후보 등 참조를 깨뜨리지 않는다. 행·열 순서 교환과 caseCode 교환은 중간 unique 위반 없이 최종 상태를 검증·저장한다. 열 집합이 바뀌면 삭제 열의 view를 제거하고 새 열의 기본 표시를 추가해 view revision도 함께 증가시킨다. 열 이름만 바뀌면 content revision만 증가한다.

IA 삭제와 케이스 연결 추가의 경합은 공통 복합 FK의 RESTRICT와 업무 오류 매핑으로 처리한다. 2C는 참조 중 삭제를 409로 안내하고 2B는 저장 시 사라진 참조를 검증 오류로 안내한다. 두 모듈이 일관된 잠금 순서를 사용해야 하는 경우 공통 담당이 정한다. 장시간 XLSX 생성이나 향후 AI 실행 중 DB 잠금을 유지하지 않는다.

## 7. XLSX 제안과 제약

**백엔드 ExcelJS**를 추천한다. 브라우저 생성은 미저장 초안·필터 상태가 결과에 섞이기 쉽다. 서버에서 저장 스냅샷을 읽으면 확정된 전체 케이스 출력과 일치 검증이 명확해진다. ExcelJS는 XLSX 데이터·스타일 읽기/쓰기를 제공한다. 정확한 버전은 조율 담당이 Node 24·CommonJS 환경에서 검증해 lockfile에 고정한다. [ExcelJS 공식 문서](https://github.com/exceljs/exceljs/blob/master/README.md)

1. 내보내기를 누르면 편집 중 값을 확정하고 대기 중인 content/view 저장을 완료한다. 실패·충돌·유효성 오류 중에는 내보내지 않는다. 다운로드 준비 중 새 편집은 잠시 막는다.
2. 마지막 확인한 contentRevision/viewRevision을 GET에 넘긴다. 서버는 repeatable-read 등 일관된 읽기 트랜잭션에서 revision·케이스·열·view·참조 표시를 확보하고 트랜잭션을 끝낸 뒤 파일을 만든다. 이후 다른 사용자가 수정해도 응답은 확인한 버전의 일관된 파일이다.
3. 시트 1개, 첫 행은 현재 열 이름, 열 순서는 view, 행 순서는 저장 케이스 순서다. 0개 케이스도 헤더를 출력한다. 검색·선택·후보·내부 UUID는 제외한다.
4. 프레임은 이름, IA는 화면 ID와 이름, 우선순위는 한글 레이블, 미지정은 빈 문자열로 출력한다. 여러 연결은 저장 순서로 셀 내 줄바꿈한다. 중복된 프레임 이름은 필요하면 Figma node ID를 덧붙여 식별한다.
5. 모든 값은 문자열 셀로 기록한다. `=`, `+`, `-`, `@`로 시작하거나 숫자처럼 보이는 사용자 입력도 수식·숫자·하이퍼링크 객체로 변환하지 않는다. 개행·앞자리 0·한글·이모지를 보존한다.
6. 첫 행 고정, 헤더 구분·줄바꿈·상단 정렬만 적용한다. 표 너비는 Excel 문자 단위로 근사 변환하고 형식 한도 안에서 조정한다. 시트명·파일명은 금지 문자와 길이를 처리하고 한글 Content-Disposition을 제공한다. 임시 서버 파일·files 등록 없이 메모리 buffer로 응답한다.

**장문 내보내기 정책은 승인 필요하다.** Excel의 한 셀은 32,767자 제한이 있지만 현재 긴 문자열 DTO에는 동일 제한이 없다. 저장 한도를 임의로 줄이거나 내용을 잘라내지 않고, 내보내기 전에 헤더·연결 표시를 포함한 출력 셀과 행·열 수를 검사해 초과 위치를 422 `EXPORT_LIMIT_EXCEEDED`로 안내하는 안을 추천한다. 대안은 별도 본문 시트로 나누는 방식이며 현재 시트 모양과 달라지고 출력 설계가 커진다. 정확한 문자·줄바꿈 한도 판정은 Excel 호환 경계 테스트로 검증한다. [Microsoft Excel 제한](https://support.microsoft.com/en-us/excel/excel-specifications-and-limits)

## 8. 조율 담당에게 필요한 공통 변경

다른 채팅에 메시지를 보내지 않고 이 표를 인계한다. 공통 담당의 선행 커밋을 전달받은 뒤 기능 구현에서 사용한다.

| 변경 대상 | 요청 내용·이유 | 선행 관계 |
| --- | --- | --- |
| `apps/api/src/contracts/sheets.dto.ts` | SheetSummary/Snapshot·목록·참조 표시 응답, export revision query, 오류 details·export 한도 코드의 문서화. 기존 입력 DTO 유지·필요한 검증 보강 | schema와 함께 우선 |
| `apps/api/src/contracts/ia.dto.ts`, 2C templates 계약 | 초기 양식의 시스템 8열 이름·기본 순서·너비, 양식 없음 처리, 트랜잭션 안에서 읽는 공개 인터페이스 | 2B·2C가 같은 초기 양식 소비 |
| `apps/api/src/database/schema.ts`, `migrations/` | 6절 테이블·복합 FK·인덱스·revision·번호 카운터·unique 교환 전략. 2A/2C의 프레임·IA·양식 모델과 연결 | repository 구현 전 |
| `apps/api/src/app.module.ts`, `common/openapi.ts` | SheetsModule/ExportsModule 및 실제 경로 등록, 안정적인 operationId·바이너리 응답 명세 | 기능 모듈 준비와 맞춰 연결 |
| `apps/api/src/common/errors.ts` | export 한도 422와 참조 경합·revision 오류의 안전한 매핑. 현행 payload 413 코드 변경이 필요하면 별도 합의 | 실제 오류 경로 통합 |
| 모든 package.json·lockfile | 웹 `@tanstack/react-table`, API `exceljs`, 웹 개발 의존성 `@playwright/test` 제안. 버전 고정·호환성·라이선스 확인 | 설치 전 공통 반영 |
| 두 생성 SDK·`apps/api/openapi.json` | 실제 API 등록 후 명세와 양쪽 SDK 재생성. 생성 코드 직접 편집 금지 | UI API 연결 전 |
| 웹 `app/routes/`, `app/styles/`, 공통 API 연결·환경 | 프로젝트/시트 URL·루트 진입·업로드 진입, 넓은 편집 레이아웃, API 3103/web 5176 후보·CORS·query client 연결 | page 연결·실행 전 |
| 공통 UI·`packages/design-tokens/src/theme.css` | 기존 토큰 우선. 표의 기본 열 너비·최소 너비·상세 패널 크기에 맞는 토큰이 없으면 정확한 값을 공통 담당에게 제안. 범용 표 컴포넌트 추가는 요청하지 않음 | UI 구현에서 필요를 확인한 뒤 |
| API 테스트 runner·환경·현재 문서 | 순차 테스트·advisory lock·DB 보호 유지, 테스트 서버가 실제 테스트 DB만 쓰도록 연결. 승인된 제품·구조·경로·명령을 README/product/architecture에 반영 | 실제 검증·경로 생성 전 |

2C 양식·IA와 2A 업로드 상세는 해당 담당의 공개 서비스/API를 소비한다. 준비되지 않았으면 빈 시트·빈 연결 검증부터 진행하되 임의의 공통 기능 사본이나 운영용 목 API를 만들지 않는다. 이후 실제 참조 연결 통합 검증을 끝내야 2B 완료다.

## 9. 새 폴더·파일과 도구 산출물 승인안

이번 설계 기록 `docs/changes/2026-10-15-stage-2b-sheet-editor/`는 현재 작업 기록 규칙에서 허용한다. 아래 **제품 폴더 2개는 아직 생성하지 않았으며 별도 명시적 승인 대상**이다. 이전 보고의 `/apps/...` 표기는 아래 저장소 상대 경로를 뜻한다.

| 정확한 저장소 상대 경로 | 목적·예상 파일 | 영향 |
| --- | --- | --- |
| `apps/api/src/sheets/` | `sheets.module.ts`, `sheets.controller.ts`, `sheets.service.ts`, `sheets.repository.ts` | 시트 생성·목록·조회·내용/표시 저장, 2C·2A와 연결 |
| `apps/api/src/exports/` | `exports.module.ts`, `exports.controller.ts`, `exports.service.ts`, `xlsx.ts` | 시트 저장 스냅샷의 XLSX 출력, ExcelJS 의존 |

웹의 세 소유 폴더는 이미 승인되어 있다. 새 `model/`, `ui/`, `api/`, `lib/`, `test/` 세그먼트를 만들지 않고 우선 각 폴더에 직접 파일을 둔다. page의 `index.tsx`, `editor.tsx`, `detail-panel.tsx`, `conflict-panel.tsx`, `editor.spec.ts`; widget의 `index.ts`, `table.tsx`, `selection.ts`, `clipboard.ts`; entity의 `index.ts`, `model.ts`, `store.ts`, `autosave.ts`, `draft-storage.ts`, `display.ts`를 예상한다. 파일 단위 분리는 실제 구현에서 책임에 맞게 조정하되 승인된 폴더를 늘리지 않는다.

API의 `apps/api/test/sheets.test.ts`, `apps/api/test/exports.test.ts`, 웹 루트 `apps/web/playwright.config.ts`는 기존 허용 폴더 안의 영속 파일이다. Playwright 설정·스크립트는 공통 담당 소유로 요청한다. 별도 e2e/fixtures 폴더나 CI 폴더는 만들지 않는다.

설치 node_modules·기존 앱 dist 예외를 그대로 사용한다. Playwright 브라우저·trace·스크린샷·report·테스트 다운로드·Vite 캐시·API fixture는 저장소 밖 OS 임시 경로로 명시한다. 기본 `test-results/`, `playwright-report/`, 추가 캐시 폴더를 저장소 안에 만들지 않는다. XLSX 출력은 다운로드이며 DB·서버 파일 저장 경로를 추가하지 않는다. 브라우저 IndexedDB는 사용 브라우저의 저장소로 Git/worktree 폴더를 추가하지 않는다.

사용자가 위 두 경로와 허용 목록 반영을 승인하면 공통 담당이 `docs/architecture.md`에 정확한 목적·범위를 반영한다. 2B가 공통 문서나 지침을 먼저 바꿔 허용 범위를 넓히지 않는다.

## 10. 구현 순서와 완료 조건

| 순서 | 작업 | 확인 가능한 완료 조건 |
| --- | --- | --- |
| 1 | 사용자 결정·경로 승인, 공통 계약 커밋·실행 대상 확인 | 11절 결정 반영, 양식·schema·의존성·라우트 담당 명확 |
| 2 | 시트 API·저장·참조 검증 | 빈 시트와 양식 사본 생성, 기존 시트 불변, 시스템 열·사용자 값·프로젝트 소속·caseCode 검증, 재기동 보존 |
| 3 | 표·상세·열·검색·복붙·키보드 | 같은 초안 반영, UUID 기반 편집, 다중 셀 전체 적용/거부, 한글 composition·긴 문자열·접근성 실제 확인 |
| 4 | 자동 저장·브라우저 초안·실패/충돌 | 진행 요청 뒤 입력 보존, 응답 유실 확인, 두 탭 revision 경합, content/view 열 정합성, 새로고침 복구·저장 공간 실패 |
| 5 | XLSX·2A/2C 연결 | 저장 완료·revision 확인 후 전체 출력, 필터·후보 제외, 열 이름/순서·참조 표시·문자열·한도 검증 |
| 6 | 회귀·성능·독립 문구 검수·인계 | 공통 검사·실제 HTTP/브라우저·UX 검수 결과와 한계, 커밋·원격·미확인 사항 기록 |

API는 기존 node:test와 실제 PostgreSQL/HTTP를 사용한다. 두 같은 revision 저장 중 하나만 성공, 트랜잭션 중간 실패의 전체 롤백, 열 삭제와 view 저장 경합, caseCode 교환·신규 발급, 다른 프로젝트 참조·IA 삭제 경합을 검증한다. schema 재현·공통 계약·두 SDK 검증은 조율 담당과 통합해 수행한다.

UI 자동화는 Playwright를 추천한다. 셀 편집·상세 동기화, 다중 셀 붙이기, 키보드 탈출·포커스, 저장 지연·실패·충돌·복원, 검색 중 전체 내보내기처럼 사용자 조작과 결과를 검증한다. 화면 테스트 일부는 HTTP 응답을 제어해 실패를 재현하고, 실제 API·테스트 DB를 잇는 저장·다시 열기·다운로드 흐름은 별도로 검증한다. 테스트 서버는 기존 서비스 재사용 없이 점유 포트를 확인하고 순차 실행한다. Playwright의 webServer 기능은 테스트용 서버 관리를 지원한다. [공식 문서](https://playwright.dev/docs/test-webserver)

브라우저 자동화가 실제 macOS 한글 IME 조합과 Excel 앱 호환성을 모두 증명하지는 않는다. 한글 입력·클립보드 및 실제 XLSX 열기는 가능한 로컬 환경에서 별도 확인하고 미확인 항목을 명시한다. XLSX는 재로딩해 셀 타입·행·열·문자열·수식 부재를 검사하고, ZIP XML의 독립 검사로 주요 내용 누락도 확인한다.

약 500케이스·기본 8열+사용자 5열 fixture에서 조회·입력·검색·복붙·저장 시간, payload 크기, 내보내기 시간·메모리를 기록한다. 임의 성능 합격 수치를 확정하지 않는다. 우선 일반 렌더링과 한 셀 편집기로 시작하고 지속 입력 지연이 확인되면 측정 근거와 함께 가상화를 별도 제안한다. TanStack Table은 가상화를 내장하지 않으므로 이번 의존성 요청에 가상화 도구는 포함하지 않는다. [TanStack 공식 가이드](https://tanstack.com/table/latest/docs/framework/react/guide/virtualization)

`pnpm check`, API 테스트, OpenAPI 재생성 비교, 승인 후 추가한 웹 테스트를 실행한다. CSS 클래스·토큰 수치·내부 상태 구조만 고정하는 테스트는 추가하지 않는다. 문구 구현 후 현재 workflow에 따라 독립 UX 검수 에이전트를 호출하고 필요한 범위만 재검수한다. 이번 설계 작업에서는 테스트·설치·DB 변경·서비스 실행을 하지 않았다.

## 11. 사용자 결정과 미정 사항

| 결정할 내용 | 추천안 | 대안·영향 |
| --- | --- | --- |
| 충돌 해결 수준 | 초안 보존·최신 내용 비교 후 필요한 입력을 수동 재반영 | 필드별 선택·구조 병합 UI는 편하지만 범위·검증 증가. 전체 강제 덮어쓰기는 기존 계약상 제외 |
| 새로고침 복구 | IndexedDB에 세션별 초안, 명시적 복원·폐기 | 메모리만 보존하면 단순하지만 새로고침 시 미저장 입력 유실 |
| 복붙·연결 열 | 텍스트·우선순위 범위 복붙, 연결은 선택 UI, 오류는 전체 거부 | 이름/ID 문자열 자동 연결은 모호성과 오연결 위험 증가 |
| 열 조작 | 순서 이동 버튼+마우스/키보드 너비 조절 | 헤더 드래그 정렬은 추가 구현·검증 필요 |
| XLSX | 서버 ExcelJS, 기본 서식, 한도 초과 시 위치 안내 후 중단 | 별도 본문 시트 분할은 출력 구조·검증 증가 |
| 검증 도구 | 기존 API node:test 유지, 웹 Playwright 추가 | 수동 검증만으로는 저장 경합·복붙·복원 회귀를 반복 확인하기 어려움 |
| 구조 승인 | `apps/api/src/sheets/`, `apps/api/src/exports/`와 공통 담당의 허용 목록 반영 | 승인 전 폴더 생성하지 않음 |

양식 초깃값·실제 응답 DTO 이름과 공개 서비스 인터페이스, 2A/2C 참조 schema는 조율 담당과 해당 기능 설계에서 맞춰야 하는 기술 미정 사항이다. DB·storage·실제 포트·CORS·의존성 버전도 조율 커밋과 실행 전 확인으로 확정한다. 이러한 기술 조율이 위 제품 선택을 바꾸면 변경점을 다시 사용자에게 제시한다.

2026-10-15 사용자는 위 추천안, 두 제품 폴더 생성, 조율 담당의 허용 목록 반영과 이 전용 브랜치로 설계 문서를 푸시하는 것을 승인했다. 공통 DTO·schema·migration·SDK·의존성·라우트·현재 공통 문서의 소유권은 유지한다. 공통 담당이 선행 변경과 경로 승인을 반영하면 그 커밋을 수용하고 2B 구현을 시작한다. 추가 구현 승인 질문은 필요하지 않으며, 승인 범위를 바꾸는 새로운 결정만 별도로 제시한다.

## 12. 2A 업로드 상세 연결을 위한 기술 조율안

2026-10-15 조율 담당의 요청에 따라 승인된 업로드→시트 생성·편집 흐름을 구체화한다. 기능 범위·대기 조건은 유지한다. 아래 필터·props·최종 DTO 이름은 공통 커밋에 반영할 기술 제안이며 아직 실행 가능한 API나 구현된 컴포넌트가 아니다.

### 시트 목록과 생성

- `listSheets`: `GET /api/v1/projects/{projectId}/sheets?uploadId={uuid}&limit=50&cursor=...`. uploadId는 선택적 단일 UUID 필터다. 지정하면 해당 프로젝트·업로드에 연결된 시트만 반환한다. 생략하면 빈 시트와 모든 업로드 연결 시트를 포함한 프로젝트 목록이다. null·특수 문자열 필터나 여러 업로드 필터는 추가하지 않는다.
- 응답은 `{items: SheetSummary[], nextCursor: string|null}`이며 기존 기본 50·최대 100, 생성 시각/UUID 내림차순 페이지 규칙을 따른다. 필터 적용 후 페이지를 나누고 query key·페이지 커서 상태는 projectId/uploadId별로 분리한다.
- projectId/uploadId의 UUID 형식 오류는 400, 프로젝트가 없거나 지정 업로드가 없거나 다른 프로젝트 소속이면 404다. 존재하는 업로드에 연결된 시트가 없으면 200의 빈 items다. 필터는 관련 시트 목록 조회를 구체화하며 새로운 제품 기능이 아니다.
- `createSheet`: `POST /api/v1/projects/{projectId}/sheets`, body는 기존 CreateSheetDto의 `{name: string, kind: "unit"|"integration", uploadId?: string|null}` 그대로다. 업로드 상세는 uploadId를 명시하고 빈 시트 생성은 생략 또는 null을 사용한다. kind와 이름은 사용자가 선택·입력한다.
- 성공은 201의 SheetSnapshot이며 2A가 소비할 최소 필드는 `id, projectId, name, kind, uploadId, contentRevision, viewRevision, createdAt, updatedAt`다. 기존 설계대로 columns/cases/view도 반환한다. 표시 참조 목록의 정확한 응답 필드명은 공통 담당이 2A/2C와 고정한다.
- 생성은 양식 사본을 만드는 동작이다. 기존 업로드 파일·원본 양식·기존 시트를 변경하지 않고 AI를 실행하지 않는다. 2A는 생성 성공 후 반환된 projectId/id로 편집기로 이동한다. POST 자동 재시도 금지와 결과 불명확 시 목록 확인 규칙을 유지한다.
- operationId는 실제 기존 API의 `createProject/listProjects/getProject/updateProject` 명명과 맞춰 6절처럼 `createSheet/listSheets/getSheet/updateSheetContent/updateSheetView/exportSheetXlsx`로 정리했다. 앞서 제안했던 sheets 접두어 형식은 이 기술 조율안으로 대체하며 실제 명세·SDK 등록은 공통 담당이 한다.

### 편집기 경로와 page 진입

- 승인된 편집기 경로 `/projects/$projectId/sheets/$sheetId`를 유지한다. 2A가 생성 후 이 경로로 이동할 때 uploadId를 중복 전달할 필요가 없다. 실제 uploadId는 시트 조회 응답을 따른다.
- page props 제안은 `projectId?: string`, `sheetId?: string`, `onOpenSheet: (target: {projectId: string; sheetId: string}) => void`다. 루트 `/` 진입은 두 ID를 생략해 프로젝트·시트 선택을 제공하고, 편집기 라우트 adapter는 두 ID를 전달한다. sheetId만 전달하는 진입은 허용하지 않는다.
- page에서 시트 선택·생성이 성공하면 onOpenSheet로 대상을 전달한다. URL 해석과 navigate·라우트 등록은 공통 app/routes adapter가 맡는다. page가 app 내부를 import하거나 업로드 page를 import하지 않는다.
- 2A 업로드 상세는 공통 SDK의 listSheets/createSheet를 소비하고 공통 라우터로 이동한다. TestCaseEditorPage의 내부 상태나 시트 저장 로직을 직접 호출하지 않는다. 실제 내보낸 props 타입과 adapter는 공통 담당이 본 계약을 수용한 뒤 각 소유 경로에서 맞춘다.

미정 제품 요구를 추가 확정하지 않았다. 양식 초깃값·트랜잭션 읽기 인터페이스, 실제 schema·DTO 응답 필드, 실행 환경은 계속 공통 선행 작업이다.
