# 프로젝트 구조

이 문서는 현재 확정된 저장소 운영과 시스템 구조를 설명한다. 기술이나 연결 방식을 가정해 채우지 않는다.

## 설계 범위와 환경

- 이번 설계 범위: Figma 플러그인과 웹의 기술 스택·폴더 구조. 백엔드는 별도 설계한다.
- 저장소 구성: pnpm workspace 기반 모노레포.
- 개발 도구: Codex.
- 필요한 구성요소: Figma 플러그인, 웹사이트, 백엔드 서버.
- 앱 위치: 웹 `apps/web/`, Figma 플러그인 `apps/figma-plugin/`, 백엔드 `apps/api/`.
- 공통 패키지 위치: `packages/ui/`, `packages/design-tokens/`.
- 백엔드 기술과 내부 구조는 별도 설계한다.
- 초기 환경: 로그인·검색 노출 없이 개발자 PC에서 로컬 검증. 백엔드·DB도 로컬 실행한다.
- 사내 배포 환경과 방식은 추후 결정한다.
- 에이전트의 작업별 문서 안내: 루트 `AGENTS.md`.
- 현재 제품·구조·절차 문서: `docs/`.
- 개별 작업 기록: `docs/changes/`에서 작업별로 관리하고 필요한 경우에만 읽는다.

## 웹·플러그인 기술 결정

| 영역 | 확정된 선택 |
| --- | --- |
| 공통 언어 | TypeScript |
| 기본 UI 스택 | React, Vite, Tailwind CSS, Motion |
| 데이터·상태 도구 | TanStack Query, Zustand |
| 린터 | Biome |
| 웹 라우터 | TanStack Router |
| API 코드 생성 | `@hey-api/openapi-ts`로 타입·SDK·TanStack Query 코드 생성 |
| UI 구조 | 웹과 플러그인 UI 모두 FSD 적용, 필요한 레이어만 구성 |

workspace·설정·최소 실행 화면은 구성했다. Node는 `.nvmrc`의 24.22.0 LTS, pnpm은 `packageManager`의 12.11.2로 고정한다. 라이브러리 버전은 각 `package.json`과 `pnpm-lock.yaml`이 기준이며 실행 명령은 [README](../README.md)에 있다. 업무 기능은 후속 구현이다.

## 구성요소 경계와 공유

- 플러그인은 선택한 Figma 프레임의 데이터·이미지 업로드에 집중한다. 테스트 케이스 생성·편집은 웹에서 수행한다.
- Figma 문서 접근 코드는 React UI와 분리한다. main은 IIFE JavaScript, UI는 폰트·CSS를 포함한 단일 HTML로 별도 빌드한다. `protocol/`의 ui-ready/plugin-ready 메시지로 연결을 확인하고, 실제 프레임 업로드 계약은 후속 설계한다.
- 기본 UI와 디자인 토큰은 공유한다.
- 화면·업무 기능·상태 저장소는 앱별로 관리한다.
- 웹은 표 중심 편집과 긴 내용의 상세 패널 편집을 제공한다. 열 추가·이름 정의·순서 변경·너비 조절·일반 문자열 검색 기능을 포함한다. 표 구현 도구, 열 유형, 문자열 검색 대상과 일치 기준, 구체적인 상태 분담은 미정이다.
- 공유 링크는 초기 읽기 전용으로 제공하고, 향후 링크별 편집 권한을 지원한다.
- 백엔드·DB·AI 실행·저장 구조의 세부 설계는 이번 범위에 포함하지 않는다.

## 공통 디자인 기준

웹·Figma 플러그인 UI·공통 UI에 동일하게 적용한다.

- UI의 폰트·컬러·radius와 공통 타이포그래피·간격은 `packages/design-tokens/src/theme.css`의 토큰을 반드시 사용한다.
- primary 컬러는 `#515299`다. hover·subtle·배경·텍스트·경계선 컬러는 공통 의미별 토큰으로 정의한다.
- 기본 폰트는 Noto Sans다. 한글은 Noto Sans KR로 보완하며, Fontsource 패키지로 폰트 파일을 자체 호스팅한다.
- 앱과 공통 UI에 원시 색상값, 임의의 폰트·radius 값, 토큰을 우회하는 Tailwind arbitrary 값을 직접 넣지 않는다. 의미가 맞는 기존 토큰을 사용하고 부족하면 공통 토큰에 정의한다.
- 앱은 공통 토큰을 로드한다. 앱별 스타일이나 컴포넌트에서 같은 의미의 디자인 값을 별도로 재정의하지 않는다.
- 디자인 기준 자체를 변경하는 경우에는 사용자 결정을 먼저 반영한다. 기술적 기본값을 새로운 디자인 결정으로 임의 확대하지 않는다.

