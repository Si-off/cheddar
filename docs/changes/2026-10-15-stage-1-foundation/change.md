# 작업: 1단계 백엔드 기반·공통 계약 구현

- 작업 ID: 2026-10-15-stage-1-foundation
- 상태: 구현·검증·원격 푸시 완료 — 2026-10-15 조율 채팅에서 원격 64dba21 확인
- 요청과 결정의 근거: 사용자가 2026-10-15 이 채팅에서 “당신이 모든 설계를 진행하고 제가 확인 후 피드백 또는 승인해서 작업을 실시”하도록 요청했다.
- 실행 범위: 2026-10-15 사용자가 설계안을 승인하고 1단계 백엔드 개발을 명시적으로 지시했다. 설계의 경로·전용 DB·저장·검증·브랜치 절차를 수행하며, 검증 후 자신의 변경을 커밋·일반 푸시한다. PR·병합·배포·채팅 간 메시지 전송은 승인 범위가 아니다. 디자인 시안 이미지는 구현에 참고하지 않는다.
- 기준 브랜치·커밋: `codex/stage-1-foundation-implementation` · `e1e059bc62d317b5d904ae0935754faef45fe8cb` (원격 main을 fetch해 확인). 준비 브랜치의 디자인 커밋은 포함하지 않았다.
- 작업 경로: `/Users/sion/.codex/worktrees/6615/cheddar`
- 인계 근거: 공유 Git 객체 `4799dcb`의 `docs/changes/2026-10-15-staged-development/{change,requirements,stage-1}.md`
- 마지막 확인 일자: 2026-10-15

## 의도와 범위

후속 구현이 서로 다른 데이터·API·저장 규칙을 만들지 않도록 1단계의 설계와 실행 경계를 검토 가능한 상태로 만든다.

- [설계안](design.md): 서버·데이터·API·저장·경로·검증·후속 소유권 제안.
- 이번에 구현한 범위: 서버 기반, 프로젝트 저장, 기본 파일 저장·조회, OpenAPI/SDK 연결, 후속 데이터 계약과 검증 예시.
- 후속 범위: 실제 Figma 업로드 흐름, 표 편집, IA 관리, XLSX, 플로우차트, AI 생성, 공유·배포.
- LangGraph의 그래프·분할·재시도·복구 상세는 이번에 결정하지 않는다.

## 설계 당시 확인한 상태

- 준비 브랜치를 생성했으며 설계 작성 전 작업 트리는 깨끗했다.
- `apps/api/`에는 `.gitkeep`만 있다. `pnpm-workspace.yaml`에는 아직 API 앱이 없다.
- 웹·플러그인에는 OpenAPI 타입·SDK·Query 생성 설정만 있고 실제 API 명세·생성 코드는 없다.
- 현재 `product.md`와 `architecture.md`에는 인계에서 합의한 프로젝트·시트·IA·후보·백엔드 스택 등이 아직 반영되지 않았다.
- 저장된 `origin/main` 참조는 `e1e059bc62d317b5d904ae0935754faef45fe8cb`이며 현재 HEAD에는 별도 디자인 커밋 `20136d3`, `92e9b72`가 추가로 포함된다. 이번에는 fetch하지 않았으므로 원격 서버의 최신 상태를 확인한 것은 아니다.
- DB 서버·role·Cheddar DB·TCP 권한·포트 여유·외부 저장 경로의 존재 및 쓰기 권한은 이번 설계에서 검증하지 않았다.

## 승인 대상

2026-10-15 사용자가 설계안 전체를 승인하고 1단계 개발을 지시했다. 아래 네 항목은 이번 구현의 승인 범위다.

1. 구현 범위와 데이터/API 규칙: 설계안 1~7절.
2. 새 소스·마이그레이션·테스트·산출물 경로와 `docs/architecture.md` 허용 목록 변경: 8절. 기존 정책상 경로·목적·영향에 대한 명시적 승인이 필요하다.
3. 전용 DB·로컬 영속 저장 경로·포트: 7절. 기존 DB의 초기화나 기존 사용자 데이터 삭제는 포함하지 않는다.
4. 다른 디자인 커밋을 함께 푸시하지 않는 구현 기준과 브랜치 준비: 9절.

## 구현 순서와 검증

승인 내용을 이 문서에 기록하고 현재 제품·구조 문서에 반영한다. 이후 서버·DB 기반 → 프로젝트·파일 → 계약·SDK → 실패·보존 검증 → 후속 소유권 확정 순서로 진행한다. 상세 완료 조건은 설계안 10절을 따른다.

## 구현 결과와 검증

