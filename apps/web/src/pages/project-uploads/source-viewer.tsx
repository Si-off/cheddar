import { Button, Label, WorkspaceIcon } from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FrameReference } from "@/entities/test-case";
import type { EvidenceRegionDto } from "@/shared/api/generated";
import { readEvidence } from "./evidence-api";
import { frameFile } from "./uploads-api";

export function SourceImage({
  projectId,
  frame,
  region,
  zoom = 1,
}: {
  projectId: string;
  frame: Pick<FrameReference, "id" | "imageFileId" | "name">;
  region?: EvidenceRegionDto;
  zoom?: number;
}) {
  const image = useQuery({
    queryKey: ["frame-image", projectId, frame.imageFileId],
    queryFn: ({ signal }) => frameFile(projectId, frame.imageFileId, signal),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string>();
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    setUrl(undefined);
    if (!image.data) return;
    const next = URL.createObjectURL(image.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image.data]);
  if (image.isError)
    return (
      <div role="alert">
        이미지를 불러오지 못했습니다.
        <Button variant="link" onClick={() => void image.refetch()}>
          다시 불러오기
        </Button>
      </div>
    );
  if (!url) return <p role="status">이미지 불러오는 중</p>;
  return (
    <div className="source-image-scroll">
      <div style={{ width: `${zoom * 100}%` }}>
        {region ? (
          <svg
            role="img"
            aria-label={frame.name}
            viewBox={`${region.x * size.width} ${region.y * size.height} ${region.width * size.width} ${region.height * size.height}`}
          >
            <title>{frame.name}</title>
            <image href={url} width={size.width} height={size.height} />
          </svg>
        ) : null}
        <img
          src={url}
          alt={frame.name}
          className={region ? "source-image-measure" : "source-image"}
          onLoad={(event) =>
            setSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
        />
      </div>
    </div>
  );
}
export function SourceViewer({
  projectId,
  caseId,
  frames,
  onClose,
}: {
  projectId: string;
  caseId?: string;
  frames: FrameReference[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1);
  const [region, setRegion] = useState<EvidenceRegionDto>();
  const evidence = useQuery({
    queryKey: ["evidence", projectId],
    queryFn: () => readEvidence(projectId),
  });
  const current = frames.find((f) => f.id === selected) ?? frames[0];
  const ids =
    evidence.data?.links
      .filter((l) => l.caseId === caseId)
      .map((l) => l.requirementId) ?? [];
  const requirements =
    evidence.data?.items.filter(
      (i) => ids.includes(i.id) && (!i.frameId || i.frameId === current?.id),
    ) ?? [];
  return (
    <aside className="source-panel" aria-label="원본 대조">
      <header>
        <h2>관련 자료</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="원본 닫기"
          onClick={onClose}
        >
          <WorkspaceIcon name="close" />
        </Button>
      </header>
      {frames.length > 0 ? (
        <>
          <Label htmlFor="source-frame">화면</Label>
          <select
            id="source-frame"
            className="sheet-select"
            value={current?.id ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setRegion(undefined);
              setZoom(1);
            }}
          >
            {frames.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {current && (
            <>
              <SourceImage
                projectId={projectId}
                frame={current}
                region={region}
                zoom={zoom}
              />
              <div className="source-toolbar">
                <Button
                  variant="ghost"
                  aria-label="축소"
                  disabled={zoom <= 0.5}
                  onClick={() => setZoom((n) => Math.max(0.5, n - 0.25))}
                >
                  −
                </Button>
                <span>{Math.round(zoom * 100)}%</span>
                <Button
                  variant="ghost"
                  aria-label="확대"
                  disabled={zoom >= 3}
                  onClick={() => setZoom((n) => Math.min(3, n + 0.25))}
                >
                  +
                </Button>
                <Button
                  variant="link"
                  onClick={() => {
                    setRegion(undefined);
                    setZoom(1);
                  }}
                >
                  전체 보기
                </Button>
                <a
                  href={`https://www.figma.com/design/${encodeURIComponent(current.figmaFileKey)}?node-id=${encodeURIComponent(current.figmaNodeId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Figma 열기
                </a>
              </div>
            </>
          )}
          <h3>근거 설명</h3>
          {requirements.map((i) => (
            <article key={i.id}>
              <Button
                variant="link"
                onClick={() => {
                  setRegion(i.region);
                  setZoom(1);
                }}
              >
                {i.title}
              </Button>
              <p className="whitespace-pre-wrap">{i.answer || i.text}</p>
            </article>
          ))}
          {!requirements.length && <p>연결 근거가 없습니다.</p>}
        </>
      ) : (
        <p>화면 연결이 없습니다.</p>
      )}
      {evidence.isError && (
        <p role="alert">
          근거를 불러오지 못했습니다.
          <Button variant="link" onClick={() => void evidence.refetch()}>
            다시 불러오기
          </Button>
        </p>
      )}
    </aside>
  );
}