## 소스 경로의 역할

| 경로 | 역할 |
| --- | --- |
| `apps/web/src/app/` | 웹 초기화·프로바이더·라우트·앱 스타일 |
| `apps/web/src/pages/test-case-editor/` | 테스트 케이스 생성·편집 화면 |
| `apps/web/src/pages/shared-test-cases/` | 공유 링크 열람 화면 |
| `apps/web/src/widgets/test-case-table/` | 편집·열람 화면에서 사용하는 표 |
| `apps/web/src/entities/test-case/` | 웹 내부에서 사용하는 테스트 케이스 모델과 관련 처리 |
| `apps/web/src/shared/` | 웹 전용 API 연결·설정·라이브러리·기본 UI |
| `apps/figma-plugin/src/main/` | Figma 문서 접근과 프레임 데이터·이미지 추출 |
| `apps/figma-plugin/src/protocol/` | Figma 실행 코드와 React UI 사이의 메시지 계약 |
| `apps/figma-plugin/src/ui/` | React UI의 FSD 루트: 앱 초기화·프레임 업로드 화면·플러그인 UI 전용 공통 코드 |
| 각 앱의 `shared/api/generated/` | `@hey-api/openapi-ts`로 생성할 API 코드의 위치 |
| `packages/ui/src/` | 앱에 종속되지 않는 기본 UI 컴포넌트 |
| `packages/design-tokens/src/` | 앱에서 공유하는 디자인 토큰 |

웹은 `app`, `pages`, `widgets`, `entities`, `shared` 레이어로 시작한다. 플러그인의 FSD 적용 범위는 `src/ui/`이며 `app`, `pages`, `shared` 레이어로 시작한다. `main/`과 `protocol/`은 React UI의 FSD 루트 밖에 둔다.

앱의 화면·업무 기능·상태 저장소는 공통 패키지로 이동하지 않는다. 공통 패키지는 앱을 역으로 참조하지 않는다. 앱 내부 슬라이스의 세부 세그먼트와 추가 레이어는 필요성과 경로를 제시하고 구조 변경 승인 후 추가한다.

현재 workspace·패키지·TypeScript·Biome·Vite·Tailwind 설정과 실행 진입점이 있다. 웹은 TanStack Router의 `/`·`/share/$shareId`, Query·Motion 프로바이더를 구성했다. 플러그인은 main/UI 메시지 연결과 Zustand 연결 상태를 구성했다. 공통 UI는 Button·Surface, 토큰은 CSS 진입점으로 제공한다. 업무 상태 저장소·표·생성·업로드 기능은 아직 구현하지 않았다.

두 앱은 실제 명세를 `OPENAPI_INPUT`으로 받아 타입·SDK·Query 코드를 각 `shared/api/generated/`에 생성하도록 설정했다. 실제 명세·생성 코드는 미정이며 해당 디렉터리는 `.gitkeep`만 유지한다. 도구 기본 출력의 `client/`·`core/`·`@tanstack/` 하위 폴더는 생성 코드 전용으로 사용자 승인을 받았다. 실제 명세 확정 후 생성하며 생성 코드를 직접 편집하지 않는다.

Figma ID는 아직 발급되지 않았다. `manifest.json`에 임의 ID를 넣지 않았으며 실제 Figma 실행은 ID 발급·반영 후 검증한다. API 주소가 미정이므로 플러그인 외부 네트워크 허용은 `none`이다.

## 문서와 검수 스킬의 역할

- `docs/ux-writing.md`는 사용자 노출 문구의 작성·판단·완료 기준을 관리한다.
- `.agents/skills/ux-writing-review/SKILL.md`는 검수 입력, 코드 확인 절차, 결과 형식과 재검수 절차를 관리한다.
- `.codex/agents/ux-writing-review.toml`은 검수 에이전트의 모델·effort와 스킬 실행 지시를 관리한다. 독립 컨텍스트로 호출하는 방법과 결과 반영은 `docs/workflow.md`에서 관리한다.
- 루트 `AGENTS.md`는 각 문서와 검수를 적용할 작업 조건만 연결한다.
- 스킬은 문구 정책을 복사하지 않고 기준 문서를 읽어 적용한다. 스킬과 에이전트 정의는 개발 작업용이며 제품 런타임에는 포함하지 않는다.

