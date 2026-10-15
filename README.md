# Cheddar

사람이 수행하는 QA 테스트 케이스를 AI로 생성하고 편집·공유·XLSX 내보내기 하는 제품이다. Figma 플러그인은 선택한 프레임의 데이터·이미지 업로드를 담당하고, 생성·편집은 웹에서 수행한다. pnpm workspace 모노레포로 관리하며 Codex를 사용해 개발한다.

## 작업 시작

Codex에서 이 저장소를 프로젝트 작업 위치로 연다. 루트 `AGENTS.md`에서 작업에 맞는 문서를 찾는다. 세부 규칙은 `docs/`에서 관리한다. 다른 폴더에서 시작한 채팅은 이 저장소의 지침을 자동으로 읽는다고 가정하지 않는다.

설정을 처음 적용하거나 바꾼 뒤에는 새 세션에서 실제 적용된 지침의 경로와 주요 규칙을 확인한다. 문서가 존재하는 것과 세션에 로드된 것은 구분한다.

## 문서 안내

| 문서 | 용도 |
| --- | --- |
| [작업별 문서 안내](AGENTS.md) | 작업 조건에 따라 읽을 문서를 찾는 진입점 |
| [제품 정의](docs/product.md) | 현재 확정된 제품 내용과 미정 사항 |
| [구조](docs/architecture.md) | 구성요소·기술 선택의 확정 상태 |
| [작업 절차](docs/workflow.md) | 계획·실행·검증·완료의 기준 |
| [결정 기록 안내](docs/decisions/README.md) | 중요한 선택의 이유를 남기는 방법 |
| [작업 기록 안내](docs/changes/README.md) | 특정 작업을 기록하고 재개하는 방법 |
| [작업 템플릿](docs/templates/change.md) | 필요한 작업에서 사용하는 양식 |

## 소스 위치

- `apps/web/`: 웹 앱
- `apps/figma-plugin/`: Figma 실행 코드·메시지 계약·React UI
- `apps/api/`: 백엔드 위치, 내부 구조는 별도 설계
- `packages/ui/`: 기본 UI
- `packages/design-tokens/`: 디자인 토큰

workspace·기본 도구 설정과 최소 실행 화면을 구성했다. 단계별 결과는 [작업 기록](docs/changes/2026-10-15-workspace-setup/change.md)을, 상세 경로와 허용 범위는 [구조 문서](docs/architecture.md)를 따른다.

## 개발 환경

- 웹·플러그인: TypeScript, React, Vite, Tailwind CSS, Motion, TanStack Query, Zustand
- 패키지 관리자·린터: pnpm workspace, Biome
- 웹 라우터: TanStack Router
- API 코드 생성: `@hey-api/openapi-ts`
- 상세 기술 결정과 미정 사항: [구조 문서](docs/architecture.md)
- 초기 검증: 로그인·검색 노출 없이 개발자 PC에서 로컬 실행, 백엔드·DB도 로컬 실행
- 도구 버전: nvm 0.40.8, Node 24.22.0 LTS (`.nvmrc`), pnpm 12.11.2 (`packageManager`)
- 백엔드 세부 설계·설치·실행·빌드·테스트 명령: 미정
- 사내 배포 환경과 절차: 추후 결정

## 설치와 실행

저장소 루트에서 실행한다. nvm 설치 후 새 셸을 열거나 nvm을 로드한다.

```sh
nvm install
nvm use
npm install --global pnpm@12.11.2
pnpm install --frozen-lockfile
pnpm dev:web
```

웹은 `http://127.0.0.1:5173/`에서 실행한다. `/`와 `/share/<shareId>`는 기본 화면만 제공하며 실제 생성·편집·공유 기능은 아직 구현하지 않았다.

```sh
pnpm dev:plugin
```

플러그인 UI와 main을 각각 감시 빌드하여 `apps/figma-plugin/dist/index.html`과 `dist/main.js`를 만든다. UI는 CSS·폰트를 포함한 단일 HTML이다. 브라우저에서 UI만 확인하려면 `pnpm --filter @cheddar/figma-plugin dev:ui`를 사용한다 (`http://127.0.0.1:5174/`).

