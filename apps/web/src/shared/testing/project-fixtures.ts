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

const part = (
  name: string,
  kind: "list" | "fixed" | "number",
  value: string | number | [string, string?][],
) => ({
  name,
  kind,
  codes: Array.isArray(value)
    ? value.map(([code, meaning = ""]) => ({ code, meaning }))
    : [],
  value: kind === "fixed" ? String(value) : "",
  digits: kind === "number" ? Number(value) : 0,
});

/** 실제 IA 시트를 AI로 읽은 결과를 줄인 규칙 초안 */
export const screenIdRuleDrafts = {
  items: [
    {
      name: "관리자 화면 ID",
      separator: "_",
      example: "PC_COM_LIST_PG_001",
      parts: [
        part("채널", "fixed", "PC"),
        part("도메인", "list", [
          ["COM", "공통"],
          ["CPN", "쿠폰 관리"],
          ["ORD", "주문 관리"],
        ]),
        part("행위", "list", [
          ["LIST", "목록"],
          ["REG", "등록/수정"],
        ]),
        part("유형", "list", [
          ["PG", "페이지"],
          ["PO", "팝업"],
        ]),
        part("일련번호", "number", 3),
      ],
    },
    {
      name: "앱 화면 ID",
      separator: "_",
      example: "U_SP_0101_CS_PG_001",
      parts: [
        part("채널", "fixed", "U"),
        part("서비스", "fixed", "SP"),
        part("메뉴", "list", [["0101"], ["0103"]]),
        part("영역", "list", [
          ["CS", "고객지원"],
          ["ES", "eSIM"],
        ]),
        part("유형", "list", [
          ["PG", "페이지"],
          ["BT", ""],
        ]),
        part("일련번호", "number", 3),
      ],
    },
  ],
  unreadFiles: [],
};

const draft = (
  key: string,
  screenId: string,
  name: string,
  group: string,
  parentKey: string | null,
  extra: Partial<{ type: string; exists: boolean; ruleMismatch: boolean }> = {},
) => ({
  key,
  screenId,
  name,
  group,
  parentKey,
  type: "page",
  description: "",
  exists: false,
  ruleMismatch: false,
  ...extra,
});

/** 실제 IA 시트를 AI로 읽은 결과를 줄인 화면 초안 */
export const screenDrafts = {
  items: [
    draft("s0:3", "U_SP_0101_PG", "스플래시", "스플래시", null, {
      ruleMismatch: true,
    }),
    draft("s0:5", "U_SP_0103_CS_PG_001", "고객지원", "홈", null),
    draft("s0:6", "U_SP_0103_CS_PG_002", "목록", "홈", "s0:5"),
    draft("s0:7", "U_SP_0103_CS_PG_003", "상세", "홈", "s0:5"),
    draft("s0:12", "U_SP_0103_ES_PG_001", "eSIM 사용 가이드", "홈", "s0:5"),
    draft("s0:13", "U_SP_0103_ES_BT_001", "등록 가이드", "홈", "s0:12", {
      type: "popup",
    }),
    draft(
      "s1:22",
      "PC_CPN_LIST_PG_001",
      "마스터 쿠폰 관리",
      "쿠폰 관리",
      null,
      {
        exists: true,
      },
    ),
    draft(
      "s1:23",
      "PC_CPN_REG_PG_001",
      "마스터 쿠폰 등록/수정",
      "쿠폰 관리",
      "s1:22",
    ),
    draft(
      "s1:24",
      "PC_CPN_SELECT_PO_001",
      "상품 선택 팝업",
      "쿠폰 관리",
      "s1:23",
      {
        type: "popup",
      },
    ),
    draft("s1:25", "PC_CPN_LIST_PG_002", "쿠폰 발행 관리", "쿠폰 관리", null),
  ],
  skipped: 13,
  unreadFiles: ["앱 화면 목록.pdf"],
};
