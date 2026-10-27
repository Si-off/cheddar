import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CreateTestSetForm } from "@/features/create-test-set";
import { FigmaTokenDialog } from "@/features/figma-token";

export function TestSetNewPage({
  uploadId,
  projectId,
}: {
  uploadId?: string;
  projectId?: string;
}) {
  const navigate = useNavigate();
  const [figmaToken, setFigmaToken] = useState(false);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 pt-8 pb-12">
      <h1 className="m-0 text-title text-fg">새 테스트 세트</h1>
      <CreateTestSetForm
        uploadId={uploadId}
        initialProjectId={projectId}
        onRequestFigmaToken={() => setFigmaToken(true)}
        onCreated={(testSetId, generating, confirmStart) =>
          generating
            ? navigate({
                to: "/test-sets/$testSetId/generating",
                params: { testSetId },
                search: { confirm: confirmStart },
              })
            : navigate({ to: "/test-sets/$testSetId", params: { testSetId } })
        }
      />
      <FigmaTokenDialog
        open={figmaToken}
        onOpenChange={setFigmaToken}
        replace
      />
    </main>
  );
}
