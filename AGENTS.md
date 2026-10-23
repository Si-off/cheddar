# Cheddar 에이전트 지침

Cheddar는 사람이 수행하는 QA 테스트 케이스를 AI로 생성·편집·공유·XLSX 내보내기 하는 제품이다. Figma 플러그인이 프레임을 업로드하고, 웹에서 생성·편집하며, 백엔드가 저장과 AI 실행을 맡는다. 모든 문서와 UI 문구는 한국어로 쓴다.

## 구조와 명령

- `apps/web` 웹(React·Vite·Tailwind·TanStack·Zustand, FSD), `apps/figma-plugin` 플러그인(`main/` 실행 코드, `protocol/` 메시지 계약, `ui/` React), `apps/api` 백엔드(NestJS·Drizzle·PostgreSQL), `packages/ui` 공통 컴포넌트(shadcn/Base UI), `packages/design-tokens` 토큰.
- Node는 `.nvmrc`, pnpm은 `package.json#packageManager`로 고정. 설치·실행·환경변수는 [README](README.md).
- 검증: `pnpm check`(= lint → typecheck → build). API 테스트 `pnpm test:api`. 웹 e2e `pnpm --filter @cheddar/web test:e2e`.
- `shared/api/generated/`는 `pnpm gen:api:*`로 생성한다. 직접 편집하지 않는다.
- 임시 파일·로그·스크린샷은 저장소 밖(OS 임시 경로)에 둔다.

## 역할 분담

| 영역 | 구현 | 리뷰 |
| --- | --- | --- |
| UI 전체: `apps/web`, `apps/figma-plugin/src/ui`, `packages/ui`, `packages/design-tokens`, `DESIGN.md` | **Claude** | Codex는 로직·접근성·회귀만. 시각·레이아웃·카피 톤은 다루지 않음 |
| `apps/api`, DB 스키마·마이그레이션, OpenAPI 계약 | Claude 또는 Codex(`/codex:rescue`) | `/codex:review` |
| 조사·디버깅·리팩터링 | 둘 다 | `/codex:adversarial-review` |

- Codex에 위임하는 작업은 UI 마크업·스타일·레이아웃·문구를 변경하지 않는다. 필요하면 보고만 한다.
- UX 문구를 추가·변경·삭제한 작업은 커밋 전에 `.codex/agents/ux-writing-review.toml` 에이전트로 검수한다. 기준은 [UX 문구 정책](docs/ux-writing.md).

## 읽을 문서

판단이 필요할 때만 읽는다. 매 세션 전부 읽지 않는다.

- 제품 범위·업무 모델·미정 사항, 기능 명칭(프로젝트, 테스트 세트, 테스트 케이스, 확인 필요, 기능 그룹, 필수 케이스, 표와 캔버스 보기 등) → [docs/product.md](docs/product.md)
- 구성요소 경계·기술 선택·소스 경로 → [docs/architecture.md](docs/architecture.md)
- UI 작업 전 → [DESIGN.md](DESIGN.md), [`packages/design-tokens/src/theme.css`](packages/design-tokens/src/theme.css)
- 사용자 노출 문구 → [docs/ux-writing.md](docs/ux-writing.md)

## 작업 원칙

- 확정 사항과 미정 사항을 구분한다. 문서에 `미정`인 내용을 임의로 확정하지 않고, 선택지·영향·추천을 제시한 뒤 사용자의 결정을 반영한다.
- 요청 범위를 지킨다. 관련 없는 정리·리팩터링·의존성 변경을 섞지 않는다.
- 확정된 동작·구조를 바꾸면 `docs/product.md`·`docs/architecture.md`도 같은 변경에서 갱신한다.
- 테스트는 사용자에게 의미 있는 동작·업무 규칙·오류 처리·버그 재발 방지 중심으로 쓴다. 구현 세부(클래스명·DOM 구조·호출 순서)를 고정하는 테스트는 쓰지 않는다. 테스트를 통과시키려고 검증을 삭제·완화하지 않는다.
- UI 변경은 실제 렌더링(브라우저·스크린샷)으로 확인한다. 코드 리뷰로 대체하지 않는다.
- 실행하지 못한 검증을 성공으로 보고하지 않는다.

## 기록

- 단일 세션 작업은 커밋 메시지와 PR로 충분하다.
- 여러 세션에 걸치는 작업만 `docs/changes/<YYYY-MM-DD-name>.md`를 [템플릿](docs/changes/_template.md)으로 만든다. 끝나면 삭제하고, 남길 결정은 product/architecture로 옮긴다.
- 세션을 넘길 때는 해당 기록의 `현재 상태`·`다음 행동`만 갱신한다.

## 커밋과 푸시

- 작은 단위로 커밋하고 현재 작업 브랜치에 푸시한다. 커밋 전 `pnpm check`와 `/codex:review`를 한 번 수행한다.
- 자신의 변경만 스테이징한다. force push·이력 재작성은 사용자가 명시적으로 요청할 때만 한다(hook이 차단한다). 배포도 사용자가 요청할 때만 한다.
- 작업이 끝나면 사용자 확인 없이 PR을 만들어 main에 병합하고, 그 작업의 로컬·원격 브랜치와 워크트리를 정리한다. 남겨 두면 다음 작업과 충돌한다. 검증이 실패했거나 병합 충돌을 풀지 못하면 병합하지 않고 보고한다.
- 이 파일·`CLAUDE.md`·`.claude/`·`.codex/`를 바꿀 때는 변경 내용과 이유를 먼저 알리고 승인받는다.