- 구현: NestJS 12.1.3·Drizzle 0.45.4·PostgreSQL 17.11, 프로젝트 CRUD 중 생성·조회·수정, 파일 등록·조회·다운로드, 오류·revision·소속·파일 형식 검증, 상태 확인.
- 계약: `apps/api/openapi.json`, 웹·플러그인 생성 타입·Fetch SDK·Query 코드. 업로드 묶음·시트·IA는 DTO/예시만 제공하며 업무 API는 후속이다.
- DB: 전용 role `cheddar_stage1` (superuser·DB 생성 권한 없음), 실행 DB `cheddar_stage1`, 테스트 DB `cheddar_stage1_test`를 새로 구성했다. 기존 DB는 초기화하지 않았다.
- 저장: 승인된 외부 영속 루트와 `.incoming/`. pending/ready/failed로 공개 여부를 구분하고 미완료 파일을 자동 삭제하지 않는다.
- 환경: Git 제외 `.env.local`, mode 0600. 비밀번호는 로그·문서·커밋에 포함하지 않았다.
- 직접 실행 검증: `127.0.0.1:3101`에서 readiness 200, 프로젝트 생성 201, 한글 파일명 JSON 저장 201, 다운로드 바이트·SHA 일치. 서버 프로세스를 종료·재시작한 뒤 동일한 프로젝트·파일을 다시 확인했다. 검증용 프로젝트 1개와 생성 JSON 파일 1개만 정리하고 서버를 종료했다.
- `pnpm check`: lint·전체 workspace 타입 검사·빌드 통과.
- `pnpm test:api`: 실제 DB/HTTP, revision 동시 충돌, 커서 페이지, 파일 내용·한글 이름, 잘못된 형식·크기·JSON·추가 필드, 실패 주입·비공개 보장, symlink/경로 이탈, readiness 장애, 두 SDK 실제 요청, 재기동 보존, 후속 계약·환경 검증 통과. 총 16개 테스트가 통과했다.
- `pnpm --filter @cheddar/api openapi:check`: DB 접속 없이 재생성한 현재 명세와 영속 명세 일치.
- 생성된 두 SDK는 실제 서버를 대상으로 프로젝트 생성·목록, multipart 파일 등록·다운로드를 검증했다. 앱 UI 연결은 후속이다.
- 발견·수정: formatter의 type-only import 전환으로 DTO runtime metadata가 빠지던 문제를 명시적 Swagger DTO 참조로 수정했다. multipart 한글 파일명 복원과 잘못된 JSON 본문의 400 응답을 회귀 검증했다.
- 문서: 승인된 서버 경계·폴더·산출물 범위를 `docs/architecture.md`에 반영하고 `docs/product.md`, README를 갱신했다. `AGENTS.md`, workflow, 스킬·에이전트 설정은 변경하지 않았다.

## UX 문구 검수

- 지정된 독립 `ux-writing-review` 에이전트(gpt-6-luna/high, 구현 대화 비상속)가 신규 API 오류 문구와 호출 조건을 코드로 검수했다.
- 지적 1건: 일반 내부 오류에서 곧바로 재시도를 권하던 문구를 결과 확인 후 재시도하도록 수정했다. 수정 범위 재검수 결과 문제 없음.
- 유지: 파일 크기·형식 제한, 입력 확인, revision 충돌·최신 내용 확인 안내.
- 미확인: 실제 앱의 표시 위치·접근성·재시도 UI는 이번에 구현하지 않았다. 브라우저/Figma UX 검증 완료를 뜻하지 않는다.

## 경로·산출물 확인

- 소스·테스트·migration은 승인된 8절 경로에만 추가했다. Drizzle SQL·`migrations/meta/`는 영속 이력이며 API `dist/`는 제외 산출물이다.
- 설치가 처음 자동 선택했던 `node_modules/.pnpm-store/`는 이번 실행이 만든 항목임을 확인하고 제거했다. 현재 pnpm store는 `/Users/sion/Library/pnpm/store/v11`이다.
- `@scarf/scarf` 설치 스크립트는 명시적으로 실행하지 않는다. 기존 lint 규칙은 유지하며 생성 명세·Drizzle meta만 포맷 대상에서 제외하고 별도 재생성·계약 검증을 수행한다.
- 테스트 컴파일·SDK 실행·fixture는 OS 임시 경로에 만들고 해당 실행의 파일만 정리한다. 기존 worktree·디자인 파일·다른 DB 데이터는 변경하지 않았다.

## 남은 범위와 인계

