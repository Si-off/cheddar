import { Button } from "@cheddar/ui";
import { Fragment, type ReactNode, useState } from "react";
import { FigmaTokenDialog } from "@/features/figma-token";

/** Figma 화면의 메뉴 이름. Figma가 영어로 보여주므로 원문 그대로 쓴다 */
function Path({ items, tail }: { items: string[]; tail?: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-body-sm text-fg-muted">
      {items.map((item, index) => (
        <Fragment key={item}>
          {index > 0 && <span aria-hidden>›</span>}
          <span className="inline-flex h-6 items-center rounded-sm border border-line bg-canvas px-2 text-caption font-medium text-fg">
            {item}
          </span>
        </Fragment>
      ))}
      {tail && (
        <>
          <span aria-hidden>›</span>
          <span>{tail}</span>
        </>
      )}
    </span>
  );
}

const scopes: [string, string][] = [
  ["이름", "Cheddar"],
  ["만료", "최대 90일"],
  ["File content", "Read-only"],
  ["Current user", "Read-only"],
  ["나머지 범위", "No access"],
];

/** Figma 개인 액세스 토큰을 만들어 Cheddar에 등록하는 순서 */
export function FigmaTokenGuidePage() {
  const [registering, setRegistering] = useState(false);
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: "Figma 설정 열기",
      body: <Path items={["계정 메뉴", "Settings", "Security"]} />,
    },
    {
      title: "새 토큰 만들기",
      body: <Path items={["Personal access tokens", "Generate new token"]} />,
    },
    {
      title: "이름, 만료, 범위 정하기",
      body: (
        <table className="w-full border-collapse text-body-sm">
          <tbody>
            {scopes.map(([name, value]) => (
              <tr
                key={name}
                className={
                  value === "Read-only" ? "bg-success-soft" : undefined
                }
              >
                <th
                  scope="row"
                  className="h-8 border-t border-line px-2.5 text-left font-medium text-fg-muted"
                >
                  {name}
                </th>
                <td
                  className={
                    value === "Read-only"
                      ? "border-t border-line px-2.5 font-medium text-success"
                      : "border-t border-line px-2.5 text-fg"
                  }
                >
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      title: "토큰 복사",
      body: (
        <Path items={["Generate token"]} tail="만든 직후 한 번만 보입니다" />
      ),
    },
    {
      title: "Cheddar에 등록",
      body: <Path items={["계정 메뉴", "Figma 토큰"]} />,
    },
  ];
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 pt-8 pb-12">
      <h1 className="m-0 text-title text-fg">Figma 토큰 발급</h1>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-3.5 rounded-lg border border-line bg-surface px-5 py-4"
          >
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-subtle text-label text-fg-muted tabular-nums"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h2 className="m-0 text-body font-medium text-fg">
                {step.title}
              </h2>
              {step.body}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setRegistering(true)}>
          토큰 등록
        </Button>
      </div>
      <FigmaTokenDialog
        open={registering}
        onOpenChange={setRegistering}
        replace
      />
    </main>
  );
}
