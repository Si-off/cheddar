# Cheddar 디자인 기준

Cheddar는 사람이 수행할 QA 테스트 케이스를 Figma 기획 자료로 만들고, 함께 편집하고, 공유하고, XLSX로 내보내는 사내 도구다. 사용자는 하루 대부분을 테스트 세트의 표 앞에서 보낸다. 화면은 조용하고 촘촘하게, 판단이 필요한 곳만 눈에 띄게 만든다.

- 원본: [Cheddar 디자인 시스템](https://claude.ai/artifact/X4uWWeyRiq37MpEcUdGAMU)(토큰, 컴포넌트 26종, 미리보기)
- 화면 시안: [Cheddar 화면 시안](https://claude.ai/artifact/LBfqbThAA8AGkkAYd8BNdA)
- 토큰 구현: `packages/design-tokens/src/theme.css`. 디자인 시스템의 `tokens.json`에서 만든다. 값은 이 파일이 기준이며 이 문서에 값을 복사하지 않는다.
- 시안의 예시 데이터는 제품 요구사항이 아니다.

## 원칙

- **표가 주인공이다.** 테스트 세트 화면의 시각적 무게는 표(또는 캔버스 보기)에 둔다. 기능은 제목 줄과 도구 상자 하나에 들어간다. 상단 바와 패널은 `bg-canvas`, `line-default`로 물러난다.
- **판단이 필요한 곳만 색을 쓴다.** 확인 필요, 저장 오류, AI 생성 결과, 다른 사람의 선택만 색으로 표시한다. 나머지는 중립색이다.
- **상태는 항상 보인다.** 저장 상태와 생성 진행은 숨기지 않는다.
- **색 하나에는 의미 하나.** `accent`는 행동과 AI 생성, `secondary`는 Figma 자료, 상태색은 상태, `presence-1`~`presence-6`은 공동 편집자에만 쓴다.
- **내부 로직을 드러내지 않는다.** 처리 방식, 모델 이름, 보관 정책, 중복된 개수 같은 정보를 화면에 쓰지 않는다.

## 문구

기준은 [UX 문구 정책](docs/ux-writing.md)이다.

- 제목, 버튼, 탭, 메뉴는 명사형이나 동사형으로 짧게 쓴다. "케이스 추가", "XLSX 내보내기", "링크 새로 만들기". 동사를 꾸미는 관형어 형태("추가할 케이스")로 쓰지 않는다.
- 제품 문구에 `·`를 쓰지 않는다.
- 오류는 짧게 쓰고 토스트로 보여준다. 토스트는 화면 아래 가운데에 띄워 옆 패널의 버튼을 가리지 않는다.
- 툴팁은 기본적으로 만들지 않는다. 아이콘 버튼에는 접근성 이름을 반드시 넣는다.
- 용어: 프로젝트, 테스트 세트, 테스트 케이스(케이스), 확인 필요, 기본 양식, 기능 그룹, 필수 케이스, 화면 구조, 메모, 표 보기, 캔버스 보기, 그룹화, 공개 링크, 방문자, 관리자, 구성원.
- 이모지를 쓰지 않는다.

## 색

라이트와 다크 두 테마를 제공하고 라이트가 기본이다. 화면에는 의미 토큰만 쓴다. `brand-*`, `neutral-*` 원본 스케일은 직접 쓰지 않는다.

- 바탕 세 층: 앱 바탕 `bg-canvas`, 카드와 표 `bg-surface`, hover와 표 머리글 `bg-subtle`. 선택된 행과 활성 메뉴는 `bg-selected`.
- 글자: 본문 `fg-default`, 보조 `fg-muted`, placeholder `fg-faint`. 읽어야 하는 글자에 `fg-faint`를 쓰지 않는다.
- 주요 행동은 `accent` 채움에 `on-accent` 글자. 한 영역에 하나만 둔다.
- AI 관련 표시(생성 버튼, 생성된 행)는 `accent-soft` 바탕에 `accent-text`.
- Figma 자료는 `secondary-soft` 바탕에 `secondary-text`.
- 상태: 저장됨 `success`, 저장 전과 확인 필요 `warning`, 오류 `danger`, 중립 안내 `info`. 각각 `-soft` 바탕과 짝이고, 항상 단어나 아이콘을 함께 쓴다.
- 포커스는 `focus-ring` 2px 실선, 2px 오프셋.
- 공동 편집자는 한 사람에 `presence-1`~`presence-6` 중 한 색을 준다. 그 색으로 아바타, 선택 셀 테두리와 이름표를 칠하고 글자는 `on-presence`. 내 선택은 늘 `accent`다. 링크 방문자는 같은 색 점선 테두리 아바타와 이름 뒤 "방문자"로 표시한다.
- 라이트 테마의 두 조합은 대비가 약간 낮다. `fg-muted` on `bg-subtle`은 13px 이상 500 굵기로 쓰고, 입력 컨트롤은 `bg-surface` 위에 둔다.

## 글꼴

- `sans` = Noto Sans KR, 식별값 `mono` = Noto Sans Mono.
- 굵기: 본문 400, 레이블 500, 제목 600, 700은 제품 이름에만.
- 기본 크기 `body` 14px. 표 셀과 플러그인 본문은 `body-sm` 13px.
- 테스트 ID와 Figma 노드 ID는 `mono`로 쓰고 숫자 폭을 맞춘다(`tabular-nums`).
- 페이지 제목 `title-lg`, 섹션과 다이얼로그 제목 `title`, 카드와 패널 머리글 `title-sm`.

## 간격과 모양

- 간격은 4px 단위 `space-1`~`space-12`. 카드 패딩 `space-4`, 패널 패딩 `space-5`, 페이지 좌우 여백 `space-6`.
- 컨트롤 높이 기본 `control-md` 36px. 표 안과 플러그인은 `control-sm` 32px. 큰 컨트롤은 44px. 입력과 버튼의 가로 여백은 12~14px로 글자가 테두리에 붙어 보이지 않게 한다(2026-10-19 답답하다는 의견으로 한 단계 키움).
- 표 행은 32px에서 시작해 내용에 따라 늘어난다. 표 안의 세로선, 가로선, 교차점을 끌어 열 너비와 행 높이를 조절하고, 더블클릭하면 기본 크기로 돌아간다. 열을 넓히면 다른 열은 그대로이고 표가 가로로 스크롤된다. 끌 수 있는 경계에 포인터를 올리거나 끄는 동안 그 열과 행의 경계선을 강조색 선으로 표시한다. 교차점은 어느 쪽 셀에서 잡아도 너비와 높이를 함께 바꾼다. 높이를 정한 행은 스프레드시트처럼 넘치는 내용을 자르고, 고른 셀만 전부 보인다.
- 스크롤바는 투명 트랙 위 `scroll-thumb` 둥근 손잡이 하나로 통일하고 `global.css`에서 처리한다.
- radius: 표 셀 안 칩 `radius-xs`, 체크박스와 배지 `radius-sm`, 버튼과 입력 `radius-md`, 카드와 패널과 다이얼로그 `radius-lg`.
- 그림자: 떠 있는 요소 `shadow-raised`, 메뉴와 토스트 `shadow-popover`, 다이얼로그 `shadow-dialog`. 카드는 그림자 대신 `line-default` 테두리로 구분한다.

## 레이아웃

- **웹 상단 바**: 제품 이름, 테스트 세트, 프로젝트, 오른쪽 계정 메뉴. 사이드바는 없다.
- **테스트 세트 화면**: 제목 줄에 제목, 저장 상태, 접속자, 공유, 작업 메뉴. 그 아래 테두리 있는 도구 상자(`Toolbar`) 하나에 보기 전환, 보기별 도구(표는 셀 도구, 캔버스는 실행취소와 그룹화, 표시를 아이콘 메뉴로. ▾는 붙이지 않는다), 케이스 추가 생성, XLSX 내보내기를 두고 오른쪽 끝에 검색과 확인 필요(개수)를 둔다. 도구 메뉴는 맨 위에 그룹 이름을 보인다. 그 아래 표 또는 캔버스가 남은 공간을 쓴다. 캔버스는 흰 상자 안에 그룹별 세로 열과 테두리 없는 연회색 카드를 두고, 결과 요약은 왼쪽 아래, 확대와 축소는 오른쪽 아래에 띄운다. 상태 색은 카드 전체의 옅은 배경과 글자로 보이며 왼쪽 색 띠는 쓰지 않는다. 확인 필요는 오른쪽 패널로 연다. 탭은 쓰지 않는다.
- **생성 진행**: 가운데 카드 하나에 제목과 단계 4개만 보여준다.
- **설정과 관리**: 제목 아래 탭(프로젝트 설정: 기본 양식, 기능 그룹, 필수 케이스, 화면 구조, 메모). 관리 화면은 계정 하나라 탭 없이 제목만 둔다.
- **Figma 플러그인**: 좁은 단일 열. `body-sm`, `control-sm`. 머리글 오른쪽에 계정 메뉴(웹 열기, 로그아웃), 내용 맨 위에 프로젝트 Select, 하단에 주요 행동 하나를 고정한다.

## 동작

움직임은 세 가지만 쓴다. **미끄러짐**(선택 표시가 이전 위치에서 새 위치로 이동), **SVG 그리기**(선이 왼쪽 끝부터 그려짐), **차오름**(색이 도형 가운데에서 바깥으로 채워짐). 요소의 크기가 커지거나 줄어드는 애니메이션은 쓰지 않는다. 구현은 `motion`(motion.dev)이다.

| 대상 | 종류 | 움직임 | 토큰 | motion 구현 |
| --- | --- | --- | --- | --- |
| 탭 표시줄, pill 탭 배경, 보기 전환 | 미끄러짐 | 새 항목으로 이동하며 너비가 맞춰진다 | `duration-base`, `easing-emphasized` | `layoutId` |
| 탭 내용 | 미끄러짐 | 이동 방향 쪽에서 16px 들어온다 | `duration-base`, `easing-emphasized` | `AnimatePresence`, `x` ±16와 `opacity` |
| 라디오 | 차오름 | 가운데에서 바깥으로 색이 차오른 뒤 가운데 점이 드러난다. 점은 이동하지 않는다 | `duration-base`, `easing-emphasized` | `motion.circle` `r` 0→8, 점 120ms 지연 |
| 스위치 | 미끄러짐 | 손잡이가 반대쪽으로 이동한다 | `duration-base`, `easing-emphasized` | 손잡이 `layout` |
| Select, Menu 목록 | 미끄러짐 | 위에서 아래로 펼쳐지고 강조 배경이 항목 사이를 이동한다 | `duration-base`, `duration-fast` | `clipPath`와 `y`, 강조 배경 `layoutId` |
| 체크박스 | SVG 그리기 | 체크가 왼쪽 끝부터 그려지고 해제하면 거꾸로 지워진다 | `duration-base`, `easing-standard` | `motion.path` `pathLength` 0↔1 |
| 저장됨, 생성 단계 완료 | SVG 그리기 | 상태 아이콘의 선이 순서대로 그려진다 | `duration-slow`, `easing-standard` | `pathLength` 0→1, 선마다 80ms 지연 |
| 표 행 추가와 삭제 | 미끄러짐 | 행 높이가 열리고 닫힌다 | `duration-slow`, `easing-standard` | `AnimatePresence`, `height` auto↔0 |
| hover 색, 테두리 | 색 | 색만 바뀐다 | `duration-fast`, `easing-standard` | CSS transition |

- 움직임은 상태 변화를 보여줄 때만 쓴다. 화면 진입 연출과 반복 장식은 쓰지 않는다.
- 앱 최상위에 `<MotionConfig reducedMotion="user">`를 둔다.
- 진행 중 표시는 회전 아이콘과 진행 막대만 쓴다.

## 컴포넌트

공통 컴포넌트는 `packages/ui`에 둔다: Button, IconButton, Icon, DrawnCheck, Field, TextField, TextArea, Select, Menu, Checkbox, Switch, RadioGroup, Badge, Tag, SaveStatus, StepList(시스템의 JobProgress), Tabs, Breadcrumb, DataGrid(시스템의 CaseTable), Avatars, FrameCard, ReviewCard, Banner, Dialog(ConfirmDialog 포함), Popover, SortableList, Progress, Toast, EmptyState(LoadError 포함). 스크롤바는 앱의 `global.css`가 처리한다. Select와 Menu는 브라우저 기본 UI가 아니라 직접 그린 목록이다. 실제 모양은 웹 개발 서버의 `/design-system.html`에서 라이트와 다크로 확인한다. props와 파일 규칙은 [프로젝트 구조의 코드 규칙](docs/architecture.md#코드-규칙)을 따른다.

## 아이콘

- 1.75 stroke 선형 아이콘, 24 그리드, 기본 16px. 구현은 lucide-react.
- 의미 고정: `sparkles` AI 생성, `frame` Figma 프레임, `table` 표 보기, `columns-3` 캔버스 보기와 그룹화, `sliders` 양식, `download` 내보내기, `link` 공유, `globe` 공개 링크, `users` 계정, `shield` 관리, `key-round` 비밀번호.

## 로고

로고 자산이 없다. 제품 이름은 굵기 700으로 "Cheddar"를 글자로만 쓴다.
