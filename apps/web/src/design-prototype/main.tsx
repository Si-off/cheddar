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
import { CandidateReview, CaseFields, SheetContent } from "./editor";
import { downloadSheet } from "./io";
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
  frames,
  generate,
  initialProjects,
  initialTemplates,
  newProject,
  newSheet,
  type Project,
  type Scenario,
  type Sheet,
  type TestCase,
} from "./model";
import "./prototype.css";

type Route = {
  page:
    | "projects"
    | "project"
    | "incoming"
    | "sources"
    | "prepare"
    | "sheet"
    | "candidates"
    | "ia"
    | "templates"
    | "flow"
    | "share";
  pid?: string;
  sid?: string;
  stage?: number;
  returnTo?: "prepare" | "sheet" | "project";
};
const params = new URLSearchParams(location.search);
const motionDuration =
  parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--duration-state",
    ),
  ) / 1000 || 0.18;
const allowedScenarios: Scenario[] = [
  "normal",
  "empty",
  "generation-error",
  "no-results",
  "candidates-only",
  "partial-import",
];
const scenario: Scenario =
  allowedScenarios.find((s) => s === params.get("scenario")) ?? "normal";
const titles: Record<string, string> = {
  projectMenu: "프로젝트",
  sheetMenu: "시트",
  settings: "보기 설정",
  layout: "레이아웃",
  columns: "열",
  filter: "필터",
  newProject: "프로젝트 만들기",
  projectInfo: "프로젝트 정보",
  rename: "시트 이름",
  add: "새 시트",
  generationSettings: "생성 설정",
  source: "관련 화면",
  detail: "테스트 편집",
  candidateDetail: "후보 편집",
  list: "테스트 목록",
  note: "메모",
  export: "XLSX 내보내기",
  share: "시트 공유",
  replace: "테스트 다시 생성",
  delete: "테스트 삭제",
  shareDetail: "테스트 상세",
  sheetTemplate: "새 시트",
  projectTemplate: "프로젝트 기본 양식",
};
function App() {
  const [templates, setTemplates] = useState(initialTemplates);
  const [pendingSheet, setPendingSheet] = useState<{
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
  const [shareSheet, setShareSheet] = useState<Sheet | null>(null);
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
  const sheet = project?.sheets.find((s) => s.id === route.sid);
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
  const mutateSheet = (pid: string, sid: string, fn: (s: Sheet) => Sheet) => {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === pid
          ? { ...p, sheets: p.sheets.map((s) => (s.id === sid ? fn(s) : s)) }
          : p,
      ),
    );
  };
  const patchSheet = (patch: Partial<Sheet>) => {
    if (project && sheet)
      mutateSheet(project.id, sheet.id, (s) => {
        if (s.generation !== "running") return { ...s, ...patch };
        return {
          ...s,
          layout: patch.layout ?? s.layout,
          activeId: patch.activeId ?? s.activeId,
        };
      });
  };
  const patchCase = (id: string, patch: Partial<TestCase>) => {
    if (!sheet || !project || sheet.generation === "running") return;
    const old = sheet.cases.find((c) => c.id === id);
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
    mutateSheet(project.id, sheet.id, (s) => ({
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
  const createSheet = (manual: boolean, selected: string[] = []) => {
    if (!project) return;
    setPendingSheet({ pid: project.id, manual, selected });
    setTemplateChoice(project.templateId);
    setDraftName(manual ? "새 시트" : "새 테스트");
    open("sheetTemplate");
  };
  const confirmSheet = () => {
    if (!pendingSheet) return;
    const template = templates.find((t) => t.id === templateChoice);
    const p = projects.find((p) => p.id === pendingSheet.pid);
    if (!template || !p || !draftName.trim()) return;
    const s = newSheet(draftName.trim(), template.columns);
    s.templateId = template.id;
    s.templateVersion = template.version;
    s.selectedFrames = pendingSheet.selected;
    updateProject(p.id, { sheets: [...p.sheets, s] });
    navigate({
      page: pendingSheet.manual ? "sheet" : "prepare",
      pid: p.id,
      sid: s.id,
      stage: pendingSheet.selected.length ? 1 : 0,
    });
    setPendingSheet(null);
  };
  const addCase = () => {
    if (!sheet) return;
    const item = blankCase(
      Math.max(0, ...sheet.cases.map((c) => c.number)) + 1,
    );
    patchSheet({ cases: [...sheet.cases, item], activeId: item.id });
    setTarget(item.id);
    open("detail");
  };
  const deleteCases = () => {
    if (!sheet || !project) return;
    const sid = sheet.id,
      pid = project.id;
    const removed = sheet.cases.filter((c) => deleteIds.includes(c.id));
    const positions = removed.map((c) => sheet.cases.indexOf(c));
    mutateSheet(pid, sid, (s) => ({
      ...s,
      cases: s.cases.filter((c) => !deleteIds.includes(c.id)),
      candidates: s.candidates.map((c) =>
        deleteIds.includes(c.id) ? { ...c, status: "pending" } : c,
      ),
    }));
    close();
    notify(
      `${removed.length}개 테스트를 삭제했습니다.`,
      () => {
        mutateSheet(pid, sid, (s) => {
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
    mutateSheet(pid, sid, (s) => ({ ...s, generation: "idle", step: 0 }));
    notify("생성을 취소했습니다.");
  };
  const runGeneration = () => {
    if (!project || !sheet) return;
    const pid = project.id,
      sid = sheet.id,
      input = clone(sheet);
    const fail = scenario === "generation-error" && !generationFailedOnce;
    setGenerationFailedOnce(true);
    timers.current.get(sid)?.forEach(clearTimeout);
    mutateSheet(pid, sid, (s) => ({ ...s, generation: "running", step: 0 }));
    navigate({ page: "sheet", pid, sid });
    const list = [1, 2].map((step) =>
      setTimeout(
        () => mutateSheet(pid, sid, (s) => ({ ...s, step })),
        step * 1100,
      ),
    );
    list.push(
      setTimeout(() => {
        timers.current.delete(sid);
        if (fail) {
          mutateSheet(pid, sid, (s) => ({ ...s, generation: "failed" }));
          return;
        }
        const result = generate(input, scenario);
        mutateSheet(pid, sid, (s) => ({
          ...s,
          ...result,
          layout: s.layout,
          activeId: result.cases[0]?.id ?? "",
          generation: "idle",
          step: 0,
        }));
        notify(`${result.cases.length}개 테스트를 생성했습니다.`);
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
      navigate({ page: "sheet", pid: route.pid, sid: route.sid });
    else if (route.page === "flow")
      navigate({
        page: route.returnTo === "prepare" ? "prepare" : "sheet",
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
                      ? "후보 검토"
                      : route.page === "share"
                        ? shareSheet?.name
                        : sheet?.name;
  const sharedCase = shareSheet?.cases.find((c) => c.id === target);
  const currentCase = sheet?.cases.find((c) => c.id === target);
  const currentCandidate = sheet?.candidates.find((c) => c.id === target);
  const selectedSource = frames.find((f) => f.id === sourceIds[sourceIndex]);
  const locked = sheet?.generation === "running";
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
                  label="시트 추가"
                  onClick={() => open("add")}
                />
                <IconButton
                  name="more"
                  label="프로젝트 메뉴"
                  onClick={() => open("projectMenu")}
                />
              </>
            )}
            {route.page === "sheet" && (
              <IconButton
                name="more"
                label="시트 메뉴"
                onClick={() => open("sheetMenu")}
              />
            )}
          </div>
        </header>
        <main ref={mainRef} tabIndex={-1} className={`main page-${route.page}`}>
          {searchOpen && route.page !== "sheet" && route.page !== "share" && (
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
              {(route.page === "sheet" || route.page === "share") && sheet && (
                <div className="database-heading">
                  <div className="database-title">
                    <Icon name="file" />
                    <h1>{sheet.name}</h1>
                  </div>
                  <div className="database-toolbar">
                    <span className="database-view">
                      <Icon
                        name={
                          (route.page === "share" ? shareSheet : sheet)
                            ?.layout === "table"
                            ? "table"
                            : "qa"
                        }
                      />
                      {(route.page === "share" ? shareSheet : sheet)?.layout ===
                      "table"
                        ? "표"
                        : "QA 진행"}
                    </span>
                    <span className="database-count">
                      {sheet.cases.length}개
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
                            label="테스트 추가"
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
                                시트 {p.sheets.length} · 화면{" "}
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
                    <h1>테스트 시트</h1>
                    <span>{project.sheets.length}</span>
                  </div>
                  {!project.sheets.length ? (
                    <EmptyState title="테스트 시트가 없습니다">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => createSheet(false)}
                      >
                        테스트 생성
                        <Icon name="arrow" />
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => createSheet(true)}
                      >
                        빈 시트 만들기
                      </button>
                    </EmptyState>
                  ) : (
                    <div className="sheet-list">
                      {project.sheets
                        .filter((s) =>
                          s.name.toLowerCase().includes(query.toLowerCase()),
                        )
                        .map((s) => (
                          <button
                            type="button"
                            className="sheet-row"
                            key={s.id}
                            onClick={() =>
                              navigate({
                                page: "sheet",
                                pid: project.id,
                                sid: s.id,
                              })
                            }
                          >
                            <span className="sheet-symbol">
                              <Icon name={s.layout === "qa" ? "qa" : "table"} />
                            </span>
                            <div>
                              <h2>{s.name}</h2>
                              <p>
                                {s.generation === "running"
                                  ? "생성 중"
                                  : `${s.cases.length}개 테스트`}
                                {s.candidates.some(
                                  (c) => c.status === "pending",
                                ) &&
                                  ` · 후보 ${s.candidates.filter((c) => c.status === "pending").length}개`}
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
                        setPendingSheet({
                          pid: p.id,
                          manual: false,
                          selected: [...intake],
                        });
                        setTemplateChoice(p.templateId);
                        setDraftName("새 테스트");
                        open("sheetTemplate");
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
                        onClick={() => createSheet(false, picked)}
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
              {route.page === "prepare" && project && sheet && (
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
                        <span>{sheet.selectedFrames.length}</span>
                      </div>
                      {project.frameIds.length ? (
                        frameGrid(
                          project.frameIds,
                          sheet.selectedFrames,
                          (id) =>
                            patchSheet({
                              selectedFrames: toggle(sheet.selectedFrames, id),
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
                          disabled={!sheet.selectedFrames.length}
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
                          {sheet.selectedFrames.slice(0, 3).map((id) => (
                            <span key={id}>
                              <Icon name="image" />
                            </span>
                          ))}
                        </span>
                        <span>화면 {sheet.selectedFrames.length}개</span>
                        <Icon name="chevron" />
                      </button>
                      <fieldset className="scope-options">
                        <legend className="sr-only">테스트 유형</legend>
                        {(["screen", "flow"] as const).map((s, i) => (
                          <label
                            key={s}
                            className={sheet.scope === s ? "chosen" : ""}
                          >
                            <input
                              type="radio"
                              name="scope"
                              checked={sheet.scope === s}
                              onChange={() => patchSheet({ scope: s })}
                            />
                            <Icon name={s === "screen" ? "image" : "flow"} />
                            {i ? "사용자 흐름" : "화면별"}
                          </label>
                        ))}
                      </fieldset>
                      <Field label="확인할 내용">
                        <textarea
                          className="goal-input"
                          placeholder="예: 옵션 선택부터 결제 완료까지 확인하고 싶어요."
                          value={sheet.goal}
                          onChange={(e) => patchSheet({ goal: e.target.value })}
                        />
                      </Field>
                      {sheet.scope === "flow" && (
                        <button
                          type="button"
                          className="flow-entry"
                          onClick={() =>
                            navigate({
                              page: "flow",
                              pid: project.id,
                              sid: sheet.id,
                              returnTo: "prepare",
                            })
                          }
                        >
                          <Icon name="flow" />
                          <span>사용자 흐름</span>
                          <small>
                            {sheet.nodes.length
                              ? `${sheet.nodes.length}개 단계`
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
                            !sheet.goal.trim() && !sheet.selectedFrames.length
                          }
                          onClick={() =>
                            sheet.cases.length
                              ? open("replace")
                              : runGeneration()
                          }
                        >
                          테스트 생성
                          <Icon name="arrow" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {route.page === "sheet" && sheet && project && (
                <>
                  {sheet.generation === "running" ? (
                    <div
                      className={`generation ${sheet.cases.length ? "generation-compact" : ""}`}
                      role="status"
                    >
                      <div className="generation-orbit">
                        <Icon name="spark" />
                      </div>
                      <div>
                        <p className="eyebrow">테스트 생성</p>
                        <h1>
                          {
                            ["자료 확인 중", "테스트 작성 중", "결과 정리 중"][
                              sheet.step
                            ]
                          }
                        </h1>
                        <div className="generation-steps">
                          {[0, 1, 2].map((i) => (
                            <span
                              className={i <= sheet.step ? "done" : ""}
                              key={i}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => cancelGeneration(project.id, sheet.id)}
                      >
                        취소
                      </button>
                      {!sheet.cases.length && <Skeleton />}
                    </div>
                  ) : sheet.generation === "failed" ? (
                    <div className="generation-error" role="alert">
                      <Icon name="alert" />
                      <div>
                        <strong>테스트를 생성하지 못했습니다.</strong>
                        <p>입력한 내용은 유지되었습니다.</p>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          navigate({
                            page: "prepare",
                            pid: project.id,
                            sid: sheet.id,
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
                  {(sheet.generation !== "running" ||
                    sheet.cases.length > 0) && (
                    <SheetContent
                      sheet={sheet}
                      ia={project.ia}
                      query={query}
                      priority={priority}
                      onPatch={patchSheet}
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
              {route.page === "candidates" && sheet && project && (
                <CandidateReview
                  sheet={sheet}
                  onChange={patchSheet}
                  onEdit={(id) => {
                    setTarget(id);
                    open("candidateDetail");
                  }}
                  onSource={source}
                  onOpenAdded={(id) => {
                    patchSheet({ activeId: id });
                    navigate({ page: "sheet", pid: project.id, sid: sheet.id });
                  }}
                  onAdded={(id) =>
                    notify(
                      "시트에 추가되었습니다.",
                      () => {
                        patchSheet({ activeId: id });
                        navigate({
                          page: "sheet",
                          pid: project.id,
                          sid: sheet.id,
                        });
                        setToast(null);
                      },
                      "테스트 보기",
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
              {route.page === "flow" && sheet && project && (
                <FlowEditor
                  sheet={sheet}
                  ia={project.ia}
                  onChange={patchSheet}
                />
              )}
              {route.page === "share" && shareSheet && project && (
                <SheetContent
                  sheet={shareSheet}
                  ia={project.ia}
                  query=""
                  priority="all"
                  readOnly
                  onPatch={(patch) =>
                    setShareSheet((s) => (s ? { ...s, ...patch } : s))
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
              "sheetMenu",
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
                <MenuItem icon="spark" onClick={() => createSheet(false)}>
                  테스트 생성
                </MenuItem>
                <MenuItem icon="table" onClick={() => createSheet(true)}>
                  빈 시트 만들기
                </MenuItem>
              </>
            )}
            {(panel === "sheetTemplate" || panel === "projectTemplate") && (
              <div className="field-stack">
                {panel === "sheetTemplate" && (
                  <Field label="시트 이름">
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
                    이 프로젝트에서 새 시트를 만들 때 기본으로 선택됩니다.
                  </p>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={panel === "sheetTemplate" && !draftName.trim()}
                  onClick={() => {
                    if (panel === "sheetTemplate") confirmSheet();
                    else if (project) {
                      updateProject(project.id, { templateId: templateChoice });
                      close();
                    }
                  }}
                >
                  {panel === "sheetTemplate" ? "시트 만들기" : "적용"}
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
            {panel === "sheetMenu" && sheet && project && (
              <>
                <MenuItem
                  icon="edit"
                  onClick={() => {
                    setDraftName(sheet.name);
                    enter("rename");
                  }}
                >
                  이름 변경
                </MenuItem>
                <MenuItem
                  icon="file"
                  disabled={locked}
                  detail={`${sheet.candidates.filter((c) => c.status === "pending").length}`}
                  onClick={() =>
                    navigate({
                      page: "candidates",
                      pid: project.id,
                      sid: sheet.id,
                    })
                  }
                >
                  후보 검토
                </MenuItem>
                <MenuItem
                  icon="flow"
                  disabled={locked}
                  onClick={() =>
                    navigate({
                      page: "flow",
                      pid: project.id,
                      sid: sheet.id,
                      returnTo: "sheet",
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
                        "현재 시트의 생성이 끝난 뒤 다시 실행할 수 있습니다.",
                      );
                      close();
                      return;
                    }
                    navigate({
                      page: "prepare",
                      pid: project.id,
                      sid: sheet.id,
                      stage: 1,
                    });
                  }}
                >
                  테스트 생성
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
                    (route.page === "share" ? shareSheet : sheet)?.layout ===
                    "table"
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
                      (route.page === "share" ? shareSheet : sheet)?.layout ===
                      layout
                        ? "selected"
                        : ""
                    }
                    aria-pressed={
                      (route.page === "share" ? shareSheet : sheet)?.layout ===
                      layout
                    }
                    key={layout}
                    onClick={() => {
                      if (route.page === "share")
                        setShareSheet((s) => (s ? { ...s, layout } : s));
                      else patchSheet({ layout });
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
            {panel === "columns" && sheet && (
              <ColumnsEditor
                columns={sheet.columns}
                onChange={(cols) => patchSheet({ columns: cols })}
                onDelete={(id) =>
                  patchSheet({
                    columns: sheet.columns.filter((c) => c.id !== id),
                    cases: sheet.cases.map((c) => {
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
                    patchSheet({ name });
                    close();
                  }
                }}
              >
                <Field
                  label={panel === "rename" ? "시트 이름" : "프로젝트 이름"}
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
            {panel === "generationSettings" && sheet && project && (
              <div className="field-stack">
                <Field label="AI 서비스">
                  <select
                    value={sheet.provider}
                    onChange={(e) => patchSheet({ provider: e.target.value })}
                  >
                    <option>Claude</option>
                    <option>OpenAI</option>
                  </select>
                </Field>
                <MenuItem icon="table" onClick={() => enter("columns")}>
                  시트 양식
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
                columns={sheet?.columns}
                ia={project.ia}
                onChange={(patch) => patchCase(currentCase.id, patch)}
              />
            )}
            {panel === "shareDetail" && sharedCase && (
              <div className="field-stack">
                <h2>{sharedCase.title}</h2>
                {shareSheet?.columns
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
              sheet &&
              project && (
                <CaseFields
                  item={currentCandidate}
                  columns={sheet.columns}
                  ia={project.ia}
                  onChange={(patch) =>
                    patchSheet({
                      candidates: sheet.candidates.map((c) =>
                        c.id === currentCandidate.id ? { ...c, ...patch } : c,
                      ),
                    })
                  }
                />
              )}
            {panel === "list" && (
              <div className="scenario-list">
                {(route.page === "share" ? shareSheet : sheet)?.cases.map(
                  (c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        if (route.page === "share")
                          setShareSheet((s) =>
                            s ? { ...s, activeId: c.id } : s,
                          );
                        else patchSheet({ activeId: c.id });
                        close();
                      }}
                    >
                      <small>TC-{String(c.number).padStart(3, "0")}</small>
                      <span>{c.title || "제목 없는 테스트"}</span>
                      <span className={`result-text result-${c.result}`}>
                        {c.result}
                      </span>
                    </button>
                  ),
                )}
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
                  새 결과가 준비되면 현재 테스트와 후보를 교체합니다. 기존
                  테스트 결과와 메모도 함께 교체됩니다.
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
                <p>선택한 테스트 {deleteIds.length}개를 삭제할까요?</p>
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
            {panel === "export" && sheet && project && (
              <div className="field-stack">
                <div className="export-summary">
                  <Icon name="file" />
                  <div>
                    <strong>{sheet.name}.xlsx</strong>
                    <p>전체 테스트 {sheet.cases.length}개 · 후보 제외</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !sheet.cases.length}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await downloadSheet(sheet, project.ia);
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
            {panel === "share" && sheet && project && (
              <div className="field-stack">
                <div className="share-document">
                  <Icon name="file" />
                  <div>
                    <strong>{sheet.name}</strong>
                    <span>테스트 {sheet.cases.length}개</span>
                  </div>
                  <span className="status-chip">읽기 전용</span>
                </div>
                <p className="muted">
                  후보와 테스트 결과·메모는 포함하지 않습니다.
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setShareSheet({
                      ...clone(sheet),
                      layout: "table",
                      selectedFrames: [],
                      nodes: [],
                      edges: [],
                      columns: sheet.columns
                        .filter(
                          (c) => !["result", "note", "frameIds"].includes(c.id),
                        )
                        .map((c) => ({ ...c })),
                      cases: sheet.cases.map((c) => ({
                        ...clone(c),
                        note: "",
                        frameIds: [],
                        result: "미진행",
                      })),
                      candidates: [],
                    });
                    navigate({ page: "share", pid: project.id, sid: sheet.id });
                  }}
                >
                  공유 시트 미리보기
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
