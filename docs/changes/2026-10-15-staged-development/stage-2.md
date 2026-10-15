# 2단계 병렬 작업 인계

- 조율·공통 파일 담당: 이 작업의 조율 채팅 `01a13d09-b1e9-7b31-ac07-0e6f6b3ab6f6`.
- 요청 근거: 사용자가 최신 main과 1단계 통합·검증, 이 채팅의 공통 파일 담당, 2A·2B·2C 별도 worktree 채팅 생성을 지시했다. 실제 구현은 각 채팅에서 사용자가 시작을 지시한다.
- 추가 승인: 로컬 main의 미푸시 커밋 `b5754b2`도 통합·푸시에 포함하도록 사용자가 명시했다.
- 코드 기준: `codex/staged-development`의 `66df233a8e0c4d85a60cb7ab6b5d98b7b86bec8a`. 원격 main `04c06c3`, 로컬 main `b5754b2`, 1단계 `64dba21`을 포함한다. 이후 인계 문서 커밋은 코드 계약을 변경하지 않는다.
- 현재 단계: 통합 검증 후 준비 전용 채팅 생성. 새 채팅의 생성은 기능 구현·서비스 실행·DB 변경 승인으로 취급하지 않는다.

## 읽을 자료

현재 AGENTS.md가 안내하는 작업 절차, docs/product.md, docs/architecture.md를 따른다. 상세 계약은 [1단계 설계](../2026-10-15-stage-1-foundation/design.md) 4~7절과 [구현 인계](../2026-10-15-stage-1-foundation/change.md), apps/api/openapi.json, apps/api/src/contracts/, apps/api/test/contracts.test.ts에 있다. 원래 제품 요구는 [requirements.md](requirements.md)에 있다.

공통 UI는 현재 DESIGN.md와 packages/ui/README.md를 따른다. 과거 디자인 시안 이미지는 업무 화면 구현 명세가 아니다. 데이터 모델과 화면 표현을 분리한다.

## 담당 경계

| 담당 | 소유 범위 | 완료 기준과 의존 관계 |
| --- | --- | --- |
| 조율 채팅 | API contracts/database/migrations/storage/common/config/projects/files/health/scripts, app.module.ts, openapi.json, 공통 API 테스트, 모든 package.json·lockfile·workspace/빌드 설정, 두 생성 SDK, 두 앱 app/·공통 API 연결·설정, packages/ui·design-tokens, README·현재 제품/구조 문서 | 공통 계약·schema·의존성·라우트 변경을 순서대로 반영하고 커밋으로 전달. 다른 채팅은 이 파일을 직접 수정하지 않는다. |
| 2A 프레임 업로드 | apps/api/src/uploads/, apps/api/test/uploads.test.ts, 플러그인 src/main/·src/protocol/·src/ui/pages/frame-upload/·src/ui/shared/lib/figma-bridge.ts·manifest.json, 웹 src/pages/project-uploads/ | 프로젝트 선택, 선택 프레임 확인, 이미지·데이터 파일과 업로드 묶음 등록, 웹 목록·상세. 실제 Figma 실행과 오류·재시도 확인. 시트 진입은 2B 계약 소비. |
| 2B 시트 편집·내보내기 | apps/api/src/sheets/·src/exports/, apps/api/test/sheets.test.ts·exports.test.ts, 웹 src/pages/test-case-editor/·src/widgets/test-case-table/·src/entities/test-case/ | 빈 시트·양식 복사, 케이스/열 편집, 자동 저장·충돌 시 입력 보존, 복붙·키보드·상세 패널, XLSX 내용 검증. 프로젝트 양식은 2C 계약 소비. |
| 2C 프로젝트 설정·IA | apps/api/src/ia/·src/templates/, apps/api/test/ia.test.ts·templates.test.ts, 웹 src/pages/project-settings/ | IA 수작업 관리·유일한 화면 ID·참조 일관성, 기본 양식 편집. 양식 변경이 기존 시트를 바꾸지 않음. AI 파일 분석은 3B 이후이며 이번 준비에서 구현하지 않는다. |

