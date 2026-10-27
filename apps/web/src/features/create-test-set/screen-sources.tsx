import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banner,
  Button,
  cn,
  FrameCard,
  Icon,
  Tag,
  TextField,
  useToast,
} from "@workspace/ui";
import { Image, Link2, Loader2 } from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { figmaTokenQuery } from "@/entities/account";
import { type TempUpload, tempUploadQuery } from "@/entities/generation";
import { isApiFailure, sdk, toApiFailure } from "@/shared/api";
import { env } from "@/shared/config/env";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type SourceStatus = "reading" | "done" | "waiting" | "failed";
interface Source {
  key: string;
  kind: "figma" | "image";
  label: string;
  status: SourceStatus;
  frameIds: string[];
  url?: string;
  /** 실패한 까닭. 칩에 이어 보인다 */
  reason?: string;
}

const thumbnail = (uploadId: string, frameId: string) =>
  `${env.apiBaseUrl}/api/v1/temp-uploads/${uploadId}/frames/${frameId}/thumbnail`;

/** 실패한 링크는 이름을 몰라 주소를 줄여 보여준다 */
const shortLink = (url: string) => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/").filter(Boolean).slice(0, 2);
    const key = path[1] ? `${path[1].slice(0, 4)}…` : "";
    return `${parsed.hostname.replace(/^www\./, "")}/${path[0] ?? ""}/${key}`;
  } catch {
    return url.slice(0, 24);
  }
};

const linksIn = (text: string) =>
  text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * 새 테스트 세트의 화면 자료. 플러그인이 올린 업로드에서 시작하거나, Figma 링크와 이미지를
 * 하나의 임시 업로드에 차례로 붙인다. 붙이는 요청은 업로드 ID가 이어지도록 한 번에 하나씩 보낸다.
 */