- 후속 2A/2B/2C의 경로 소유권은 승인 설계 9절을 따른다. API·DB schema·migration·SDK·lockfile 공통 변경은 현재 기반 담당이 소유하며 병렬 기능 채팅은 직접 수정하지 않는다.
- 20프레임·500케이스 규모, 실제 Figma 연결·업로드, 웹 편집·한글 입력·복붙·접근성, IA·XLSX·AI·플로우는 미구현/미검증이다.
- LangGraph 상세·공유·로그인·클라우드 이전·배포는 이번에 결정하거나 실행하지 않았다.
- 구현 계약 커밋: `70ea20e652e3c6e027e5b86b4979f0aa94da1ccf`. PR·병합·배포·채팅 간 메시지 전송은 없음.

## 후속 구현에 전달할 계약

- 기준: `codex/stage-1-foundation-implementation`의 구현 커밋 `70ea20e652e3c6e027e5b86b4979f0aa94da1ccf`. 이후 문서 인계 커밋은 코드 계약을 변경하지 않는다.
- 제공 API: 프로젝트 생성·목록·조회·수정, 프로젝트 소속 파일 등록·목록·메타데이터·다운로드, liveness/readiness. 수정은 `expectedRevision`, 목록은 `limit`/`cursor`, 오류는 `error.code`/`message`/`requestId`를 사용한다.
- 명세: [openapi.json](../../../apps/api/openapi.json). 후속 업로드·시트·IA·양식 DTO는 components에만 포함되며 실제 API 경로는 아직 없다.
- 계약 예시와 유효·무효 입력: [contracts.test.ts](../../../apps/api/test/contracts.test.ts). 실제 HTTP·두 SDK 사용 예시: [api.test.ts](../../../apps/api/test/api.test.ts).
- DTO 위치: `apps/api/src/contracts/`. DB와 DTO를 직접 공유하지 않고 후속 저장 schema는 기반 담당과 조율한다. 소유권은 [설계 9절](design.md#9-브랜치-기준과-후속-소유권)을 따른다.
- 생성 SDK: 웹 `apps/web/src/shared/api/generated/`, 플러그인 `apps/figma-plugin/src/ui/shared/api/generated/`. 직접 수정하지 않고 명세에서 함께 재생성한다.
- 실행: 루트에서 `pnpm dev:api`. 현재 DB·Git 제외 환경 파일은 구성돼 있고 서버는 검증 후 종료했다. 새 worktree는 환경 파일을 따로 준비해야 한다. migration은 `pnpm db:migrate`로 명시 적용한다.
- 검증: `pnpm check`, `pnpm test:api`(16개 통과), `pnpm --filter @cheddar/api openapi:check`. 실행 환경 Node 24.22.0, pnpm 12.11.2, PostgreSQL 17.11. 실제 별도 프로세스 재시작 후 저장 보존과 SHA 일치도 확인했다.
- 통합 기준: 구현 시작점은 `e1e059b`이며 완료 시 저장된 `origin/main`은 다른 작업이 반영된 `437e1d4`다. 이번 브랜치에 그 디자인 변경을 병합하거나 참조하지 않았다. main 통합 시 현재 문서 변경을 비교해야 하며 이번에는 병합하지 않는다.

## 최초 원격 반영 시도 기록

- 대상 저장소: `https://github.com/Si-off/cheddar.git`
- 대상 브랜치: `codex/stage-1-foundation-implementation`
- 구현 커밋 후 위 작업 브랜치로 일반 푸시를 시도했으나 자동 승인 검토가 실행 전에 차단했다. 사유는 이번 소스·문서 payload와 GitHub 대상에 대한 사용자 명시적 승인 부족이다. 저장소 작업 지침의 일반 푸시 허용과 별개로 적용된 차단이며 우회하지 않았다.
- 따라서 구현은 로컬 완료이며 원격 반영은 미완료다. 사용자가 이 저장소·브랜치에 대한 변경 전송을 승인하면 커밋 목록과 대상 확인 후 일반 푸시하고 원격 SHA를 검증한다. 비밀번호·환경 파일·빌드·의존성 산출물은 스테이징에 포함되지 않았음을 확인했다.

## 후속 상태 확인

2026-10-15 사용자가 두 커밋의 푸시를 승인한 후 1단계 채팅에서 푸시를 완료했다. 조율 채팅도 원격 codex/stage-1-foundation-implementation의 64dba21 일치를 확인했다. 위 승인 대기·미완료 설명은 최초 시도 당시 기록이며 현재 상태가 아니다. 최신 통합과 인계는 [2단계 준비](../2026-10-15-staged-development/stage-2.md)를 참조한다.