## 파일 생성과 폴더 변경

- 폴더를 생성·이동·이름 변경하기 전에 `docs/architecture.md`의 허용된 폴더 구조와 현재 경로를 확인한다. 승인된 범위 밖의 폴더는 숨김 폴더를 포함해 임의로 만들지 않는다.
- 새 폴더나 구조 변경이 필요하면 정확한 경로·목적·영향을 먼저 알리고 사용자의 명시적 승인을 받는다. 구조 문서에 먼저 추가해 스스로 허용 범위를 넓히지 않는다.
- 허용된 폴더 안에서도 현재 요청에 필요한 영속 파일만 생성한다. 일반적인 구현 요청을 구조 확장이나 임시 파일 저장의 승인으로 해석하지 않는다.

## 허용된 폴더 구조

현재 승인된 고정 구조는 다음과 같다. `.git`은 Git 관리 메타데이터이며 프로젝트 산출물 폴더가 아니다.

```text
cheddar/
├── AGENTS.md
├── README.md
├── .agents/
│   └── skills/
│       └── ux-writing-review/
│           └── SKILL.md
├── .codex/
│   └── agents/
│       └── ux-writing-review.toml
├── .github/
│   └── pull_request_template.md
├── apps/
│   ├── api/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── providers/
│   │       │   ├── routes/
│   │       │   └── styles/
│   │       ├── pages/
│   │       │   ├── test-case-editor/
│   │       │   └── shared-test-cases/
│   │       ├── widgets/
│   │       │   └── test-case-table/
│   │       ├── entities/
│   │       │   └── test-case/
│   │       └── shared/
│   │           ├── api/
│   │           │   └── generated/
│   │           │       ├── client/
│   │           │       ├── core/
│   │           │       └── @tanstack/
│   │           ├── config/
│   │           ├── lib/
│   │           └── ui/
│   └── figma-plugin/
│       └── src/
│           ├── main/
│           ├── protocol/
│           └── ui/
│               ├── app/
│               ├── pages/
│               │   └── frame-upload/
│               └── shared/
│                   ├── api/
│                   │   └── generated/
│                   │       ├── client/
│                   │       ├── core/
│                   │       └── @tanstack/
│                   ├── config/
│                   ├── lib/
│                   └── ui/
├── packages/
│   ├── ui/
│   │   └── src/
│   └── design-tokens/
│       └── src/
└── docs/
    ├── product.md
    ├── architecture.md
    ├── workflow.md
    ├── ux-writing.md
    ├── decisions/
    │   └── README.md
    ├── changes/
    │   └── README.md
    └── templates/
        └── change.md
```

- 두 앱의 `shared/api/generated/` 아래 `client/`·`core/`·`@tanstack/`는 API 생성 코드 전용으로 승인되었다. 실제 명세로 생성할 때만 만들며 현재는 생성하지 않는다. 임의 기능 폴더나 추가 하위 폴더로 허용 범위를 확대하지 않는다.
- 위 트리에 표시된 모든 폴더가 승인된 고정 구조다. `.gitkeep`은 각 빈 말단 폴더를 Git에서 유지하기 위한 파일이며 트리에서는 생략했다. 실제 구현 파일이 생기면 같은 폴더의 `.gitkeep`을 제거할 수 있다.
- `apps/api/`는 백엔드 위치로 승인되었다. `.gitkeep`은 빈 폴더를 Git에서 유지하기 위한 파일이다. 백엔드 내부 폴더·파일 구성은 미정이며 별도 결정 후 반영한다.
- 이미 합의된 작업 기록 형식으로 `docs/changes/<change-id>/` 한 단계의 폴더를 허용한다. 현재 사용자가 요청한 작업에 기록이 필요한 경우에만 생성한다. 그 아래의 추가 폴더는 별도 승인이 필요하다.
- 결정 기록은 `docs/decisions/` 안에 Markdown 파일로 추가한다. 작업·결정 기록 생성에 관한 상세 기준은 각 디렉터리의 안내를 따른다.
- `.agents/skills/ux-writing-review/`와 `.codex/agents/`는 이번 UX 문구 검수의 영속 스킬·에이전트 정의 위치로 승인되었다. 현재 파일은 각각 `SKILL.md`와 `ux-writing-review.toml`만 사용한다. 다른 스킬·에이전트·설정·스크립트·참고자료·메타데이터용 경로의 추가 권한으로 확대하지 않는다.
- 위 트리 밖의 추가 소스 폴더, `.agents/`·`.codex/`의 추가 하위 경로, 워크플로 폴더 등은 아직 승인되지 않았다. 향후 확장 예시나 미정 항목에 언급된 이름을 생성 허가로 해석하지 않는다.
- 폴더 생성·이동·이름 변경으로 이 범위를 벗어나려면 경로·목적·영향을 먼저 제시하고 명시적 승인을 받는다. 승인 후 실제 구조와 이 목록을 함께 갱신한다. 에이전트가 목록을 먼저 수정해 스스로 승인할 수 없다.
- 기존에 발견한 폴더는 그 존재만으로 승인된 구조에 편입하지 않는다. 목록과 다르면 사용자 변경 여부와 필요성을 확인하고 임의 삭제하지 않는다.

