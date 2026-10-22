import { LoginForm } from "@/features/auth";
import { AuthCard } from "@/widgets/auth-card";

export interface LoginPageProps {
  defaultLoginId?: string;
  onLoggedIn: () => void;
}

export function LoginPage({ defaultLoginId, onLoggedIn }: LoginPageProps) {
  return (
    <AuthCard title="로그인">
      <LoginForm defaultLoginId={defaultLoginId} onLoggedIn={onLoggedIn} />
      <p className="m-0 text-body-sm text-fg-muted">
        비밀번호를 잊었다면 관리자에게 문의하세요.
      </p>
    </AuthCard>
  );
}
