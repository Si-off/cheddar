import { createContext, use } from "react";
import { env } from "@/shared/config/env";

/** 셀 이미지를 어디서 읽고 어디로 올리는지. 로그인 화면과 공개 링크 화면이 서로 다른 주소를 준다. */
export interface CellImageSource {
  url: (imageId: string) => string;
  /** 올린 이미지의 id. 올릴 수 없는 화면에서는 없다. */
  upload?: (file: File) => Promise<string>;
}

export const CellImageContext = createContext<CellImageSource | null>(null);

export const useCellImages = () => use(CellImageContext);

/** 셀 높이에 맞춘 이미지. 비율을 지키고 셀 너비를 넘지 않는다. */
export function CellImageThumb({ imageId }: { imageId: string }) {
  const source = useCellImages();
  if (!source) return null;
  return (
    <img
      src={source.url(imageId)}
      alt="셀 이미지"
      draggable={false}
      className="block h-24 max-w-full rounded-sm object-contain object-left"
    />
  );
}

/** 서버가 형식이나 크기를 이유로 받지 않았다. 메시지를 그대로 보여준다. */
export class UploadRejected extends Error {}

const upload = (path: string) => async (file: File) => {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    method: "POST",
    body,
    credentials: "include",
  });
  if (response.status === 400 || response.status === 413) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (body?.error?.message) throw new UploadRejected(body.error.message);
  }
  if (!response.ok) throw new Error("UPLOAD_FAILED");
  return ((await response.json()) as { id: string }).id;
};

/** 로그인한 사람이 연 테스트 세트의 이미지 */
export const testSetImages = (
  testSetId: string,
  canEdit: boolean,
): CellImageSource => ({
  url: (id) => `${env.apiBaseUrl}/api/v1/test-sets/${testSetId}/images/${id}`,
  upload: canEdit ? upload(`/api/v1/test-sets/${testSetId}/images`) : undefined,
});

/** 공개 링크로 연 테스트 세트의 이미지 */
export const sharedImages = (
  token: string,
  canEdit: boolean,
): CellImageSource => ({
  url: (id) =>
    `${env.apiBaseUrl}/api/v1/shared/${encodeURIComponent(token)}/images/${id}`,
  upload: canEdit
    ? upload(`/api/v1/shared/${encodeURIComponent(token)}/images`)
    : undefined,
});
