import type { Guide } from "./types";

// 9/30 QA 시트의 행 나누기 분석(2026-10-22)까지 반영한 지침. 다음 지침과 비교하는 기준선으로 둔다.
export const sheetV1: Guide = {
  id: "sheet-v1",
  columns: {
    test_env:
      '테스트 환경을 쓴다. 환경별로 같은 케이스를 반복할 때 사용한다. 예: "Android", "PC Web". iOS와 Mobile Web도 환경 값으로 쓸 수 있다.',
    test_case:
      '기능 단위 시나리오 이름을 쓴다. 경우가 크게 나뉘면 번호를 붙인다. 예: "회원가입 > 이메일 인증", "쿠폰 등록 Case 2. 비정상 등록".',
    title:
      '하위 시나리오 이름을 명사구로 쓴다. 같은 하위 시나리오의 행은 이 이름을 함께 쓴다. 조건만 다른 반복이면 "Case 2-1. 기간 만료 쿠폰"처럼 번호와 조건을 쓴다. 확인할 결과 문장은 예상 결과에 쓴다. 예: "쿠폰 정상 등록", "사용 취소 팝업 버튼별 동작", "Case 2. 구매 수량 초과".',
    user_role:
      '테스트 수행자의 상태를 쓴다. 예: "비회원", "회원(인증 전)". 관리자 수행이면 "관리자"로 쓴다.',
    screen_id:
      '화면 구조에 있는 ID만 쓴다. 없으면 "추후 채번"으로 쓴다. 화면 ID 규칙으로 ID를 만들지 않는다. 예: 화면 구조의 ID가 "LOGIN-01"이면 "LOGIN-01", 없으면 "추후 채번".',
    steps:
      '수행자의 행동만 번호 목록으로 쓴다. 결과를 섞지 않는다. 같은 시나리오에서 앞 행의 흐름을 이어가면 다음 번호부터 쓰고 앞 절차를 반복하지 않는다. 예: "1. 이메일을 입력한다.\n2. 가입 버튼을 누른다."',
    expected:
      '확인할 결과를 쓴다. 여러 결과면 "- " 불릿으로 쓴다. 예: "- 완료 안내가 표시된다.\n- 가입 화면으로 이동한다."',
    extra:
      '사전 조건과 테스트 데이터를 쓴다. 없으면 빈 값으로 둔다. 예: "미인증 회원으로 로그인", "이메일: test@example.com".',
  },
  viewpoints: [
    {
      id: "screen_entry",
      name: "화면 진입과 노출",
      when: "화면 진입 경로나 노출 조건이 있을 때",
    },
    {
      id: "normal_completion",
      name: "정상 흐름 완료",
      when: "완료할 수 있는 업무 흐름이 있을 때",
    },
    {
      id: "copy_check",
      name: "문구 확인",
      when: "확인할 화면 문구가 있을 때",
    },
    {
      id: "input_activation",
      name: "입력과 버튼 활성",
      when: "입력 필드나 활성 조건이 있는 버튼이 있을 때",
    },
    {
      id: "failure_guidance",
      name: "실패 응답별 안내",
      when: "실패 응답과 안내가 정의되어 있을 때",
    },
    {
      id: "dialog_actions",
      name: "팝업과 바텀시트의 버튼별 결과",
      when: "팝업이나 바텀시트가 있을 때",
    },
    {
      id: "user_states",
      name: "사용자 상태별",
      when: "회원 여부, 인증 여부, 앱 설치 여부, 지원 단말에 따라 동작이 달라질 때",
    },
    {
      id: "settings_limits",
      name: "설정값 조합과 한도",
      when: "품절, 수량 초과 등 설정값 조합이나 한도가 있을 때",
    },
    {
      id: "navigation_retention",
      name: "이동과 값 유지",
      when: "화면 이동이나 값 유지가 있을 때",
    },
    {
      id: "admin_listing",
      name: "관리자 목록과 조회",
      when: "관리자 화면에 조회 조건, 목록 열, 상세, 엑셀 열이 있을 때",
      admin: true,
    },
    {
      id: "admin_bulk",
      name: "관리자 일괄 처리",
      when: "관리자 화면에 일괄 처리가 있을 때: 1건, 여러 건, 선택 없음, 정상·실패·부분 실패",
      admin: true,
    },
    {
      id: "admin_settings",
      name: "관리자 설정의 사용자 화면 반영",
      when: "관리자 설정이 사용자 화면에 반영될 때",
      admin: true,
    },
  ],
  decomposition: [
    {
      id: "row-unit",
      level: "row",
      rule: "한 행은 수행자가 한 번 확인하는 결과다.",
    },
    {
      id: "row-next-action",
      level: "row",
      rule: "흐름의 다음 행동마다 결과를 확인할 때 새 행으로 나눈다. 같은 시나리오 안에서 수행 절차 번호를 이어 쓰고 앞 절차를 반복하지 않는다. 예: 앞 행이 '1. 목록 진입 2. [등록] 선택'이면 다음 행은 '3. [확인] 선택'.",
    },
    {
      id: "row-branch",
      level: "row",
      rule: "같은 지점에서 버튼이나 응답에 따라 결과가 갈릴 때 새 행으로 나눈다. 같은 하위 시나리오에 버튼이나 응답마다 행을 두고 갈리는 행동은 같은 번호를 써도 된다.",
    },
    {
      id: "case-condition",
      level: "case",
      rule: "절차는 같고 사용자 상태, 설정값, 입력 데이터, 한도만 다를 때 조건마다 하위 시나리오를 'Case 1. 조건'처럼 두고 둘째 행부터 수행 절차를 null로 둔다.",
    },
    {
      id: "row-target",
      level: "row",
      rule: "같은 확인을 메뉴나 대상만 바꿔 반복할 때 같은 하위 시나리오에 대상마다 행을 둔다.",
    },
    {
      id: "cell-same-screen",
      level: "cell",
      rule: "한 행동 뒤 같은 화면에서 함께 보이는 것은 한 행의 예상 결과에 불릿으로 묶는다.",
    },
    {
      id: "cell-move",
      level: "cell",
      rule: "결과를 확인하지 않는 이동은 행을 나누지 않고 수행 절차 번호 목록에 넣는다.",
    },
    {
      id: "cell-platform",
      level: "cell",
      rule: "iOS와 AOS 차이는 한 행에 둔다.",
    },
    {
      id: "scenario-env",
      level: "scenario",
      rule: "테스트 환경 열이 있으면 환경마다 동작이 다른 기능은 시나리오를 환경별로 반복하고, 동작이 같아 환경마다 확인만 하면 같은 하위 시나리오 안에 환경만 다른 행으로 둔다.",
    },
  ],
};
