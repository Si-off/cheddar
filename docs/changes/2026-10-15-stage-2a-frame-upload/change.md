# 작업: 2A 프레임 업로드

- 작업 ID: 2026-10-15-stage-2a-frame-upload
- 상태: 구현 중 — 사용자 계획·경로 승인 완료, 공통 변경 조율 중
- 요청 근거: 2026-10-15 사용자가 구현 계획·필요한 공통 변경·새 폴더 승인안을 먼저 정리하고 미정 사항을 함께 결정한 뒤 구현하도록 요청했다.
- 실행 범위: 2026-10-15 사용자가 직접 선택한 Frame, 구현 계획과 두 소스 폴더 생성을 승인하고 공통 변경을 조율 채팅과 협의해 구현하도록 지시했다. 검증·자신의 변경 커밋·일반 푸시를 포함한다. 공통 담당 파일·다른 worktree는 직접 수정하지 않는다. 조율 채팅과의 완료 보고·공통 변경·개발 조율 메시지는 허용되며, 다른 작업 채팅과 직접 연락·PR·병합·배포는 승인되지 않았다.
- 기준: `codex/stage-2a-frame-upload` · 최초 `4cfd066574ca97241372d3b56561fb96f0430847`, 공통 선행 `c7fb51bdd40c49318707893c308e40a5d3fa1816` fast-forward 수용
- 작업 경로: `/Users/sion/.codex/worktrees/ad36/cheddar`
- 마지막 확인: 2026-10-15

## 의도와 완료 조건

플러그인에서 프로젝트와 선택 프레임을 확인하고 이미지·데이터를 업로드한다. 웹에서 같은 프로젝트의 업로드 목록·상세를 확인하고 2B 시트로 이어간다.

- 프로젝트 목록은 기존 API를 사용한다. 이번 플러그인 범위에 프로젝트 생성·설정 기능을 추가하지 않는다.
- 완료된 묶음은 불변이며 재업로드는 새 묶음이다. 화면 ID와 Figma node ID를 혼용하지 않는다.
- 묶음은 순서 있는 프레임 목록을 보존하고 이미지·데이터 파일은 같은 프로젝트의 ready 파일만 연결한다.
- 실제 Figma → 파일 저장 → 묶음 등록 → 웹 재조회 → 시트 진입을 확인한다. 2B 미통합 상태는 연계 미확인으로 남긴다.
- 약 20프레임은 규모 검증 기준이며 업로드 개수 제한이 아니다.
- AI 실행·업로드 교체·버전 관리·공유·배포는 이번 범위 밖이다.

## 현재 확인한 상태

- 기존 프로젝트·파일 API, 생성 SDK, 공통 UI·토큰과 React/Query/Zustand 기반이 있다.
- `CreateUploadDto`는 묶음 이름과 프레임의 Figma file key/node ID·이름·크기·이미지/JSON 파일 ID를 받는다. 동일 file key/node ID 조합은 묶음 안에서 중복될 수 없다.
- 업로드 DB·응답 DTO·업무 API·SDK operation은 아직 없다. 파일 서비스는 ready 파일 조회와 다운로드를 공개한다.
- 플러그인의 main/protocol/bridge는 연결 메시지만 제공하고 업로드 화면은 안내용이다. manifest에는 실제 ID가 없고 외부 네트워크가 차단되어 있다.
- 웹은 `/`와 `/share/$shareId`만 있다. 업로드 화면·프로젝트 탐색과 시트 경로는 공통 담당의 라우트 계약이 필요하다.
- 서버 환경 검증은 명시적인 HTTP(S) Origin만 허용한다. Figma UI의 `null` Origin은 현재 허용되지 않는다.
- 준비 후 HEAD와 깨끗한 작업 트리를 재확인했다. 환경 파일·자격증명을 읽거나 복사하지 않았다.

## 결정 요청과 추천안

2026-10-15 사용자가 질문 카드에서 다음을 결정했다.

- 전체 프레임 성공 후 묶음 등록. 같은 실행에서 성공한 파일을 재사용하고 실패 항목만 재시도하며, 플러그인을 닫으면 진행 상태는 종료한다.
- 웹의 묶음 상세에서 연결된 시트 목록과 새 시트 만들기를 제공한다. 단위/통합을 선택하고 생성 후 편집기로 이동한다.

