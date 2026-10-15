# 2B·2C 공통 선행 계약

2026-10-15 `codex/staged-development`, 기준 c7fb51b. 실제 사용자 승인은 각 채팅의 추천안·폴더 승인·공통 준비 후 구현 지시에서 확인했다. 2B 설계 ba4f211, 2C 설계0adfcea를 읽고 반영했다.

## 계약과 책임

- DTO: IaItemDto/IaPageDto/ProjectTemplateDto/DeleteIaQueryDto, SheetSummaryDto/SheetSnapshotDto/SheetPageDto/SheetPageQueryDto/SheetExportQueryDto. IA PATCH는 expectedRevision 필수·나머지 선택, null은 description/parentId만. 변경 없는 PATCH는2C 서비스에서400. 이름은 trim 후 비어 있으면 거부한다.
- SheetSnapshotDto는 summary+sourceTemplateRevision/columns/cases/view/references. references.frames는 id/uploadId/figmaFileKey/figmaNodeId/name/imageFileId/dataFileId, references.iaItems는 id/screenId/name. 현재 연결의 표시값만 같은 읽기 시점으로 제공한다. 전체 선택 목록은 업로드·IA API다.
- listSheets uploadId는 선택적 단일 UUID, 프로젝트 소속 확인 후 필터→cursor/limit 적용. 없는/타 프로젝트 업로드404, 연결 없음200 빈 목록. createSheet는 name/kind/uploadId,201 snapshot. 생성 POST 자동 재시도 없음.
- DB export: iaItems/projectTemplates/sheets/sheetColumns/sheetColumnViews/testCases/testCaseValues/testCaseFrameLinks/testCaseIaLinks. migration0002. 프로젝트 소속 복합 FK·restrict, 빈 번호 제외unique, 행/열/연결 위치unique, custom열만 값 저장을 DB로 보장한다. 시스템8열 완전성·트리 다단계 순환·JSONB 양식 의미·참조 존재의 안전한 오류 매핑은 서비스가 검사한다.
- case/column UUID는 전역 식별자다. 순서·번호 교환은 최종 입력 검증 후 같은tx에서 기존 position을 사용하지 않는 양수 구간으로 옮기고 caseCode를 임시 빈값으로 바꾼 뒤 최종값을 반영한다. 살아 있는 case UUID를 삭제·재생성하지 않는다. view와 연결행은 참조를 확인하고 같은tx에서 교체할 수 있다.
- DatabaseTransaction은 database/database.service.ts export. 쓰기는 프로젝트 행FOR UPDATE→시트→IA 순서, 다중ID는 오름차순. IA/양식 변경도 프로젝트 잠금을 사용한다. 잠금 자체로 프로젝트revision을 올리지 않는다. 일관된snapshot은 repeatable-read transaction에서 읽고 XLSX 직렬화 전 끝낸다.
- 2C 소유 TemplatesRepository.readSnapshot(tx: DatabaseTransaction, projectId:string):Promise<ProjectTemplateDto>를 TemplatesModule에서 export한다. 호출자는 프로젝트잠금을 먼저 획득한다.2B는 같은tx에서 읽고 모든열UUID와 view참조를 새UUID로 치환하며 원본revision을보관한다. 공통에서2C repository를 대신 구현하지 않는다.
- 프로젝트 생성과 초기 양식은 공통 ProjectsRepository에서 한tx로 저장한다. 기존프로젝트는migration으로 누락분만 보충한다. GET 생성부작용 없음. 초기8열 이름은 케이스 번호/제목/사전조건/수행 단계/기대 결과/우선순위/관련 프레임/IA 화면, 너비180. 기존 시스템열UUID/field 유지, 새시트복사만 새UUID.
- 오류는 기존 ApiError 경계를 사용한다. REVISION_CONFLICT409 details:{resource:'content'|'view',currentRevision}, IA는currentRevision. SCREEN_ID_CONFLICT409, REFERENCE_IN_USE409, EXPORT_LIMIT_EXCEEDED422. 오류값에는 원본입력·SQL을 넣지 않고 필드/종류/안전한위치만 넣는다. 기능서비스가 분류하고 공통filter는 ApiError를 그대로 전달한다.413 FILE_TOO_LARGE 기존코드유지. 문구는기능검수 대상이다.

