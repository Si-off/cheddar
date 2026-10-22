# 테스트 시나리오 제네레이터 시연 준비

## 1. 준비하기

Git, Docker Desktop, Figma 데스크톱 앱을 설치하세요. Docker Desktop을 실행하고 저장소 접근 권한을 받으세요.

## 2. 내려받기

```sh
git clone https://github.com/Si-off/cheddar.git
cd cheddar
```

전달받은 API 설정 파일을 `apps/api/.env.local`에 넣으세요. 내용은 수정하지 않습니다.

## 3. 실행하기

```sh
docker compose up -d --build
docker compose ps -a
```

`api`와 `web`이 `healthy`, `plugin`이 `Exited (0)`이면 준비가 끝납니다. 처음에는 이미지 다운로드와 빌드 시간이 필요합니다.

브라우저에서 http://127.0.0.1:5173 을 열고 로그인하세요.

- 아이디: `demo@example.com`
- 비밀번호: `Demo-Scenario-2026!`

## 4. Figma에 등록하기

1. Figma 데스크톱에서 디자인 파일을 여세요.
2. 하단 도구 모음의 Actions를 열고 `Import plugin from manifest`를 검색하세요.
3. `Import plugin from manifest…`를 선택하세요.
4. 내려받은 저장소의 `demo/figma-plugin/manifest.json`을 선택하세요.
5. Actions에서 `테스트 시나리오 제네레이터 (시연)`을 찾아 실행하세요.
6. 플러그인에서 로그인하고 브라우저에서 같은 시연 계정으로 연결을 승인하세요.
7. 프레임을 선택하고 업로드하세요. 열린 웹에서 테스트 세트를 만들고 AI 생성을 시작하세요.
8. 생성 결과를 편집하고 저장한 뒤 XLSX로 내보내세요.

파일 선택창에서 열기가 비활성화되면 취소한 뒤 Figma 메뉴의 Plugins → Development → Import plugin from manifest 경로로 다시 시도하세요. 계속 안 되면 준비 담당자에게 화면을 전달하세요.

등록한 플러그인은 이 폴더의 파일을 사용합니다. 시연 중 폴더를 옮기거나 삭제하지 마세요.

## 다시 시작하거나 종료하기

다시 시작:

```sh
docker compose up -d
```

종료:

```sh
docker compose down
```

종료해도 DB와 업로드 파일은 유지됩니다. `down -v`는 데이터를 지우므로 사용하지 마세요.

## 실행되지 않을 때

```sh
docker compose logs --tail=80 api plugin web
```

- 설정 파일 오류: `apps/api/.env.local` 위치와 파일 이름을 확인하세요.
- 포트 충돌: 3101 또는 5173 포트를 사용하는 기존 서버를 종료하세요.
- Figma 파일 없음: `plugin` 상태가 `Exited (0)`인지 확인하세요.
- AI 오류: 로그와 함께 준비 담당자에게 API 키의 권한과 잔액 확인을 요청하세요.

## 준비 담당자 참고

원본 설정 파일에서 AI 키와 단계별 모델, effort만 읽습니다. 원본 DB 주소와 저장 경로, 비용 동기화 관리자 키는 사용하지 않습니다. fake 설정은 시연 실행에서 자동 해제합니다. 시연 DB와 파일은 전용 Docker 볼륨에 보관하며 호스트에는 loopback 포트만 공개합니다. 고정 계정은 로컬 시연용입니다.

이미지 빌드에는 환경변수 파일을 포함하지 않습니다. 설정 파일은 별도로 전달하세요. Docker 실행과 실제 Figma 업로드, AI 생성, 편집, XLSX 다운로드를 확인한 후 시연 준비 완료로 판단하세요.