이후 사용자가 “직접 선택한 Frame만 포함하는 것으로 하고, 구현 계획과 새 폴더 두 개 생성도 승인합니다. 필요한 공통 변경은 조율 채팅과 협의해서 구현 진행해주세요.”라고 지시했다. 아래 계획을 구현하며 공통 소유 파일은 조율 담당에게 요청한다.

| 항목 | 추천안 | 영향·대안 |
| --- | --- | --- |
| 선택 대상 — 확정 | 직접 선택한 `FRAME`만 허용. 다른 유형이 섞이면 선택 수정을 안내. 자식 프레임을 자동 추가하지 않음 | 2026-10-15 사용자 직접 승인 |
| 선택·순서 | 현재 선택 목록을 확인하고 업로드 시작 시 고정. 목록에 표시한 순서를 저장 | 실행 도중 선택 변경이 진행 중 묶음을 바꾸지 않음. 수동 순서 편집은 초기 제외 |
| 부분 실패 — 확정 | 전 프레임 성공 후 묶음을 원자적으로 등록. 실패한 파일만 수동 재시도 | 2026-10-15 사용자 질문 카드 선택 |
| 재시도 수명 — 확정 | 플러그인을 열어 둔 같은 실행에서 추출 결과·확인된 파일 ID 보존 | 닫기·재실행 후 이어하기는 제외. 이미 완료된 묶음은 웹에서 확인 가능 |
| 시트 진입 — 확정 | 묶음 상세에서 연결된 시트 조회, 단위/통합을 선택해 새 시트 생성 후 편집기로 이동 | 2026-10-15 사용자 질문 카드 선택. 새 시트 이름 입력은 구현 제안 |
| 이미지·데이터 | PNG 1배율과 선택 프레임의 `JSON_REST_V1` 내보내기를 저장 | JSON은 `schemaVersion`, 출처·프레임 메타데이터, 내보내기 결과를 감싼 형식. 외부 Figma REST API·토큰 없이 플러그인에서 추출 |
| 크기 초과 | 기존 이미지 20 MiB·JSON 5 MiB를 유지하고 해당 프레임·대응 행동 표시 | 자동 축소·데이터 잘라내기로 원본을 바꾸지 않음 |
| Figma 파일 키 | 개발용 manifest에 `enablePrivatePluginApi`를 켜 자동 취득. 얻지 못하면 업로드 전 안내 | 공개 플러그인 지원은 후속. 수동 파일 URL 입력을 초기 흐름에 추가하지 않는 안 |
| 로컬 연결 | 실제 Figma ID를 반영하고 개발용 API만 `devAllowedDomains`에 추가 | 2A 전용 환경에서 Figma의 `null` Origin을 명시적으로 허용하도록 공통 담당과 구성. 이는 플러그인 신원 인증이 아님 |

실제 Figma ID·검증할 파일의 준비 상태와 조율 담당이 정할 DB·storage·포트는 구현 전 확인한다. 포트 후보는 API 3102, 웹 5175, 플러그인 UI 5178이며 아직 점유·연결을 검증하지 않았다.

## 필요한 공통 변경 요청

담당은 조율 채팅 `01a13d09-b1e9-7b31-ac07-0e6f6b3ab6f6`이다. 아래는 요청 명세이며 이 채팅에서 해당 파일을 수정하지 않는다.

