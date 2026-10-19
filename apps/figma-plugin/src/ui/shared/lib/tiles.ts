// 큰 보드는 AI가 글자를 읽을 수 있게 겹치는 타일로 나눈다.
export const TILE_HEIGHT = 1600;
export const TILE_OVERLAP = 200;
// 이 높이까지는 나누지 않고 한 장으로 보낸다
export const SINGLE_MAX_HEIGHT = 2000;

export type TileRect = { top: number; height: number };

export function tileRects(height: number): TileRect[] {
  if (height <= SINGLE_MAX_HEIGHT) return [{ top: 0, height }];
  const rects: TileRect[] = [];
  const step = TILE_HEIGHT - TILE_OVERLAP;
  for (let top = 0; ; top += step) {
    if (top + TILE_HEIGHT >= height) {
      // 마지막 타일은 끝에 맞춰 짧은 조각이 생기지 않게 한다
      rects.push({
        top: Math.max(0, height - TILE_HEIGHT),
        height: TILE_HEIGHT,
      });
      break;
    }
    rects.push({ top, height: TILE_HEIGHT });
  }
  return rects;
}

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
