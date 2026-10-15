import { isUUID } from "class-validator";
import { invalid } from "./errors";

export function decodeCursor(
  value?: string,
): { createdAt: Date; id: string } | undefined {
  if (value === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const data: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(data) ||
      data.length !== 2 ||
      typeof data[0] !== "string" ||
      !isUUID(data[1])
    )
      throw new Error();
    const createdAt = new Date(data[0]);
    if (createdAt.toISOString() !== data[0]) throw new Error();
    return { createdAt, id: data[1] };
  } catch {
    throw invalid([{ field: "cursor", code: "invalidCursor" }]);
  }
}
export function encodeCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify([row.createdAt.toISOString(), row.id]),
  ).toString("base64url");
}
