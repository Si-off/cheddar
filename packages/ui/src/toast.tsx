import { Toast as BaseToast } from "@base-ui/react/toast";
import {
  CircleAlert,
  CircleCheck,
  Info,
  type LucideIcon,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

type ToastTone = "neutral" | "success" | "danger" | "info";

const toneIcon: Record<ToastTone, LucideIcon | null> = {
  neutral: null,
  success: CircleCheck,
  danger: CircleAlert,
  info: Info,
};

/** 앱 최상위에 한 번 둔다. 토스트는 오른쪽 아래에 쌓인다. React 밖에서 띄우려면 createToaster의 결과를 넘긴다. */
export function ToastProvider({
  children,
  toaster,
}: {
  children: ReactNode;
  toaster?: Toaster;
}) {
  return (
    <BaseToast.Provider toastManager={toaster?.manager}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className="fixed right-6 bottom-6 z-50 flex w-80 max-w-full flex-col gap-2 outline-none">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => {
    const icon = toneIcon[(toast.type as ToastTone | undefined) ?? "neutral"];
    return (
      <BaseToast.Root
        key={toast.id}
        toast={toast}
        className="flex items-start gap-2 rounded-lg bg-inverse px-4 py-3 text-body-sm text-fg-inverse shadow-popover transition duration-base ease-emphasized data-ending-style:translate-x-4 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0"
      >
        {icon && <Icon icon={icon} className="mt-0.5" />}
        <BaseToast.Content className="flex min-w-0 flex-1 flex-col">
          <BaseToast.Title className="m-0 text-body-sm" />
          <BaseToast.Description className="m-0 text-caption opacity-80" />
        </BaseToast.Content>
        <BaseToast.Close
          aria-label="닫기"
          className="grid size-5 place-items-center rounded-sm opacity-70 hover:opacity-100"
        >
          <Icon icon={X} size="sm" />
        </BaseToast.Close>
      </BaseToast.Root>
    );
  });
}

export interface ShowToastOptions {
  /** 짧은 한 문장. 오류면 무엇이 잘못됐는지와 다음 행동 */
  message: ReactNode;
  tone?: ToastTone;
  description?: ReactNode;
  /** 밀리초. 0이면 닫을 때까지 남는다 */
  timeout?: number;
}

type Manager = Pick<
  ReturnType<typeof BaseToast.createToastManager>,
  "add" | "close"
>;

function bind(manager: Manager) {
  return {
    show: ({
      message,
      tone = "neutral",
      description,
      timeout,
    }: ShowToastOptions) =>
      manager.add({
        title: message,
        description,
        type: tone,
        timeout,
        priority: tone === "danger" ? "high" : "low",
      }),
    close: (id: string) => manager.close(id),
  };
}

export type Toaster = ReturnType<typeof bind> & {
  manager: ReturnType<typeof BaseToast.createToastManager>;
};

/** React 밖(예: 전역 조회 오류 처리)에서 토스트를 띄울 때 쓴다. ToastProvider에 넘긴다. */
export function createToaster(): Toaster {
  const manager = BaseToast.createToastManager();
  return { ...bind(manager), manager };
}

/** 토스트 띄우기. ToastProvider 안에서 쓴다. */
export function useToast() {
  return bind(BaseToast.useToastManager());
}
