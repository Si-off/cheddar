import { cn, type PresenceColor, presenceClass } from "./utils";

export interface Person {
  id: string;
  name: string;
  color: PresenceColor;
  /** 로그인하지 않은 링크 방문자 */
  guest?: boolean;
}

export interface AvatarsProps {
  people: Person[];
  /** 이보다 많으면 +n으로 줄인다 */
  max?: number;
  "aria-label"?: string;
  className?: string;
}

/** 지금 같은 화면을 보는 사람. 색은 셀 선택 표시와 같다. 방문자는 점선 테두리로 구분한다. */
export function Avatars({
  people,
  max = 4,
  className,
  "aria-label": ariaLabel = "접속 중",
}: AvatarsProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <ul aria-label={ariaLabel} className={cn("flex items-center", className)}>
      {shown.map((person) => {
        const name = person.guest ? `${person.name} (방문자)` : person.name;
        return (
          <li
            key={person.id}
            title={name}
            aria-label={name}
            className={cn(
              "-ml-1.5 grid size-7 place-items-center rounded-full border-2 text-caption font-semibold first:ml-0",
              person.guest
                ? cn(
                    "border-dashed bg-surface text-fg",
                    presenceClass[person.color].border,
                  )
                : cn(
                    "border-surface text-on-presence",
                    presenceClass[person.color].bg,
                  ),
            )}
          >
            <span aria-hidden>{person.name.slice(0, 1)}</span>
          </li>
        );
      })}
      {rest > 0 && (
        <li
          aria-label={`외 ${rest}명`}
          className="-ml-1.5 grid size-7 place-items-center rounded-full border-2 border-surface bg-subtle text-caption font-semibold text-fg-muted"
        >
          <span aria-hidden>+{rest}</span>
        </li>
      )}
    </ul>
  );
}