표의 경로는 담당 범위를 정한 것이며 미승인 폴더 생성을 허용하지 않는다. 현재 architecture.md에 없는 새 경로 및 내부 세그먼트는 각 작업의 설계에서 목적·영향과 함께 제시하고 사용자 승인 후 추가한다. 공통 파일 담당 지정 자체는 지침·폴더 정책 변경의 포괄 승인이 아니다.

후속 기능 API는 아직 구현되지 않았다. 지금 제공하는 실제 API는 프로젝트·파일·health이며 업로드/시트/IA/양식은 DTO·설계 계약이다. 기능 채팅은 다른 기능 API를 복제 구현하지 않고, 필요한 공통 응답 DTO·schema·migration·모듈 등록·SDK·의존성 변경을 자기 설계에 정리한다. 조율 채팅이 이를 읽고 공통 변경을 먼저 반영한 뒤 기능 작업에서 그 커밋을 사용한다. 초기 양식 제공 계약은 2B·2C가 동일하게 소비하도록 먼저 통합한다.

## 준비 턴과 실행 환경

1. 자신의 worktree·HEAD·상태를 읽기 전용 확인한다. 기준 커밋이 포함돼 있어야 한다.
2. detached HEAD이면 자기 전용 브랜치를 생성하는 준비 작업만 허용한다. 권장 이름은 2A codex/stage-2a-frame-upload, 2B codex/stage-2b-sheet-editor, 2C codex/stage-2c-project-settings다. 이름이 사용 중이면 덮어쓰지 않고 충돌을 보고한다.
3. 관련 문서·계약을 읽고 범위, 미정 사항, 필요한 공통 변경·새 경로를 간결하게 보고한 뒤 종료한다. 파일 구현·의존성 설치·DB 변경·서비스 시작·외부 호출을 하지 않는다.
4. 사용자 시작 지시 후에도 새로운 제품 결정·미승인 경로는 해당 절차를 따른다. 시작 지시와 설계 승인 범위를 구분한다.

새 worktree에 환경 파일이나 자격증명을 자동 복사하지 않는다. 구현 시작 시 조율 담당이 DB·storage·포트 사용을 정한다. 기존 runtime DB를 여러 기능이 임의 변경하지 않는다. 1단계 테스트는 cheddar_stage1_test DB 이름·role을 검증하고 advisory lock으로 동시 실행을 막으므로, 현재 테스트는 순차 실행한다. 별도 테스트 DB 지원이 필요하면 조율 담당이 안전 검증을 유지한 채 설정을 변경한다. 로컬 서버 포트 후보는 2A 3102/5175/5178(API/web/plugin UI), 2B 3103/5176, 2C 3104/5177이며 실제 사용 전 점유 여부와 CORS를 확인한다. 지금은 서버를 시작하지 않는다.

## 메시지와 인계

현재 요청은 새 채팅 생성과 공통 파일 담당 지정이다. 채팅 간 자동 메시지·답장에 대한 별도 허용은 아직 없다. 각 채팅은 공통 변경 요구를 자기 보고에 남기며 조율 채팅이 상태와 내용을 읽는다. 다른 채팅의 worktree를 수정하거나 메시지를 보내지 않는다. 사용자가 이후 상호 메시지를 허용하면 그 범위에서 협의한다.

기능 작업의 완료 보고에는 커밋·원격 반영, 검증 결과, 필요한 공통 변경·통합 순서와 미확인 사항을 남긴다. UX 문구 변경은 현재 workflow.md의 독립 검수 절차를 따른다. 제품 요구 변경과 LangGraph 상세 결정은 채팅 간 기술 합의로 대신하지 않는다.

## 통합 검증

Node 24.22.0·pnpm 12.11.2에서 frozen-lockfile 설치, pnpm check, 실제 PostgreSQL/HTTP 및 양쪽 생성 SDK 테스트 16개, OpenAPI 재생성 일치 검사를 통과했다. 테스트 환경 값은 기존 1단계 Git 제외 파일에서 프로세스 환경으로만 읽었고 복사·출력하지 않았다. 테스트 fixture는 OS 임시 경로에서 정리했다. 디자인 HTML 5.2 MiB가 Biome 기본 검사 크기를 넘는 기존 경고 1건은 남아 있다. 업무 UI·실제 Figma·AI 기능 검증 완료를 뜻하지 않는다.
