# 작업: shadcn 기반 공통 컴포넌트

- 상태: 완료
- 기준: main / 24f5450
- 요청 근거: 사용자가 shadcn/ui 기반 공통 컴포넌트와 프로젝트 규칙에 맞춘 커스텀 스타일, focus ring 미사용을 요청했다. 첫 범위는 기본 입력·선택 및 Dialog, Select, Tabs, Tooltip으로 선택했다.
- 실행 범위: 구현, 검증, 로컬 커밋과 일반 푸시. PR·병합·배포는 포함하지 않는다.

## 범위와 계획

1. 기존 packages/ui/src 안에서 Button, Input, Textarea, Checkbox, RadioGroup, Switch, Label, Dialog, Select, Tabs, Tooltip을 제공한다. 기존 Surface는 유지한다.
2. shadcn의 컴포넌트 구성과 동작 기반을 사용하며 프로젝트 공통 토큰으로 스타일을 커스텀한다. 사용자가 Base UI 기반을 선택했다.
3. 바깥 focus ring 대신 요소 내부의 테두리·배경 변화로 키보드 포커스를 구분한다. 외곽 크기와 위치는 고정하고 내부 채움·선 그리기·스위치 이동 원칙을 적용한다.
4. 앱의 업무 화면과 별도로 실제 React 컴포넌트를 확인할 개발용 미리보기를 제공한다. 기존 foundations HTML은 디자인 방향 검토 자료로 유지한다.
5. pnpm check, 키보드 조작, controlled/uncontrolled 상태, disabled 및 invalid 표현, Dialog의 포커스 이동·복귀, Select 및 Tabs 탐색을 확인한다. UI 문구 변경은 독립 ux-writing-review 검수를 거친다.

## 경로

- 공통 컴포넌트·유틸리티·스타일: packages/ui/src의 기존 폴더 안
- shadcn 설정: 기존 workspace 폴더의 components.json
- 개발용 미리보기: apps/web/design-system.html 및 apps/web/src/app/component-preview.tsx
- 작업 기록: 이 폴더
- 도구 임시 자료·검증 로그: OS 임시 경로

## 진행

- 착수 시 공통 UI는 Button과 Surface였으며 shadcn 설정이나 기반 의존성은 없었다.
- 기존 Button의 바깥 outline을 새 포커스 표현으로 교체했다.

## 결과

