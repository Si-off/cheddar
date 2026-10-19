/** e2e 전용: 테스트 세트 화면의 API 응답 */
export const columns = [
  {
    id: "c-id",
    systemKey: "test_id",
    name: "테스트 ID",
    type: "text",
    description: "",
    options: [],
  },
  {
    id: "c-title",
    systemKey: "title",
    name: "제목",
    type: "text",
    description: "",
    options: [],
  },
  {
    id: "c-exp",
    systemKey: null,
    name: "예상 결과",
    type: "text",
    description: "",
    options: [],
  },
  {
    id: "c-pri",
    systemKey: null,
    name: "우선순위",
    type: "select",
    description: "",
    options: ["높음", "보통", "낮음"],
  },
  {
    id: "c-tags",
    systemKey: null,
    name: "영역",
    type: "tags",
    description: "",
    options: ["회원", "약관"],
  },
  {
    id: "c-auto",
    systemKey: null,
    name: "자동화",
    type: "checkbox",
    description: "",
    options: [],
  },
];

export const cases = [
  {
    id: "k1",
    values: {
      "c-id": "TC-001",
      "c-title": "이메일 형식이 아니면 가입할 수 없다",
      "c-exp": "오류 문구 표시",
      "c-pri": "높음",
      "c-tags": ["회원"],
      "c-auto": true,
    },
  },
  {
    id: "k2",
    values: {
      "c-id": "TC-002",
      "c-title": "약관 동의 없이 가입 버튼이 비활성이다",
      "c-exp": "가입 버튼 비활성",
      "c-pri": "보통",
      "c-tags": ["약관"],
      "c-auto": false,
    },
  },
];

export const testSet = {
  id: "t1",
  name: "2.4.0 회원가입 개편",
  memo: "",
  project: { id: "p1", name: "쇼핑몰 앱 리뉴얼" },
  owner: { id: "a1", name: "최하늘" },
  isPublic: false,
  version: 1,
  access: { canEdit: true, canRename: true, canDelete: true, canExport: true },
  columns,
  cases,
  updatedAt: "2026-10-19T00:00:00Z",
};

export const defaultViewResponse = {
  view: "table",
  groupByColumnId: null,
  columnWidths: {},
  rowHeights: {},
};

/** t1 화면에 필요한 조회 응답 */
export function testSetResponses(overrides: Record<string, unknown> = {}) {
  return {
    "GET /api/v1/test-sets/t1": testSet,
    "GET /api/v1/test-sets/t1/view": defaultViewResponse,
    "PUT /api/v1/test-sets/t1/view": (_route: unknown, body: unknown) => body,
    ...overrides,
  };
}
