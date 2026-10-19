import { Select as BaseSelect } from "@base-ui/react/select";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useId } from "react";
import {
  type ControlSize,
  controlFrame,
  controlHeight,
  Field,
  type FieldOwnProps,
} from "./field";
import { DrawnCheck, Icon } from "./icon";
import { PopupHighlight, popupFrame, popupItem } from "./popup-list";
import { cn } from "./utils";

export interface SelectItem {
  value: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SelectProps extends FieldOwnProps {
  items: SelectItem[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  size?: ControlSize;
  /** 폼 제출용 이름 */
  name?: string;
  className?: string;
  "aria-label"?: string;
}

/** 브라우저 기본 select 대신 직접 그린 목록 상자 */
export function Select({
  items,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  size = "md",
  name,
  className,
  "aria-label": ariaLabel,
  ...field
}: SelectProps) {
  const highlightId = useId();
  const byValue = new Map(items.map((item) => [item.value, item]));
  return (
    <Field {...field} className={className}>
      <BaseSelect.Root
        items={items}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onValueChange?.(next as string | null)}
        name={name}
        disabled={field.disabled}
        required={field.required}
      >
        <BaseSelect.Trigger
          aria-label={ariaLabel}
          className={cn(
            "flex w-full items-center gap-2 px-3 text-left",
            controlFrame,
            controlHeight[size],
          )}
        >
          <BaseSelect.Value className="flex min-w-0 flex-1 items-center gap-2 truncate">
            {(current: string | null) => {
              const item = current == null ? undefined : byValue.get(current);
              if (!item)
                return <span className="text-fg-faint">{placeholder}</span>;
              return (
                <>
                  {item.icon && (
                    <Icon icon={item.icon} className="text-fg-muted" />
                  )}
                  <span className="truncate">{item.label}</span>
                </>
              );
            }}
          </BaseSelect.Value>
          <BaseSelect.Icon className="text-fg-muted transition-transform duration-base data-popup-open:rotate-180">
            <Icon icon={ChevronDown} size="sm" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner
            sideOffset={4}
            alignItemWithTrigger={false}
            className="z-50"
          >
            <BaseSelect.Popup
              className={popupFrame}
              style={{ minWidth: "var(--anchor-width)" }}
            >
              <BaseSelect.List>
                {items.map((item) => (
                  <BaseSelect.Item
                    key={item.value}
                    value={item.value}
                    disabled={item.disabled}
                    className={popupItem}
                    render={(props, state) => (
                      <div {...props}>
                        <PopupHighlight
                          active={state.highlighted}
                          layoutId={highlightId}
                        />
                        <span className="relative flex min-w-0 flex-1 items-center gap-2">
                          {item.icon && (
                            <Icon icon={item.icon} className="text-fg-muted" />
                          )}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <BaseSelect.ItemText className="truncate">
                              {item.label}
                            </BaseSelect.ItemText>
                            {item.description && (
                              <span className="text-caption text-fg-muted">
                                {item.description}
                              </span>
                            )}
                          </span>
                          <DrawnCheck
                            drawn={state.selected}
                            size="sm"
                            className="text-accent"
                          />
                        </span>
                      </div>
                    )}
                  />
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </Field>
  );
}