- 11종의 요청 컴포넌트를 Base UI 1.9.0 기반으로 제공한다. shadcn base-nova의 구성·API를 참고하고 원본 MIT 라이선스를 보존했다. 공통 스타일은 별도 CSS로 관리하며 두 앱이 동일하게 로드한다.
- 외부 focus ring과 outline을 사용하지 않는다. 내부 배경·경계선, 텍스트 밑줄로 포커스를 나타내며 오류·선택 상태도 유지한다. Checkbox·RadioGroup은 중심 채움, Checkbox는 SVG 선 그리기, Switch는 손잡이 이동을 사용한다. 팝업은 opacity만 전환한다.
- DESIGN.md에 포커스 원칙을 추가했고 구조 문서·README·공통 UI 사용 안내를 갱신했다. 토큰 변경에 맞춰 foundations HTML도 재생성했다. 업무 화면의 기능·문구는 변경하지 않았다.
- `pnpm check` 통과: lint, UI·웹·플러그인 타입 검사, 웹·플러그인 빌드. 폰트 내장 HTML은 기본 검사 크기 한도 경고가 있어 7MB 한도의 별도 Biome 검사도 통과했다. `git diff --check` 통과.
- 공식 `shadcn info --cwd packages/ui` 실행으로 Base UI 구성, Tailwind v4, 공통 경로 해석 및 11개 설치 컴포넌트 인식을 확인했다.
- 로컬 Chromium 브라우저에서 Checkbox의 controlled 선택·해제와 indeterminate 해제, RadioGroup 방향키 선택, Switch 전환, Input 오류 해제, Select 키보드 열기·이동·선택 및 값 표시, Tabs 방향키 이동·Enter 활성화를 확인했다.
- Dialog의 입력 자동 포커스, Tab·Shift+Tab 순환, 저장 후 값 반영, 닫기·Escape 종료 및 각각의 텍스트·아이콘 트리거로 포커스 복귀를 확인했다. Tooltip의 키보드 포커스 표시도 확인했다.
- 포커스 시 outline·box-shadow가 없고 버튼 밑줄이 표시됨을 확인했다. Radio 채움 중간값을 확인했으며 390px 화면에서 가로 넘침 없이 Dialog를 조작했다. 브라우저 오류·경고 로그 없음.
- 독립 ux-writing-review 에이전트의 코드 기반 검수 결과 문제 없음. 기본 닫기 이름, 입력 오류와 설명 연결, 아이콘 접근성 이름과 Tooltip, 미리보기의 문구·표시 조건을 검수했다. 문구 검수 에이전트는 실행 화면을 확인하지 않았으며 화면 검증은 메인이 수행했다.
- 자동 UI 테스트 프레임워크는 여전히 미구성이다. 이번에는 얇은 래퍼별 구현 세부 테스트를 추가하지 않고 실제 브라우저의 사용자 조작과 결과로 검증했다. 강제 색상 모드 실제 실행과 프레임 단위 성능 측정, Figma 호스트 실행은 수행하지 않았다.
- 최초 의존성 설치의 workspace 링크 누락은 전체 workspace 재설치로 해결했다. 설치 중 저장소 내부로 자동 선택된 임시 pnpm store는 OS 임시 경로로 옮겼으며 최종 node_modules의 storeDir도 OS 임시 경로다. npm CLI 캐시·원본 registry·검증 로그·스크린샷은 저장소 밖에 두었다.
- 작업 도중 다른 작업의 검수 지침 변경이 발견되어 해당 변경은 보존하고 이번 커밋에서 제외한다.

## 후속: 포커스 표현과 선택 배경 수정

- 사용자 요청에 따라 포커스의 밑줄·점선을 제거하고 기존 배경색과 테두리 색상만 변화하도록 수정했다. 링크 버튼의 호버에도 밑줄이 겹치지 않도록 색상 변화로 맞췄다. 오류 입력은 오류 배경을 유지하며 포커스 테두리 색상으로 구분한다.
- 체크박스의 안쪽 채움 레이어가 바깥과 같은 radius를 사용해 모서리에 빈틈이 생겼다. 안쪽 레이어의 별도 radius를 제거하고 바깥 윤곽에서 클리핑하여 중심 채움이 내부 끝까지 이어지도록 수정했다.
- 비활성 스위치는 체크 여부와 관계없이 neutral-300 회색 트랙을 사용한다. 꺼진 일반 스위치의 기존 회색 트랙과 손잡이 이동은 유지한다.
- DESIGN.md와 사용 안내를 현재 포커스 원칙으로 갱신했다. UI 문구 및 그 의미의 표시 조건 변경은 없다.
- pnpm check와 git diff --check 통과. 브라우저에서 버튼·탭의 밑줄 없음, 실선 테두리, outline·box-shadow 없음, 체크박스 선택·해제 및 내부 클리핑, 비활성 스위치 회색 배경을 확인했다. 개발 서버가 이전 통합 CSS를 유지해 재시작 후 최신 스타일로 검증했다.

## 후속: 텍스트 입력 포커스

- Input과 Textarea는 포커스 시 배경색을 유지하고 테두리 색상만 변경하도록 수정했다. 공통 입력 클래스를 사용하는 Select의 기존 포커스 배경은 별도 선택자로 유지했다.
- DESIGN.md와 공통 UI 사용 안내에 텍스트 입력의 포커스 기준을 반영했다. UI 문구 변경은 없다.
- 브라우저에서 Input과 Textarea의 포커스 전후 배경이 흰색으로 동일하고 테두리는 포커스 색상으로 전환됨을 확인했다. 오류 입력도 기존 오류 배경을 유지했다. pnpm check와 git diff --check 통과.