| 대상 | 요청 내용 |
| --- | --- |
| `apps/api/src/contracts/uploads.dto.ts` | 생성 요청에 `clientRequestId` UUID 추가. `UploadSummaryDto`·`UploadPageDto`·`UploadDto`·프레임 응답 DTO 제공. 목록은 id/projectId/name/createdAt/frameCount, 상세는 순서 있는 프레임과 id/출처/크기/파일 ID 제공. 날짜·식별자·페이지 규칙은 기존 계약 유지 |
| `apps/api/src/database/schema.ts`, `apps/api/migrations/` | uploads/frames 테이블. 프로젝트 내 업로드 요청 키 unique, 묶음 요청 내용의 해시 보관, 프레임 UUID와 position, 같은 프로젝트 업로드·파일의 복합 FK, 묶음 내 position 및 Figma 출처 조합 unique, 프로젝트별 목록 인덱스. ready 상태·MIME 적합성은 service 검증과 기존 파일 불변 정책으로 보장 |
| 공통 오류 계약 | 같은 요청 키·같은 내용은 기존 묶음 반환, 같은 키·다른 내용은 409 `IDEMPOTENCY_CONFLICT` 제안. 같은 키 동시 요청도 한 묶음만 생성. 새로운 의도적 업로드에는 새 키 부여 |
| `apps/api/src/app.module.ts`·명세 설정 | 2A `UploadsModule` 등록. 실제 구현한 경로만 공개 명세에 포함. 공통 담당이 명세 설명·schema와 SDK 재생성 관리 |
| 두 생성 SDK·공통 API 연결 | createUpload/listUploads/getUpload operation과 응답 타입 생성. 각 앱의 API base URL·공통 client 연결. 생성 파일 직접 편집 금지 |
| 두 앱 `app/`·웹 공통 탐색 | 웹 `/projects/$projectId/uploads`와 `/projects/$projectId/uploads/$uploadId` 제안. 프로젝트 선택·목록 진입을 제공하고 페이지에 projectId/uploadId와 시트 이동 계약 전달. 2A가 전역 라우터를 수정하지 않도록 구성 |
| 2B 연계 | 같은 프로젝트 uploadId를 받는 시트 생성·연결 시트 목록 조회·편집기 이동 경로를 공통 계약으로 고정. 시트 생성·조회 로직은 2B 소유 |
| `apps/api/src/config/env.ts`·공통 요청 설정 | 2A 개발 환경에서만 `null` Origin 허용을 명시적으로 켜는 방식과 환경 예시·검증. 기본 정책은 유지하고 실제 Figma에서 확인 |
| 실행 환경 | 전용 실행 DB·storage와 테스트 실행 순서 확정. 기존 공유 테스트 DB는 advisory lock을 유지하고 순차 실행. 환경 파일·자격증명 자동 복사 금지 |
| 현재 문서 | 승인된 제품·네트워크 계약 및 아래 두 소스 폴더를 `docs/product.md`·`docs/architecture.md`에 반영. 허용 구조 변경은 사용자의 명시적 경로 승인 후에만 반영 |

새 런타임 의존성은 현재 계획에 없다. 추가 필요성이 확인되면 용도와 영향을 공통 담당에게 요청한다. 공통 UI·토큰이 부족하면 기존 요소로 먼저 구성하고 필요한 항목만 요청한다.

## 2A API·실패 처리 제안

- `POST /api/v1/projects/{projectId}/uploads`: 모든 ready 이미지/JSON 파일의 프로젝트·MIME·존재와 프레임 입력을 검증한 후 한 트랜잭션으로 묶음·프레임을 저장한다. 신규는 201, 동일 요청 재조회는 200을 제안한다.
- `GET /api/v1/projects/{projectId}/uploads`: 기존 cursor/limit 규칙으로 최신 묶음부터 반환한다.
- `GET /api/v1/projects/{projectId}/uploads/{uploadId}`: 같은 프로젝트의 완성된 상세만 반환한다. 없는 자원·다른 프로젝트 자원은 404다.
- 요청 해시는 이름과 순서 있는 프레임 입력 전체를 대상으로 안정적으로 계산한다. 실패한 트랜잭션은 묶음을 남기지 않는다. 등록 응답 유실 시 같은 키·같은 입력으로 재시도한다.
- 파일 업로드는 기존 단일 파일 API를 사용한다. 성공 응답을 받은 파일만 재사용한다. 단일 파일 응답 유실은 성공 여부가 불명확하므로 완료됐다고 표시하지 않는다. 필요 시 해당 바이트를 다시 보내며 참조되지 않은 ready 파일은 자동 삭제하지 않는다.
- 프레임 추출은 순차 처리하여 한꺼번에 모든 이미지 바이트를 만들지 않는다. 선택·메타데이터를 고정하고 추출 중 문서 변경이 결과를 섞지 않도록 감지·중단한다. 제한 초과·노드 삭제·export 실패를 해당 프레임에 연결한다.
- 묶음 등록 전에는 웹 업로드 목록에 노출되지 않는다. 파일 자체의 보존·삭제 정책은 기존 계약을 따른다.

## 새 폴더 승인안

