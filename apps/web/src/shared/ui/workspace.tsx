import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  WorkspaceIcon,
  type WorkspaceIconName,
} from "@cheddar/ui";
import type { ReactNode } from "react";
export function MenuAction({
  icon,
  children,
  onClick,
  disabled = false,
}: {
  icon: WorkspaceIconName;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      className="workspace-menu-action"
      disabled={disabled}
      onClick={onClick}
    >
      <WorkspaceIcon name={icon} />
      <span>{children}</span>
      <WorkspaceIcon name="chevron" />
    </Button>
  );
}
export function LoadingSkeleton({ table = false }: { table?: boolean }) {
  return (
    <div
      role="status"
      aria-label="조회 중"
      className={table ? "workspace-skeleton is-table" : "workspace-skeleton"}
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row}>
          {(table ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1]).map((cell) => (
            <i key={cell} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function WorkspaceSelect({
  id,
  label,
  value,
  options,
  disabled,
  onValueChange,
}: {
  id?: string;
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectTrigger id={id} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
