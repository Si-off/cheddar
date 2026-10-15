import { useEffect } from "react";
import { FrameUploadPage } from "@/pages/frame-upload";
import { connectToFigma } from "@/shared/lib/figma-bridge";
import { AppProviders } from "./providers";

export function App() {
  useEffect(connectToFigma, []);
  return (
    <AppProviders>
      <FrameUploadPage />
    </AppProviders>
  );
}
