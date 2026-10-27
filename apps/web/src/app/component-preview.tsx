import {
  Avatars,
  Badge,
  Banner,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  type CellPosition,
  Checkbox,
  DataGrid,
  type DataGridColumn,
  Dialog,
  EmptyState,
  FrameCard,
  IconButton,
  Menu,
  Progress,
  RadioGroup,
  ReviewCard,
  SaveStatus,
  Select,
  SortableList,
  StepList,
  Switch,
  Tabs,
  Tag,
  TextArea,
  TextField,
  ToastProvider,
  Toolbar,
  ToolbarMenu,
  ToolbarSeparator,
  useToast,
} from "@workspace/ui";
import {
  Copy,
  Download,
  FileSearch,
  Globe,
  Link,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Table,
  Trash2,
} from "lucide-react";
import { MotionConfig } from "motion/react";
import { type ReactNode, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";

type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  if (theme === "system")
    document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-title text-fg">{title}</h2>
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        {children}
      </div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

interface SampleCase {
  id: string;
  title: string;
  pre: string;
  priority: string;
  area: string[];
  generated?: boolean;
}

const sampleCases: SampleCase[] = [
  {
    id: "TC-001",
    title: "이메일 형식이 아니면 가입할 수 없다",
    pre: "회원가입 화면",
    priority: "높음",
    area: ["회원"],
  },
  {
    id: "TC-002",
    title: "비밀번호가 8자 미만이면 오류 문구를 표시한다",
    pre: "회원가입 화면",
    priority: "높음",
    area: ["회원", "보안"],
  },
  {
    id: "TC-003",
    title: "약관 동의 없이 가입 버튼이 비활성이다",
    pre: "약관 화면",
    priority: "보통",
    area: ["약관"],
  },
  {
    id: "TC-004",
    title: "인증번호 3분이 지나면 다시 받아야 한다",
    pre: "인증번호 발송 직후",
    priority: "높음",
    area: ["인증"],
    generated: true,
  },
  {
    id: "TC-005",
    title: "가입 완료 후 웰컴 쿠폰이 지급된다",
    pre: "",
    priority: "보통",
    area: ["쿠폰"],
    generated: true,
  },
];

const priorityTone: Record<string, "danger" | "warning" | "neutral"> = {
  높음: "danger",
  보통: "warning",
};

const caseColumns: DataGridColumn<SampleCase>[] = [
  {
    id: "id",
    header: "테스트 ID",
    width: 96,
    mono: true,
    cell: (row) => row.id,
  },
  { id: "title", header: "제목", width: 320, cell: (row) => row.title },
  { id: "pre", header: "사전 조건", width: 180, cell: (row) => row.pre },
  {
    id: "priority",
    header: "우선순위",
    width: 96,
    cell: (row) => (
      <Tag tone={priorityTone[row.priority] ?? "neutral"}>{row.priority}</Tag>
    ),
  },
  {
    id: "area",
    header: "영역",
    width: 140,
    cell: (row) => (
      <span className="flex flex-wrap gap-1">
        {row.area.map((a) => (
          <Tag key={a}>{a}</Tag>
        ))}
      </span>
    ),
  },
];

function GridDemo() {
  const [active, setActive] = useState<CellPosition | null>({
    rowId: "TC-002",
    columnId: "pre",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set(["TC-002"]));
  return (
    <DataGrid
      aria-label="테스트 케이스"
      columns={caseColumns}
      rows={sampleCases}
      getRowId={(row) => row.id}
      activeCell={active}
      onActiveCellChange={setActive}
      selectedRowIds={selected}
      onSelectedRowIdsChange={setSelected}
      isRowHighlighted={(row) => Boolean(row.generated)}
      presence={[
        { rowId: "TC-004", columnId: "title", name: "김지은", color: 1 },
        {
          rowId: "TC-005",
          columnId: "pre",
          name: "춤추는 수달",
          color: 3,
          guest: true,
        },
      ]}
      footer={
        <Button variant="ghost" size="sm" icon={Plus}>
          케이스 추가
        </Button>
      }
    />
  );
}

function SortableDemo() {
  const [items, setItems] = useState(["회원가입", "로그인", "상품 목록"]);
  return (
    <SortableList
      aria-label="순서 바꾸기 예시"
      className="w-72 rounded-lg border border-line bg-surface"
      divided
      items={items}
      getId={(item) => item}
      getHandleLabel={(item) => `${item} 순서 이동`}
      onReorder={setItems}
      renderItem={(item, handle) => (
        <div className="flex items-center gap-2 px-3 py-2 text-body-sm">
          {handle}
          {item}
        </div>
      )}
    />
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <Row>
      <Button
        onClick={() =>
          toast.show({ message: "케이스 52개를 추가했습니다", tone: "success" })
        }
      >
        완료 토스트
      </Button>
      <Button
        onClick={() =>
          toast.show({
            message: "파일을 만들지 못했습니다. 다시 시도하세요.",
            tone: "danger",
          })
        }
      >
        오류 토스트
      </Button>
    </Row>
  );
}

function Preview() {
  const [theme, setTheme] = useState<Theme>("system");
  const [step, setStep] = useState(2);
  const steps = [
    "화면 살펴보기",
    "사용 흐름 이해하기",
    "테스트 케이스 작성하기",
    "마무리하기",
  ];
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="m-0 flex-1 text-title-lg text-fg">공통 컴포넌트</h1>
        <Tabs.Root
          value={theme}
          onValueChange={(value) => {
            setTheme(value as Theme);
            applyTheme(value as Theme);
          }}
        >
          <Tabs.List variant="pill" aria-label="테마">
            <Tabs.Tab value="system">시스템</Tabs.Tab>
            <Tabs.Tab value="light">라이트</Tabs.Tab>
            <Tabs.Tab value="dark">다크</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
      </header>

      <Section title="버튼">
        <Row>
          <Button variant="primary" icon={Plus}>
            새 테스트 세트
          </Button>
          <Button icon={Download}>XLSX 내보내기</Button>
          <Button variant="ai" icon={Sparkles}>
            케이스 추가 생성
          </Button>
          <Button variant="ghost">취소</Button>
          <Button variant="danger" icon={Trash2}>
            삭제
          </Button>
          <Button variant="primary" loading>
            저장
          </Button>
        </Row>
        <Row>
          <Button size="sm">작게</Button>
          <Button size="lg" variant="primary">
            크게
          </Button>
          <IconButton icon={MoreHorizontal} label="작업" />
          <IconButton icon={Table} label="표 보기" pressed />
          <IconButton icon={Copy} label="복사" variant="solid" size="sm" />
          <Button render={<a href="#links" />} nativeButton={false} icon={Link}>
            링크로 그린 버튼
          </Button>
        </Row>
      </Section>

      <Section title="입력">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="테스트 세트 이름"
            required
            counter="13/100"
            defaultValue="2.4.0 회원가입 개편"
          />
          <TextField label="검색" icon={Search} placeholder="케이스 검색" />
          <TextField label="기본 기간" defaultValue="90" trailing="일" />
          <TextField
            label="이메일"
            defaultValue="abc"
            error="이메일 형식이 아닙니다"
          />
          <Select
            label="프로젝트"
            defaultValue="shop"
            items={[
              { value: "shop", label: "쇼핑몰 앱 리뉴얼" },
              { value: "approval", label: "사내 결재 시스템" },
              { value: "bot", label: "고객센터 챗봇", disabled: true },
            ]}
          />
          <Select
            label="공개 범위"
            defaultValue="private"
            items={[
              {
                value: "private",
                label: "비공개",
                description: "초대한 사람만",
                icon: Lock,
              },
              {
                value: "public",
                label: "공개",
                description: "링크가 있는 누구나",
                icon: Globe,
              },
            ]}
          />
        </div>
        <TextArea
          label="메모"
          placeholder="이번 배포에서 바뀐 점, 꼭 확인할 부분"
        />
      </Section>

      <Section title="선택 컨트롤">
        <Row>
          <Checkbox label="화면 진입과 첫 상태" defaultChecked />
          <Checkbox label="중간 취소와 뒤로 가기" />
          <Checkbox aria-label="일부 선택" indeterminate />
          <Switch label="만료일 필수" defaultChecked />
          <Switch label="링크 공유" />
        </Row>
        <RadioGroup
          aria-label="링크 권한"
          defaultValue="edit"
          orientation="horizontal"
          options={[
            { value: "edit", label: "편집 가능" },
            { value: "view", label: "보기만 가능" },
          ]}
        />
      </Section>

      <Section title="메뉴와 탭">
        <Row>
          <Menu.Root>
            <Menu.Trigger
              render={
                <IconButton
                  icon={MoreHorizontal}
                  label="역할 작업"
                  variant="solid"
                />
              }
            />
            <Menu.Popup>
              <Menu.Item icon={Copy}>복제</Menu.Item>
              <Menu.Item>이름 변경</Menu.Item>
              <Menu.Separator />
              <Menu.Item icon={Trash2} tone="danger">
                삭제
              </Menu.Item>
            </Menu.Popup>
          </Menu.Root>
        </Row>
        <Toolbar aria-label="도구 상자">
          <IconButton icon={Copy} label="복사" size="sm" />
          <ToolbarSeparator />
          <ToolbarMenu icon={MoreHorizontal} label="수정">
            <Menu.Item icon={Copy} shortcut="⌘C">
              복사
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item icon={Trash2} tone="danger" disabled>
              행 삭제
            </Menu.Item>
          </ToolbarMenu>
        </Toolbar>
        <Tabs.Root defaultValue="template">
          <Tabs.List aria-label="프로젝트 설정">
            <Tabs.Tab value="template">기본 양식</Tabs.Tab>
            <Tabs.Tab value="groups">기능 그룹</Tabs.Tab>
            <Tabs.Tab value="required" count={14}>
              필수 케이스
            </Tabs.Tab>
            <Tabs.Tab value="screens">화면 구조</Tabs.Tab>
            <Tabs.Tab value="memo">메모</Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
        <Breadcrumb>
          <BreadcrumbItem render={<a href="#tests" />}>
            테스트 세트
          </BreadcrumbItem>
          <BreadcrumbItem current>2.4.0 회원가입 개편</BreadcrumbItem>
        </Breadcrumb>
      </Section>

      <Section title="표시">
        <Row>
          <Badge>보기 전용</Badge>
          <Badge tone="accent" icon={Sparkles}>
            AI
          </Badge>
          <Badge tone="figma">Figma</Badge>
          <Badge tone="success" dot>
            활성
          </Badge>
          <Badge tone="warning" dot>
            확인 필요 4
          </Badge>
          <Badge tone="danger" dot>
            만료
          </Badge>
          <Badge tone="info" icon={Globe}>
            공개
          </Badge>
          <Tag onRemove={() => undefined}>회원</Tag>
        </Row>
        <Row>
          <SaveStatus state="saved" meta="방금" />
          <SaveStatus state="saving" />
          <SaveStatus state="dirty" />
          <SaveStatus state="error" />
          <Avatars
            people={[
              { id: "a", name: "최하늘", color: 2 },
              { id: "b", name: "김지은", color: 1 },
              { id: "c", name: "춤추는 수달", color: 3, guest: true },
              { id: "d", name: "박민수", color: 4 },
              { id: "e", name: "이서연", color: 5 },
              { id: "f", name: "정우진", color: 6 },
            ]}
          />
        </Row>
      </Section>

      <Section title="생성 진행">
        <StepList
          aria-label="진행 단계"
          steps={steps.map((label, index) => ({
            key: label,
            label,
            state:
              index < step ? "done" : index === step ? "active" : "pending",
          }))}
        />
        <Row>
          <Button
            size="sm"
            onClick={() => setStep((s) => (s + 1) % (steps.length + 1))}
          >
            다음 단계
          </Button>
        </Row>
      </Section>

      <Section title="업로드 진행">
        <Progress
          label="업로드 중"
          value={(step / steps.length) * 100}
          className="max-w-sm"
        />
      </Section>

      <Section title="순서 바꾸기">
        <SortableDemo />
      </Section>

      <Section title="표">
        <GridDemo />
      </Section>

      <Section title="카드와 안내">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <FrameCard name="회원가입_시작" />
          <FrameCard name="회원가입_이메일" selected />
          <FrameCard name="휴대폰인증_입력" state="uploading" />
          <FrameCard name="가입완료" state="done" />
          <FrameCard name="중복가입_안내" state="failed" />
        </div>
        <ReviewCard
          title="탈퇴한 회원의 이메일로 다시 가입할 수 있는가"
          reason="화면마다 재가입 제한 기간이 다르게 적혀 있습니다."
          actions={
            <>
              <Button variant="ghost">제외</Button>
              <Button variant="primary">테스트 세트에 추가</Button>
            </>
          }
        >
          <TextArea aria-label="답변" placeholder="답변" rows={2} />
        </ReviewCard>
        <Banner tone="warning" title="확인 필요 4건">
          예상 결과를 정하지 못한 케이스가 있습니다.
        </Banner>
        <EmptyState
          icon={FileSearch}
          title="테스트 세트가 없습니다"
          actions={
            <Button variant="primary" icon={Plus}>
              새 테스트 세트
            </Button>
          }
        />
      </Section>

      <Section title="다이얼로그와 토스트">
        <Row>
          <Dialog.Root>
            <Dialog.Trigger render={<Button icon={Link} />}>
              공유
            </Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Header title="공유" />
              <Dialog.Body>
                <Select
                  aria-label="공개 범위"
                  defaultValue="public"
                  items={[
                    {
                      value: "private",
                      label: "비공개",
                      description: "초대한 사람만",
                      icon: Lock,
                    },
                    {
                      value: "public",
                      label: "공개",
                      description: "링크가 있는 누구나",
                      icon: Globe,
                    },
                  ]}
                />
                <TextField
                  aria-label="공유 링크"
                  readOnly
                  defaultValue="example.com/s/7Kq2xVm"
                />
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.Close render={<Button variant="primary" />}>
                  완료
                </Dialog.Close>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Root>
        </Row>
        <ToastDemo />
      </Section>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <Preview />
        </ToastProvider>
      </MotionConfig>
    </StrictMode>,
  );
}
