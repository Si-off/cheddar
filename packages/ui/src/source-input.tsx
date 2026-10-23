import {
  CircleAlert,
  FileSpreadsheet,
  FileText,
  Image,
  Loader2,
  type LucideIcon,
  Paperclip,
  X,
} from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { Button, IconButton } from "./button";
import { Icon } from "./icon";
import { cn } from "./utils";

export interface SourceInputProps {
  /** 붙여 넣은 글 */
  text: string;
  onTextChange: (text: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** 고를 수 있는 파일 형식(input accept 값) */
  accept?: string;
  placeholder?: string;
  /** 글 입력 칸의 접근성 이름 */
  label: string;
  /** 읽는 중이면 입력과 첨부를 잠그고 파일마다 회전 표시를 둔다 */
  busy?: boolean;
  /** 상자 아래 오류 문구 */
  error?: ReactNode;
  /** 첨부 버튼과 같은 줄 오른쪽에 둘 조작 */
  actions?: ReactNode;
  className?: string;
}

const extension = (name: string) =>
  name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

const fileIcon = (name: string): LucideIcon => {
  const ext = extension(name);
  if (["xlsx", "xls", "csv", "tsv"].includes(ext)) return FileSpreadsheet;
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return Image;
  return FileText;
};

const fileMeta = (file: File) => {
  const size =
    file.size >= 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)}MB`
      : `${Math.max(1, Math.round(file.size / 1024))}KB`;
  const ext = extension(file.name).toUpperCase();
  return ext ? `${ext} ${size}` : size;
};

/**
 * 글을 붙여 넣거나 파일을 끌어 놓는 상자. 채팅 입력처럼 글 칸 아래에 첨부한 파일이 쌓인다.
 * 클립보드의 이미지도 붙여 넣으면 파일로 더한다.
 */
export function SourceInput({
  text,
  onTextChange,
  files,
  onFilesChange,
  accept,
  placeholder,
  label,
  busy,
  error,
  actions,
  className,
}: SourceInputProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | File[]) => {
    const added = Array.from(list);
    if (!added.length) return;
    // 같은 파일을 두 번 넣으면 하나만 둔다
    const key = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
    const seen = new Set(files.map(key));
    onFilesChange([...files, ...added.filter((f) => !seen.has(key(f)))]);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    if (!busy) add(event.dataTransfer.files);
  };
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files);
    if (!pasted.length) return;
    event.preventDefault();
    add(pasted);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 끌어 놓기만 받는 틀이며 조작은 안쪽 입력과 버튼이 맡는다 */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && !over) setOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setOver(false);
        }}
        onDrop={drop}
        className={cn(
          "flex flex-col rounded-lg border border-line bg-surface transition-colors duration-fast focus-within:border-line-strong",
          over && "border-accent bg-selected",
          busy && "bg-canvas",
          error && "border-danger",
        )}
      >
        <textarea
          aria-label={label}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          value={text}
          readOnly={busy}
          rows={5}
          onChange={(event) => onTextChange(event.target.value)}
          onPaste={paste}
          className="min-h-32 resize-none rounded-t-lg border-0 bg-transparent px-4 py-3.5 font-mono text-fg text-mono outline-none placeholder:font-sans placeholder:text-body-sm placeholder:text-fg-faint"
        />
        {files.length > 0 && (
          <ul
            aria-label="첨부한 파일"
            className="m-0 flex list-none flex-col gap-1.5 px-3 py-0"
          >
            {files.map((file, index) => (
              <li
                key={`${file.name}:${file.size}:${file.lastModified}`}
                className="flex items-center gap-2.5 rounded-md bg-subtle py-1.5 pr-1.5 pl-2"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-surface text-fg-muted">
                  <Icon icon={fileIcon(file.name)} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-body-sm text-fg">
                  {file.name}
                </span>
                <span className="shrink-0 text-caption text-fg-muted">
                  {fileMeta(file)}
                </span>
                {busy ? (
                  <span className="grid size-8 place-items-center text-accent-text">
                    <Icon icon={Loader2} size="sm" spin label="읽는 중" />
                  </span>
                ) : (
                  <IconButton
                    icon={X}
                    size="sm"
                    label={`${file.name} 빼기`}
                    onClick={() =>
                      onFilesChange(files.filter((_, i) => i !== index))
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 px-3 pt-2 pb-2.5">
          <input
            ref={picker}
            type="file"
            multiple
            accept={accept}
            tabIndex={-1}
            aria-hidden
            className="hidden"
            onChange={(event) => {
              if (event.target.files) add(event.target.files);
              event.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={Paperclip}
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            파일 첨부
          </Button>
          <span className="flex-1" />
          {actions}
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 text-body-sm text-danger"
        >
          <Icon icon={CircleAlert} className="mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
