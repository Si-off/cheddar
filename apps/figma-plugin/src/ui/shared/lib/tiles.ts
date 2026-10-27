import { tileRects } from "@workspace/contracts";

export {
  SINGLE_MAX_HEIGHT,
  TILE_HEIGHT,
  TILE_OVERLAP,
  type TileRect,
  tileRects,
} from "@workspace/contracts";

/** PNG 한 장을 타일 PNG 목록으로 나눈다 */
export async function sliceImage(png: Uint8Array): Promise<Blob[]> {
  const source = new Blob([png as BlobPart], { type: "image/png" });
  const bitmap = await createImageBitmap(source);
  try {
    const rects = tileRects(bitmap.height);
    if (rects.length === 1) return [source];
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    const tiles: Blob[] = [];
    for (const rect of rects) {
      canvas.height = rect.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        bitmap,
        0,
        rect.top,
        bitmap.width,
        rect.height,
        0,
        0,
        bitmap.width,
        rect.height,
      );
      tiles.push(
        await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("TILE_FAILED"))),
            "image/png",
          ),
        ),
      );
    }
    return tiles;
  } finally {
    bitmap.close();
  }
}
