---
name: frontend
description: Cheddar의 웹·Figma 플러그인 UI와 공통 컴포넌트를 만들거나 수정할 때 적용한다. 토큰·컴포넌트 사용 규칙, 작성 순서, 렌더링 확인 절차.
---

# Cheddar 프런트엔드

## 순서

1. `DESIGN.md`로 톤앤매너와 모션 원칙을, `packages/design-tokens/src/theme.css`로 사용 가능한 토큰 이름을 확인한다.
2. 화면에 노출할 정보와 문구를 먼저 정한다(`docs/ux-writing.md` 1절·5절). 삭제 → 화면 구성으로 해결 → 필요한 문구 작성 순서로 판단하고, 제품 문구에 `·` 나열을 쓰지 않는다. 기능 명칭은 `docs/product.md#기능-명칭`을 따른다.
3. `packages/ui`에 있는 컴포넌트를 조합한다. 없으면 shadcn/Base UI 기반으로 `packages/ui`에 추가한 뒤 사용한다. 앱 안에 1회용 변형을 만들지 않는다.
4. 구현 후 실제 화면을 렌더링해 확인하고 스크린샷을 남긴다.

## 규칙

- 색·간격·radius·그림자·타이포·모션은 `theme.css` 토큰(Tailwind 테마 클래스)만 사용한다. `#hex`, `px` 임의값, `[...]` arbitrary 값을 쓰지 않는다.
- 선택·상태 반응은 조작 영역을 유지하고 내부 색·채움·선으로 표현한다. 사이드바 접기, 상세 패널, 모달 전환처럼 구조 연결을 보여주는 짧은 이동만 허용하고 장식용 확대·이동은 쓰지 않는다. 전환은 피드백 120ms, 상태 180ms, 선택·진입 240ms 토큰을 쓴다.
- 포커스는 배경·테두리 색 변화만으로 표현한다. 별도 링·밑줄·점선을 추가하지 않는다.
- 라이트 모드만 있다. 다크 모드 분기를 만들지 않는다. 시스템 동작 줄이기는 CSS 전환 토큰과 Motion 프로바이더의 `reducedMotion="user"`가 처리하므로 컴포넌트에서 따로 분기하지 않되, 상태·선택·포커스의 의미는 움직임 없이도 전달되게 한다.
- 웹은 FSD(`app/pages/widgets/entities/shared`), 플러그인 UI는 `src/ui/` 아래 `app/pages/shared`. 레이어 역참조를 하지 않는다.
- 서버 데이터는 TanStack Query, 미저장 입력·선택·검색은 Zustand/로컬 상태.
- 표는 TanStack Table. 긴 텍스트 셀은 줄바꿈으로 행 높이가 늘어나고, 좁은 화면은 표 내부 가로 스크롤.
- UI 테스트는 사용자 조작과 관찰 가능한 결과만 검증한다. 클래스명·DOM 구조를 고정하지 않는다.

## 렌더링 확인

- 웹: `pnpm dev:web` 후 해당 라우트를 열어 확인. Playwright(`apps/web`의 `test:e2e`)로 스크린샷을 찍을 수 있다.
- 공통 컴포넌트: 웹 개발 서버의 `/design-system.html`.
- 플러그인 UI: `pnpm dev:plugin` 빌드 결과를 Figma 개발 manifest로 불러 확인. 불가능하면 미확인으로 보고한다.
- 확인하지 못한 화면을 확인했다고 쓰지 않는다.
