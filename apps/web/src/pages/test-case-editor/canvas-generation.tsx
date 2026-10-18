import { Button, Textarea } from "@cheddar/ui/legacy";
import { useEffect, useState } from "react";
import type { FlowGenerationDto } from "@/shared/api/generated";
import type { CanvasSession } from "./canvas-session";
import { generationProviders } from "./test-scenarios-api";

export function CanvasGeneration({
  session,
  disabled,
  onClose,
  onReview,
}: {
  session: CanvasSession;
  disabled: boolean;
  onClose: () => void;
  onReview: () => void;
}) {
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [available, setAvailable] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [jobs, setJobs] = useState<FlowGenerationDto[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<{ id: string; signature: string }>();
  useEffect(() => {
    let live = true;
    void generationProviders()
      .then((result) => {
        const providers = result.items
          .filter((p) => p.configured)
          .map((p) => p.id);
        if (live) {
          setAvailable(providers);
          if (providers[0]) setProvider(providers[0]);
        }
      })
      .catch(() => {
        if (live)
          setError(
            "AI 목록을 불러오지 못했습니다. 흐름 생성 패널을 닫았다가 다시 열어주세요.",
          );
      });
    const load = async () => {
      try {
        const next = await session.jobs();
        if (live) setJobs(next.items);
      } catch {
        if (live)
          setError(
            "생성 작업을 불러오지 못했습니다. 흐름 생성 패널을 닫았다가 다시 열어주세요.",
          );
      }
    };
    void load();
    const timer = setInterval(() => {
      void load();
    }, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [session]);
  async function start() {
    setBusy(true);
    setError(undefined);
    const signature = JSON.stringify({ provider, description });
    const attempt =
      request?.signature === signature
        ? request
        : { id: crypto.randomUUID(), signature };
    setRequest(attempt);
    try {
      const job = await session.generate(provider, description, attempt.id);
      setJobs((old) => [job, ...old.filter((j) => j.id !== job.id)]);
      setRequest(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="canvas-inspector" aria-label="흐름 생성">
      <header>
        <strong>흐름 생성</strong>
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
      </header>
      {error && <p role="alert">{error}</p>}
      <label>
        AI
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as typeof provider)}
        >
          <option value="anthropic" disabled={!available.includes("anthropic")}>
            Claude
          </option>
          <option value="openai" disabled={!available.includes("openai")}>
            OpenAI
          </option>
        </select>
      </label>
      <label htmlFor="canvas-flow-request">
        생성 요청
        <Textarea
          id="canvas-flow-request"
          value={description}
          maxLength={10000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="확인할 사용자 흐름"
        />
      </label>
      <Button
        disabled={disabled || busy || !available.includes(provider)}
        onClick={() => void start()}
      >
        {busy ? "요청 중" : "흐름 생성"}
      </Button>
      {!available.length && <p>사용할 수 있는 AI가 없습니다.</p>}
      <div className="canvas-job-list">
        {jobs.map((job) => (
          <article key={job.id}>
            <strong>
              {job.provider === "anthropic" ? "Claude" : "OpenAI"}
            </strong>
            {job.status === "running" ? (
              <p role="status">흐름 생성 중</p>
            ) : job.status === "failed" ? (
              <p>{job.error}</p>
            ) : (
              <>
                <span>{job.result?.steps.length}개 단계</span>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    void session
                      .review(job)
                      .then(onReview)
                      .catch((e) => setError(e.message));
                  }}
                >
                  초안 검토
                </Button>
              </>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
}
