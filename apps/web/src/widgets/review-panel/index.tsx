import {
  Badge,
  Button,
  cn,
  Dialog,
  Icon,
  IconButton,
  TextField,
} from "@cheddar/ui";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ReviewItem, ReviewStatus } from "@/entities/generation";
import { CellField, type CellValue, type Column } from "@/entities/test-set";

const statusBadge: Record<
  ReviewStatus,
  { tone: "warning" | "info" | "neutral" | "success"; label: string }
> = {
  pending: { tone: "warning", label: "확인 필요" },
  rewriting: { tone: "info", label: "다시 작성 중" },
  excluded: { tone: "neutral", label: "제외함" },
  resolved: { tone: "success", label: "추가함" },
};

const dotClass: Record<ReviewStatus, string> = {
  pending: "bg-warning",
  rewriting: "bg-info",
  excluded: "bg-line-strong",
  resolved: "bg-success",
};

export interface ReviewPanelProps {
  columns: Column[];
  items: ReviewItem[];
  readOnly?: boolean;
  /** 답을 남기면 저장한다(입력 칸을 벗어날 때) */
  onAnswer: (item: ReviewItem, answer: string) => void;
  onDraft: (item: ReviewItem, columnId: string, value: CellValue) => void;
  onExclude: (item: ReviewItem) => void;
  onRestore: (item: ReviewItem) => void;
  onAccept: (item: ReviewItem) => void;
  onRewrite: (item: ReviewItem, answer: string) => void;
  onClose: () => void;
}

/**
 * 확인 필요 항목을 하나씩 처리하는 오른쪽 패널. 고쳐서 추가하거나, 질문에 답해 다시 작성하거나, 제외한다.
 * 처리하면 다음 남은 항목으로 넘어간다.
 */
export function ReviewPanel({
  columns,
  items,
  readOnly,
  onAnswer,
  onDraft,
  onExclude,
  onRestore,
  onAccept,
  onRewrite,
  onClose,
}: ReviewPanelProps) {
  const [currentId, setCurrentId] = useState<string | null>(
    items.find((i) => i.status === "pending")?.id ?? items[0]?.id ?? null,
  );
  const index = Math.max(
    0,
    items.findIndex((i) => i.id === currentId),
  );
  const item = items[index];
  const go = (to: number) =>
    setCurrentId(items[(to + items.length) % items.length]?.id ?? null);
  const nextPending = () => {
    for (let k = 1; k <= items.length; k++) {
      const candidate = items[(index + k) % items.length];
      if (candidate?.status === "pending") return setCurrentId(candidate.id);
    }
  };

  const close = () => {
    // Esc로 닫아도 입력 칸의 blur 저장을 먼저 실행한다.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onClose();
  };

  return (
    <Dialog.Root
      defaultOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Content placement="side">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-line border-b px-4 py-3">
          <Dialog.Title className="m-0 text-title-sm text-fg">
            확인 필요
          </Dialog.Title>
          <nav aria-label="확인 필요 항목" className="flex flex-wrap gap-1">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                aria-label={`${i + 1}번째 항목, ${statusBadge[it.status].label}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setCurrentId(it.id)}
                className={cn(
                  "grid size-5 place-items-center rounded-full border-0 bg-transparent p-0 outline-none transition-colors duration-fast hover:bg-subtle focus-visible:bg-selected",
                  i === index && "bg-selected",
                )}
              >
                <span
                  className={cn("size-2 rounded-full", dotClass[it.status])}
                />
              </button>
            ))}
          </nav>
          <span className="flex-1" />
          <IconButton
            icon={ChevronLeft}
            size="sm"
            label="이전 항목"
            disabled={items.length < 2}
            onClick={() => go(index - 1)}
          />
          <IconButton
            icon={ChevronRight}
            size="sm"
            label="다음 항목"
            disabled={items.length < 2}
            onClick={() => go(index + 1)}
          />
          <IconButton
            icon={X}
            size="sm"
            label="확인 필요 닫기"
            onClick={close}
          />
        </header>
        {item ? (
          <ReviewBody
            key={item.id}
            item={item}
            columns={columns}
            readOnly={readOnly}
            onAnswer={onAnswer}
            onDraft={onDraft}
            onRewrite={onRewrite}
          />
        ) : (
          <p className="m-0 px-4 py-6 text-body-sm text-fg-muted">
            확인할 항목이 없습니다
          </p>
        )}
        {item && (
          <footer className="mt-auto flex shrink-0 flex-wrap items-center gap-2 border-line border-t px-4 py-3">
            <Badge tone={statusBadge[item.status].tone} dot>
              {statusBadge[item.status].label}
            </Badge>
            <span className="flex-1" />
            {!readOnly && item.status === "excluded" && (
              <Button variant="ghost" onClick={() => onRestore(item)}>
                되돌리기
              </Button>
            )}
            {!readOnly && item.status === "pending" && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onExclude(item);
                    nextPending();
                  }}
                >
                  제외
                </Button>
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => {
                    onAccept(item);
                    nextPending();
                  }}
                >
                  테스트 세트에 추가
                </Button>
              </>
            )}
          </footer>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ReviewBody({
  item,
  columns,
  readOnly,
  onAnswer,
  onDraft,
  onRewrite,
}: {
  item: ReviewItem;
  columns: Column[];
  readOnly?: boolean;
  onAnswer: (item: ReviewItem, answer: string) => void;
  onDraft: (item: ReviewItem, columnId: string, value: CellValue) => void;
  onRewrite: (item: ReviewItem, answer: string) => void;
}) {
  const [answer, setAnswer] = useState(item.answer);
  const locked = readOnly || item.status !== "pending";
  // 테스트 ID는 추가할 때 붙는다
  const fields = columns.filter((c) => c.systemKey !== "test_id");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
      <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-body-sm text-fg">
        {item.reason}
      </p>
      {item.question && (
        <div className="flex flex-col gap-2">
          <TextField
            label={item.question}
            placeholder="답변"
            readOnly={locked}
            maxLength={2000}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onBlur={() => {
              if (answer !== item.answer) onAnswer(item, answer);
            }}
          />
          {!readOnly && (
            <div>
              <Button
                size="sm"
                variant="ai"
                icon={Sparkles}
                disabled={locked || !answer.trim()}
                onClick={() => onRewrite(item, answer.trim())}
              >
                답변으로 다시 작성
              </Button>
            </div>
          )}
        </div>
      )}
      {item.status === "rewriting" ? (
        <div className="flex items-center gap-2 text-body-sm text-fg-muted">
          <Icon icon={Loader2} size="sm" spin />
          다시 작성 중
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map((column) => (
            <CellField
              key={column.id}
              column={column}
              value={item.draft[column.id]}
              readOnly={locked}
              onChange={(value) => onDraft(item, column.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
