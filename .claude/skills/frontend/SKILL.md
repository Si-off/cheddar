---
name: frontend
description: Cheddar의 웹·Figma 플러그인 UI와 공통 컴포넌트를 만들거나 수정할 때 적용한다. 토큰·컴포넌트 사용 규칙, 작성 순서, 렌더링 확인 절차.
---

# Cheddar 프런트엔드

## 순서

1. `DESIGN.md`로 톤앤매너와 모션 원칙을, `packages/design-tokens/src/theme.css`로 사용 가능한 토큰 이름을 확인한다. 화면 구성은 `DESIGN.md`에 링크된 화면 시안을 따른다(시안의 예시 데이터는 요구사항이 아니다).
2. 화면에 노출할 정보와 문구를 먼저 정한다(`docs/ux-writing.md` 1절·5절). 삭제 → 화면 구성으로 해결 → 필요한 문구 작성 순서로 판단하고, 제품 문구에 `·` 나열을 쓰지 않는다. 내부 처리 방식, 모델 이름, 보관 정책을 화면에 쓰지 않는다. 기능 명칭은 `docs/product.md#기능-명칭`을 따른다.
3. `packages/ui`에 있는 컴포넌트를 조합한다. 없으면 Base UI 위에 Tailwind 클래스와 cva로 `packages/ui`에 추가한 뒤 사용한다. 앱 안에 1회용 변형을 만들지 않는다. `packages/ui/src/legacy/`와 `legacy-theme.css`는 개편 전 화면 전용이며 새 코드에서 가져오지 않는다.
4. 구현 후 실제 화면을 라이트와 다크로 렌더링해 확인하고 스크린샷을 남긴다.

## 규칙

- 색·간격·radius·그림자·타이포·모션은 `theme.css` 토큰(Tailwind 테마 클래스: `bg-canvas`, `text-fg`, `border-line`, `text-body`, `shadow-popover`, `duration-base`, `ease-emphasized` 등)만 사용한다. `#hex`, `px` 임의값, `[...]` arbitrary 값을 쓰지 않는다. 데이터에 따라 바뀌는 크기(열 너비 등)만 style로 넘긴다.
- CSS 파일은 `theme.css`와 앱별 `global.css`만 둔다. 컴포넌트와 페이지별 CSS 파일을 만들지 않는다.
- 움직임은 미끄러짐, SVG 그리기, 차오름 세 가지만 쓴다. 요소 크기가 커지거나 줄어드는 애니메이션과 장식용 진입 연출은 쓰지 않는다. 시간은 `duration-fast`(120ms, hover와 피드백), `duration-base`(200ms, 상태와 선택), `duration-slow`(320ms, 행 추가와 삭제, 완료 표시)를 쓰고, motion 코드에서는 `@cheddar/ui`의 `motionTokens`를 쓴다.
- 포커스는 `global.css`의 `:focus-visible` 2px `focus-ring` 실선이 처리한다. 컴포넌트에서 포커스 표시를 지우지 않는다.
- 라이트와 다크 두 테마가 있다. 색은 의미 토큰만 쓰면 테마에 따라 바뀌므로 컴포넌트에서 테마를 분기하지 않는다. 시스템 동작 줄이기는 `global.css`와 Motion 프로바이더의 `reducedMotion="user"`가 처리하므로 컴포넌트에서 따로 분기하지 않되, 상태·선택·포커스의 의미는 움직임 없이도 전달되게 한다.
- 웹은 FSD(`app/pages/widgets/features/entities/shared`), 플러그인 UI는 `src/ui/` 아래 `app/pages/shared`. 레이어 역참조를 하지 않는다. 결합도와 응집도 규칙(도메인을 모르는 공통 컴포넌트, 조합형 props, 생성 API 타입은 entities에서 멈춤, 다른 파일이 쓰지 않는 작은 기능은 같은 파일)은 `docs/architecture.md#코드-규칙`을 따른다.
- 서버 데이터는 TanStack Query, 미저장 입력·선택·검색은 Zustand/로컬 상태.
- 표는 `@cheddar/ui`의 `DataGrid`. 긴 텍스트 셀은 줄바꿈으로 행 높이가 늘어나고, 좁은 화면은 표 내부 가로 스크롤.
- UI 테스트는 사용자 조작과 관찰 가능한 결과만 검증한다. 클래스명·DOM 구조를 고정하지 않는다.

## 렌더링 확인

- 웹: `pnpm dev:web` 후 해당 라우트를 열어 확인. Playwright(`apps/web`의 `test:e2e`)로 스크린샷을 찍을 수 있다. 스크린샷은 저장소 밖에 둔다.
- 공통 컴포넌트: 웹 개발 서버의 `/design-system.html`. 머리글의 테마 전환으로 라이트와 다크를 모두 본다.
- 플러그인 UI: `pnpm dev:plugin` 빌드 결과를 Figma 개발 manifest로 불러 확인. 불가능하면 미확인으로 보고한다.
- 확인하지 못한 화면을 확인했다고 쓰지 않는다.
