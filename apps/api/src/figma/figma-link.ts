import { ApiError } from "../common/errors";

export const linkInvalid = () =>
  new ApiError(400, "FIGMA_LINK_INVALID", "Figma 링크를 확인해주세요.");

/** Figma 파일, 페이지, 프레임 링크에서 파일 키와 노드 ID를 읽는다. 브랜치 링크는 브랜치 파일을 읽는다. */
export function parseFigmaLink(value: string): {
  fileKey: string;
  nodeId: string | null;
} {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw linkInvalid();
  }
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "figma.com" || url.hostname.endsWith(".figma.com"))
  )
    throw linkInvalid();
  const parts = url.pathname.split("/").filter(Boolean);
  if (!["design", "file", "proto"].includes(parts[0] ?? ""))
    throw linkInvalid();
  const fileKey = parts[2] === "branch" ? parts[3] : parts[1];
  if (!fileKey || !/^[A-Za-z0-9]{10,64}$/.test(fileKey)) throw linkInvalid();
  // 주소창은 12-34, 복사한 링크는 12:34로 노드 ID를 적는다
  const raw = url.searchParams.get("node-id");
  if (!raw) return { fileKey, nodeId: null };
  const nodeId = raw.replace(/-/g, ":");
  if (!/^[A-Za-z0-9:;]{1,200}$/.test(nodeId)) throw linkInvalid();
  // 0:1 같은 첫 페이지 기본값도 페이지 링크로 그대로 쓴다
  return { fileKey, nodeId };
}