## 임시 파일과 도구 산출물

- 임시 스크립트·조사 자료·다운로드·로그·스크린샷·캐시 등 작업용 임시 파일은 저장소와 worktree 밖의 OS 임시 경로에 둔다. 생성 전에 실제 경로가 저장소 밖인지 확인한다. `.gitignore` 등록은 예외가 아니다.
- 도구가 저장소 안에 임시 산출물을 만드는지 실행 전에 확인하고, 가능하면 출력·캐시 경로를 밖으로 지정한다. 불가능하면 실행 전에 경로와 필요성을 알리고 예외 승인을 받는다. 향후 별도로 승인된 빌드·의존성 산출물 경로는 그 승인 범위만 따른다.
- 사용자에게 제공할 영속 산출물은 임시 파일과 구분하고 합의된 경로에 저장한다. 본인이 만든 임시 파일만 정리하며 기존 파일을 임의로 삭제하지 않는다.

`tmp/`·`work/`·숨김 폴더도 임시 파일 저장의 예외가 아니다.

이번 기본 설정·설치·검증에 필요한 도구 산출물 예외는 다음과 같다. 모두 Git에서 제외한다.

- 루트와 workspace 패키지의 `node_modules/`: pnpm 의존성과 workspace 링크. 루트의 `node_modules/.pnpm/`을 포함한다.
- `apps/web/dist/`, `apps/figma-plugin/dist/`: 배포·Figma 개발 실행용 빌드 결과. 번들러가 만드는 하위 파일·폴더를 포함한다.
- Vite 캐시, 코드 생성 검증 결과, 로그·스크린샷은 저장소 밖의 OS 임시 경로를 사용한다. pnpm 저장소는 저장소 밖의 사용자 기본 저장소를 사용한다. Vite 설정은 runner 로더로 읽어 설정 번들 임시 파일도 저장소에 남기지 않는다.

위 예외는 현재 사용자가 요청한 workspace·앱 기본 설정에 필요한 범위다. 새로운 도구 산출물 경로나 다른 임시 파일의 저장 허가로 확대하지 않는다.

## 미정

| 항목 | 상태 |
| --- | --- |
| 슬라이스 내부 세그먼트와 향후 추가 레이어·슬라이스 | 필요 시 별도 결정 |
| 플러그인 업무 메시지·프레임 추출·업로드 계약 | 연결 메시지만 구성, 업무 계약은 미정 |
| 공통 UI·디자인 토큰 확장 | 기본 진입점 구성, 추가 요구에 맞춰 결정 |
| 실제 API 명세 | 미정. OPENAPI_INPUT 기반 생성 설정·출력 하위 폴더 허용은 완료 |
| TanStack Query와 Zustand의 세부 책임 분담 | 미정 |
| 표 편집 구현 도구·열 유형·문자열 검색 대상과 일치 기준 | 미정 |
| XLSX 생성 위치와 라이브러리 | 미정 |
| Figma 발급 플러그인 ID·실제 Figma 실행 검증 | 미정 |
| 테스트 프레임워크·CI | 미정. lint·타입 검사·빌드 명령은 구성 |
| 백엔드 기술 스택·API·DB·AI 실행 구조 | 별도 설계 |
| 초기 로컬 구성요소 연결·공유 링크 접근 방식 | 미정 |
| 사내 배포·릴리스·관측 방식 | 추후 결정 |

## 갱신 기준

구조가 결정되면 이 문서에 현재 상태를 반영한다. 여러 대안 중 선택한 이유가 이후 판단에 필요하면 `decisions/`에 별도 기록을 남기고 연결한다. 과거 작업 계획만으로 현재 구조를 판단하지 않는다.
