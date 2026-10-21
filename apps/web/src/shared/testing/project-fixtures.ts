/** e2e 전용: 프로젝트 설정 화면의 API 응답 */
export const project = {
  id: "p1",
  name: "쇼핑몰 앱 리뉴얼",
  description: "모바일 쇼핑 앱",
  canManage: true,
};

export const template = {
  revision: 3,
  columns: [
    {
      id: "c-id",
      presetKey: "test_id",
      systemKey: "test_id",
      enabled: true,
      name: "테스트 ID",
      type: "text",
      description: "",
      options: [],
    },
    {
      id: "c-title",
      presetKey: "title",
      systemKey: "title",
      enabled: true,
      name: "제목",
      type: "text",
      description: "",
      options: [],
    },
    {
      id: "c-steps",
      presetKey: "steps",
      systemKey: null,
      enabled: true,
      name: "수행 절차",
      type: "text",
      description: "번호 목록으로 씁니다.",
      options: [],
    },
    {
      id: "c-extra",
      presetKey: "extra",
      systemKey: null,
      enabled: false,
      name: "추가 정보",
      type: "text",
      description: "",
      options: [],
    },
    {
      id: "c-priority",
      presetKey: null,
      systemKey: null,
      enabled: true,
      name: "우선순위",
      type: "select",
      description: "",
      options: ["높음", "보통", "낮음"],
    },
  ],
};

export const groups = [
  { id: "g1", name: "회원가입", description: "이메일 가입, 약관" },
  { id: "g2", name: "로그인", description: "" },
];

export const screens = [
  {
    id: "s1",
    screenId: "SIGNUP",
    name: "회원가입",
    parentId: null,
    description: "",
  },
  {
    id: "s2",
    screenId: "SIGNUP-TERMS",
    name: "약관 동의",
    parentId: "s1",
    description: "",
  },
  {
    id: "s3",
    screenId: "ORDER",
    name: "주문서",
    parentId: null,
    description: "",
  },
];

/** 프로젝트 p1의 설정 조회 응답. 덮어쓸 응답을 넘긴다. */
export function projectSettings(overrides: Record<string, unknown> = {}) {
  return {
    "GET /api/v1/projects/p1": project,
    "GET /api/v1/projects/p1/template": template,
    "GET /api/v1/projects/p1/feature-groups": { items: groups },
    "GET /api/v1/projects/p1/screens": { items: screens },
    "GET /api/v1/projects/p1/memo": {
      body: "",
      updatedAt: null,
      updatedBy: null,
    },
    ...overrides,
  };
}
