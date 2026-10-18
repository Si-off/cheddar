import { PasswordSetupForm } from "@/features/auth";
import { AuthCard } from "@/widgets/auth-card";

export interface PasswordSetupPageProps {
  kind: "invite" | "reset";
  token: string;
  onDone: (email: string) => void;
}

/** 초대 링크와 재설정 링크가 여는 비밀번호 설정 화면 */
export function PasswordSetupPage({
  kind,
  token,
  onDone,
}: PasswordSetupPageProps) {
  return (
    <AuthCard title={kind === "invite" ? "비밀번호 설정" : "비밀번호 재설정"}>
      <PasswordSetupForm kind={kind} token={token} onDone={onDone} />
    </AuthCard>
  );
}
