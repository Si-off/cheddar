import { Button, EmptyState } from "@cheddar/ui";
import { Lock } from "lucide-react";
import type { ReactElement } from "react";

export interface NoAccessNoticeProps {
  /** 소유자 이름을 알면 누구에게 요청할지 보여준다 */
  ownerName?: string;
  /** 돌아갈 곳 링크 요소. 예: <Link to="/test-sets" /> */
  backLink: ReactElement;
}

export function NoAccessNotice({ ownerName, backLink }: NoAccessNoticeProps) {
  return (
    <main className="flex justify-center px-6 pt-40 pb-12">
      <EmptyState
        icon={Lock}
        title="접근 권한이 없습니다"
        description={
          ownerName ? `소유자 ${ownerName}에게 초대를 요청하세요.` : undefined
        }
        actions={
          <Button render={backLink} nativeButton={false}>
            테스트 세트 목록
          </Button>
        }
      />
    </main>
  );
}
