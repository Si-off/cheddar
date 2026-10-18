import { LoginForm } from "@/features/auth";
import { AuthCard } from "@/widgets/auth-card";

export interface LoginPageProps {
  defaultEmail?: string;
  onLoggedIn: () => void;
}

export function LoginPage({ defaultEmail, onLoggedIn }: LoginPageProps) {
  return (
    <AuthCard title="로그인">
      <LoginForm defaultEmail={defaultEmail} onLoggedIn={onLoggedIn} />
      <p className="m-0 text-body-sm text-fg-muted">
        비밀번호를 잊었다면 관리자에게 문의하세요.
      </p>
    </AuthCard>
  );
}
