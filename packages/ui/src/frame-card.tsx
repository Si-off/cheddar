import { CircleAlert, Frame, Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { DrawnCheck, Icon } from "./icon";
import { cn } from "./utils";

const ratioClass = {
  portrait: "aspect-3/4",
  landscape: "aspect-video",
  square: "aspect-square",
};

const stateLabel = {
  uploading: "업로드 중",
  done: "업로드 완료",
  failed: "업로드 실패",
};

export interface FrameCardProps extends ComponentProps<"figure"> {
  name: string;
  /** 미리보기 이미지 주소. 없으면 자리 표시 */
  imageSrc?: string;
  ratio?: keyof typeof ratioClass;
  selected?: boolean;
  state?: "uploading" | "done" | "failed";
}

/** Figma 프레임 한 장 */
export function FrameCard({
  name,
  imageSrc,
  ratio = "portrait",
  selected,
  state,
  className,
  ...rest
}: FrameCardProps) {
  return (
    <figure
      {...rest}
      className={cn("m-0 flex min-w-0 flex-col gap-1.5", className)}
    >
      <div
        className={cn(
          "relative grid place-items-center overflow-hidden rounded-md border bg-secondary-soft text-secondary-text",
          ratioClass[ratio],
          selected ? "border-accent outline-2 outline-accent" : "border-line",
        )}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            className="size-full object-cover object-top"
          />
        ) : (
          <Icon icon={Frame} size="lg" />
        )}
        {state && (
          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-surface shadow-raised">
            {state === "uploading" && (
              <Icon icon={Loader2} size="sm" spin className="text-fg-muted" />
            )}
            {state === "done" && (
              <DrawnCheck drawn size="sm" className="text-success" />
            )}
            {state === "failed" && (
              <Icon icon={CircleAlert} size="sm" className="text-danger" />
            )}
            <span className="sr-only">{stateLabel[state]}</span>
          </span>
        )}
      </div>
      <figcaption className="truncate text-caption text-fg-muted" title={name}>
        {name}
      </figcaption>
    </figure>
  );
}
