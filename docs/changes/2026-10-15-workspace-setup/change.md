# 작업: 프런트엔드 workspace와 앱 기본 설정

- 상태: 완료
- 요청: 확정 기술 스택으로 pnpm workspace·웹·Figma 플러그인·공통 패키지 기본 설정. 단계별 진행.
- 추가 결정: Node는 nvm으로 최신 LTS를 설치·고정하고 pnpm도 최신 버전으로 업데이트.
- 추가 디자인 결정: primary #515299, Noto Sans, UI는 폰트·컬러·radius 등 공통 디자인 토큰을 반드시 사용.
- 실행 범위: 로컬 구성·검증, 자율 커밋·일반 푸시. 백엔드 구현·배포는 제외.
- 시작 기준: main, 49ff4c048bac4550b225ce862c6360e47b1e9e98
- 마지막 확인 일자: 2026-10-15

## 계획

1. nvm·Node·pnpm, workspace·TypeScript·Biome·패키지 정의 구성.
2. 공통 UI·디자인 토큰 진입점 구성.
3. 웹 라우터·프로바이더·Vite·Tailwind와 최소 실행 화면 구성.
4. Figma main·UI 별도 빌드와 최소 메시지 연결 구성.
5. API 코드 생성 설정, 타입·빌드·브라우저·산출물 검증과 문서 갱신.

## 진행

- 1단계 완료: nvm 0.40.8, Node 24.22.0 LTS, pnpm 12.11.2 설치·확인. .nvmrc와 packageManager 고정.
- 웹·플러그인·공통 UI·토큰과 루트의 5개 workspace 프로젝트 확인.
- 의존성 설치·잠금 파일 생성·기본 설정 11개 Biome 검사 통과.
- 2단계 완료 및 추가 디자인 반영: primary #515299, 자체 호스팅 Noto Sans·Noto Sans KR, 의미별 컬러·폰트·radius·간격 토큰. AGENTS.md에 토큰 사용 의무 반영. 공통 UI·웹 타입 검사와 웹 빌드 통과.
- 3단계 완료: 웹 Vite·Tailwind·TanStack Router·Query/Motion 프로바이더와 최소 실행 화면 구성. / 및 /share/$shareId 브라우저 진입, primary 토큰·폰트 패밀리·noindex 확인. 웹 타입 검사·빌드 통과.
- 4단계 완료: Figma main IIFE·UI 단일 HTML 빌드, ui-ready/plugin-ready 메시지 계약, Query/Motion 프로바이더·Zustand 연결 상태 구성. 타입·빌드·동시 감시 빌드 통과. 저장소 밖 브라우저 host 모의 환경에서 양방향 메시지 연결과 단독 실행 안내를 확인.
- 사용자 확인: Figma 플러그인 ID는 아직 발급받지 않음. manifest에 임의 ID를 넣지 않는다.
- 5단계 완료: pnpm check (Biome 41개 파일·공통 UI/양 앱 TypeScript·양 앱 빌드) 통과. 실제 계약과 분리한 임시 명세로 양 앱 타입·Fetch SDK·Query 생성 및 생성 코드 타입 검사 통과. OPENAPI_INPUT 누락 시 명확한 실패도 확인.
- 플러그인 산출물 검사: manifest 경로·단일 HTML·내장 폰트·IIFE·잘못된 메시지 무시·연결 응답 통과. 단일 HTML에서 불필요한 모듈 preload polyfill은 제외.
- README·구조·작업 절차를 실제 실행 명령과 구현 상태에 맞게 갱신. API 생성 코드용 하위 폴더만 사용자 명시 승인 후 구조 문서에 추가했으며 아직 생성하지 않았다.

## 검증과 남은 사항

- 실행 명령: pnpm check, pnpm dev:web, pnpm dev:plugin, 두 앱 gen:api --output <OS 임시 경로>, 생성 결과 tsc 검사.
- 브라우저: 웹 /·/share 경로, noindex, primary·폰트 패밀리, 플러그인 모의 host 연결과 브라우저 단독 실행 안내 확인. 최종 플러그인 단독 UI 콘솔 오류·경고 없음. 모의 host iframe 검사에서는 출처를 확인하지 못한 MutationObserver 오류 로그가 관찰되었다. 최종 번들에는 MutationObserver 코드가 없고 단독 UI에는 해당 오류가 없었다. 실제 Figma 콘솔 확인은 후속 검증으로 남긴다.
- 브라우저 모의 환경은 실제 Figma 런타임 검증이 아니다. 발급 ID·실제 문서 접근·업로드·API 호출은 미검증이다.
- 실제 OpenAPI 명세는 미정. 도구가 generated/ 아래에 만드는 client/·core/·@tanstack/ 경로는 저장소 밖에서만 검증했으며 사용자가 생성 코드 전용으로 명시 승인했다. 실제 명세 확정 전까지 저장소에 생성하지 않는다.
- Noto Sans·KR를 모두 자체 호스팅하여 현재 플러그인 단일 HTML은 약 5.6 MB다. 실제 Figma 실행 시 로딩을 확인하고 필요하면 사용하는 언어·글리프 범위를 조정한다.
- 테스트 프레임워크·CI·제품 업무 구현·백엔드는 이번 범위에서 결정하거나 구현하지 않았다.

## 미정과 경계

- 백엔드 API·DB·AI 제공자·실제 OpenAPI 명세는 미정. 업무용 API나 샘플 계약을 제품 코드에 만들지 않는다.
- Figma 발급 플러그인 ID는 미정. 실제 Figma 실행 여부는 빌드·브라우저 검증과 구분한다.
- 상세 UI 설계와 테스트 케이스 표·XLSX 기능은 이번 기본 설정의 범위 밖이다.
- 사용자 추가 요청에 따라 AGENTS.md에 디자인 토큰 사용 의무만 사전 고지 후 반영한다. 기존 소스 폴더를 사용하고 필수 node_modules·앱 dist 예외만 구조 문서에 기록한다.

## 완료 상태

- 소스·숨김 폴더를 점검했으며 허용된 경로 외에 추가 폴더·임시 파일이 없다. 의존성과 dist는 승인된 산출물 예외다.
- apps/api는 .gitkeep만 유지한다. 실제 API 명세·계약·생성 코드가 저장소에 추가되지 않았음을 확인했다.
- 단계별 커밋: ec2a469 (workspace·도구), cbc7322 (공통 진입점), 04925f0 (브랜드 토큰·폰트·규칙), c9bace5 (웹), 97ca696 (플러그인). 최종 검증·문서는 후속 작은 커밋으로 반영한다.
- 웹 로컬 개발 서버는 127.0.0.1:5173에서 확인할 수 있다.
