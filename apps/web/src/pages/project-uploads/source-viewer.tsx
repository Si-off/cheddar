import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Label,
  WorkspaceIcon,
} from "@cheddar/ui/legacy";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FrameReference } from "@/entities/test-case";
import type { AnalysisRegionDto } from "@/shared/api/generated";
import { readAnalysis } from "./analysis-api";
import { frameFile } from "./uploads-api";

export function SourceImage({
  projectId,
  frame,
  region,
  zoom = 1,
}: {
  projectId: string;
  frame: Pick<FrameReference, "id" | "imageFileId" | "name">;
  region?: AnalysisRegionDto;
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
  if (!url) return <p role="status">이미지 조회 중</p>;
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
          aria-hidden={!!region}
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
  embedded = false,
}: {
  projectId: string;
  caseId?: string;
  frames: FrameReference[];
  onClose?: () => void;
  embedded?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1);
  const [region, setRegion] = useState<AnalysisRegionDto>();
  const analysis = useQuery({
    queryKey: ["analysis", projectId],
    queryFn: () => readAnalysis(projectId),
  });
  const current = frames.find((f) => f.id === selected) ?? frames[0];
  const ids =
    analysis.data?.links
      .filter((l) => l.caseId === caseId)
      .map((l) => l.requirementId) ?? [];
  const requirements =
    analysis.data?.items.filter(
      (i) => ids.includes(i.id) && (!i.frameId || i.frameId === current?.id),
    ) ?? [];
  const Container = embedded ? "section" : "aside";
  return (
    <Container
      className={
        embedded ? "source-panel source-panel--embedded" : "source-panel"
      }
      aria-label="관련 자료"
    >
      {!embedded && (
        <header>
          <h2>관련 자료</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="관련 자료 닫기"
            onClick={onClose}
          >
            <WorkspaceIcon name="close" />
          </Button>
        </header>
      )}
      {frames.length > 0 ? (
        <>
          <Label htmlFor="source-frame">화면</Label>
          <Combobox
            items={frames}
            value={current ?? null}
            itemToStringLabel={(frame) => frame.name}
            onValueChange={(frame) => {
              setSelected(frame?.id ?? "");
              setRegion(undefined);
              setZoom(1);
            }}
          >
            <ComboboxInput id="source-frame" placeholder="화면 검색" />
            <ComboboxContent>
              <ComboboxEmpty>검색 결과가 없습니다</ComboboxEmpty>
              <ComboboxList>
                {(frame) => (
                  <ComboboxItem key={frame.id} value={frame}>
                    {frame.name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
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
          <h3>요구사항 연결</h3>
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
          {analysis.isPending && <p role="status">요구사항 조회 중</p>}
          {analysis.isSuccess && !requirements.length && (
            <p>요구사항 연결이 없습니다.</p>
          )}
        </>
      ) : (
        <p>화면 연결이 없습니다.</p>
      )}
      {analysis.isError && (
        <p role="alert">
          분석 결과를 불러오지 못했습니다.
          <Button variant="link" onClick={() => void analysis.refetch()}>
            다시 불러오기
          </Button>
        </p>
      )}
    </Container>
  );
}