| 정확한 경로 | 목적·예정 파일 | 영향 |
| --- | --- | --- |
| `apps/api/src/uploads/` | `uploads.module.ts`, `uploads.controller.ts`, `uploads.service.ts`, `uploads.repository.ts` | 업로드 묶음 생성·조회. 기존 files/projects 공개 서비스와 공통 DB schema 사용. `dto/` 등 추가 내부 폴더 없음 |
| `apps/web/src/pages/project-uploads/` | 목록·상세 페이지와 이 화면에만 필요한 업로드·시트 진입 UI 파일을 같은 폴더에 배치 | 공통 라우트에서 연결. 업무 상태는 페이지 안에서 관리하고 추가 FSD 슬라이스·세그먼트 없음 |

기존 승인 폴더에서 수정할 2A 경로는 플러그인 `src/main/`, `src/protocol/`, `src/ui/pages/frame-upload/`, `src/ui/shared/lib/figma-bridge.ts`, `manifest.json`과 `apps/api/test/uploads.test.ts`다. 필요한 소스 파일은 기존 폴더에 평평하게 추가한다.

이 작업 기록 폴더는 기존 `docs/changes/<change-id>/` 규칙으로 생성했다. 위 두 소스 폴더는 2026-10-15 사용자가 명시적으로 승인했다. 조율 담당에게 `docs/architecture.md`의 허용 목록에 두 경로만 반영하도록 요청했다.

## 구현 순서와 검증

1. 사용자 결정·소스 폴더 승인을 기록한다. 공통 담당의 schema/DTO/모듈 연결·환경·SDK 전달 커밋과 2B 연결 계약을 확인한다.
2. 업로드 service/repository/controller 및 `uploads.test.ts`를 구현한다. 원자적 등록·불변 조회·동시 중복 방지·잘못된 파일 연결을 검증한다.
3. 플러그인 protocol/main에서 선택 목록·이미지/JSON 추출을 구현하고 bridge/UI에 프로젝트·이름·선택 확인·진행·실패·재시도를 연결한다.
4. 웹 목록·상세와 프레임 이미지·데이터 확인, 기존 시트/새 시트 진입을 구현한다. Query는 서버 상태, 로컬 상태는 진행 중 업로드·입력·선택을 담당한다.
5. 공통 담당이 실제 경로의 OpenAPI·두 SDK를 재생성하고 앱 연결을 반영한다. 순환 의존이 없도록 API → 명세/SDK → 앱 연결 순서로 통합한다.
6. `pnpm check`, 실제 DB/HTTP 업로드 테스트와 기존 API 회귀, OpenAPI 일치·SDK 요청을 확인한다. 테스트 DB는 조율된 순서로 실행한다.
7. 실제 Figma ID·파일과 로컬 환경으로 선택 변경·빈 선택·비대상 선택·export 실패·크기 제한·서버 장애·응답 유실·재시도·재조회 및 약 20프레임을 확인한다. 브라우저에서 프로젝트 전환·목록/상세·이미지/JSON·시트 이동·키보드·접근성 동작을 확인한다.
8. UI·오류 문구 변경 완료 후 workflow의 지정 독립 UX 문구 검수를 수행하고 지적·재검수 결과를 반영한다. 실행 UI 검증과 코드 문구 검수를 구분한다.
9. 자신의 diff·신규/무시 산출물 경로를 확인하고 기능 단위로 검증·커밋·일반 푸시한다. 공통 변경·2B 의존·미확인 사항을 인계한다.

명세·SDK는 업무 controller가 있어야 실제 경로를 생성할 수 있으므로, 공통 schema/DTO 선행과 API 구현 후 명세/SDK 갱신을 별도 통합 단계로 관리한다. 테스트·스크린샷·로그·임시 fixture는 저장소 밖 OS 임시 경로를 사용한다.

## 근거와 진행

