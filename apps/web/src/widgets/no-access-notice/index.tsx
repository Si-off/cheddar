import { Button, EmptyState } from "@cheddar/ui";
import { Lock } from "lucide-react";
import type { ReactElement } from "react";

export interface NoAccessNoticeProps {
  /** 돌아갈 곳 링크 요소. 예: <Link to="/test-sets" /> */
  backLink: ReactElement;
}

export function NoAccessNotice({ backLink }: NoAccessNoticeProps) {
  return (
    <main className="flex justify-center px-6 pt-40 pb-12">
      <EmptyState
        icon={Lock}
        title="접근 권한이 없습니다"
        actions={
          <Button render={backLink} nativeButton={false}>
            테스트 세트 목록
          </Button>
        }
      />
    </main>
  );
}
