# 작업: 시트 개선안 구현

여러 세션에 걸치는 작업이라 이 기록을 둔다. 끝나면 삭제하고 남길 결정은 product/architecture로 옮긴다.

## 목표

[제품 정의](../product.md)의 프로젝트, 테스트 세트, AI 생성 절과 [프로젝트 구조](../architecture.md)의 "시트 개선안" 절을 코드에 반영한다. 시안은 [Cheddar 화면 시안](https://claude.ai/artifact/LBfqbThAA8AGkkAYd8BNdA)의 테스트 세트·프로젝트 설정 페이지다.

포함: 양식 고정(사전 정의 열 + 사용자 열), 필수 케이스 제거와 점검 관점 내부화, 화면 구조 유형과 IA 가져오기, 화면 ID 규칙, 새 테스트 세트의 양식 선택과 열 고르기 모달, 표의 열 추가·순서·병합 표시·셀 나누기, XLSX 2단 머리글과 병합, 생성 프롬프트의 열별 작성 규칙과 행 나누기.

제외: 케이스 행 순서 드래그(기존 `move_case` 유지), 카드 보기 변경, 공유·권한 변경, 플러그인 변경.

## 단계

의존 순서대로 6단계. 1→2→3은 순차, 4와 5는 3 뒤에 병렬, 6은 마지막.

| 단계 | 담당 | 범위 | 완료 조건 |
| --- | --- | --- | --- |
| 1. 양식 모델과 API | Codex | `projects/template.ts`의 사전 정의 열 14개를 `presetKey`·작성 규칙·예시로 재정의. `project_templates.columns`에 `presetKey`, `enabled` 추가. 양식 PUT이 사전 정의 열의 이름·형식·작성 기준 변경을 400으로 거절. `required_cases` 테이블·DTO·엔드포인트 삭제. 마이그레이션 `0007`. 프로젝트 만들기가 사전 정의 열만 생성 | `pnpm test:api` 통과. 양식 PUT 거절 테스트, 필수 케이스 엔드포인트 404 테스트, 만들기 트랜잭션 테스트 |
| 2. 테스트 세트 열 연산과 XLSX | Codex | 만들기 DTO에 `template: {kind: "project" \| "recent" \| "custom", columns?}`. `PUT /columns` 대신 `ops`에 `add_column`, `remove_column`, `reorder_columns` 연산 추가(세트 version 증가, 공동 편집 전파). `remove_column`은 값 삭제. `export`에 2단 머리글(QA 결과·QA 담당자 → QA 진행, 개발 진행 상태·개발 담당자 → 개발 작업상황)과 병합 대상 열의 연속 같은 값 병합 | 연산 원자성·전파 테스트. XLSX 머리글·병합 범위 테스트 |
| 3. 화면 구조와 화면 ID 규칙 | Codex | `screen_structure_items.type` 추가. `screen_id_rules` 테이블과 CRUD. 다음 ID 계산 `GET /screens/next-id?ruleId&prefixParts`. 규칙 불일치 판정은 화면 목록 응답에 `ruleMismatch`로 포함. IA 가져오기 `POST /screens/import`(XLSX 업로드, exceljs 재사용, ID 없는 행 건너뛰기, 중복 ID는 첫 행). 마이그레이션 `0008` | 규칙 검증·다음 번호·가져오기 테스트 |
| 4. 생성 프롬프트와 스키마 | Codex | `formSchema`가 `enabled` 열만 포함. 사전 정의 열은 `presetKey`별 작성 규칙과 시트 예시를 프롬프트에 주입. 점검 관점 12개를 `generation/steps/viewpoints.ts` 상수로 두고 `requiredCases` 입력·`coverage` 검증을 관점 ID로 교체. `cases` 프롬프트에 행 나누기와 환경별 반복 규칙. 열 하나 채우기 작업 `fill_column`(rewrite와 같은 실행기) | 스키마 단위 테스트. fake provider로 coverage 검증 테스트. `fill_column` 동시 한도 공유 테스트 |
| 5. 웹 | Claude | 아래 "웹 작업" 참고 | `pnpm check` 통과, `pnpm dev:web` 실제 화면 확인, e2e 갱신 |
| 6. 마무리 | Claude | SDK 재생성 확인, 문서의 "구현 전" 표기 제거, 이 기록 삭제, `/codex:review` | 리뷰 반영 후 커밋·푸시 |

### Codex 위임 공통 조건

프롬프트에 항상 넣는다: UI 파일(`apps/web`, `apps/figma-plugin/src/ui`, `packages/ui`, `packages/design-tokens`)은 수정하지 말고 필요한 변경은 보고만 할 것. 계약을 바꾸면 OpenAPI 명세를 다시 내보낼 것. 마이그레이션은 Drizzle로 생성하고 SQL을 검토할 것. 운영 데이터는 없으므로 `required_cases` 행 보존은 하지 않는다.

### 웹 작업 (5단계 세부)

순서는 의존성 순이다. 각 항목은 `packages/ui` 컴포넌트를 먼저 쓰고, 없으면 `packages/ui`에 추가한다.

1. `packages/ui`: `tabs.tsx`에 미끄러지는 선택 표시줄(패딩 포함 너비, 탭 간격 0, `duration-base`·`easing-emphasized`), `data-grid.tsx`에 열 머리글 끌기·병합 셀 렌더·셀 나누기 메뉴·머리글 `+`, `context-menu`(Base UI ContextMenu) 추가.
2. `entities/project`, `entities/test-set`: 재생성 SDK 반영. `presetKey`·`enabled`·`type`·`screenIdRules` 타입.
3. `features/manage-template-columns`(`edit-template` 대체): 사전 정의 열 토글(테스트 ID·제목 비활성), 사용자 열 추가·편집·삭제. `features/manage-required-cases` 삭제.
4. `features/manage-screens`: 유형 열, 모듈별 묶음, 규칙 불일치 배지, 다음 ID 채운 추가 행, IA 가져오기 버튼. `features/manage-screen-id-rules`: 규칙 요약 행(부분 묶음 표시), ⋯ 메뉴, 삭제 확인.
5. `widgets/screen-id-rule-dialog`: 예시 ID 세그먼트(한 덩어리, 구분 기호 없음), 부분 ⋯ 메뉴와 우클릭, 두 번 클릭 이름 변경, 끌어서 순서, 코드 표(셀 편집, 호버 ×, 하단 `+`).
6. `pages/project-settings`: 탭 양식·기능 그룹·화면 구조·메모. 브레드크럼 제거, 저장 상태 오른쪽. 기능 그룹 상단 입력 제거, 머리글 버튼 + 끝 `+` 행.
7. `widgets/column-picker`: 열 고르기 모달(표 머리글 미리보기, 끌기, 켜고 끄기, 열 추가, 최근 세트와 같게). `features/create-test-set`와 `pages/test-set-new`: 양식 3택, 프레임 격자 전체 선택과 토글.
8. `widgets/case-table`: 병합 표시 규칙(테스트 환경, 테스트 케이스, 제목, 화면 ID, 수행 절차; 상위 경계 안에서만), 열 끌기와 되돌리기 토스트, 머리글 메뉴(이름 변경·작성 기준·좌우 추가·삭제 확인), 머리글 `+` 팝오버(`widgets/add-column`: 사전 정의 열 토글 목록 + 직접 정의 + 기존 케이스 AI 채우기). `widgets/columns-editor`와 `features/edit-test-set-columns` 삭제. `features/add-column`, `features/reorder-columns` 추가.
9. `pages/test-set`: 도구 줄에서 양식 편집 제거. 브레드크럼 제거, 저장 상태 오른쪽.
10. UX 문구 검수(`.codex/agents/ux-writing-review.toml`), 실제 화면 확인.

## 결정 (확정)

- 점검 관점은 12개 고정, "변경된 부분만"은 제외.
- 열 순서는 세트 전체 저장. 사람별 보기에는 열 너비와 행 높이만.
- 규칙 삭제 시 화면 ID 유지. 삭제는 확인 대화상자.
- "최근 테스트 세트와 같게"는 같은 프로젝트에서 요청자가 볼 수 있는 가장 최근 세트 1개.
- 열 추가의 "기존 케이스 AI로 채우기" 기본값은 꺼짐.

## 완료 조건

- [ ] 1~4단계 API 테스트 통과, OpenAPI 명세와 웹 SDK 재생성
- [ ] 5단계 `pnpm check` 통과, 시안과 같은 화면을 `pnpm dev:web`에서 확인
- [ ] 생성 1회 실행으로 열별 작성 규칙과 행 나누기가 결과에 반영되는지 확인
- [ ] XLSX를 열어 2단 머리글과 병합 셀 확인
- [ ] product/architecture의 "구현 전" 표기 제거, 이 기록 삭제

## 현재 상태

기준 브랜치 `main`, 커밋 `092c3fd` 이후 문서만 변경(product.md, architecture.md, 이 기록). 코드 변경 없음.

## 다음 행동

1. 1단계 Codex 위임 시작(`/codex:rescue --background`). 브리핑은 이 문서의 1단계 행과 architecture.md 개선안 절을 그대로 준다.
2. 1단계가 끝나면 2·3단계를 각각 위임. 4단계는 3단계 뒤.
3. Claude는 1단계 진행 중 웹 작업 1(packages/ui)부터 시작한다. API 의존이 없는 부분이다.
