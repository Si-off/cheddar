import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// 글자 크기 토큰(text-body 등)을 색(text-fg 등)과 다른 그룹으로 알려 줘야 tailwind-merge가 둘 중 하나를 지우지 않는다.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title-lg",
            "title",
            "title-sm",
            "body",
            "body-sm",
            "label",
            "caption",
            "overline",
            "mono",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type PresenceColor = 1 | 2 | 3 | 4 | 5 | 6;

/** 공동 편집자 색. Tailwind가 찾을 수 있게 클래스 이름을 그대로 적는다. */
export const presenceClass: Record<
  PresenceColor,
  { bg: string; border: string; outline: string }
> = {
  1: {
    bg: "bg-presence-1",
    border: "border-presence-1",
    outline: "outline-presence-1",
  },
  2: {
    bg: "bg-presence-2",
    border: "border-presence-2",
    outline: "outline-presence-2",
  },
  3: {
    bg: "bg-presence-3",
    border: "border-presence-3",
    outline: "outline-presence-3",
  },
  4: {
    bg: "bg-presence-4",
    border: "border-presence-4",
    outline: "outline-presence-4",
  },
  5: {
    bg: "bg-presence-5",
    border: "border-presence-5",
    outline: "outline-presence-5",
  },
  6: {
    bg: "bg-presence-6",
    border: "border-presence-6",
    outline: "outline-presence-6",
  },
};

/** motion 전환 값. theme.css의 duration, easing 토큰과 같은 값이다. */
export const motionTokens = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.3, 0, 0, 1.1] as const,
};