## 경로·의존성·통합

architecture에 승인된 API `sheets/`, `exports/`, `ia/`, `templates/` 및 웹 `project-settings/`를 추가했다. 내부 하위 폴더로 범위를 확대하지 않는다.

웹 `@tanstack/react-table@8.21.3`(MIT), API `exceljs@4.4.0`(MIT), 웹 개발 `@playwright/test@1.64.0`(Apache-2.0)을 고정했다. Node 24/React 19 호환 범위를 확인했다. Table은 v8의 useReactTable API를 사용한다. 설치 도구가 1.64.1에 자동 추가한 출시 대기 예외는 제거하고 기존 정책을 충족하는 1.64.0으로 lockfile을 재생성했다. 공급망 설정을 완화하지 않았다. ExcelJS의 전이 의존성 deprecated 경고는 남아 있다.

Playwright는 기존 page의 *.spec.ts를 찾고 단일 worker, retry 0, list 출력을 사용한다. outputDir은 OS 임시 폴더다. 브라우저 설치 시 PLAYWRIGHT_BROWSERS_PATH도 OS 임시 경로로 지정한다. 설정은 서버를 자동 시작하지 않는다. 실제 브라우저·업무 API 검증은 2B 후속이다.

공통 DTO만 OpenAPI schema와 양쪽 SDK 타입으로 생성했다. 기능 controller를 받은 뒤 실제 operation을 생성한다. 2B·2C는 API 커밋을 먼저 전달하고 후속 SDK 커밋으로 UI를 연결한다. 라우트는 page 완성 후 공통에서 연결한다. 2A 연결은 stage-2a-common.md를 따른다.

## 테스트 환경과 검증

`test/database.ts`의 `openTestDatabase()`는 config/database/lock/projects/folder/close를 반환한다. 로컬 전용 DB 이름·role·비superuser·DB 소유자와 runtime DB 분리를 확인하고 기존 advisory lock 31015432를 획득한다. migration 반복 적용·hash 일치를 검사한다. projects 배열에는 자기가 생성한 UUID만 등록한다. app.close 후 lease.close로 자기 프로젝트의 하위 데이터와 임시 저장소를 정리한다. DB 전체 초기화는 하지 않는다. API runner의 test-concurrency=1을 유지하며 별도 프로세스의 실행 슬롯은 조율한다.

Node 24.22.0/pnpm 12.11.2에서 실제 DB·HTTP·DTO 테스트 23개, pnpm check, OpenAPI 일치, frozen-lockfile 설치를 통과했다. 기존 디자인 HTML 크기 경고 1건이 남아 있다. 신규 검증은 아래와 같다.

- 기본 양식 초기화, 누락 보충 반복, 편집 양식 보존과 독립 UUID.
- IA 대소문자·중복·타 프로젝트 부모·자기 참조 차단.
- 케이스 소속·번호·순서 교환, 같은 시트의 custom 열 값, IA 참조 삭제 제한.
- IA PATCH의 생략·null 구분과 목록·내보내기 query 검증.
- ExcelJS CommonJS 텍스트 XLSX 왕복, TanStack v8 API import, Playwright CLI 로딩.

독립 UX 검수는 c7fb51b 대비 기본 열 이름·DTO 조건·backfill을 확인해 문제 없음으로 보고했다. 실제 설정·편집 UI와 기능 API 검증은 후속이다. 실행 DB를 변경하거나 상시 서버를 시작하지 않았다. 테스트 DB만 0002까지 적용했으므로 이전 schema로 실행하지 말고 이 커밋을 먼저 수용한다.

2B 포트 3103/5176, 2C 3104/5177은 시작 직전 점유를 확인하고 해당 웹 Origin을 CORS에 추가한다. 환경 파일·자격증명을 복사하거나 출력하지 않는다. 2A API aae7bad를 수신했으며 이 공통 커밋 뒤 통합한다. PR/main 병합·배포는 수행하지 않았다.
