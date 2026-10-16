import {
  Button,
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Surface,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@cheddar/ui";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";

function ComponentPreview() {
  const [project, setProject] = useState<{
    value: string;
    label: string;
  } | null>(null);
  const projects = [
    { value: "commerce", label: "커머스 QA" },
    { value: "account", label: "계정 QA" },
  ];
  const [checked, setChecked] = useState(true);
  const [mixed, setMixed] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [requiredValue, setRequiredValue] = useState("");
  const [layout, setLayout] = useState("list");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider>
      <main className="mx-auto min-h-screen max-w-content bg-background p-page text-foreground">
        <h1 className="mb-8 text-title font-heading">컴포넌트</h1>
        <div className="grid items-start gap-6 md:grid-cols-2">
          <Surface className="grid gap-4">
            <h2 className="text-heading font-heading">프로젝트 검색</h2>
            <Label htmlFor="preview-project">프로젝트</Label>
            <Combobox
              items={projects}
              value={project}
              onValueChange={setProject}
            >
              <ComboboxInput id="preview-project" placeholder="프로젝트 검색" />
              <ComboboxContent>
                <ComboboxEmpty>검색 결과 없음</ComboboxEmpty>
                <ComboboxList>
                  {(item) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">툴바 32</Button>
              <Input aria-label="폼 40" placeholder="폼 40" />
            </div>
          </Surface>
          <Surface className="grid gap-4">
            <h2 className="text-heading font-heading">Button</h2>
            <div className="flex flex-wrap gap-3">
              <Button>기본</Button>
              <Button variant="secondary">보조</Button>
              <Button variant="outline">테두리</Button>
              <Button variant="ghost">배경 없음</Button>
              <Button variant="destructive">삭제</Button>
              <Button variant="link">링크</Button>
              <Button disabled>비활성</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">작게</Button>
              <Button>보통</Button>
              <Button size="lg">크게</Button>
            </div>
          </Surface>
          <Surface className="grid gap-4">
            <h2 className="text-heading font-heading">Input / Textarea</h2>
            <div className="grid gap-2">
              <Label htmlFor="preview-name">이름</Label>
              <Input id="preview-name" defaultValue={name} key={name} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="preview-required">필수 입력</Label>
              <Input
                id="preview-required"
                required
                value={requiredValue}
                onValueChange={setRequiredValue}
                aria-invalid={!requiredValue.trim()}
                aria-describedby={
                  !requiredValue.trim() ? "preview-error" : undefined
                }
              />
              {!requiredValue.trim() && (
                <p id="preview-error" className="text-caption text-danger">
                  값을 입력하세요.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="preview-disabled">비활성 입력</Label>
              <Input id="preview-disabled" disabled defaultValue="편집 불가" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="preview-notes">내용</Label>
              <Textarea id="preview-notes" />
            </div>
          </Surface>
          <Surface className="grid gap-4">
            <h2 className="text-heading font-heading">
              Checkbox / RadioGroup / Switch
            </h2>
            <Label>
              <Checkbox
                name="selected"
                checked={checked}
                onCheckedChange={setChecked}
              />
              항목 선택
            </Label>
            <Label>
              <Checkbox
                indeterminate={mixed}
                onCheckedChange={() => setMixed(false)}
              />
              일부 선택
            </Label>
            <Label>
              <Checkbox defaultChecked disabled />
              비활성 선택
            </Label>
            <RadioGroup
              value={layout}
              onValueChange={setLayout}
              aria-label="보기 방식"
              name="layout"
            >
              <Label>
                <RadioGroupItem value="list" />
                목록
              </Label>
              <Label>
                <RadioGroupItem value="grid" />
                그리드
              </Label>
              <Label>
                <RadioGroupItem value="disabled" disabled />
                사용 불가
              </Label>
            </RadioGroup>
            <Label>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                name="notifications"
              />
              알림
            </Label>
            <Label>
              <Switch defaultChecked disabled />
              비활성 알림
            </Label>
            <Button
              variant="outline"
              onClick={() => {
                setChecked(true);
                setMixed(true);
                setEnabled(false);
                setLayout("list");
              }}
            >
              초기화
            </Button>
          </Surface>
          <Surface className="grid gap-4">
            <h2 className="text-heading font-heading">Select</h2>
            <div className="grid gap-2">
              <Label id="preview-sort-label">정렬</Label>
              <Select
                defaultValue="recent"
                items={{
                  recent: "최신순",
                  name: "이름순",
                  unavailable: "사용 불가",
                }}
                name="sort"
              >
                <SelectTrigger aria-labelledby="preview-sort-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">최신순</SelectItem>
                  <SelectItem value="name">이름순</SelectItem>
                  <SelectItem value="unavailable" disabled>
                    사용 불가
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select
              disabled
              defaultValue="disabled"
              items={{ disabled: "선택 불가" }}
            >
              <SelectTrigger aria-label="비활성 정렬">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">선택 불가</SelectItem>
              </SelectContent>
            </Select>
          </Surface>
          <Surface className="grid gap-4">
            <h2 className="text-heading font-heading">Tabs</h2>
            <Tabs defaultValue="all">
              <TabsList aria-label="항목 상태">
                <TabsTrigger value="all">전체</TabsTrigger>
                <TabsTrigger value="done">완료</TabsTrigger>
                <TabsTrigger value="disabled" disabled>
                  사용 불가
                </TabsTrigger>
              </TabsList>
              <TabsContent value="all">전체 항목이 없습니다.</TabsContent>
              <TabsContent value="done">완료 항목이 없습니다.</TabsContent>
            </Tabs>
          </Surface>
          <Surface className="grid gap-4">
            <h2 className="text-heading font-heading">Dialog / Tooltip</h2>
            <Dialog
              open={open}
              onOpenChange={(next) => {
                if (next) setDraft(name);
                setOpen(next);
              }}
            >
              <div className="flex gap-3">
                <DialogTrigger render={<Button variant="outline" />}>
                  이름 변경
                </DialogTrigger>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DialogTrigger
                        render={<Button variant="ghost" size="icon" />}
                        aria-label="이름 변경"
                      />
                    }
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m16 3 5 5-12 12H4v-5Z M14 5l5 5" />
                    </svg>
                  </TooltipTrigger>
                  <TooltipContent>이름 변경</TooltipContent>
                </Tooltip>
              </div>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>이름 변경</DialogTitle>
                </DialogHeader>
                <form
                  className="grid gap-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setName(draft);
                    setOpen(false);
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="dialog-name">이름</Label>
                    <Input
                      id="dialog-name"
                      value={draft}
                      onValueChange={setDraft}
                      required
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      취소
                    </DialogClose>
                    <Button type="submit">저장</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </Surface>
        </div>
      </main>
    </TooltipProvider>
  );
}

const root = document.getElementById("root");
if (root && import.meta.env.DEV)
  createRoot(root).render(
    <StrictMode>
      <ComponentPreview />
    </StrictMode>,
  );