- 메시지 권한: 2026-10-15 조율 채팅 `01a13d09-b1e9-7b31-ac07-0e6f6b3ab6f6`의 실제 사용자 메시지를 `read_thread`로 확인했다. 사용자는 2A·2B·2C의 완료 보고를 받아 개발을 조율하도록 요청하고, 조율 메시지를 주고받으라는 지시의 전송을 명시적으로 허용했다. 실제 완료 또는 공통 변경으로 진행이 막힐 때 조율 채팅에 보고한다. 수신 확인만으로 메시지를 보내지 않으며, 미정 사항·폴더 승인 대기는 유지한다.
- [Figma fileKey](https://developers.figma.com/docs/plugins/api/figma/): private API 설정·지원 조건.
- [Figma manifest](https://developers.figma.com/docs/plugins/manifest/): 개발용 네트워크와 `enablePrivatePluginApi`.
- [Figma exportAsync](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/): PNG·JSON 내보내기.
- [Figma network requests](https://developers.figma.com/docs/plugins/making-network-requests/): 플러그인 iframe Origin과 네트워크 허용.
- 위 공식 문서는 2026-10-15 설계 시 확인했다. 실제 로컬 Figma 연결은 아직 검증하지 않았다.
- 설계 턴 수행: 읽기 전용 코드·문서 조사와 본 계획 기록. 당시에는 제품 구현·환경 구성·실행 검증을 하지 않았다.

## 2026-10-15 API 선행 구현·검증

- 사용자 승인 이후 공통 담당에게 DTO/schema/환경·라우트·SDK/2B 연결을 요청했고, 공통 선행 `c7fb51b`를 기존 2A 변경을 보존하며 수용했다. 공통 파일은 직접 수정하지 않았다.
- API 소유 경로의 UploadsModule/controller/service/repository, `uploads.test.ts`를 구현했다. 파일 상태·MIME·프로젝트 소속을 확인하고 묶음·프레임을 트랜잭션으로 등록한다. 요청 키 동시 경합은 INSERT conflict 대기 후 완성된 기존 묶음을 조회한다. 요청 해시는 이름·명시 프레임 필드 순서만 사용하고 UUID 철자는 소문자로 정규화한다.
- `pnpm --filter @cheddar/api typecheck`와 API 빌드 통과. 소유 파일 Biome 검사 및 diff 공백 검사 통과.
- 조율 담당이 배정한 테스트 DB 슬롯에서 `pnpm test:api` 전체 24개 통과(기존 18개와 업로드 6개). 실제 PostgreSQL/HTTP, 전부 성공 후 공개·입력 순서·동일키 재시도/동시 경합·다른 내용409·잘못된 소속/pending/MIME rollback·동일 시각 커서·새 앱 pool 재조회와 원본 바이트 보존을 확인했다.
- 테스트는 기존 1단계 제외 환경 파일을 프로세스로만 읽었다. 복사·출력하지 않았으며 DB 이름/role/비superuser 확인과 advisory lock을 유지했다. 자기 실행 UUID 행·OS 임시 파일만 정리하고 앱/pool을 닫은 뒤 슬롯을 반환했다. 실행 DB migration·상시 서버는 아직 시작하지 않았다.
- API 독립 UX 검수에서 충돌 시 기존 등록 상태를 명시하라는 1건을 반영했다. 수정 문구 “이 업로드 요청은 다른 내용으로 이미 등록되었습니다. 웹에서 등록된 묶음을 확인해주세요.”를 같은 에이전트가 재검수해 문제 없음을 확인했다. 프런트 UI 문구는 후속 검수 대상이다.
- 플러그인 직접 선택/고정·PNG/JSON 추출·문서 변경 감지와 파일별 재시도, 웹 목록·상세·시트 연결 UI는 구현 중이다. main/업로드 세션 동작 테스트 6개가 통과했다. 실행 명령은 `node --test apps/figma-plugin/src/main/index.test.mjs apps/figma-plugin/src/ui/pages/frame-upload/upload-session.test.mjs`다.
- 주어진 Figma 파일은 사용자가 편집 권한이 없다고 확인했다. 같은 읽기 전용 추출을 Dev Mode inspect에서도 지원하도록 manifest를 확장했다. 사용자에게 실제 ID 생성법을 안내했으며 ID는 아직 준비되지 않았다. 실제 Figma 실행은 미검증이다.
- 데이터 파일 형식: UTF-8 JSON `{schemaVersion:1,source:{figmaFileKey,figmaNodeId},frame:{nodeId,name,width,height},exportedAt,document:<JSON_REST_V1 결과>}`. 선택 Frame의 하위 구조를 포함하며 외부 REST API/인증 토큰은 사용하지 않는다.
- 남은 일: API 커밋 전달 → 공통 모듈/명세·SDK·라우트/환경 통합 → 전체 타입·빌드·브라우저/규모·UX 검증 → 실제 Figma ID 준비 후 실행 검증. UI는 아직 없는 SDK operation을 소비하도록 작성 중이므로 현재 전체 앱 타입 검사가 완료됐다고 보고하지 않는다.
