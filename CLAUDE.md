@AGENTS.md

# Claude 전용

Claude Code는 이 프로젝트의 오케스트레이터이자 프런트엔드 담당이다. Codex는 `codex-plugin-cc`로 호출한다.

## UI 작업

- 시작 전에 `DESIGN.md`와 `packages/design-tokens/src/theme.css`를 읽고, `.claude/skills/frontend`를 적용한다.
- 색·간격·radius·폰트·모션 값은 토큰만 사용한다. 원시 값과 Tailwind arbitrary 값을 넣지 않는다. 토큰이 부족하면 `theme.css`에 먼저 추가하고 `DESIGN.md`에 맥락을 한 줄 적는다.
- 공통 컴포넌트는 `packages/ui`에서 가져온다. 같은 역할의 컴포넌트를 앱 안에 다시 만들지 않는다.
- 화면 구성이 바뀌는 UI 작업은 코드 전에 시안(이미지 또는 Design 아티팩트)을 먼저 보여주고 합의한 뒤 구현한다. 시안의 모킹 데이터는 제품 요구사항이 아니다. 버튼 하나, 문구 하나 수준의 변경은 바로 구현한다.
- 완료 전에 웹은 `pnpm dev:web`을 띄워 실제 화면을 확인한다(Playwright 또는 브라우저 스크린샷). 플러그인 UI는 `/design-system.html` 또는 빌드 결과로 확인한다.
- 새 문구는 `docs/ux-writing.md` 기준으로 먼저 필요성을 판단하고, 커밋 전 UX 문구 검수 에이전트를 돌린다.

## Codex 위임

- 백엔드 구현·조사·디버깅은 `/codex:rescue --background`로 위임할 수 있다. 프롬프트에 목적, 대상 경로, 완료 조건, 그리고 **"UI 파일(`apps/web`, `apps/figma-plugin/src/ui`, `packages/ui`, `packages/design-tokens`)은 수정하지 말고 필요한 변경은 보고만 할 것"** 을 항상 포함한다.
- 커밋 전 `/codex:review`를 한 번 돌리고, 지적 사항은 반영하거나 코드·요구사항에 근거한 미반영 이유를 남긴다. 디자인·카피 톤에 대한 Codex 의견은 반영 대상이 아니다.
- 설계 판단이 갈리는 변경은 `/codex:adversarial-review`로 전제를 검증한다.
- review gate(`/codex:setup --enable-review-gate`)는 켜지 않는다.

## Hook

`.claude/settings.json`의 hook이 다음을 자동화한다. 글로 다시 확인하지 않는다.

- SessionStart: 브랜치·미커밋 변경·진행 중 작업 기록을 주입
- PreToolUse(Bash): 위험한 git 명령 차단
- PostToolUse(Edit/Write): Biome 포맷
- Stop: 변경 파일 Biome 검사, 실패 시 종료 차단
