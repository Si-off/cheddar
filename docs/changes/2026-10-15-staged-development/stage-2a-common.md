# 2A 공통 선행 계약

2026-10-15 조율 worktree `codex/staged-development`, 기준 `a78834c`. 2A 실제 사용자 지시에서 직접 선택 Frame·구현 계획·두 소스 폴더 생성 승인을 확인했다. 공통 변경은 이 채팅이 담당한다.

## 반영 범위

- `CreateUploadDto.clientRequestId` UUID 필수, 묶음 이름 trim, 프레임 중복은 모호하지 않은 두 문자열 조합으로 검사한다.
- `UploadSummaryDto`·`UploadPageDto`·`UploadFrameDto`·`UploadDto` 공개 응답 계약. frames 배열 순서는 저장 position 순서다.
- DB export `uploads`·`uploadFrames`, migration `0001_neat_saracen.sql`. 요청 키는 프로젝트 안에서 unique, 파일과 업로드의 프로젝트 소속은 복합 FK/restrict로 보장한다. 파일의 ready/MIME 검사·하나 이상 프레임·불변 묶음은 서비스 책임이다.
- 2A 서비스는 trim된 name과 순서 있는 frames의 명시 필드만 일관되게 직렬화해 SHA-256으로 저장한다. clientRequestId는 해시에서 제외한다. 신규201, 동일 키·동일 입력200 기존 결과, 다른 입력409 IDEMPOTENCY_CONFLICT. 트랜잭션과 unique 경합 처리는 2A 소유다.
- OpenAPI에는 schema만 추가하고 두 SDK의 타입을 재생성했다. upload operation·module·웹 라우트는 2A 실제 controller/page 커밋 뒤 연결한다.
- 개발 opt-in `ALLOW_FIGMA_NULL_ORIGIN=true`는 `NODE_ENV=development`에서만 허용한다. 기본 차단 유지, 다른 웹 Origin은 명시 목록 유지, credentials false. 이 설정은 Figma 신원 검증이 아니다.
- architecture 허용 구조에 사용자 승인된 API uploads/와 웹 pages/project-uploads/만 반영했다. 기능 폴더의 실제 파일은2A 소유다.

## 환경·검증

Node24.22.0/pnpm12.11.2. pnpm check 통과(기존 디자인 HTML 크기 경고1건). API 실제 PostgreSQL/HTTP·두 SDK·DTO 검사18개 통과, OpenAPI 일치 통과. 초기 테스트 fixture SQL 타입 추론 오류를 수정한 뒤 재검증했다. migration을 전용 테스트 DB에 두 번 적용해 반복 안전성을 확인했다. 다른 프로젝트 연결·요청 키·프레임 순서/식별자 중복·비정상 치수·참조 삭제 차단, null Origin 기본 거부/개발 opt-in/preflight를 검증했다. 실제 Figma는 미검증이다.

실행 DB·저장소는 변경하지 않았고 상시 서버를 시작하지 않았다. 테스트는 기존1단계 제외 환경 파일을 프로세스로만 읽었고 복사·출력하지 않았다. 전용 테스트 DB는 migration0001까지 반영됐으므로 이전 migration만 가진 worktree로 실행하면 readiness가 실패한다. 테스트 슬롯은 조율 후 순차 사용한다.

2A 포트3102/5175/5178은 이번 lsof 확인에서 listener가 없었다. 실제 시작 직전 재확인한다. CORS_ORIGINS에는 http://127.0.0.1:5175,http://127.0.0.1:5178을 사용한다. 실행 DB migration·서버 시작은 실제API 통합 후 조율한다. Figma 플러그인 ID·개발 manifest·실제 iframe 실행 검증은2A 후속이다.

## 다음 연결

2B 연결 계약: listSheets의 선택적 uploadId 필터, CreateSheetDto name/kind/uploadId, 생성201 응답 projectId/id로 /projects/$projectId/sheets/$sheetId 이동. 실제 시트 경로·SDK 준비 전 임시 구현으로 대체하지 않는다.

