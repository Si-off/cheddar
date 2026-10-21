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
    type: "page",
    parentId: null,
    description: "",
    ruleMismatch: false,
  },
  {
    id: "s2",
    screenId: "SIGNUP-TERMS",
    name: "약관 동의",
    type: "popup",
    parentId: "s1",
    description: "",
    ruleMismatch: false,
  },
  {
    id: "s3",
    screenId: "ORDER",
    name: "주문서",
    type: "page",
    parentId: null,
    description: "",
    ruleMismatch: true,
  },
];

export const screenIdRules = [
  {
    id: "r1",
    name: "기본",
    separator: "_",
    parts: [
      {
        name: "플랫폼",
        kind: "list",
        codes: [
          { code: "PC", meaning: "PC 웹" },
          { code: "MO", meaning: "모바일 웹" },
        ],
        value: "",
        digits: 0,
      },
      {
        name: "기능",
        kind: "list",
        codes: [
          { code: "SIGNUP", meaning: "회원가입" },
          { code: "ORDER", meaning: "주문" },
        ],
        value: "",
        digits: 0,
      },
      { name: "번호", kind: "number", codes: [], value: "", digits: 2 },
    ],
    example: "PC_SIGNUP_01",
  },
];

/** 프로젝트 p1의 설정 조회 응답. 덮어쓸 응답을 넘긴다. */
export function projectSettings(overrides: Record<string, unknown> = {}) {
  return {
    "GET /api/v1/projects/p1": project,
    "GET /api/v1/projects/p1/template": template,
    "GET /api/v1/projects/p1/feature-groups": { items: groups },
    "GET /api/v1/projects/p1/screens": { items: screens },
    "GET /api/v1/projects/p1/screen-id-rules": { items: screenIdRules },
    "GET /api/v1/projects/p1/memo": {
      body: "",
      updatedAt: null,
      updatedBy: null,
    },
    ...overrides,
  };
}
