import { Surface } from "@cheddar/ui";
import { useFigmaConnection } from "@/shared/lib/figma-bridge";

export function FrameUploadPage() {
  const connected = useFigmaConnection((state) => state.connected);
  return (
    <main className="p-page text-body">
      <Surface>
        <h1 className="text-title font-heading">Figma 프레임</h1>
        <p className="mt-2 text-muted">
          선택한 프레임으로 테스트 케이스 작성을 준비합니다.
        </p>
        <p role="status" className="mt-4 text-label text-primary">
          {connected ? "Figma 연결됨" : "Figma에서 플러그인을 열어주세요."}
        </p>
      </Surface>
    </main>
  );
}
