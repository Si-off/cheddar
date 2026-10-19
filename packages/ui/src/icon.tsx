import type { LucideIcon, LucideProps } from "lucide-react";
import { motion } from "motion/react";
import { cn, motionTokens } from "./utils";

const iconSize = { sm: 14, md: 16, lg: 20 } as const;

export type IconSize = keyof typeof iconSize;

export interface IconProps extends Omit<LucideProps, "ref" | "size"> {
  icon: LucideIcon;
  size?: IconSize;
  /** 아이콘만으로 뜻을 전달할 때의 접근성 이름. 없으면 장식으로 숨긴다. */
  label?: string;
  spin?: boolean;
}

export function Icon({
  icon: Glyph,
  size = "md",
  label,
  spin,
  className,
  ...rest
}: IconProps) {
  return (
    <Glyph
      {...rest}
      size={iconSize[size]}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn("shrink-0", spin && "animate-spin", className)}
    />
  );
}

export interface DrawnCheckProps {
  /** 그려진 상태. false면 거꾸로 지워진다. */
  drawn: boolean;
  size?: IconSize;
  className?: string;
  /** 체크 대신 가로줄(일부 선택) */
  indeterminate?: boolean;
}

/** 왼쪽 끝에서 시작해 아래로 꺾인 뒤 오른쪽 위로 그려지는 체크 표시 */
export function DrawnCheck({
  drawn,
  size = "md",
  className,
  indeterminate,
}: DrawnCheckProps) {
  const px = iconSize[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <motion.path
        d={indeterminate ? "M6 12h12" : "m4 12 5 5L20 6"}
        initial={false}
        animate={{ pathLength: drawn ? 1 : 0, opacity: drawn ? 1 : 0 }}
        transition={{
          duration: motionTokens.base,
          ease: motionTokens.standard,
        }}
      />
    </svg>
  );
}
