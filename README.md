# Cheddar

사람이 수행하는 QA 테스트 케이스를 AI로 생성하고 편집·공유·XLSX 내보내기 하는 제품이다. Figma 플러그인은 선택한 프레임의 데이터·이미지 업로드를 담당하고, 생성·편집은 웹에서 수행한다. pnpm workspace 모노레포로 관리하며 Codex를 사용해 개발한다.

## 작업 시작

Codex에서 이 저장소를 프로젝트 작업 위치로 연다. 루트 `AGENTS.md`가 공통 지침의 진입점이다. 다른 폴더에서 시작한 채팅은 이 저장소의 지침을 자동으로 읽는다고 가정하지 않는다.

설정을 처음 적용하거나 바꾼 뒤에는 새 세션에서 실제 적용된 지침의 경로와 주요 규칙을 확인한다. 문서가 존재하는 것과 세션에 로드된 것은 구분한다.

## 문서 안내

| 문서 | 용도 |
| --- | --- |
| [프로젝트 규칙](AGENTS.md) | 코딩 에이전트의 공통 지침 |
| [제품 정의](docs/product.md) | 현재 확정된 제품 내용과 미정 사항 |
| [구조](docs/architecture.md) | 구성요소·기술 선택의 확정 상태 |
| [작업 절차](docs/workflow.md) | 계획·실행·검증·완료의 기준 |
| [결정 기록 안내](docs/decisions/README.md) | 중요한 선택의 이유를 남기는 방법 |
| [작업 기록 안내](docs/changes/README.md) | 특정 작업을 기록하고 재개하는 방법 |
| [작업 템플릿](docs/templates/change.md) | 필요한 작업에서 사용하는 양식 |

## 개발 환경

- 웹·플러그인: TypeScript, React, Vite, Tailwind CSS, Motion, TanStack Query, Zustand
- 패키지 관리자·린터: pnpm workspace, Biome
- 웹 라우터: TanStack Router
- API 코드 생성: `@hey-api/openapi-ts`
- 상세 기술 결정과 미정 사항: [구조 문서](docs/architecture.md)
- 초기 검증: 로그인·검색 노출 없이 개발자 PC에서 로컬 실행, 백엔드·DB도 로컬 실행
- 백엔드 세부 설계·설치·실행·빌드·테스트 명령: 미정
- 사내 배포 환경과 절차: 추후 결정

명령과 환경은 실제 도입하고 확인한 뒤 문서에 추가한다.
