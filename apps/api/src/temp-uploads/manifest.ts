import { invalid } from "../common/errors";
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 플러그인 UI가 만든 화면 문서 하나의 상한. 가공은 플러그인이 하고 서버는 모양과 크기만 본다 */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export type ManifestFrame = {
  name: string;
  document: unknown;
  imageCount: number;
};
export function parseManifest(
  text: string,
  images: Express.Multer.File[],
): ManifestFrame[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("frames" in parsed) ||
    Object.keys(parsed).some((k) => k !== "frames") ||
    !Array.isArray(parsed.frames) ||
    parsed.frames.length < 1 ||
    parsed.frames.length > 200
  )
    throw invalid();
  let count = 0;
  for (const frame of parsed.frames) {
    if (
      !frame ||
      typeof frame !== "object" ||
      Array.isArray(frame) ||
      Object.keys(frame).some(
        (k) => !["name", "document", "imageCount"].includes(k),
      ) ||
      typeof frame.name !== "string" ||
      !frame.name.trim() ||
      frame.name.length > 1000 ||
      !screenDocument(frame.document) ||
      !Number.isInteger(frame.imageCount) ||
      frame.imageCount < 0
    )
      throw invalid();
    count += frame.imageCount;
  }
  if (
    count !== images.length ||
    Buffer.byteLength(text) + images.reduce((n, f) => n + f.size, 0) >
      MAX_UPLOAD_BYTES
  )
    throw invalid();
  for (const file of images) {
    if (file.size > MAX_IMAGE_BYTES || imageMime(file.buffer) !== file.mimetype)
      throw invalid();
  }
  return parsed.frames;
}
function screenDocument(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "schemaVersion" in value &&
    value.schemaVersion === 2 &&
    Buffer.byteLength(JSON.stringify(value)) <= MAX_DOCUMENT_BYTES
  );
}
export function imageMime(bytes: Buffer): "image/png" | "image/jpeg" | null {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  return null;
}
