export type Priority = "높음" | "보통" | "낮음" | "미지정";
export type Category = "정상 흐름" | "예외 상황" | "경계 조건";
export type Result = "미진행" | "통과" | "실패" | "보류";
export type Frame = {
  id: string;
  name: string;
  screen: string;
  kind: "browse" | "product" | "cart" | "checkout" | "complete";
};
export type TestCase = {
  id: string;
  number: number;
  title: string;
  group: string;
  category: Category;
  priority: Priority;
  precondition: string;
  data: string;
  steps: string;
  expected: string;
  frameIds: string[];
  iaIds: string[];
  extra: Record<string, string>;
  result: Result;
  note: string;
  rowHeight?: number;
};
export type Candidate = TestCase & {
  reason: string;
  status: "pending" | "added" | "excluded";
};
export type Column = {
  id: string;
  name: string;
  width: number;
  visible: boolean;
  custom?: boolean;
};
export type IAItem = {
  id: string;
  code: string;
  name: string;
  parent: string;
  frameId: string;
};
export type FlowNode = {
  id: string;
  label: string;
  kind: "시작" | "화면" | "행동" | "조건" | "종료";
  x: number;
  y: number;
  iaId: string;
};
export type FlowEdge = { id: string; from: string; to: string; label: string };
export type TestScenario = {
  id: string;
  name: string;
  layout: "qa" | "table";
  templateId?: string;
  templateVersion?: number;
  activeId: string;
  goal: string;
  scope: "flow" | "screen";
  selectedFrames: string[];
  provider: string;
  columns: Column[];
  cases: TestCase[];
  candidates: Candidate[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  generation: "idle" | "running" | "failed";
  step: number;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  frameIds: string[];
  testScenarios: TestScenario[];
  templateId: string;
  ia: IAItem[];
};
export type DemoState =
  | "normal"
  | "empty"
  | "generation-error"
  | "no-results"
  | "candidates-only"
  | "partial-import";
export const uid = () => crypto.randomUUID();
export const clone = <T>(value: T): T => structuredClone(value);
export function defaultColumns(): Column[] {
  return [
    { id: "number", name: "테스트 ID", width: 96, visible: true },
    { id: "group", name: "기능 구분", width: 116, visible: true },
    { id: "title", name: "테스트 항목", width: 244, visible: true },
    { id: "iaIds", name: "화면 ID", width: 128, visible: true },
    { id: "precondition", name: "사전 조건", width: 200, visible: true },
    { id: "data", name: "테스트 데이터", width: 180, visible: true },
    { id: "steps", name: "수행 절차", width: 260, visible: true },
    { id: "expected", name: "예상 결과", width: 260, visible: true },
    { id: "priority", name: "우선순위", width: 100, visible: false },
    { id: "category", name: "테스트 유형", width: 128, visible: false },
    { id: "frameIds", name: "관련 화면", width: 200, visible: false },
    { id: "result", name: "테스트 결과", width: 120, visible: false },
    { id: "note", name: "메모", width: 240, visible: false },
  ];
}
export const frames: Frame[] = [
  { id: "browse", name: "상품 탐색", screen: "SHOP-01", kind: "browse" },
  { id: "product", name: "상품 상세", screen: "SHOP-02", kind: "product" },
  { id: "cart", name: "장바구니", screen: "CART-01", kind: "cart" },
  { id: "checkout", name: "주문·결제", screen: "ORDER-01", kind: "checkout" },
  { id: "complete", name: "주문 완료", screen: "ORDER-02", kind: "complete" },
];

const caseSeeds: [
  string,
  Category,
  Priority,
  string,
  string,
  string,
  string[],
][] = [
  [
    "상품 옵션을 선택하고 장바구니에 담기",
    "정상 흐름",
    "높음",
    "구매 가능한 상품이 있다.",
    "상품 상세를 연다.\n색상과 수량을 선택한다.\n장바구니에 담기를 누른다.",
    "선택한 옵션과 수량으로 상품이 장바구니에 추가된다.",
    ["product", "cart"],
  ],
  [
    "장바구니에서 상품 수량 변경하기",
    "정상 흐름",
    "높음",
    "장바구니에 상품이 1개 있다.",
    "상품 수량의 + 버튼을 누른다.\n주문 금액을 확인한다.",
    "수량과 상품 금액, 총 주문 금액이 함께 변경된다.",
    ["cart"],
  ],
  [
    "선택한 상품만 주문하기",
    "정상 흐름",
    "높음",
    "장바구니에 서로 다른 상품 2개가 있다.",
    "한 상품만 선택한다.\n주문하기를 누른다.",
    "선택한 상품만 주문서에 표시된다.",
    ["cart", "checkout"],
  ],
  [
    "배송지 정보를 입력하고 결제하기",
    "정상 흐름",
    "높음",
    "주문할 상품이 선택되어 있다.",
    "수령인·연락처·주소를 입력한다.\n결제 수단을 선택한다.\n결제하기를 누른다.",
    "결제 성공 후 주문 완료 화면에 주문 정보가 표시된다.",
    ["checkout", "complete"],
  ],
  [
    "필수 배송지 항목을 비운 채 결제하기",
    "예외 상황",
    "높음",
    "주문서가 열려 있다.",
    "배송지 주소를 비운다.\n결제하기를 누른다.",
    "주소 입력이 필요하다는 안내가 표시되고 결제가 진행되지 않는다.",
    ["checkout"],
  ],
  [
    "장바구니의 마지막 상품 삭제하기",
    "경계 조건",
    "보통",
    "장바구니에 상품 1개가 있다.",
    "상품 삭제를 누른다.",
    "빈 장바구니와 상품 탐색으로 돌아가는 행동이 표시된다.",
    ["cart"],
  ],
  [
    "주문 완료 후 주문 내역 확인하기",
    "정상 흐름",
    "보통",
    "결제가 완료되었다.",
    "주문 완료 화면에서 주문 내역 보기를 누른다.",
    "방금 완료한 주문의 상품·배송지·결제 금액을 확인할 수 있다.",
    ["complete"],
  ],
  [
    "옵션을 선택하지 않고 담기",
    "예외 상황",
    "보통",
    "옵션이 있는 상품 상세가 열려 있다.",
    "옵션을 선택하지 않는다.\n장바구니에 담기를 누른다.",
    "필수 옵션 선택 안내가 표시되고 상품은 추가되지 않는다.",
    ["product"],
  ],
  [
    "여러 상품의 주문 금액 확인하기",
    "정상 흐름",
    "높음",
    "가격과 수량이 다른 상품 2개가 있다.",
    "두 상품을 모두 선택한다.\n총 주문 금액을 확인한다.",
    "선택된 상품의 수량별 금액을 합산한 금액이 표시된다.",
    ["cart", "checkout"],
  ],
  [
    "상품 목록에서 상세 화면 열기",
    "정상 흐름",
    "낮음",
    "상품 목록이 표시되어 있다.",
    "상품 카드를 선택한다.",
    "선택한 상품의 이름·이미지·가격이 상세 화면에 표시된다.",
    ["browse", "product"],
  ],
  [
    "선택 상품을 모두 해제하기",
    "경계 조건",
    "보통",
    "장바구니의 상품이 선택되어 있다.",
    "전체 선택을 해제한다.",
    "선택 수량과 주문 금액이 0으로 표시되고 주문을 진행할 수 없다.",
    ["cart"],
  ],
  [
    "상품 상세로 돌아가 옵션 확인하기",
    "정상 흐름",
    "낮음",
    "장바구니에 옵션을 선택한 상품이 있다.",
    "장바구니에서 상품 이름을 누른다.",
    "해당 상품 상세가 열리고 구매 가능한 옵션을 확인할 수 있다.",
    ["cart", "product"],
  ],
];

export function seedCases(): TestCase[] {
  return caseSeeds.map(
    (
      [title, category, priority, precondition, steps, expected, frameIds],
      i,
    ) => ({
      id: `case-${i + 1}`,
      number: i + 1,
      title,
      group: frames.find((f) => f.id === frameIds[0])?.name ?? "",
      category,
      priority,
      precondition,
      data:
        i === 0
          ? "색상: 베이지\n수량: 1개"
          : i === 1
            ? "수량: 1 → 2개"
            : i === 3
              ? "결제 수단: 신용카드"
              : "",
      steps,
      expected,
      frameIds,
      iaIds: frameIds.map((id) => `ia-${id}`),
      extra: {},
      result: "미진행",
      note: "",
    }),
  );
}
export function seedCandidates(): Candidate[] {
  return [
    {
      title: "결제 중 네트워크가 끊긴 경우",
      reason:
        "화면에서 네트워크 오류 안내와 결제 재시도 방식을 확인할 수 없습니다.",
      steps:
        "결제 요청 직후 네트워크 연결을 끊는다.\n연결을 복구하고 주문 상태를 확인한다.",
      expected: "결제 상태를 확인할 수 있고 같은 주문이 중복 결제되지 않는다.",
      frameIds: ["checkout"],
    },
    {
      title: "주문 직전 상품이 품절된 경우",
      reason: "품절 상태 화면이 없어 재고 재확인 시점은 검토가 필요합니다.",
      steps: "장바구니의 상품이 품절된 상태로 주문을 시도한다.",
      expected:
        "품절 상품을 안내하고 구매 가능한 상품으로 주문을 수정할 수 있다.",
      frameIds: ["cart", "checkout"],
    },
    {
      title: "결제 버튼을 연속으로 누른 경우",
      reason:
        "결제 중 버튼 상태와 중복 요청 처리 규칙이 화면에 명시되지 않았습니다.",
      steps: "결제 버튼을 빠르게 두 번 누른다.",
      expected: "한 번의 주문과 결제만 처리된다.",
      frameIds: ["checkout", "complete"],
    },
  ].map((item, i) => ({
    ...item,
    id: `candidate-${i + 1}`,
    number: 0,
    group: "주문·결제",
    category: "예외 상황",
    priority: "높음",
    precondition: "주문서에 필수 정보를 입력했다.",
    data: "",
    status: "pending",
    iaIds: [],
    extra: {},
    result: "미진행",
    note: "",
  }));
}

export function blankCase(number: number): TestCase {
  return {
    id: uid(),
    number,
    title: "",
    group: "",
    category: "정상 흐름",
    priority: "미지정",
    precondition: "",
    data: "",
    steps: "",
    expected: "",
    frameIds: [],
    iaIds: [],
    extra: {},
    result: "미진행",
    note: "",
  };
}
export function newTestScenario(
  name: string,
  columns: Column[] = defaultColumns(),
): TestScenario {
  return {
    id: uid(),
    name,
    layout: "table",
    activeId: "",
    goal: "",
    scope: "flow",
    selectedFrames: [],
    provider: "Claude",
    columns: clone(columns),
    cases: [],
    candidates: [],
    nodes: [],
    edges: [],
    generation: "idle",
    step: 0,
  };
}
export function newProject(name: string): Project {
  return {
    id: uid(),
    name,
    description: "",
    frameIds: [],
    testScenarios: [],
    templateId: "template-default",
    ia: [],
  };
}
export function initialProjects(scenario: DemoState): Project[] {
  if (scenario === "empty") return [];
  const testScenario = newTestScenario("주문·결제 테스트");
  Object.assign(testScenario, {
    id: "test-scenario-order",
    templateId: "template-default",
    templateVersion: 1,
    layout: "table",
    cases: seedCases(),
    candidates: seedCandidates(),
    activeId: "case-1",
    selectedFrames: frames.map((f) => f.id),
    goal: "상품 선택부터 주문 완료까지 정상 흐름과 예외 상황을 확인합니다.",
  });
  return [
    {
      id: "project-shop",
      name: "커머스 웹",
      description: "상품 탐색, 장바구니, 주문·결제",
      frameIds: frames.map((f) => f.id),
      testScenarios: [testScenario],
      templateId: "template-default",
      ia: frames.map((f) => ({
        id: `ia-${f.id}`,
        code: f.screen,
        name: f.name,
        parent: "",
        frameId: f.id,
      })),
    },
  ];
}
export function generate(
  testScenario: TestScenario,
  scenario: DemoState,
): Pick<TestScenario, "cases" | "candidates"> {
  const selected = new Set(testScenario.selectedFrames);
  const filter = <T extends TestCase>(items: T[]) =>
    items
      .filter((c) => testScenario.scope === "flow" || c.frameIds.length === 1)
      .filter((c) => !selected.size || c.frameIds.some((f) => selected.has(f)))
      .map((c) => ({
        ...c,
        frameIds: c.frameIds.filter((id) => selected.has(id)),
      }));
  return {
    cases:
      scenario === "no-results" || scenario === "candidates-only"
        ? []
        : filter(seedCases()),
    candidates: scenario === "no-results" ? [] : filter(seedCandidates()),
  };
}
export function cellValue(item: TestCase, col: Column, ia: IAItem[]): string {
  if (col.id === "number") return `TC-${String(item.number).padStart(3, "0")}`;
  if (col.custom) return item.extra[col.id] ?? "";
  if (col.id === "frameIds")
    return item.frameIds
      .map((id) => frames.find((f) => f.id === id)?.name ?? id)
      .join(", ");
  if (col.id === "iaIds")
    return item.iaIds
      .map((id) => ia.find((i) => i.id === id)?.code ?? "")
      .filter(Boolean)
      .join(", ");
  return String(item[col.id as keyof TestCase] ?? "");
}
export function mockFlow(ia: IAItem[]): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  const labels: [string, FlowNode["kind"]][] = [
    ["시작", "시작"],
    ["상품 선택", "화면"],
    ["장바구니 확인", "화면"],
    ["결제 성공?", "조건"],
    ["주문 완료", "종료"],
    ["결제 재시도", "행동"],
  ];
  const nodes = labels.map(([label, kind], i) => ({
    id: uid(),
    label,
    kind,
    x: 100 + (i % 3) * 300,
    y: 100 + Math.floor(i / 3) * 220,
    iaId: ia[i - 1]?.id ?? "",
  }));
  const pairs: [number, number, string][] = [
    [0, 1, ""],
    [1, 2, ""],
    [2, 3, ""],
    [3, 4, "성공"],
    [3, 5, "실패"],
    [5, 3, ""],
  ];
  return {
    nodes,
    edges: pairs.map(([a, b, label]) => ({
      id: uid(),
      from: nodes[a].id,
      to: nodes[b].id,
      label,
    })),
  };
}

export type TestScenarioTemplate = {
  id: string;
  name: string;
  description: string;
  version: number;
  columns: Column[];
};
export function initialTemplates(): TestScenarioTemplate[] {
  return [
    {
      id: "template-default",
      name: "기본 테스트 양식",
      description: "기능별 테스트 항목과 수행 결과를 정리하는 양식",
      version: 1,
      columns: defaultColumns(),
    },
  ];
}