2B ba4f211, 2C 0adfcea 승인 설계와 공통 요청을 수신했다. 업로드 공통 커밋 다음에 시트·IA·초기 양식 계약을 준비한다. PR/main 병합·배포는 수행하지 않았다.

독립 UX 검수는 a78834c 대비 env/uploads DTO와 오류 주변 코드를 확인해 문제 없음으로 보고했다. 사용자 문구는 바뀌지 않았고 Origin 허용 조건은 기존 오류 의미와 일치했다. 실제 브라우저/Figma 화면 검수는 미수행이다.

## 실제 업로드 API 통합

2A API 커밋 aae7bad를 검토해 조율 브랜치에 병합했다. UploadsModule을 앱에 등록하고 createUpload/listUploads/getUpload 실제 operation을 양쪽 SDK에 생성했다. 공통 client는 앱 provider에서 한 번 설정하며 VITE_API_BASE_URL을 사용한다. Query mutation 자동 재시도는 false다. uploads 테스트는 공통 DB helper로 전환해 새 project_templates 행까지 자기 UUID 범위로 정리한다.

통합 후 실제 DB·HTTP·양쪽 SDK 테스트30개, pnpm check, OpenAPI 일치 검사 통과. SDK로 신규201/동일재시도200/조회/목록을 추가 검증했다. 새 SDK fixture가 기존 페이지분할 사례에 영향을 주어 해당 검증 뒤로 분리했으며 기존 assertion을 완화하지 않았다. API 문구는2A의 독립검수·수정·재검수 결과를 유지했다. 이번 연결은 UI 문구를 변경하지 않았다.

2A 프런트는 아직 통합 전이다. 시트 연결은 선택적 sheetGateway(list/create) props로 분리하고 2B 실제 SDK가 준비되면 라우트 closure에서 projectId/uploadId를 주입한다. 미제공 상태에서는 시트 연결 UI를 숨기며 이 기능의 완료로 보고하지 않는다. 실제 Figma는 플러그인 ID 준비와 실행 검증이 남아 있다. 실행 DB migration·상시 서버 시작은 하지 않았다.

2C 요청에 따라 Playwright testDir를 src/pages로 넓혀 project-settings의 spec도 발견한다. 공통 검사 통과와 브라우저 검증 완료는 구분한다.

## 웹 라우트 연결

2A 프런트95b8cb2를 fast-forward로 수용했다. `/projects/$projectId/uploads`는 목록, `/projects/$projectId/uploads/$uploadId`는 상세로 연결하며 같은 프로젝트의 목록 복귀와 브라우저 히스토리를 사용한다. 상세는 projectId/uploadId 변경 시 새 인스턴스로 초기화한다. sheetGateway와 편집 경로는2B 기능 통합 때 함께 연결하며 현재 시트 UI는 숨김 상태다. 루트의 프로젝트 선택·편집 진입도2B 통합 대상이다.

라우트 연결 후 pnpm check, 플러그인 main/재시도 테스트6개, diff 검사를 통과했다. 기존 optional-chain/디자인HTML 크기 경고2건이 남아 있다. 새 UI 문구는 추가하지 않았으며2A의 독립 문구검수·gateway 조건검수 결과를 유지했다. 실제 목록→상세→뒤로/앞으로/목록 복귀와 직접 URL 새로고침은 테스트DB 슬롯을 가진2A의 브라우저 검증에서 확인한다. 아직 브라우저 검증 완료로 보고하지 않는다.

2C 로컬83c7612는 소스·테스트 전송 허용 범위를 이유로 자동 승인 검토가 푸시를 거절했고 해당 채팅에서 사용자 승인을 요청했다. 이 라우트 커밋에는2C 코드를 포함하지 않는다. 승인 전 다른 브랜치를 통한 원격 전송도 보류한다.
