import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Icon, Phone } from "./art";
import {
  Dialog,
  EmptyState,
  Field,
  IconButton,
  MenuItem,
  Skeleton,
} from "./components";
import { CandidateReview, CaseFields, TestScenarioContent } from "./editor";
import { downloadTestScenario } from "./io";
import {
  ColumnsEditor,
  FlowEditor,
  IAManager,
  TemplateLibrary,
} from "./managers";
import {
  blankCase,
  cellValue,
  clone,
  type DemoState,
  frames,
  generate,
  initialProjects,
  initialTemplates,
  newProject,
  newTestScenario,
  type Project,
  type TestCase,
  type TestScenario,
} from "./model";
import "./prototype.css";

type Route = {
  page:
    | "projects"
    | "project"
    | "incoming"
    | "sources"
    | "prepare"
    | "testScenario"
    | "candidates"
    | "ia"
    | "templates"
    | "flow"
    | "share";
  pid?: string;
  sid?: string;
  stage?: number;
  returnTo?: "prepare" | "testScenario" | "project";
};
const params = new URLSearchParams(location.search);
const motionDuration =
  parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--duration-state",
    ),
  ) / 1000 || 0.18;
const allowedScenarios: DemoState[] = [
  "normal",
  "empty",
  "generation-error",
  "no-results",
  "candidates-only",
  "partial-import",
];
const scenario: DemoState =
  allowedScenarios.find((s) => s === params.get("scenario")) ?? "normal";
