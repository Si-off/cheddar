import { createHash } from "node:crypto";
import { ApiError, invalid } from "../common/errors";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_JSON_BYTES = 5 * 1024 * 1024;

export function originalFileName(name: string) {
  // Browser FormData sends UTF-8 while multipart's default parameter decoder is latin1.
  // Keep already decoded names and genuine latin1 names when bytes are not valid UTF-8.
  if ([...name].some((character) => character.charCodeAt(0) > 255)) return name;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(name, "latin1"),
    );
  } catch {
    return name;
  }
}

export function inspectFile(bytes: Buffer, declaredType: string) {
  if (!bytes.length) throw invalid([{ field: "file", code: "emptyFile" }]);
  if (bytes.length > MAX_FILE_BYTES)
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      "파일은 20 MiB 이하로 업로드해주세요.",
    );
  let mediaType: string;
  if (declaredType === "application/json") {
    if (bytes.length > MAX_JSON_BYTES)
      throw new ApiError(
        413,
        "FILE_TOO_LARGE",
        "JSON 파일은 5 MiB 이하로 업로드해주세요.",
      );
    try {
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw invalid([{ field: "file", code: "invalidJson" }]);
    }
    mediaType = "application/json";
  } else if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mediaType = "image/png";
  else if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    mediaType = "image/jpeg";
  else if (
    bytes.length >= 16 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    mediaType = "image/webp";
  else
    throw new ApiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "PNG, JPEG, WebP 또는 JSON 파일을 선택해주세요.",
    );
  if (declaredType !== mediaType)
    throw new ApiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "파일 형식이 내용과 일치하지 않습니다. 파일을 확인해주세요.",
    );
  return {
    mediaType,
    byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
