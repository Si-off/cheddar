import { Popover as BasePopover } from "@base-ui/react/popover";
import { dotClass, type Tone } from "./badge";
import { Popover } from "./popover";
import { cn } from "./utils";

/** 색 고르기에 보이는 순서와 이름 */
const tones: { tone: Tone; label: string }[] = [
  { tone: "neutral", label: "회색" },
  { tone: "danger", label: "빨강" },
  { tone: "warning", label: "노랑" },
  { tone: "success", label: "초록" },
  { tone: "figma", label: "청록" },
  { tone: "info", label: "파랑" },
  { tone: "accent", label: "보라" },
];

/** 색 점을 누르면 아래에 색 목록이 열리고, 고르면 바로 닫힌다. */
export function TonePicker({
  value,
  onChange,
  label,
}: {
  value: Tone;
  onChange: (tone: Tone) => void;
  /** 화면 읽기 프로그램이 읽는 이름(예: "Pass 색") */
  label: string;
}) {
  const current = tones.find((t) => t.tone === value) ?? tones[0];
  return (
    <BasePopover.Root>
      <BasePopover.Trigger
        aria-label={`${label}: ${current?.label}`}
        className="grid size-7 shrink-0 place-items-center rounded-sm border-0 bg-transparent p-0 transition-colors duration-fast hover:bg-canvas data-popup-open:bg-canvas"
      >
        <span
          aria-hidden
          className={cn("size-3.5 rounded-full", dotClass[value])}
        />
      </BasePopover.Trigger>
      <Popover.Popup aria-label={label}>
        <div className="flex gap-1.5 p-2">
          {tones.map(({ tone, label: name }) => (
            <BasePopover.Close
              key={tone}
              aria-label={name}
              aria-pressed={tone === value}
              onClick={() => onChange(tone)}
              className={cn(
                "size-6 rounded-full border-0 p-0 transition-shadow duration-fast",
                dotClass[tone],
                tone === value &&
                  "ring-2 ring-accent ring-offset-2 ring-offset-surface",
              )}
            />
          ))}
        </div>
      </Popover.Popup>
    </BasePopover.Root>
  );
}