const titles: Record<string, string> = {
  projectMenu: "프로젝트",
  testScenarioMenu: "시나리오",
  settings: "보기 설정",
  layout: "레이아웃",
  columns: "열",
  filter: "필터",
  newProject: "프로젝트 만들기",
  projectInfo: "프로젝트 정보",
  rename: "시나리오 이름",
  add: "새 시나리오",
  generationSettings: "생성 설정",
  source: "관련 화면",
  detail: "테스트 케이스 편집",
  candidateDetail: "검토 후보 편집",
  list: "테스트 케이스 목록",
  note: "메모",
  export: "XLSX 내보내기",
  share: "시나리오 공유",
  replace: "테스트 케이스 다시 생성",
  delete: "테스트 케이스 삭제",
  shareDetail: "테스트 케이스 상세",
  testScenarioTemplate: "새 시나리오",
  projectTemplate: "프로젝트 기본 양식",
};
function App() {
  const [templates, setTemplates] = useState(initialTemplates);
  const [pendingTestScenario, setPendingTestScenario] = useState<{
    pid: string;
    manual: boolean;
    selected: string[];
  } | null>(null);
  const [templateChoice, setTemplateChoice] = useState("template-default");
  const [projects, setProjects] = useState(() => initialProjects(scenario));
  const [route, setRoute] = useState<Route>(() =>
    params.get("from") === "figma"
      ? { page: "incoming" }
      : { page: "projects" },
  );
  const [panels, setPanels] = useState<string[]>([]);
  const panel = panels.at(-1);
  const [target, setTarget] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [draftName, setDraftName] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [intake, setIntake] = useState(() => {
    const ids = params
      .get("frames")
      ?.split(",")
      .filter((id) => frames.some((f) => f.id === id));
    return (ids?.length ? ids : frames.map((f) => f.id)).filter(
      (id) => scenario !== "partial-import" || id !== "complete",
    );
  });
  const [failedFrame, setFailedFrame] = useState(scenario === "partial-import");
  const [destination, setDestination] = useState(
    () => initialProjects(scenario)[0]?.id ?? "new",
  );
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    action?: () => void;
    label?: string;
  } | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [shareTestScenario, setShareTestScenario] =
    useState<TestScenario | null>(null);
  const [generationFailedOnce, setGenerationFailedOnce] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const anchor = useRef<{ left: number; bottom: number }>({
    left: 0,
    bottom: 64,
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());
  const scroll = useRef(new Map<string, number>());
  const project = projects.find((p) => p.id === route.pid);
  const testScenario = project?.testScenarios.find((s) => s.id === route.sid);
  const reduced = useReducedMotion();
  const routeKey = (r: Route) =>
    `${r.page}:${r.pid ?? ""}:${r.sid ?? ""}:${r.stage ?? ""}`;
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550);
    const pop = (e: PopStateEvent) => {
      setRoute(e.state?.prototypeRoute ?? { page: "projects" });
      setPanels([]);
      setSearchOpen(false);
      setQuery("");
    };
    window.addEventListener("popstate", pop);
    const activeTimers = timers.current;
    return () => {
      clearTimeout(t);
      window.removeEventListener("popstate", pop);
      for (const values of activeTimers.values()) values.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = (next: Route) => {
    scroll.current.set(routeKey(route), window.scrollY);
    history.pushState(
      { prototypeRoute: next },
      "",
      `#${next.page}${next.sid ? `/${next.sid}` : ""}`,
    );
    setRoute(next);
    setPanels([]);
    setQuery("");
    setPriority("all");
    setSearchOpen(false);
    setError("");
    requestAnimationFrame(() => {
      window.scrollTo(0, scroll.current.get(routeKey(next)) ?? 0);
      mainRef.current?.focus({ preventScroll: true });
    });
  };
  const open = (name: string) => {
    const rect = (
      document.activeElement as HTMLElement | null
    )?.getBoundingClientRect();
    if (rect) anchor.current = { left: rect.right - 360, bottom: rect.bottom };
    setError("");
    setPanels([name]);
  };
  const enter = (name: string) => {
    setError("");
    setPanels((p) => [...p, name]);
  };
  const close = () => {
    setPanels([]);
    setError("");
  };
  const notify = (message: string, action?: () => void, label?: string) =>
    setToast({ message, action, label });
  const updateProject = (id: string, patch: Partial<Project>) => {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const mutateTestScenario = (
    pid: string,
    sid: string,
    fn: (s: TestScenario) => TestScenario,
  ) => {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === pid
          ? {
              ...p,
              testScenarios: p.testScenarios.map((s) =>
                s.id === sid ? fn(s) : s,
              ),
            }
          : p,
      ),
    );
  };
  const patchTestScenario = (patch: Partial<TestScenario>) => {
    if (project && testScenario)
      mutateTestScenario(project.id, testScenario.id, (s) => {
        if (s.generation !== "running") return { ...s, ...patch };
        return {
          ...s,
          layout: patch.layout ?? s.layout,
          activeId: patch.activeId ?? s.activeId,
        };
      });
  };
  const patchCase = (id: string, patch: Partial<TestCase>) => {
    if (!testScenario || !project || testScenario.generation === "running")
      return;
    const old = testScenario.cases.find((c) => c.id === id);
    const contentChanged = [
      "title",
      "precondition",
      "data",
      "steps",
      "expected",
    ].some(
      (key) =>
        key in patch &&
        patch[key as keyof TestCase] !== old?.[key as keyof TestCase],
    );
    if (contentChanged && old?.result !== "미진행")
      notify("내용이 변경되어 테스트 결과를 미진행으로 바꿨습니다.");
    mutateTestScenario(project.id, testScenario.id, (s) => ({
      ...s,
      cases: s.cases.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              ...(contentChanged ? { result: "미진행" as const } : {}),
            }
          : c,
      ),
    }));
  };
  const source = (ids: string[]) => {
    setSourceIds(ids);
    setSourceIndex(0);
    open("source");
  };
  const createTestScenario = (manual: boolean, selected: string[] = []) => {
    if (!project) return;
    setPendingTestScenario({ pid: project.id, manual, selected });
    setTemplateChoice(project.templateId);
    setDraftName("새 시나리오");
    open("testScenarioTemplate");
  };
  const confirmTestScenario = () => {
    if (!pendingTestScenario) return;
    const template = templates.find((t) => t.id === templateChoice);
    const p = projects.find((p) => p.id === pendingTestScenario.pid);
    if (!template || !p || !draftName.trim()) return;
    const s = newTestScenario(draftName.trim(), template.columns);
    s.templateId = template.id;
    s.templateVersion = template.version;
    s.selectedFrames = pendingTestScenario.selected;
    updateProject(p.id, { testScenarios: [...p.testScenarios, s] });
    navigate({
      page: pendingTestScenario.manual ? "testScenario" : "prepare",
      pid: p.id,
      sid: s.id,
      stage: pendingTestScenario.selected.length ? 1 : 0,
    });
    setPendingTestScenario(null);
  };
  const addCase = () => {
    if (!testScenario) return;
    const item = blankCase(
      Math.max(0, ...testScenario.cases.map((c) => c.number)) + 1,
    );
    patchTestScenario({
      cases: [...testScenario.cases, item],
      activeId: item.id,
    });
    setTarget(item.id);
    open("detail");
  };
  const deleteCases = () => {
    if (!testScenario || !project) return;
    const sid = testScenario.id,
      pid = project.id;
    const removed = testScenario.cases.filter((c) => deleteIds.includes(c.id));
    const positions = removed.map((c) => testScenario.cases.indexOf(c));
    mutateTestScenario(pid, sid, (s) => ({
      ...s,
      cases: s.cases.filter((c) => !deleteIds.includes(c.id)),
      candidates: s.candidates.map((c) =>
        deleteIds.includes(c.id) ? { ...c, status: "pending" } : c,
      ),
    }));
    close();
    notify(
      `${removed.length}개 테스트 케이스를 삭제했습니다.`,
      () => {
        mutateTestScenario(pid, sid, (s) => {
          const cases = [...s.cases];
          removed.forEach((c, i) => {
            if (!cases.some((x) => x.id === c.id))
              cases.splice(Math.min(positions[i], cases.length), 0, c);
          });
          return {
            ...s,
            cases,
            candidates: s.candidates.map((c) =>
              removed.some((x) => x.id === c.id)
                ? { ...c, status: "added" }
                : c,
            ),
          };
        });
        setToast(null);
      },
      "실행 취소",
    );
  };
  const cancelGeneration = (pid: string, sid: string) => {
    timers.current.get(sid)?.forEach(clearTimeout);
    timers.current.delete(sid);
    mutateTestScenario(pid, sid, (s) => ({
      ...s,
      generation: "idle",
      step: 0,
    }));
    notify("생성을 취소했습니다.");
  };
  const runGeneration = () => {
    if (!project || !testScenario) return;
    const pid = project.id,
      sid = testScenario.id,
      input = clone(testScenario);
    const fail = scenario === "generation-error" && !generationFailedOnce;
    setGenerationFailedOnce(true);
    timers.current.get(sid)?.forEach(clearTimeout);
    mutateTestScenario(pid, sid, (s) => ({
      ...s,
      generation: "running",
      step: 0,
    }));
    navigate({ page: "testScenario", pid, sid });
    const list = [1, 2].map((step) =>
      setTimeout(
        () => mutateTestScenario(pid, sid, (s) => ({ ...s, step })),
        step * 1100,
      ),
    );
    list.push(
      setTimeout(() => {
        timers.current.delete(sid);
        if (fail) {
          mutateTestScenario(pid, sid, (s) => ({ ...s, generation: "failed" }));
          return;
        }
        const result = generate(input, scenario);
        mutateTestScenario(pid, sid, (s) => ({
          ...s,
          ...result,
          layout: s.layout,
          activeId: result.cases[0]?.id ?? "",
          generation: "idle",
          step: 0,
        }));
        notify(`${result.cases.length}개 테스트 케이스를 생성했습니다.`);
      }, 3500),
    );
    timers.current.set(sid, list);
  };
  const back = () => {
    if (
      route.page === "project" ||
      route.page === "incoming" ||
      route.page === "templates"
    )
      navigate({ page: "projects" });
    else if (["candidates", "prepare", "share"].includes(route.page))
      navigate({ page: "testScenario", pid: route.pid, sid: route.sid });
    else if (route.page === "flow")
      navigate({
        page: route.returnTo === "prepare" ? "prepare" : "testScenario",
        pid: route.pid,
        sid: route.sid,
        stage: 1,
      });
    else navigate({ page: "project", pid: route.pid });
  };
  const title =
    route.page === "projects"
      ? "프로젝트"
      : route.page === "incoming"
        ? "가져온 화면"
        : route.page === "project"
          ? project?.name
          : route.page === "sources"
            ? "화면 자료"
            : route.page === "ia"
              ? "화면 목록"
              : route.page === "templates"
                ? "공용 양식"
                : route.page === "prepare"
                  ? "테스트 준비"
                  : route.page === "flow"
                    ? "사용자 흐름"
                    : route.page === "candidates"
                      ? "검토 후보"
                      : route.page === "share"
                        ? shareTestScenario?.name
                        : testScenario?.name;
  const sharedCase = shareTestScenario?.cases.find((c) => c.id === target);
  const currentCase = testScenario?.cases.find((c) => c.id === target);
  const currentCandidate = testScenario?.candidates.find(
    (c) => c.id === target,
  );
  const selectedSource = frames.find((f) => f.id === sourceIds[sourceIndex]);
  const locked = testScenario?.generation === "running";
  const frameGrid = (
    ids: string[],
    selected: string[],
    toggle: (id: string) => void,
  ) => (
    <div className="frame-grid">
      {frames
        .filter((f) => ids.includes(f.id))
        .map((f) => (
          <div
            className={`frame-tile ${selected.includes(f.id) ? "is-selected" : ""}`}
            key={f.id}
          >
            <button
              type="button"
              className="frame-image"
              aria-label={`${f.name} 미리보기`}
              onClick={() => source([f.id])}
            >
              <Phone frame={f} />
            </button>
            <label className="frame-caption">
              <input
                type="checkbox"
                checked={selected.includes(f.id)}
                onChange={() => toggle(f.id)}
              />
              <span>{f.name}</span>
              <small>{f.screen}</small>
            </label>
          </div>
        ))}
    </div>
  );
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((x) => x !== id) : [...items, id];
  return (
    <MotionConfig reducedMotion="user">
      <div className="prototype">
        <button
          type="button"
          className="skip-link"
          onClick={() => mainRef.current?.focus()}
        >
          본문으로 이동
        </button>
        <header className="app-header">
          <div className="breadcrumb">
            {route.page !== "projects" && (
              <IconButton name="back" label="이전 화면" onClick={back} />
            )}
            <button
              type="button"
              className="workspace-mark"
              aria-label="프로젝트 목록"
              onClick={() => navigate({ page: "projects" })}
            >
              <Icon name="grid" />
            </button>
            {project && route.page !== "project" && (
              <>
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => navigate({ page: "project", pid: project.id })}
                >
                  {project.name}
                </button>
                <span className="breadcrumb-separator">/</span>
              </>
            )}
            <span className="breadcrumb-current">{title}</span>
            {route.page === "share" && (
              <span className="status-chip">읽기 전용</span>
            )}
          </div>
          <div className="header-actions">
            {["projects", "project"].includes(route.page) && (
              <IconButton
                name="search"
                label="검색"
                active={searchOpen}
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setQuery("");
                }}
              />
            )}
            {route.page === "projects" && (
              <IconButton
                name="file"
                label="공용 양식"
                onClick={() => navigate({ page: "templates" })}
              />
            )}
            {route.page === "projects" && (
              <IconButton
                name="plus"
                label="프로젝트 만들기"
                onClick={() => {
                  setDraftName("");
                  open("newProject");
                }}
              />
            )}
            {route.page === "project" && (
              <>
                <IconButton
                  name="plus"
                  label="시나리오 추가"
                  onClick={() => open("add")}
                />
                <IconButton
                  name="more"
                  label="프로젝트 메뉴"
                  onClick={() => open("projectMenu")}
                />
              </>
            )}
            {route.page === "testScenario" && (
              <IconButton
                name="more"
                label="시나리오 메뉴"
                onClick={() => open("testScenarioMenu")}
              />
            )}
          </div>
        </header>
        <main ref={mainRef} tabIndex={-1} className={`main page-${route.page}`}>
          {searchOpen &&
            route.page !== "testScenario" &&
            route.page !== "share" && (
              <div className="search-strip">
                <Icon name="search" />
                <input
                  ref={searchRef}
                  aria-label="검색어"
                  placeholder="검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <IconButton
                  name="close"
                  label="검색 지우기"
                  onClick={() => {
                    setQuery("");
                    setSearchOpen(false);
                  }}
                />
              </div>
            )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={routeKey(route)}
              className="page-content"
              initial={{ opacity: 0, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : motionDuration }}
            >
              {(route.page === "testScenario" || route.page === "share") &&
                testScenario && (
                  <div className="database-heading">
                    <div className="database-title">
                      <Icon name="file" />
                      <h1>{testScenario.name}</h1>
                    </div>
                    <div className="database-toolbar">
                      <span className="database-view">
                        <Icon
                          name={
                            (route.page === "share"
                              ? shareTestScenario
                              : testScenario
                            )?.layout === "table"
                              ? "table"
                              : "qa"
                          }
                        />
                        {(route.page === "share"
                          ? shareTestScenario
                          : testScenario
                        )?.layout === "table"
                          ? "표"
                          : "QA 진행"}
                      </span>
                      <span className="database-count">
                        {testScenario.cases.length}개
                      </span>
                      <div className="database-actions">
                        {searchOpen && (
                          <input
                            ref={searchRef}
                            className="database-search"
                            aria-label="검색어"
                            placeholder="검색"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setQuery("");
                                setSearchOpen(false);
                              }
                            }}
                          />
                        )}
                        {route.page !== "share" && (
                          <IconButton
                            name="search"
                            label="검색"
                            active={searchOpen}
                            onClick={() => {
                              setSearchOpen((v) => !v);
                              setQuery("");
                            }}
                          />
                        )}
                        <IconButton
                          name="settings"
                          label="보기 설정"
                          onClick={() => open("settings")}
                        />
                        {route.page !== "share" && (
                          <span className="database-add">
                            <IconButton
                              name="plus"
                              label="테스트 케이스 추가"
                              disabled={locked}
                              onClick={addCase}
                            />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              {route.page === "projects" && (
                <div className="collection-page">
                  <div className="page-title">
                    <h1>프로젝트</h1>
                    <span>{projects.length}</span>
                  </div>
                  {loading ? (
                    <Skeleton cards />
                  ) : !projects.length ? (
                    <EmptyState title="프로젝트가 없습니다">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          setDraftName("");
                          open("newProject");
                        }}
                      >
                        프로젝트 만들기
                        <Icon name="plus" />
                      </button>
                    </EmptyState>
                  ) : (
                    <div className="project-grid">
                      {projects
                        .filter((p) =>
                          p.name.toLowerCase().includes(query.toLowerCase()),
                        )
                        .map((p) => (
                          <button
                            type="button"
                            className="project-card"
                            key={p.id}
                            onClick={() =>
                              navigate({ page: "project", pid: p.id })
                            }
                          >
                            <span className="project-art">
                              <span />
                              <span />
                              <Icon name="folder" />
                            </span>
                            <div className="project-card-content">
                              <h2>{p.name}</h2>
                              <p>
                                시나리오 {p.testScenarios.length} · 화면{" "}
                                {p.frameIds.length}
                              </p>
                            </div>
                            <Icon name="arrow" />
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {route.page === "project" && project && (
                <div className="collection-page">
                  <div className="page-title">
                    <h1>테스트 시나리오</h1>
                    <span>{project.testScenarios.length}</span>
                  </div>
                  {!project.testScenarios.length ? (
                    <EmptyState title="테스트 시나리오가 없습니다">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => createTestScenario(false)}
                      >
                        테스트 케이스 생성
                        <Icon name="arrow" />
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => createTestScenario(true)}
                      >
                        빈 시나리오 만들기
                      </button>
                    </EmptyState>
                  ) : (
                    <div className="test-scenario-list">
                      {project.testScenarios
                        .filter((s) =>
                          s.name.toLowerCase().includes(query.toLowerCase()),
                        )
                        .map((s) => (
                          <button
                            type="button"
                            className="test-scenario-row"
                            key={s.id}
                            onClick={() =>
                              navigate({
                                page: "testScenario",
                                pid: project.id,
                                sid: s.id,
                              })
                            }
                          >
                            <span className="test-scenario-symbol">
                              <Icon name={s.layout === "qa" ? "qa" : "table"} />
                            </span>
                            <div>
                              <h2>{s.name}</h2>
                              <p>
                                {s.generation === "running"
                                  ? "생성 중"
                                  : `${s.cases.length}개 테스트 케이스`}
                                {s.candidates.some(
                                  (c) => c.status === "pending",
                                ) &&
                                  ` · 검토 후보 ${s.candidates.filter((c) => c.status === "pending").length}개`}
                              </p>
                            </div>
                            <Icon name="arrow" />
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {route.page === "incoming" && (
                <div className="collection-page">
                  <div className="page-title">
                    <h1>가져온 화면</h1>
                    <span>{intake.length}</span>
                  </div>
                  {frameGrid(
                    frames
                      .filter((f) => !failedFrame || f.id !== "complete")
                      .map((f) => f.id),
                    intake,
                    (id) => setIntake(toggle(intake, id)),
                  )}
                  {failedFrame && (
                    <div className="notice" role="status">
                      <p>
                        주문 완료 화면을 가져오지 못했습니다. 나머지 화면으로
                        계속할 수 있습니다.
                      </p>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => {
                          setFailedFrame(false);
                          setIntake((ids) => [
                            ...new Set([...ids, "complete"]),
                          ]);
                        }}
                      >
                        다시 가져오기
                      </button>
                    </div>
                  )}
                  <div className="intake-footer">
                    <Field label="프로젝트">
                      <select
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        <option value="new">새 프로젝트</option>
                      </select>
                    </Field>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!intake.length}
                      onClick={() => {
                        const p =
                          projects.find((x) => x.id === destination) ??
                          newProject("새 프로젝트");
                        const updated = {
                          ...p,
                          frameIds: Array.from(
                            new Set([...p.frameIds, ...intake]),
                          ),
                        };
                        setProjects((ps) =>
                          ps.some((x) => x.id === p.id)
                            ? ps.map((x) => (x.id === p.id ? updated : x))
                            : [...ps, updated],
                        );
                        navigate({ page: "sources", pid: p.id });
                      }}
                    >
                      자료만 추가
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={!intake.length}
                      onClick={() => {
                        const p =
                          projects.find((x) => x.id === destination) ??
                          newProject("새 프로젝트");
                        const updated = {
                          ...p,
                          frameIds: Array.from(
                            new Set([...p.frameIds, ...intake]),
                          ),
                        };
                        setProjects((ps) =>
                          ps.some((x) => x.id === p.id)
                            ? ps.map((x) => (x.id === p.id ? updated : x))
                            : [...ps, updated],
                        );
                        setPendingTestScenario({
                          pid: p.id,
                          manual: false,
                          selected: [...intake],
                        });
                        setTemplateChoice(p.templateId);
                        setDraftName("새 시나리오");
                        open("testScenarioTemplate");
                      }}
                    >
                      테스트 준비
                      <Icon name="arrow" />
                    </button>
                  </div>
                </div>
              )}
              {route.page === "sources" && project && (
                <div className="collection-page">
                  <div className="page-title">
                    <h1>화면 자료</h1>
                    <span>{project.frameIds.length}</span>
                    <IconButton
                      name="plus"
                      label="화면 가져오기"
                      onClick={() => {
                        setDestination(project.id);
                        navigate({ page: "incoming" });
                      }}
                    />
                  </div>
                  {project.frameIds.length ? (
                    frameGrid(project.frameIds, picked, (id) =>
                      setPicked(toggle(picked, id)),
                    )
                  ) : (
                    <EmptyState title="가져온 화면이 없습니다">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          setDestination(project.id);
                          navigate({ page: "incoming" });
                        }}
                      >
                        화면 가져오기
                      </button>
                    </EmptyState>
                  )}
                  {picked.length > 0 && (
                    <div className="selection-dock">
                      <span>{picked.length}개 선택</span>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => createTestScenario(false, picked)}
                      >
                        테스트 준비
                        <Icon name="arrow" />
                      </button>
                      <IconButton
                        name="close"
                        label="화면 선택 해제"
                        onClick={() => setPicked([])}
                      />
                    </div>
                  )}
                </div>
              )}
              {route.page === "prepare" && project && testScenario && (
                <div
                  className={`prepare-page ${route.stage === 1 ? "prepare-write" : ""}`}
                >
                  <div className="step-caption">
                    <span className={route.stage === 0 ? "current" : ""}>
                      01 자료 선택
                    </span>
                    <Icon name="chevron" />
                    <span className={route.stage === 1 ? "current" : ""}>
                      02 테스트 범위
                    </span>
                  </div>
                  {route.stage === 0 ? (
                    <>
                      <div className="page-title">
                        <h1>테스트할 화면 선택</h1>
                        <span>{testScenario.selectedFrames.length}</span>
                      </div>
                      {project.frameIds.length ? (
                        frameGrid(
                          project.frameIds,
                          testScenario.selectedFrames,
                          (id) =>
                            patchTestScenario({
                              selectedFrames: toggle(
                                testScenario.selectedFrames,
                                id,
                              ),
                            }),
                        )
                      ) : (
                        <EmptyState title="선택할 화면이 없습니다" />
                      )}
                      <div className="prepare-footer">
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => navigate({ ...route, stage: 1 })}
                        >
                          설명만으로 시작
                        </button>
                        <button
                          type="button"
                          className="primary"
                          disabled={!testScenario.selectedFrames.length}
                          onClick={() => navigate({ ...route, stage: 1 })}
                        >
                          다음
                          <Icon name="arrow" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="page-title">
                        <h1>테스트 범위</h1>
                        <IconButton
                          name="settings"
                          label="생성 설정"
                          onClick={() => open("generationSettings")}
                        />
                      </div>
                      <button
                        type="button"
                        className="source-summary"
                        onClick={() => navigate({ ...route, stage: 0 })}
                      >
                        <span className="mini-sources">
                          {testScenario.selectedFrames.slice(0, 3).map((id) => (
                            <span key={id}>
                              <Icon name="image" />
                            </span>
                          ))}
                        </span>
                        <span>화면 {testScenario.selectedFrames.length}개</span>
                        <Icon name="chevron" />
                      </button>
                      <fieldset className="scope-options">
                        <legend className="sr-only">테스트 유형</legend>
                        {(["screen", "flow"] as const).map((s, i) => (
                          <label
                            key={s}
                            className={testScenario.scope === s ? "chosen" : ""}
                          >
                            <input
                              type="radio"
                              name="scope"
                              checked={testScenario.scope === s}
                              onChange={() => patchTestScenario({ scope: s })}
                            />
                            <Icon name={s === "screen" ? "image" : "flow"} />
                            {i ? "통합 테스트" : "단위 테스트"}
                          </label>
                        ))}
                      </fieldset>
                      <Field label="확인할 내용">
                        <textarea
                          className="goal-input"
                          placeholder="예: 옵션 선택부터 결제 완료까지 확인하고 싶어요."
                          value={testScenario.goal}
                          onChange={(e) =>
                            patchTestScenario({ goal: e.target.value })
                          }
                        />
                      </Field>
                      {testScenario.scope === "flow" && (
                        <button
                          type="button"
                          className="flow-entry"
                          onClick={() =>
                            navigate({
                              page: "flow",
                              pid: project.id,
                              sid: testScenario.id,
                              returnTo: "prepare",
                            })
                          }
                        >
                          <Icon name="flow" />
                          <span>사용자 흐름</span>
                          <small>
                            {testScenario.nodes.length
                              ? `${testScenario.nodes.length}개 단계`
                              : "선택"}
                          </small>
                          <Icon name="chevron" />
                        </button>
                      )}
                      <div className="prepare-footer">
                        <button
                          type="button"
                          className="primary"
                          disabled={
                            !testScenario.goal.trim() &&
                            !testScenario.selectedFrames.length
                          }
                          onClick={() =>
                            testScenario.cases.length
                              ? open("replace")
                              : runGeneration()
                          }
                        >
                          테스트 케이스 생성
                          <Icon name="arrow" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {route.page === "testScenario" && testScenario && project && (
                <>
                  {testScenario.generation === "running" ? (
                    <div
                      className={`generation ${testScenario.cases.length ? "generation-compact" : ""}`}
                      role="status"
                    >
                      <div className="generation-orbit">
                        <Icon name="spark" />
                      </div>
                      <div>
                        <p className="eyebrow">테스트 케이스 생성</p>
                        <h1>
                          {
                            [
                              "자료 확인 중",
                              "테스트 케이스 생성 중",
                              "결과 정리 중",
                            ][testScenario.step]
                          }
                        </h1>
                        <div className="generation-steps">
                          {[0, 1, 2].map((i) => (
                            <span
                              className={i <= testScenario.step ? "done" : ""}
                              key={i}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() =>
                          cancelGeneration(project.id, testScenario.id)
                        }
                      >
                        취소
                      </button>
                      {!testScenario.cases.length && <Skeleton />}
                    </div>
                  ) : testScenario.generation === "failed" ? (
                    <div className="generation-error" role="alert">
                      <Icon name="alert" />
                      <div>
                        <strong>테스트 케이스를 생성하지 못했습니다.</strong>
                        <p>입력한 내용은 유지되었습니다.</p>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          navigate({
                            page: "prepare",
                            pid: project.id,
                            sid: testScenario.id,
                            stage: 1,
                          })
                        }
                      >
                        설정 수정
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={runGeneration}
                      >
                        다시 시도
                      </button>
                    </div>
                  ) : null}
                  {priority !== "all" && (
                    <div className="active-filter">
                      <span>우선순위: {priority}</span>
                      <IconButton
                        name="close"
                        label="필터 해제"
                        onClick={() => setPriority("all")}
                      />
                    </div>
                  )}
                  {(testScenario.generation !== "running" ||
                    testScenario.cases.length > 0) && (
                    <TestScenarioContent
                      testScenario={testScenario}
                      ia={project.ia}
                      query={query}
                      priority={priority}
                      onPatch={patchTestScenario}
                      onCase={patchCase}
                      onDetail={(id) => {
                        setTarget(id);
                        open("detail");
                      }}
                      onSource={source}
                      onNote={(id) => {
                        setTarget(id);
                        open("note");
                      }}
                      onDelete={(ids) => {
                        setDeleteIds(ids);
                        open("delete");
                      }}
                      onAdd={addCase}
                    />
                  )}
                </>
              )}
              {route.page === "candidates" && testScenario && project && (
                <CandidateReview
                  testScenario={testScenario}
                  onChange={patchTestScenario}
                  onEdit={(id) => {
                    setTarget(id);
                    open("candidateDetail");
                  }}
                  onSource={source}
                  onOpenAdded={(id) => {
                    patchTestScenario({ activeId: id });
                    navigate({
                      page: "testScenario",
                      pid: project.id,
                      sid: testScenario.id,
                    });
                  }}
                  onAdded={(id) =>
                    notify(
                      "시나리오에 추가되었습니다.",
                      () => {
                        patchTestScenario({ activeId: id });
                        navigate({
                          page: "testScenario",
                          pid: project.id,
                          sid: testScenario.id,
                        });
                        setToast(null);
                      },
                      "테스트 케이스 보기",
                    )
                  }
                />
              )}
              {route.page === "ia" && project && (
                <IAManager
                  project={project}
                  onChange={(patch) => updateProject(project.id, patch)}
                />
              )}
              {route.page === "templates" && (
                <TemplateLibrary
                  templates={templates}
                  onChange={setTemplates}
                />
              )}
              {route.page === "flow" && testScenario && project && (
                <FlowEditor
                  testScenario={testScenario}
                  ia={project.ia}
                  onChange={patchTestScenario}
                />
              )}
              {route.page === "share" && shareTestScenario && project && (
                <TestScenarioContent
                  testScenario={shareTestScenario}
                  ia={project.ia}
                  query=""
                  priority="all"
                  readOnly
                  onPatch={(patch) =>
                    setShareTestScenario((s) => (s ? { ...s, ...patch } : s))
                  }
                  onCase={() => {}}
                  onDetail={(id) => {
                    setTarget(id);
                    open("shareDetail");
                  }}
                  onSource={source}
                  onNote={() => {}}
                  onDelete={() => {}}
                  onAdd={() => {}}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        {panel && (
          <Dialog
            title={titles[panel] ?? "설정"}
            popover={[
              "settings",
              "layout",
              "columns",
              "filter",
              "testScenarioMenu",
              "projectMenu",
              "add",
              "generationSettings",
              "projectTemplate",
            ].includes(panel)}
            anchor={anchor.current}
            side={[
              "settings",
              "layout",
              "columns",
              "filter",
              "detail",
              "shareDetail",
              "candidateDetail",
              "source",
              "list",
              "note",
              "generationSettings",
            ].includes(panel)}
            wide={panel === "source"}
            onClose={close}
            onBack={
              panels.length > 1
                ? () => setPanels((p) => p.slice(0, -1))
                : undefined
            }
          >
            {panel === "projectMenu" && project && (
              <>
                <MenuItem
                  icon="image"
                  onClick={() => {
                    setPicked([]);
                    navigate({ page: "sources", pid: project.id });
                  }}
                >
                  화면 자료
                </MenuItem>
                <MenuItem
                  icon="list"
                  onClick={() => navigate({ page: "ia", pid: project.id })}
                >
                  화면 목록 (IA)
                </MenuItem>
                <MenuItem
                  icon="table"
                  onClick={() => {
                    setTemplateChoice(project.templateId);
                    enter("projectTemplate");
                  }}
                >
                  기본 양식
                </MenuItem>
                <MenuItem
                  icon="settings"
                  onClick={() => {
                    setDraftName(project.name);
                    enter("projectInfo");
                  }}
                >
                  프로젝트 정보
                </MenuItem>
              </>
            )}
            {panel === "add" && (
              <>
                <MenuItem
                  icon="spark"
                  onClick={() => createTestScenario(false)}
                >
                  테스트 케이스 생성
                </MenuItem>
                <MenuItem icon="table" onClick={() => createTestScenario(true)}>
                  빈 시나리오 만들기
                </MenuItem>
              </>
            )}
            {(panel === "testScenarioTemplate" ||
              panel === "projectTemplate") && (
              <div className="field-stack">
                {panel === "testScenarioTemplate" && (
                  <Field label="시나리오 이름">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={100}
                    />
                  </Field>
                )}
                <Field label="공용 양식">
                  <select
                    value={templateChoice}
                    onChange={(e) => setTemplateChoice(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="template-preview">
                  {templates
                    .find((t) => t.id === templateChoice)
                    ?.columns.filter((c) => c.visible)
                    .map((c) => (
                      <span key={c.id}>{c.name}</span>
                    ))}
                </div>
                {panel === "projectTemplate" && (
                  <p className="field-hint">
                    이 프로젝트에서 새 시나리오를 만들 때 기본으로 선택됩니다.
                  </p>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={
                    panel === "testScenarioTemplate" && !draftName.trim()
                  }
                  onClick={() => {
                    if (panel === "testScenarioTemplate") confirmTestScenario();
                    else if (project) {
                      updateProject(project.id, { templateId: templateChoice });
                      close();
                    }
                  }}
                >
                  {panel === "testScenarioTemplate"
                    ? "시나리오 만들기"
                    : "적용"}
                </button>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => navigate({ page: "templates" })}
                >
                  공용 양식 관리
                  <Icon name="arrow" />
                </button>
              </div>
            )}
            {panel === "testScenarioMenu" && testScenario && project && (
              <>
                <MenuItem
                  icon="edit"
                  onClick={() => {
                    setDraftName(testScenario.name);
                    enter("rename");
                  }}
                >
                  이름 변경
                </MenuItem>
                <MenuItem
                  icon="file"
                  disabled={locked}
                  detail={`${testScenario.candidates.filter((c) => c.status === "pending").length}`}
                  onClick={() =>
                    navigate({
                      page: "candidates",
                      pid: project.id,
                      sid: testScenario.id,
                    })
                  }
                >
                  검토 후보
                </MenuItem>
                <MenuItem
                  icon="flow"
                  disabled={locked}
                  onClick={() =>
                    navigate({
                      page: "flow",
                      pid: project.id,
                      sid: testScenario.id,
                      returnTo: "testScenario",
                    })
                  }
                >
                  사용자 흐름
                </MenuItem>
                <MenuItem
                  icon="spark"
                  disabled={locked}
                  onClick={() => {
                    if (locked) {
                      notify(
                        "현재 시나리오의 생성이 끝난 뒤 다시 실행할 수 있습니다.",
                      );
                      close();
                      return;
                    }
                    navigate({
                      page: "prepare",
                      pid: project.id,
                      sid: testScenario.id,
                      stage: 1,
                    });
                  }}
                >
                  테스트 케이스 생성
                </MenuItem>
                <hr />
                <MenuItem icon="download" onClick={() => enter("export")}>
                  XLSX 내보내기
                </MenuItem>
                <MenuItem icon="share" onClick={() => enter("share")}>
                  공유
                </MenuItem>
              </>
            )}
            {panel === "settings" && (
              <>
                <MenuItem
                  icon="grid"
                  detail={
                    (route.page === "share" ? shareTestScenario : testScenario)
                      ?.layout === "table"
                      ? "표"
                      : "QA 진행"
                  }
                  onClick={() => enter("layout")}
                >
                  레이아웃
                </MenuItem>
                {route.page !== "share" && (
                  <>
                    <MenuItem
                      icon="table"
                      disabled={locked}
                      onClick={() => enter("columns")}
                    >
                      열
                    </MenuItem>
                    <MenuItem icon="settings" onClick={() => enter("filter")}>
                      필터
                    </MenuItem>
                  </>
                )}
              </>
            )}
            {panel === "layout" && (
              <div className="layout-options">
                {(["table", "qa"] as const).map((layout, i) => (
                  <button
                    type="button"
                    className={
                      (route.page === "share"
                        ? shareTestScenario
                        : testScenario
                      )?.layout === layout
                        ? "selected"
                        : ""
                    }
                    aria-pressed={
                      (route.page === "share"
                        ? shareTestScenario
                        : testScenario
                      )?.layout === layout
                    }
                    key={layout}
                    onClick={() => {
                      if (route.page === "share")
                        setShareTestScenario((s) => (s ? { ...s, layout } : s));
                      else patchTestScenario({ layout });
                      close();
                    }}
                  >
                    <span className={`layout-illustration layout-${layout}`}>
                      {(layout === "table"
                        ? ["a", "b", "c", "d", "e", "f", "g", "h", "i"]
                        : ["a", "b", "c"]
                      ).map((key) => (
                        <i key={key} />
                      ))}
                    </span>
                    <Icon name={layout === "table" ? "table" : "qa"} />
                    <strong>{i ? "QA 진행" : "표"}</strong>
                  </button>
                ))}
              </div>
            )}
            {panel === "columns" && testScenario && (
              <ColumnsEditor
                columns={testScenario.columns}
                onChange={(cols) => patchTestScenario({ columns: cols })}
                onDelete={(id) =>
                  patchTestScenario({
                    columns: testScenario.columns.filter((c) => c.id !== id),
                    cases: testScenario.cases.map((c) => {
                      const extra = { ...c.extra };
                      delete extra[id];
                      return { ...c, extra };
                    }),
                  })
                }
              />
            )}
            {panel === "filter" && (
              <Field label="우선순위">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="all">전체</option>
                  {["높음", "보통", "낮음", "미지정"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            )}
            {(panel === "newProject" ||
              panel === "projectInfo" ||
              panel === "rename") && (
              <form
                className="field-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = draftName.trim();
                  if (!name || name.length > 100) return;
                  if (panel === "newProject") {
                    const p = newProject(name);
                    setProjects((ps) => [...ps, p]);
                    navigate({ page: "project", pid: p.id });
                  } else if (panel === "projectInfo" && project) {
                    updateProject(project.id, { name });
                    close();
                  } else {
                    patchTestScenario({ name });
                    close();
                  }
                }}
              >
                <Field
                  label={panel === "rename" ? "시나리오 이름" : "프로젝트 이름"}
                >
                  <input
                    value={draftName}
                    maxLength={100}
                    onChange={(e) => setDraftName(e.target.value)}
                    required
                  />
                </Field>
                {panel === "projectInfo" && project && (
                  <Field label="설명">
                    <textarea
                      value={project.description}
                      onChange={(e) =>
                        updateProject(project.id, {
                          description: e.target.value,
                        })
                      }
                    />
                  </Field>
                )}
                <button
                  type="submit"
                  className="primary"
                  disabled={!draftName.trim()}
                >
                  {panel === "newProject" ? "만들기" : "적용"}
                </button>
              </form>
            )}
            {panel === "generationSettings" && testScenario && project && (
              <div className="field-stack">
                <Field label="AI 서비스">
                  <select
                    value={testScenario.provider}
                    onChange={(e) =>
                      patchTestScenario({ provider: e.target.value })
                    }
                  >
                    <option>Claude</option>
                    <option>OpenAI</option>
                  </select>
                </Field>
                <MenuItem icon="table" onClick={() => enter("columns")}>
                  시나리오 양식
                </MenuItem>
                <p className="field-hint">
                  화면 목록 {project.ia.length}개가 함께 사용됩니다.
                </p>
              </div>
            )}
            {panel === "source" && selectedSource && (
              <div className="source-viewer">
                <div className="source-navigation">
                  <IconButton
                    name="back"
                    label="이전 화면 미리보기"
                    disabled={!sourceIndex}
                    onClick={() => setSourceIndex((i) => i - 1)}
                  />
                  <span>
                    {selectedSource.name} · {sourceIndex + 1}/{sourceIds.length}
                  </span>
                  <IconButton
                    name="arrow"
                    label="다음 화면 미리보기"
                    disabled={sourceIndex === sourceIds.length - 1}
                    onClick={() => setSourceIndex((i) => i + 1)}
                  />
                </div>
                <Phone frame={selectedSource} />
              </div>
            )}
            {panel === "detail" && currentCase && project && (
              <CaseFields
                item={currentCase}
                columns={testScenario?.columns}
                ia={project.ia}
                onChange={(patch) => patchCase(currentCase.id, patch)}
              />
            )}
            {panel === "shareDetail" && sharedCase && (
              <div className="field-stack">
                <h2>{sharedCase.title}</h2>
                {shareTestScenario?.columns
                  .filter((col) => col.visible)
                  .map((col) => (
                    <section key={col.id}>
                      <h3>{col.name}</h3>
                      <p className="multiline">
                        {cellValue(sharedCase, col, project?.ia ?? []) || "—"}
                      </p>
                    </section>
                  ))}
              </div>
            )}
            {panel === "candidateDetail" &&
              currentCandidate &&
              testScenario &&
              project && (
                <CaseFields
                  item={currentCandidate}
                  columns={testScenario.columns}
                  ia={project.ia}
                  onChange={(patch) =>
                    patchTestScenario({
                      candidates: testScenario.candidates.map((c) =>
                        c.id === currentCandidate.id ? { ...c, ...patch } : c,
                      ),
                    })
                  }
                />
              )}
            {panel === "list" && (
              <div className="scenario-list">
                {(route.page === "share"
                  ? shareTestScenario
                  : testScenario
                )?.cases.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      if (route.page === "share")
                        setShareTestScenario((s) =>
                          s ? { ...s, activeId: c.id } : s,
                        );
                      else patchTestScenario({ activeId: c.id });
                      close();
                    }}
                  >
                    <small>TC-{String(c.number).padStart(3, "0")}</small>
                    <span>{c.title || "제목 없는 테스트 케이스"}</span>
                    <span className={`result-text result-${c.result}`}>
                      {c.result}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {panel === "note" && currentCase && (
              <Field label="QA 메모">
                <textarea
                  rows={8}
                  value={currentCase.note}
                  onChange={(e) =>
                    patchCase(currentCase.id, { note: e.target.value })
                  }
                />
              </Field>
            )}
            {panel === "replace" && (
              <div className="field-stack">
                <p>
                  새 결과가 준비되면 현재 테스트 케이스와 검토 후보를
                  교체합니다. 기존 테스트 결과와 메모도 함께 교체됩니다.
                </p>
                <div className="button-row">
                  <button type="button" className="secondary" onClick={close}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={runGeneration}
                  >
                    다시 생성
                  </button>
                </div>
              </div>
            )}
            {panel === "delete" && (
              <div className="field-stack">
                <p>선택한 테스트 케이스 {deleteIds.length}개를 삭제할까요?</p>
                <div className="button-row">
                  <button type="button" className="secondary" onClick={close}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={deleteCases}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
            {panel === "export" && testScenario && project && (
              <div className="field-stack">
                <div className="export-summary">
                  <Icon name="file" />
                  <div>
                    <strong>{testScenario.name}.xlsx</strong>
                    <p>
                      전체 테스트 케이스 {testScenario.cases.length}개 · 검토
                      후보 제외
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !testScenario.cases.length}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await downloadTestScenario(testScenario, project.ia);
                      notify("XLSX 파일을 내려받았습니다.");
                      close();
                    } catch {
                      setError("파일을 만들지 못했습니다. 다시 시도해 주세요.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? (
                    <>
                      <span className="spinner" />
                      파일 준비 중
                    </>
                  ) : (
                    <>
                      XLSX 다운로드
                      <Icon name="download" />
                    </>
                  )}
                </button>
              </div>
            )}
            {panel === "share" && testScenario && project && (
              <div className="field-stack">
                <div className="share-document">
                  <Icon name="file" />
                  <div>
                    <strong>{testScenario.name}</strong>
                    <span>테스트 케이스 {testScenario.cases.length}개</span>
                  </div>
                  <span className="status-chip">읽기 전용</span>
                </div>
                <p className="muted">
                  검토 후보와 테스트 결과·메모는 포함하지 않습니다.
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setShareTestScenario({
                      ...clone(testScenario),
                      layout: "table",
                      selectedFrames: [],
                      nodes: [],
                      edges: [],
                      columns: testScenario.columns
                        .filter(
                          (c) => !["result", "note", "frameIds"].includes(c.id),
                        )
                        .map((c) => ({ ...c })),
                      cases: testScenario.cases.map((c) => ({
                        ...clone(c),
                        note: "",
                        frameIds: [],
                        result: "미진행",
                      })),
                      candidates: [],
                    });
                    navigate({
                      page: "share",
                      pid: project.id,
                      sid: testScenario.id,
                    });
                  }}
                >
                  공유 시나리오 미리보기
                  <Icon name="arrow" />
                </button>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </Dialog>
        )}
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              style={{ x: "-50%" }}
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <Icon name="check" />
              <span>{toast.message}</span>
              {toast.action && (
                <button type="button" onClick={toast.action}>
                  {toast.label}
                </button>
              )}
              <IconButton
                name="close"
                label="알림 닫기"
                onClick={() => setToast(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
if (import.meta.env.DEV) {
  const root = document.getElementById("root");
  if (root)
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
}
