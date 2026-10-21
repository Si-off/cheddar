export const VIEWPOINTS = [
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
  { id: "copy_check", name: "문구 확인", when: "확인할 화면 문구가 있을 때" },
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
  },
  {
    id: "admin_bulk",
    name: "관리자 일괄 처리",
    when: "관리자 화면에 일괄 처리가 있을 때: 1건, 여러 건, 선택 없음, 정상·실패·부분 실패",
  },
  {
    id: "admin_settings",
    name: "관리자 설정의 사용자 화면 반영",
    when: "관리자 설정이 사용자 화면에 반영될 때",
  },
] as const;

export function applicableViewpoints(
  frames: { name: string }[],
  screenStructure: unknown[],
) {
  const admin =
    /관리자|어드민|(?:^|[^a-z])admin(?:istrator)?(?:$|[^a-z])|back[ _-]?office/i.test(
      JSON.stringify([
        frames.map((frame) => frame.name),
        screenStructure.map((item) => {
          if (!item || typeof item !== "object") return "";
          const screen = item as { name?: unknown; screenId?: unknown };
          return [screen.name, screen.screenId];
        }),
      ]),
    );
  return VIEWPOINTS.filter(
    (viewpoint) => admin || !viewpoint.id.startsWith("admin_"),
  );
}
