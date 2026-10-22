# 작업: 계정·권한 간소화

여러 세션에 걸치는 작업에만 만든다. 파일명은 `YYYY-MM-DD-name.md`. 끝나면 삭제한다.

## 목표

초기 단계에 맞게 계정과 권한을 줄이고 메인 기능과 편의에 집중한다. 복잡한 권한은 필요해질 때 다시 들인다(이전 구현은 git 이력에 있다).

사용자 결정(2026-10-22): 관리자/구성원 2단계, 관리자가 처음 비밀번호를 정함, 외부 협력사는 공개 링크로 참여.

### 남기는 것

- 계정: 이름, 아이디, 등급(관리자 `admin` | 구성원 `member`), 상태(활성 | 비활성), 비밀번호
- 로그인, 세션, 로그아웃, 플러그인 연결, 실시간 공동 편집, 공개 링크와 방문자 이름
- 마지막 활성 관리자 보호(마지막 한 명을 구성원으로 바꾸거나 비활성화할 수 없다)

### 없애는 것

- 사용자 정의 역할, 권한 목록, 범위(전체/프로젝트), 만료일 필수 역할, 고정 역할 "링크 방문자"
- 소속
- 계정 만료일과 만료·초대됨 상태
- 초대 링크와 비밀번호 재설정 링크(auth_tokens)
- 테스트 세트 사람 초대, 비공개 공개 범위의 "초대받은 사람" 개념, 소유권 이전, "모든 테스트 세트 열람" 권한
- 관리 화면의 역할, 소속 탭

### 새 규칙

| 대상 | 규칙 |
| --- | --- |
| 구성원 | 모든 프로젝트와 테스트 세트를 보고 편집한다. 프로젝트 만들기와 설정, 테스트 세트 만들기, 플러그인 업로드, XLSX 내보내기, 공개 링크 설정을 한다 |
| 관리자 | 구성원이 하는 모든 일과 계정 관리 |
| 테스트 세트 삭제 | 만든 사람과 관리자 |
| 계정 만들기 | 관리자가 이름, 아이디, 등급, 처음 비밀번호(12~128자)를 정한다 |
| 비밀번호 다시 정하기 | 관리자가 새 비밀번호를 정한다. 그 계정의 세션을 모두 끊는다 |
| 내 비밀번호 바꾸기 | 현재 비밀번호와 새 비밀번호. 지금 세션은 유지하고 다른 세션은 끊는다 |
| 비활성화 | 세션과 공동 편집 연결을 끊는다. 다시 활성화할 수 있다. 계정 삭제는 없다 |
| 공개 링크 | 꺼짐(기본) 또는 켜짐. 켜짐은 보기 가능 또는 편집 가능. 새로 만들기로 이전 링크를 무효화. 끄면 방문자 연결을 끊는다 |
| 링크 방문자 | 기존 규칙 유지(셀 편집, 케이스 추가·삭제만). XLSX 내보내기는 항상 허용 |
| 로그인 계정이 링크를 열 때 | 계정 권한(편집)으로 참여 |
| 테스트 세트 목록 필터 | 전체, 내가 만든 |
| 첫 관리자 CLI | `admin:create --login-id --name`. 임시 비밀번호를 만들어 출력하고, 로그인 후 내 비밀번호 바꾸기로 바꾼다 |

### API 계약(초안)

- `GET /api/v1/auth/me` → `{ id, name, loginId, role, status }`. 권한 목록 필드는 없앤다.
- `POST /api/v1/auth/password` `{ currentPassword, newPassword }` → 204
- 삭제: `auth/invitations*`, `auth/password-resets*`, `accounts/:id/invitation`, `accounts/:id/password-reset`, `accounts/:id/owned-test-sets*`, `roles*`, `affiliations*`, `test-sets/:id/sharing/candidates`, `test-sets/:id/members/*`
- `GET /api/v1/accounts?search&role&status&page` (관리자)
- `POST /api/v1/accounts` `{ name, loginId, role, password }` → `AccountDto` (관리자)
- `PATCH /api/v1/accounts/:id` `{ name?, role? }` (관리자). 비활성화와 다시 활성화는 기존 경로 유지
- `PUT /api/v1/accounts/:id/password` `{ password }` → 204 (관리자)
- `AccountDto` → `{ id, name, loginId, role, status, createdAt }`
- 공유 설정 `GET/PATCH test-sets/:id/sharing` → `{ visibility: private|public, linkPermission, linkToken }`. `private`는 링크 꺼짐을 뜻한다. 멤버 목록 필드는 없앤다

### DB

- `accounts`: `role`(enum admin|member) 추가. 기존 관리자 역할(system_key administrator) 전체 범위 할당 계정은 `admin`, 나머지는 `member`. `status`는 active|inactive. 비밀번호가 없는 초대됨 계정은 `inactive`. `affiliation_id`, `expires_at` 삭제
- 삭제 테이블: `roles`, `role_permissions`, `role_assignments`, `role_assignment_projects`, `affiliations`, `auth_tokens`, `test_set_members`
- `test_sets`의 공개 범위·링크 컬럼은 유지한다

## 완료 조건

- [ ] product.md, architecture.md에 새 규칙 반영
- [ ] API·DB 변경과 마이그레이션, 테스트(`pnpm test:api`) 통과
- [ ] 웹·플러그인 SDK 재생성, 웹 화면 정리(관리 화면 계정 탭만, 공유 대화상자 링크만, 내 비밀번호 바꾸기), e2e 통과
- [ ] `pnpm check`, Codex 리뷰, UX 문구 검수
- [ ] 배포 DB 마이그레이션과 첫 관리자 재생성, 실제 로그인 확인

## 현재 상태

기준: `main` 9d92a6c(아이디 전환 병합). 문서 정리 시작.

## 다음 행동

product.md 갱신 → API·DB 구현 → SDK 재생성 → 웹 정리 → 검증.