export function useScreenSources(initialUploadId?: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [uploadId, setUploadId] = useState(initialUploadId);
  const upload = useQuery({
    ...tempUploadQuery(uploadId ?? ""),
    enabled: Boolean(uploadId),
    meta: { quietCodes: ["NOT_FOUND"] },
  });
  const [sources, setSources] = useState<Source[]>([]);
  // 칩을 지워 뺀 프레임과 눌러서 뺀 프레임
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [tokenProblem, setTokenProblem] = useState<
    "required" | "invalid" | null
  >(null);
  const queue = useRef(Promise.resolve());
  const current = useRef(uploadId);
  const lost = upload.isError && isApiFailure(upload.error, "NOT_FOUND");
  // 찾을 수 없는 업로드는 새로 붙일 때 쓰지 않는다. 다음 요청부터는 새로 받은 업로드를 쓴다
  const stale = useRef<string>(undefined);
  if (lost) stale.current = uploadId;

  const update = (key: string, patch: Partial<Source>) =>
    setSources((list) =>
      list.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
  const enqueue = (task: () => Promise<void>) => {
    queue.current = queue.current.then(task, task);
  };
  const target = () =>
    current.current === stale.current ? undefined : current.current;
  const applied = (data: { upload: TempUpload; omittedCount: number }) => {
    current.current = data.upload.id;
    setUploadId(data.upload.id);
    queryClient.setQueryData(
      tempUploadQuery(data.upload.id).queryKey,
      data.upload,
    );
    if (data.omittedCount > 0)
      toast.show({
        message: `프레임 ${data.omittedCount}개는 한도를 넘어 넣지 못했습니다`,
        tone: "danger",
      });
  };

  const known = () =>
    new Set(
      (current.current
        ? queryClient.getQueryData(tempUploadQuery(current.current).queryKey)
        : undefined
      )?.frames.map((f) => f.id) ?? [],
    );
  // 응답을 받지 못했어도 서버에는 붙었을 수 있다. 업로드를 다시 읽어 새로 생긴 프레임을 이 자료로 잇는다.
  // 요청은 한 번에 하나라 새 프레임은 모두 이번 요청의 것이다.
  const recover = async (before: Set<string>) => {
    if (!current.current) return [];
    try {
      const fresh = await queryClient.fetchQuery({
        ...tempUploadQuery(current.current),
        staleTime: 0,
      });
      return fresh.frames.filter((f) => !before.has(f.id)).map((f) => f.id);
    } catch {
      return [];
    }
  };

  const readLink = (key: string, url: string) =>
    enqueue(async () => {
      const before = known();
      try {
        const { data } = await sdk.addFigmaLinkToUpload({
          body: { url, uploadId: target() },
          throwOnError: true,
        });
        applied(data);
        update(key, {
          status: "done",
          label: data.title || shortLink(url),
          frameIds: data.addedFrameIds,
        });
      } catch (error) {
        const { code, message } = toApiFailure(error);
        if (code === "FIGMA_TOKEN_REQUIRED" || code === "FIGMA_TOKEN_INVALID") {
          setTokenProblem(
            code === "FIGMA_TOKEN_REQUIRED" ? "required" : "invalid",
          );
          update(key, { status: "waiting" });
          return;
        }
        if (code === "NETWORK") {
          const frameIds = await recover(before);
          if (frameIds.length) {
            update(key, { status: "done", frameIds });
            return;
          }
        }
        update(key, {
          status: "failed",
          reason:
            code === "FIGMA_LINK_INVALID"
              ? "링크 확인 필요"
              : code === "FIGMA_LINK_UNAVAILABLE"
                ? "볼 수 없는 링크"
                : "읽지 못함",
        });
        if (code !== "FIGMA_LINK_INVALID" && code !== "FIGMA_LINK_UNAVAILABLE")
          toast.show({ message, tone: "danger" });
      }
    });

  const addLinks = (text: string) => {
    const added = linksIn(text).map((url) => ({
      key: crypto.randomUUID(),
      kind: "figma" as const,
      label: shortLink(url),
      status: "reading" as const,
      frameIds: [],
      url,
    }));
    setSources((list) => [...list, ...added]);
    for (const s of added) readLink(s.key, s.url);
  };

  const addImages = (files: File[]) => {
    const images = files.filter((f) => IMAGE_TYPES.includes(f.type));
    if (images.length < files.length)
      toast.show({
        message: "PNG, JPG, WebP 이미지만 넣을 수 있습니다",
        tone: "danger",
      });
    if (!images.length) return;
    const added = images.map((file) => ({
      key: crypto.randomUUID(),
      kind: "image" as const,
      label: file.name,
      status: "reading" as const,
      frameIds: [],
    }));
    setSources((list) => [...list, ...added]);
    enqueue(async () => {
      const before = known();
      const settle = (frameIds: (string | undefined)[]) =>
        added.forEach((s, i) => {
          const frameId = frameIds[i];
          update(
            s.key,
            frameId
              ? { status: "done", frameIds: [frameId] }
              : { status: "failed", reason: "읽지 못함" },
          );
        });
      try {
        const { data } = await sdk.addImagesToUpload({
          body: { uploadId: target(), "images[]": images },
          throwOnError: true,
        });
        applied(data);
        // 이미지 한 장이 프레임 하나다. 한도를 넘은 장은 실패로 둔다
        settle(data.addedFrameIds);
      } catch (error) {
        if (isApiFailure(error, "NETWORK")) {
          const frameIds = await recover(before);
          if (frameIds.length) {
            settle(frameIds);
            return;
          }
        }
        settle([]);
        toast.show({
          message: isApiFailure(error, "VALIDATION_ERROR")
            ? "이미지를 읽지 못했습니다"
            : toApiFailure(error).message,
          tone: "danger",
        });
      }
    });
  };

  const remove = (key: string) => {
    const source = sources.find((s) => s.key === key);
    if (!source) return;
    setHidden((prev) => new Set([...prev, ...source.frameIds]));
    setSources((list) => list.filter((s) => s.key !== key));
  };

  // 토큰을 등록하거나 바꾸면 기다리던 링크를 다시 읽는다
  const token = useQuery({ ...figmaTokenQuery(), enabled: false });
  const seen = useRef(token.dataUpdatedAt);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 토큰이 바뀐 때만 다시 읽는다
  useEffect(() => {
    if (token.dataUpdatedAt === seen.current) return;
    seen.current = token.dataUpdatedAt;
    if (!token.data) return;
    setTokenProblem(null);
    for (const s of sources)
      if (s.status === "waiting" && s.url) {
        update(s.key, { status: "reading" });
        readLink(s.key, s.url);
      }
  }, [token.dataUpdatedAt]);

  const all = (upload.data?.frames ?? []).filter((f) => !hidden.has(f.id));
  const selected = all.filter((f) => !excluded.has(f.id));
  return {
    uploadId,
    upload,
    lost,
    sources,
    frames: all,
    selected,
    excluded,
    setExcluded,
    tokenProblem,
    addLinks,
    addImages,
    remove,
    reading: sources.some((s) => s.status === "reading"),
    /** 넣은 프레임을 모두 고른 상태면 비워 서버 기본(전체)을 쓴다 */
    frameIds:
      hidden.size > 0 || excluded.size > 0
        ? selected.map((f) => f.id)
        : undefined,
  };
}

export type ScreenSourcesState = ReturnType<typeof useScreenSources>;

const tagTone = {
  reading: "figma",
  done: "figma",
  waiting: "warning",
  failed: "danger",
} as const;

export interface ScreenSourcesProps {
  state: ScreenSourcesState;
  /** 토큰이 없거나 만료되어 기다리는 링크가 있을 때 토큰 입력을 연다 */
  onRequestFigmaToken: () => void;
}

export function ScreenSources({
  state,
  onRequestFigmaToken,
}: ScreenSourcesProps) {
  const [draft, setDraft] = useState("");
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { uploadId, frames, selected, excluded, setExcluded, sources } = state;
  const waiting = sources.filter((s) => s.status === "waiting").length;
  const reading = sources.filter(
    (s) => s.status === "reading" && s.kind === "figma",
  );

  const submitDraft = () => {
    if (!draft.trim()) return;
    state.addLinks(draft);
    setDraft("");
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const files = [...event.clipboardData.files];
    if (files.length) {
      event.preventDefault();
      state.addImages(files);
      return;
    }
    // 링크를 붙여 넣으면 바로 읽는다. 여러 줄도 한 번에 받는다
    const text = event.clipboardData.getData("text");
    if (/figma\.com\//.test(text)) {
      event.preventDefault();
      state.addLinks(`${draft} ${text}`);
      setDraft("");
    }
  };
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setOver(false);
    const files = [...event.dataTransfer.files];
    if (files.length) state.addImages(files);
    else state.addLinks(event.dataTransfer.getData("text"));
  };

  return (
    <section
      aria-labelledby="sources-title"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        "flex flex-col gap-3.5 rounded-lg border bg-surface p-5 transition-colors duration-fast",
        over ? "border-accent bg-selected" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="sources-title" className="m-0 text-title-sm text-fg">
          화면 자료
        </h2>
        {frames.length > 0 && (
          <>
            <span className="text-body-sm text-fg-muted tabular-nums">
              {frames.length}개 중 {selected.length}개 선택
            </span>
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExcluded(
                  excluded.size === 0
                    ? new Set(frames.map((f) => f.id))
                    : new Set(),
                )
              }
            >
              {excluded.size === 0 ? "전체 해제" : "전체 선택"}
            </Button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <TextField
          aria-label="Figma 링크"
          icon={Link2}
          type="url"
          placeholder="Figma 링크 붙여 넣기"
          className="min-w-64 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={paste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submitDraft();
            }
          }}
        />
        <Button icon={Image} onClick={() => fileInput.current?.click()}>
          이미지 첨부
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            state.addImages([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {state.tokenProblem && waiting > 0 && (
        <Banner
          tone="warning"
          title={
            state.tokenProblem === "invalid"
              ? `Figma 토큰을 사용할 수 없어 링크 ${waiting}개를 읽지 못했습니다`
              : `Figma 토큰이 없어 링크 ${waiting}개를 읽지 못했습니다`
          }
          actions={
            <Button size="sm" onClick={onRequestFigmaToken}>
              {state.tokenProblem === "invalid" ? "토큰 바꾸기" : "토큰 등록"}
            </Button>
          }
        />
      )}
      {sources.length > 0 && (
        <ul
          aria-label="넣은 자료"
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {sources.map((s) => (
            <li key={s.key} className="min-w-0">
              <Tag
                tone={
                  s.kind === "image" && s.status === "done"
                    ? "neutral"
                    : tagTone[s.status]
                }
                onRemove={
                  s.status === "reading" ? undefined : () => state.remove(s.key)
                }
                removeLabel={`${s.label} 빼기`}
              >
                {s.status === "reading" && (
                  <>
                    <Icon
                      icon={Loader2}
                      size="sm"
                      spin
                      className="mr-1 align-middle"
                    />
                    <span className="sr-only">읽는 중 </span>
                  </>
                )}
                {s.label}
                {s.status === "done" && s.kind === "figma" && (
                  <span className="text-fg-muted">
                    {" "}
                    프레임 {s.frameIds.length}개
                  </span>
                )}
                {s.status === "failed" && s.reason && ` ${s.reason}`}
              </Tag>
            </li>
          ))}
        </ul>
      )}
      {state.lost && (
        <p className="m-0 text-body-sm text-fg-muted">
          화면 자료를 찾을 수 없습니다. 자료를 다시 넣으세요.
        </p>
      )}
      {state.upload.isError && !state.lost && (
        <div className="flex items-center gap-2">
          <p className="m-0 flex-1 text-body-sm text-fg-muted">
            프레임을 불러오지 못했습니다
          </p>
          <Button
            size="sm"
            loading={state.upload.isFetching}
            onClick={() => state.upload.refetch()}
          >
            다시 시도
          </Button>
        </div>
      )}
      {(frames.length > 0 || reading.length > 0) && (
        <ul className="m-0 grid list-none grid-cols-3 gap-x-2.5 gap-y-3 p-0 sm:grid-cols-5">
          {frames.map((f) => {
            const on = !excluded.has(f.id);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(f.id);
                      else next.delete(f.id);
                      return next;
                    })
                  }
                  className={cn(
                    "block w-full rounded-md border-0 bg-transparent p-0 text-left transition-opacity duration-fast",
                    !on && "opacity-45",
                  )}
                >
                  <FrameCard
                    name={f.name}
                    selected={on}
                    imageSrc={
                      f.imageCount > 0 && uploadId
                        ? thumbnail(uploadId, f.id)
                        : undefined
                    }
                  />
                </button>
              </li>
            );
          })}
          {reading.map((s) => (
            <li key={s.key}>
              <FrameCard name={s.label} state="uploading" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