Figma 플러그인 ID는 아직 발급되지 않아 manifest의 `id`를 생략했다. Figma에서 새 플러그인을 만들고 [공식 안내](https://developers.figma.com/docs/plugins/manifest/)에 따라 발급된 ID를 manifest에 반영한 뒤 개발용으로 가져온다. 현재 실제 Figma 내 실행은 미검증이다. API 주소·허용 도메인은 백엔드 설계 후 정한다.

## 검증과 API 코드 생성

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm check
```

`pnpm check`는 위 세 검사를 순서대로 수행한다. 테스트 프레임워크와 CI는 미정이다. Vite 캐시·오류 로그 등 임시 자료는 저장소 밖에 둔다.

두 앱의 `openapi-ts.config.ts`는 `OPENAPI_INPUT` 환경변수로 실제 명세 URL 또는 절대 경로를 받으며, 타입·Fetch SDK·TanStack Query 코드를 생성한다. 명세가 없으면 명확한 오류로 종료한다. `.env.example`은 설명용이며 코드 생성 시 환경변수는 셸에서 명시적으로 전달한다.

실제 명세는 아직 미정이며 현재 `generated/`는 비워두었다. 각 `generated/` 아래 `client/`·`core/`·`@tanstack/`는 생성 코드 전용으로 허용했다. 실제 명세 확정 후 다음 명령을 사용한다.

```sh
OPENAPI_INPUT=<실제-명세-URL-또는-절대경로> pnpm gen:api:web
OPENAPI_INPUT=<실제-명세-URL-또는-절대경로> pnpm gen:api:plugin
```

검증용 명세와 생성 결과는 저장소 밖에서만 사용했다. 생성 코드는 직접 편집하지 않고 명세·설정 변경 후 다시 만든다.

## 디자인 토큰

UI 디자인 기준과 토큰 사용 규칙은 [공통 디자인 기준](docs/architecture.md#공통-디자인-기준)을 따른다.

[라이트 모드 foundations 미리보기](docs/design-foundations.html)는 폰트와 스타일을 내장한 스탠드얼론 HTML이다. 파일을 브라우저에서 열면 색상, 타이포그래피, 간격, 형태, 모션, 인터랙션을 확인할 수 있다.

프로젝트의 디자인 방향을 비교·결정하기 위한 미리보기다. 합의한 표현은 [DESIGN.md](DESIGN.md)의 공통 원칙으로, 반복해서 사용할 값은 공통 토큰으로 관리한다. 실제 화면은 이 원칙과 토큰을 맥락에 맞게 적용하며, 미리보기의 개별 구현 기법이나 샘플 구성을 제품 컴포넌트 명세로 삼지 않는다.

토큰 원본은 `packages/design-tokens/src/theme.css`, 미리보기 원본은 `packages/design-tokens/preview.template.html`이다. 원본 변경 후 아래 명령으로 HTML을 다시 생성한다.

```sh
node packages/design-tokens/build-preview.mjs
```

HTML 안의 CSS 다운로드는 일반 CSS 변수를 내보낸다. 다운로드하는 CSS에는 폰트 파일이 포함되지 않는다. HTML에는 Fontsource의 Noto Sans와 Noto Sans KR 및 해당 라이선스가 함께 포함된다.

## 공통 컴포넌트

`@cheddar/ui`는 shadcn/ui의 Base UI 구성을 바탕으로 프로젝트 토큰과 모션 원칙을 적용한다. 기존 배경색과 테두리 색상 변화만으로 키보드 포커스를 구분한다.

`pnpm dev:web` 실행 후 [컴포넌트 미리보기](http://127.0.0.1:5173/design-system.html)에서 실제 컴포넌트를 조작할 수 있다. 이 진입점은 개발 모드에서만 렌더링하며 기본 프로덕션 빌드에 포함되지 않는다. 디자인 방향을 비교하는 foundations HTML과 역할이 다르다.

제공 API, 스타일 로드와 사용 예시는 [공통 UI 사용 안내](packages/ui/README.md)를 참고한다.
