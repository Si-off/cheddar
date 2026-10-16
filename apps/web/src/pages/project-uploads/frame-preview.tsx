import { Button, WorkspaceIcon } from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { frameFile } from "./uploads-api";

export function FramePreview({
  projectId,
  fileId,
  name,
}: {
  projectId: string;
  fileId: string;
  name: string;
}) {
  const file = useQuery({
    queryKey: ["frame-image", projectId, fileId],
    queryFn: ({ signal }) => frameFile(projectId, fileId, signal),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  useEffect(() => {
    if (!file.data) return;
    const next = URL.createObjectURL(file.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file.data]);
  return (
    <div
      className={`workspace-frame-preview${expanded ? " workspace-frame-preview-expanded" : ""}`}
    >
      {file.isPending && (
        <p role="status" className="text-label text-muted">
          이미지 조회 중
        </p>
      )}
      {file.isError && (
        <div role="alert" className="space-y-2 text-label text-danger">
          <p>이미지를 불러오지 못했습니다.</p>
          <Button variant="outline" onClick={() => void file.refetch()}>
            다시 불러오기
          </Button>
        </div>
      )}
      {url && (
        <>
          <button
            type="button"
            aria-label={`${name} 이미지 ${expanded ? "축소" : "확대"}`}
            aria-expanded={expanded}
            className={`workspace-frame-image-button${actualSize ? " workspace-frame-image-actual" : ""}`}
            onClick={() => {
              setExpanded((value) => !value);
              setActualSize(false);
            }}
          >
            <img src={url} alt={name} loading="lazy" />
          </button>
          {expanded && (
            <div className="workspace-frame-image-toolbar">
              <Button
                variant="outline"
                aria-pressed={actualSize}
                onClick={() => setActualSize((value) => !value)}
              >
                {actualSize ? "너비 맞춤" : "원본 크기"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setExpanded(false);
                  setActualSize(false);
                }}
              >
                이미지 접기
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function FrameDataDownload({
  projectId,
  fileId,
  name,
}: {
  projectId: string;
  fileId: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const blob = await frameFile(
        projectId,
        fileId,
        AbortSignal.timeout(30_000),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${name.replace(/[\r\n\0/\\]/g, "-").slice(0, 180)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void download()}
        disabled={busy}
        aria-label={`${name} 데이터 내려받기`}
      >
        <WorkspaceIcon name="download" />
      </Button>
      {failed && (
        <p role="alert" className="text-label text-danger">
          데이터를 가져오지 못했습니다. 다시 내려받아주세요.
        </p>
      )}
    </div>
  );
}
